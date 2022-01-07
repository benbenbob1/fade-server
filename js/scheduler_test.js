const scheduler = require('./scheduler');
const FunctionScheduler = scheduler.FunctionScheduler;

function test1() { console.log("-"); }
function test2() { console.log("--"); }
function test3() { console.log("---"); }

function testScheduler() {
    var s = new FunctionScheduler();
    s.timerBegin();

    var PID1 = s.addTask(test1, 500);
    var PID2 = s.addTask(test2, 1000);
    var PID3 = s.addTask(test3, 4000);



    setTimeout(function() {
        var res = s.removeTask(PID1);
        console.log("Removing "+PID1+" :: "+res.nextExecutionIndex);
    }, 8500);

    setTimeout(function() {
        console.log("Setting faster "+PID2);
        s.changeTaskInterval(PID2, 100);
    }, 9000);

    setTimeout(function() {
        console.log("Removing "+PID2);
        s.removeTask(PID2);
    }, 14000);

    setTimeout(function() {
        console.log("Removing "+PID3);
        s.removeTask(PID3);
    }, 10000);
}

testScheduler();