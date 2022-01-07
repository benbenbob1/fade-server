const scheduler = require('../scheduler');
const Queue = scheduler.Queue;
const FunctionScheduler = scheduler.FunctionScheduler;

test('Queue isEmpty, push', () => {
    let queue = new Queue();
    expect(queue.isEmpty()).toBe(true);
    queue.push("test");
    expect(queue.isEmpty()).toBe(false);
    expect(queue.elements[0]).toBe("test");
    queue.push("test2");
    expect(queue.elements[0]).toBe("test");
    expect(queue.elements[1]).toBe("test2");
    expect(queue.peek()).toBe("test2");
    expect(queue.peek(1)).toBe("test");
    expect(queue.peek(2)).toBeFalsy();
});

test('Queue pop', () => {
    let queue = new Queue();
    queue.push("test");
    expect(queue.isEmpty()).toBe(false);
    queue.push("test2");
    expect(queue.pop()).toBe("test2");
    expect(queue.pop()).toBe("test");
    expect(queue.pop()).toBeFalsy();
    expect(queue.peek()).toBeFalsy();

    expect(queue.isEmpty()).toBe(true);

    queue.push("test3");
    queue.push("test4");
    expect(queue.pop(1)).toBe("test3");
    expect(queue.pop(0)).toBe("test4");
});

/*test('Scheduler', () => {
    
});*/