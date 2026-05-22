---
difficulty: intermediate
---

# The JavaScript Event Loop

JavaScript is single-threaded, but it handles asynchronous operations without blocking. Understanding how it actually does that — the event loop, call stack, and the two task queues — lets you predict execution order and avoid subtle bugs.

## The Moving Parts

**Call stack** — where your synchronous code runs. Functions are pushed on when called, popped off when they return. If the stack is busy, nothing else runs.

**Heap** — where objects live in memory. Not directly relevant to execution order, but it's where your closures and long-lived data sit.

**Task queue (macrotask queue)** — holds callbacks from `setTimeout`, `setInterval`, I/O events, and UI events. The event loop picks one task per cycle.

**Microtask queue** — holds callbacks from resolved Promises (`.then`, `.catch`, `.finally`) and `queueMicrotask()`. This queue is **drained completely** before the event loop moves on to the next macrotask.

The cycle looks like this:

1. Run all synchronous code (empty the call stack)
2. Drain the entire microtask queue
3. Pick one macrotask from the task queue and run it
4. Go to step 2

This is why `Promise.resolve().then(fn)` runs before `setTimeout(fn, 0)` — the Promise callback is a microtask, and all microtasks run before any macrotask is picked up, even one with a 0ms delay.

## Example

```javascript
// Predicting execution order — trace through this before running it

console.log('1 - synchronous start');

setTimeout(() => {
  console.log('5 - macrotask (setTimeout 0ms)');
}, 0);

Promise.resolve()
  .then(() => {
    console.log('3 - microtask (first .then)');
    // Scheduling another microtask from inside a microtask — it still
    // drains before the setTimeout fires
    return Promise.resolve();
  })
  .then(() => {
    console.log('4 - microtask (second .then, chained)');
  });

console.log('2 - synchronous end');

// Output order: 1, 2, 3, 4, 5

// -------------------------

// Practical example: why async/await ordering can surprise you
async function fetchData() {
  console.log('A - inside async fn, before await');
  const result = await Promise.resolve('data'); // suspends here
  console.log('C - after await (this is a microtask continuation)');
  return result;
}

console.log('before call');
fetchData();
console.log('B - synchronous code after calling fetchData()');

// Output: "before call", "A...", "B...", "C..."
// 'B' runs before 'C' because await suspends the async function
// and hands control back to the caller synchronously

// -------------------------

// Stacking microtasks: be careful with deeply chained promises
// Each .then schedules a new microtask — this can starve macrotasks
// (like UI repaints or timers) if you chain thousands of them

function chainedMicrotasks(n) {
  let p = Promise.resolve();
  for (let i = 0; i < n; i++) {
    p = p.then(() => {}); // n microtasks queued in sequence
  }
  return p;
}

setTimeout(() => console.log('timer fired'), 0);
chainedMicrotasks(3).then(() => console.log('chain done'));

// Output: "chain done" before "timer fired" — all microtasks
// from the chain flush before the macrotask queue is touched
```

## Why This Matters

When you're building dashboards with Chart.js and calling multiple APIs, you've likely written `Promise.all([...])` and assumed the UI updates in a predictable order. The event loop is why that works — and why it can break subtly when you mix `setTimeout` with Promise chains for sequencing logic.

Common real-world cases where this bites developers:

- **Debouncing with Promises** — if your debounce uses `setTimeout` but your state updates use resolved Promises, the state can change before the debounced callback fires, leading to stale reads.
- **Testing async code** — test frameworks run assertions after microtasks but the order of macrotasks can make tests pass locally and fail in CI with different timer precision.
- **Node.js streams and I/O** — `process.nextTick` queues ahead of Promises (it has its own "nextTick queue" that runs before the microtask queue). Mixing them without knowing the order causes ordering bugs in data pipelines.

## Exercise

Without running the code, write down the exact console output order for this snippet. Then run it to verify.

```javascript
console.log('start');

setTimeout(() => console.log('timeout 1'), 0);
setTimeout(() => console.log('timeout 2'), 0);

Promise.resolve()
  .then(() => {
    console.log('promise 1');
    setTimeout(() => console.log('timeout 3 (from inside promise)'), 0);
    return Promise.resolve();
  })
  .then(() => console.log('promise 2'));

queueMicrotask(() => console.log('queueMicrotask'));

console.log('end');
```

Then modify it: make `timeout 3` fire before `timeout 1` without changing where they're defined. (Hint: you can't reorder the `setTimeout` calls themselves — think about when each one is *registered*.)

<details>
<summary>Hint</summary>

The key question is: when is `timeout 3` registered? It's registered inside a `.then` callback, which runs after synchronous code and after `queueMicrotask`. By that time, `timeout 1` and `timeout 2` are already in the macrotask queue ahead of it.

To make `timeout 3` fire first, you'd need to register it before the others — but without moving the code, consider what runs synchronously vs. asynchronously.

</details>

<details>
<summary>Solution</summary>

```javascript
// Expected output:
// start
// end
// promise 1        <- microtask
// queueMicrotask   <- also a microtask, but registered after promise 1 in source...
//                     actually queueMicrotask runs BEFORE .then callbacks
//                     in V8's implementation — both are microtasks but
//                     queueMicrotask is processed in registration order
//                     alongside .then. Since queueMicrotask() is called
//                     synchronously before the .then fires, it queues first.
// promise 2
// timeout 1
// timeout 2
// timeout 3 (from inside promise)

// The actual output in V8 (Node/Chrome):
// start
// end
// promise 1
// queueMicrotask   <- registered sync, fires before promise 2
// promise 2
// timeout 1
// timeout 2
// timeout 3 (from inside promise)

// To make timeout 3 fire first — you'd need to register it
// before timeout 1 and timeout 2 are registered.
// Since those are registered synchronously, the only way is
// to register timeout 3 synchronously too, earlier in the file:

setTimeout(() => console.log('timeout 3'), 0); // registered first
setTimeout(() => console.log('timeout 1'), 0);
setTimeout(() => console.log('timeout 2'), 0);
// But that changes where it's defined — the constraint was about
// keeping the structure. The lesson: macrotask order = registration order.
// You cannot reorder macrotasks after they're queued.
```

</details>
