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

    // Adds item at bottom of queue (last item)
    pushLast(element) {
        this.elements.unshift(element);
    }

    // Returns item at top of queue (lowest on array)
    pop(elementIdx = 0) {
        if (elementIdx !== 0)
        {
            return this.elements.splice(-elementIdx, 1);
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
    // ASSUMES tasks are in order!
    iterateScheduler() {
        this.curTimeIndex ++;

        // Find next tasks to execute
        if (this.tasks.isEmpty()) {
            return;
        }

        let howDeep = 0;
        while (howDeep < this.tasks.elements.length) {
            let nextTask = this.tasks.peek();
            if (nextTask.nextExecutionIndex <= this.curTimeIndex) {
                let task = this.tasks.pop();
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
            //console.log("Adding task to empty queue");
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
            console.warn("changeTaskInterval was called with an undocumented PID ("+PID+")");
            return;
        }

        // Remove task from execution
        let theTask = this.removeTask(PID);
        if (theTask === false) {
            console.warn("changeTaskInterval was called with an invalid PID ("+PID+")");
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
            // Remove from next execution
            let howDeep = 0;
            while (howDeep < this.tasks.elements.length) {
                let nextTask = this.tasks.peek(howDeep);
                console.log("Peeking idx "+howDeep+": PID="+nextTask.PID+", next time is "+nextTask.nextExecutionIndex);
                if (nextTask.PID === PID) {
                    let removed = this.tasks.pop(howDeep);
                    console.log("Tried to remove PID "+PID+" / idx "+howDeep+", removed "+removed.PID);
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
            // T[0]: 1
            // --> T[-]: 3 <--
            // T[1]: 4
            // T[2]: 5
            for (let t=this.tasks.elements.length-1; t>=0; t--) {
                let someOtherTask = this.tasks.peek(t);
                if (nextExecutionIndex >= someOtherTask) {
                    this.tasks.elements.splice(t, 0, task);
                    inserted = true;
                    break;
                }
            }

            if (!inserted) {
                // It got all the way to the bottom, insert as last item
                this.tasks.pushLast(task);
            }
        }
    }
}

if (typeof module !== "undefined") {
    module.exports = FunctionScheduler;
}


function testScheduler() {
    var s = new FunctionScheduler();
    s.timerBegin();

    var PID1 = s.addTask(() => console.log("-"), 1000);
    var PID2 = s.addTask(() => console.log("--"), 1000);
    var PID3 = s.addTask(() => console.log("---"), 4000);

    setTimeout(function() {
        var res = s.removeTask(PID1);
        console.log("Removing "+PID1+" :: "+res);
    }, 8000);

    setTimeout(function() {
        console.log("Setting faster "+PID2);
        s.changeTaskInterval(PID2, 100);
    }, 9000);

    setTimeout(function() {
        console.log("Removing "+PID3);
        s.removeTask(PID3);
    }, 10000);
}

testScheduler();
