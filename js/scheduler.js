// Task object

class Task {
    //executionFrequency is an index
    constructor(PID, functionToExecute, executionFrequency, shouldRepeat, context=null) {
        this.toExecute = functionToExecute;
        this.repeat = shouldRepeat;
        this.executionFrequency = executionFrequency;
        this.nextExecutionIndex = -1;
        this.PID = PID;

        if (context !== null) {
            this.context = context;
        }
    }

    execute() {
        if (this.context) {
            this.toExecute.call(this.context);
        } else {
            this.toExecute();
        }
    }
}

// FIFO
class Queue {
    constructor() {
        this.elements = [];
    }

    // Inserts item at top of queue (end of array)
    push(element) {
        this.elements.push(element);
    }

    // Adds item at bottom of queue (array 0)
    pushLast(element) {
        this.elements.unshift(element);
    }

    // Returns item at top of queue (end of array) or the nth from top
    pop(elementIdx = 0) {
        if (this.isEmpty()) {
            return null;
        }

        if (elementIdx > 0)
        {
            // splice(-1) removes last element and returns array of removed elements
            return this.elements.splice(-elementIdx-1, 1)[0];
        }

        return this.elements.pop();
    }

    isEmpty() {
        return this.elements.length == 0;
    }

    // Peek top idx'th item
    peek(idx = 0) {
        return this.isEmpty() ? null : this.elements[this.elements.length - idx - 1];
    }
}

class FunctionScheduler {

    // FS.timerBegin()
    // FS.addTask(passedInFunction, execFreqInMsec) - returns PID
    // FS.removeTask(PID) - returns true if function was found and stopped

    constructor() {
        //Initiate clock
        // Stores each Task in priority queue, 
        // FIFO in order of next to execute (top one is next to execute)

        // Every executionAccuracy miliseconds, the executeNext function
        // is called. This checks the item at the end of the queue.
        // If that item's next execute index (the number of executionAccuracy's 
        // that have passed since the program started) is the current
        // one, then execute that function and reschedule it if applicable
        // (run a scheduleNext function). Rerun the executeNext function
        // as long as current one did run, in case next scheduled task is
        // at same time (and so on).

        // For EA being 100msec, if a task is scheduled to repeat every
        // 1500msec (1.5 sec), it would be scheduled for time index 15.
        // At time index 15, the task would be run and then rescheduled for 
        // time index 30.

        // If executionAccuracy is 100msec, the scheduler WILL CRASH after
        // (9007199254740991/10)/60/60/24 = 10 trillion days

        this.curTimeIndex = 0;

        this.executionAccuracy = 200; //msec

        this.tasks = new Queue();

        this.previousExecutionTime = -1;

        this.currentlyExecuting = false; // Act as a mutex

        /*
        PIDs: {
            PID: task object if still repeating, otherwise false
        }
        */
        this.PIDs = {};
        this.lastPID = -1;
    }

    // (Re)start the internal timer
    timerBegin() {
        this.curTimeIndex = 0;

        if (this.timer != null) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.previousExecutionTime = new Date().getTime();
    }

