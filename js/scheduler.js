// Task object

class Task {
    //executionFrequency is an index
    constructor(PID, functionToExecute, executionFrequency, shouldRepeat) {
        this.toExecute = functionToExecute;
        this.repeat = shouldRepeat;
        this.executionFrequency = executionFrequency;
        this.nextExecutionIndex = -1;
        this.PID = PID;
    }

    execute() {
        this.toExecute();
    }
}

class FunctionScheduler {

    // FS.timerBegin()
    // FS.addTask(passedInFunction, execFreqInMsec) - returns PID
    // FS.removeTask(PID) - returns true if function was found and stopped

    constructor() {
        //Initiate clock
        // Stores each Task in priority queue, 
        // FIFO in order of next to execute

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

        this.tasks = [];

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
        //this.timer = setInterval(
        //    function(){
        //        fs.iterateScheduler.call(fs);
        //    }, this.executionAccuracy, this
        //);
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

        //console.log("At index "+this.curTimeIndex+" I have "+this.tasks.length+" tasks in the queue");

        var taskIndicesToRemove = [];

        //Find all tasks to execute
        for (var t=this.tasks.length-1; t>=0; t--) {
            var task = this.tasks[t];

            //console.log("At "+this.curTimeIndex+", found task with NEI at "+task.nextExecutionIndex);
            if (task.nextExecutionIndex <= this.curTimeIndex) {
                //console.log("And I'm gonna run it");
                task.execute();
                //taskIndicesToRemove.push(t);
                this.tasks.splice(t, 1);
                if (task.repeat == true) {
                    // Add task back if should repeat
                    this.scheduleTask(task, 
                        task.nextExecutionIndex + task.executionFrequency);
                } else {
                    //TODO splice out PID
                    this.PIDs[task.PID] = false;
                }
            }
        }

        //Remove all ran tasks
        /*for (var idx=0; idx<taskIndicesToRemove.length; idx++) {
            // Remove task from queue
            console.log("Removing "+taskIndicesToRemove[idx]);
            this.tasks.splice(taskIndicesToRemove[idx], 1);
        }*/

        // Accurate timer
        // Based on https://gist.github.com/manast/1185904
        var curTick = new Date().getTime();
        this.previousExecutionTime += this.executionAccuracy;
        var nextTick = this.executionAccuracy - 
            (curTick - this.previousExecutionTime);
        if (nextTick < 0) {
            nextTick = 0;
        }

        //console.log("Next tick is "+nextTick);

        if (this.tasks.length !== 0) {
            var fs = this;
            this.timer = setTimeout(function(){
                fs.iterateScheduler.call(fs);
            }, nextTick);
        }
    }


    // Adds a function to the queue in order (from the bottom)
    // Runs immediately if specified
    // Timer is accurate to executionAccuracy

    // execFreqInMsec is the execution frequency
    // Or just a delay, to be executed once if negative

    // Returns PID (int) of added task
    addTask(passedInFunction, execFreqInMsec) {
        var wasEmpty = this.tasks.length === 0;
        var shouldRepeat = execFreqInMsec > 0;
        var adjustedExecFreqMsec = execFreqInMsec;
        if (!shouldRepeat) {
            adjustedExecFreqMsec = -adjustedExecFreqMsec;
        }
        var execFreqAsIndex = Math.floor(execFreqInMsec/this.executionAccuracy);

        var thisPID = ++this.lastPID;

        var taskToAdd = new Task(
            thisPID, passedInFunction,
            execFreqAsIndex, shouldRepeat
        );

        // Add task to record
        this.PIDs[thisPID] = taskToAdd;

        //Find insertion point in task 
        this.scheduleTask(taskToAdd, this.curTimeIndex + execFreqAsIndex);

        if (wasEmpty) {
            //console.log("Adding task to empty queue");
            this.iterateScheduler();
        }

        return thisPID;
    }

    // Remove task from scheduler (WILL STILL EXECUTE NEXT) by PID (int)
    // Returns true if task was found AND removed
    removeTask(PID) {
        if (PID in this.PIDs) {
            var taskToRemove = this.PIDs[PID];
            // Easiest way to remove (for now)
            if (taskToRemove.PID === PID) {
                taskToRemove.repeat = false;
                return true;
            }
        }

        return false;
    }

    scheduleTask(task, nextExecutionIndex) {
        task.nextExecutionIndex = nextExecutionIndex;

        //console.log("ST at "+this.curTimeIndex+", scheduling for "+nextExecutionIndex);

        if (this.tasks.length == 0) {
            this.tasks.push(task);
        } else {
            var inserted = false;
            // T[0]: 5
            // --> T[-]: 4 <--
            // T[1]: 3
            // T[2]: 1
            for (var t=this.tasks.length-1; t>=0; t--) {
                if (this.tasks[t].nextExecutionIndex >= nextExecutionIndex) {
                    this.tasks.splice(t, 0, task);
                    inserted = true;
                    break;
                }
            }

            if (!inserted) {
                //console.log("Not inserted");
                //It got all the way to the bottom, insert as last item
                this.tasks.push(task);
            }
        }
    }
}

if (typeof module !== "undefined") {
    module.exports = FunctionScheduler;
}

/*
function toRun() {
    console.log("-");
}

function toRun2() {
    console.log("--");
}

function toRun3() {
    console.log("---");
}

function testScheduler() {
    var s = new FunctionScheduler();
    s.timerBegin();

    var PID1 = s.addTask(toRun, 1000);
    var PID2 = s.addTask(toRun2, 1000);
    var PID3 = s.addTask(toRun3, 4000);

    setTimeout(function() {
        var res = s.removeTask(PID1);
        console.log("Removing "+PID1+" :: "+res);
    }, 8000);

    setTimeout(function() {
        console.log("Removing "+PID2);
        s.removeTask(PID2);
    }, 9000);

    setTimeout(function() {
        console.log("Removing "+PID3);
        s.removeTask(PID3);
    }, 10000);
}

testScheduler();
*/