    // Stop or pause the timer
    stopTimer() {
        if (this.timer != null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    // Increases curTimeIndex by 1
    // Runs all tasks scheduled for this time index, then reschedules them if
    // applicable.
    // ASSUMES tasks are in order: top of queue is to be executed soonest
    iterateScheduler() {
        this.curTimeIndex ++;

        // Find next tasks to execute
        if (this.tasks.isEmpty()) {
            return;
        }

        this.currentlyExecuting = true;

        let howDeep = 0;
        while (howDeep < this.tasks.elements.length) {
            //console.log(`Comparing T[${howDeep}]: ${task.nextExecutionIndex}`);
            if (this.tasks.peek().nextExecutionIndex <= this.curTimeIndex) {
                let task = this.tasks.pop();
                //console.log("Now running "+task.PID);
                task.execute();
                if (task.repeat == true) {
                    // Add task back if should repeat
                    let nextTaskExecutionIndex = task.nextExecutionIndex + task.executionFrequency;
                    if (nextTaskExecutionIndex < this.curTimeIndex) {
                        // Too soon or we missed the last execution by a lot
                        nextTaskExecutionIndex = this.curTimeIndex + task.executionFrequency;
                    }

                    this.scheduleTask(task, 
                        this.curTimeIndex + task.executionFrequency);
                } else {
                    delete this.PIDs[task.PID];
                }

                howDeep ++;
            } else {
                break;
            }
        }

        // Accurate timer
        // Based on https://gist.github.com/manast/1185904
        var curTick = new Date().getTime();
        this.previousExecutionTime += this.executionAccuracy;
        var nextTick = this.executionAccuracy - 
            (curTick - this.previousExecutionTime);
        if (nextTick < 0) {
            nextTick = this.executionAccuracy;
        }

        if (!this.tasks.isEmpty()) {
            var fs = this;
            this.timer = setTimeout(function(){
                fs.iterateScheduler.call(fs);
            }, nextTick);
        }

        this.currentlyExecuting = false;
    }


    // Adds a function to the queue in order (from the top)
    // Runs immediately if specified
    // Timer is accurate to executionAccuracy

    // execFreqInMsec is the execution frequency
    // Or just a delay, to be executed once if negative

    // Returns PID (int) of added task
    addTask(passedInFunction, execFreqInMsec, context=null) {
        let wasEmpty = this.tasks.isEmpty();
        let shouldRepeat = execFreqInMsec > 0;
        let adjustedExecFreqMsec = execFreqInMsec;
        if (!shouldRepeat) {
            adjustedExecFreqMsec = -adjustedExecFreqMsec;
        }

        let execFreqAsIndex = Math.floor(execFreqInMsec/this.executionAccuracy);

        let thisPID = ++this.lastPID;

        let taskToAdd = new Task(
            thisPID, 
            passedInFunction,
            execFreqAsIndex, 
            shouldRepeat, 
            context
        );

        // Add task to record
        this.PIDs[thisPID] = taskToAdd;

        // Find insertion point in task 
        this.scheduleTask(taskToAdd, this.curTimeIndex + execFreqAsIndex);

        if (wasEmpty) {
            this.iterateScheduler();
        }

        return thisPID;
    }

    changeTaskInterval(PID, newExecFreqInMsec) {
        if (PID in this.PIDs) {
            let taskToRemove = this.PIDs[PID];
            if (taskToRemove.repeat !== true) {
                console.warn("changeTaskInterval: existing task was not set to repeat ("+PID+")");
                return;
            }
        }
        else {
            console.warn("changeTaskInterval was called with an unknown PID ("+PID+")");
            return;
        }

        // Remove task from execution
        let theTask = this.removeTask(PID);
        if (theTask === false) {
            console.warn("changeTaskInterval was called with an invalid PID (could not remove "+PID+")");
            return;
        }

        // Reschedule task (+ add it back)
        let execFreqAsIndex = Math.floor(newExecFreqInMsec/this.executionAccuracy);
        theTask.repeat = true;
        theTask.executionFrequency = execFreqAsIndex; // Set new execution freq
        this.PIDs[PID] = theTask; // Add back to record

        this.scheduleTask(theTask, this.curTimeIndex + execFreqAsIndex);

    }

    // Remove task from scheduler by PID (int) and from PIDs
    // Returns task if task was found AND removed
    //         false if task was not found
    removeTask(PID) {
        if (PID in this.PIDs) {
            let taskToRemove = this.PIDs[PID];

            taskToRemove.repeat = false;

            while (this.currentlyExecuting) {
                //console.log("Waiting for execution to stop");
            }

            // console.log("Before removing "+PID+" from tasks:");
            // let howDeep2 = 0;
            // while (howDeep2<this.tasks.elements.length) {
            //     let task = this.tasks.peek(howDeep2);
            //     console.log(`T[${howDeep2}]: ${task.PID}`);
            //     howDeep2 ++;
            // }

            // Remove from next execution
            let howDeep = 0;
            while (howDeep < this.tasks.elements.length) {
                let nextTask = this.tasks.peek(howDeep);
                if (nextTask.PID === PID) {
                    let removed = this.tasks.pop(howDeep);
                    break;
                }

                howDeep ++;
            }

            delete this.PIDs[PID];

            return taskToRemove;
        }

        return false;
    }

    scheduleTask(task, nextExecutionIndex) {
        task.nextExecutionIndex = nextExecutionIndex;

        if (this.tasks.length == 0) {
            this.tasks.push(task);
        } else {
            var inserted = false;
            // Task[queue depth]: next execution index
            // T[0]: 1
            // --> T[-]: 3 <--
            // T[1]: 4
            // T[2]: 5 <- bottom of queue
            let howDeep = 0;
            while (howDeep<this.tasks.elements.length) {
                let someOtherTask = this.tasks.peek(howDeep);
                // If this is sooner than that
                if (nextExecutionIndex <= someOtherTask.nextExecutionIndex) {
                    this.tasks.elements.splice(this.tasks.elements.length-howDeep, 0, task);
                    inserted = true;
                    break;
                }

                howDeep ++;
            }

            if (!inserted) {
                // It got all the way to the bottom, insert as last item
                this.tasks.pushLast(task);
            }
        }
    }
}

if (typeof module !== "undefined") {
    module.exports = { 
        FunctionScheduler: FunctionScheduler,
        Task: Task, 
        Queue: Queue 
    };
}