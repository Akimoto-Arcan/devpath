---
difficulty: intermediate
---

# Closures

A closure is a function bundled together with its **lexical environment** — the variables that were in scope where the function was defined, not where it's called. Every function in JavaScript forms a closure. Most of the time this is invisible, but when a function outlives the scope it was born in, closures become the only reason it still works at all.

## What a Closure Actually Is

When a function is created, it holds a reference to its outer scope's variable environment. If the outer function returns or finishes, those variables are not garbage collected as long as the inner function still references them. The inner function *closes over* those variables.

Critical point: closures capture **variables**, not values. If the variable changes after the closure is created, the closure sees the new value — not a snapshot from creation time. This is the source of the classic loop bug.

## Example

```javascript
// --- 1. The classic loop bug ---
// All 5 callbacks share the same `i` variable — by the time any fires,
// the loop has finished and i === 5
for (var i = 0; i < 5; i++) {
  setTimeout(() => console.log(i), 100); // prints: 5 5 5 5 5
}

// Fix 1: use let, which creates a new binding per iteration
for (let i = 0; i < 5; i++) {
  setTimeout(() => console.log(i), 100); // prints: 0 1 2 3 4
}

// Fix 2: use an IIFE to create a new scope (older pattern, pre-let)
for (var i = 0; i < 5; i++) {
  ((j) => {
    setTimeout(() => console.log(j), 100); // prints: 0 1 2 3 4
  })(i);
}

// --- 2. Module pattern using closures ---
// Exposes a public API while keeping internal state private
const counter = (() => {
  let count = 0;        // private — not accessible from outside
  let stepSize = 1;     // private

  return {
    increment() { count += stepSize; },
    decrement() { count -= stepSize; },
    setStep(n) { stepSize = n; },
    value() { return count; },
  };
})();

counter.increment();
counter.increment();
counter.setStep(5);
counter.increment();
console.log(counter.value()); // 7
console.log(counter.count);   // undefined — count is truly private

// --- 3. Memoization using closures ---
// The cache lives in the closure — persists across calls,
// invisible to callers
function memoize(fn) {
  const cache = new Map(); // captured by the returned function

  return function (...args) {
    const key = JSON.stringify(args); // simple key; real memoize libs are smarter
    if (cache.has(key)) {
      console.log(`cache hit: ${key}`);
      return cache.get(key);
    }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

function slowSquare(n) {
  // Simulate expensive computation
  return n * n;
}

const fastSquare = memoize(slowSquare);
console.log(fastSquare(12)); // computed: 144
console.log(fastSquare(12)); // cache hit: 144
console.log(fastSquare(7));  // computed: 49

// --- 4. Closures and event handlers — a real footgun ---
function attachHandlers() {
  const buttons = document.querySelectorAll('button');
  // If you use var here, all handlers close over the same `i`
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', () => {
      console.log(`Button ${i} clicked`); // always logs buttons.length
    });
  }
}
// Fix: use let, or capture i explicitly via data attribute or IIFE
```

## Why This Matters

You use closures constantly — every callback, every event listener, every `useEffect` in React closes over something. The bugs come when you don't realize a variable is shared across closures instead of copied.

**React hooks** are almost entirely closure-based. The "stale closure" problem in `useEffect` — where you read an old version of state — is the loop bug in disguise. The closure captured a variable, state was updated, but the closure still holds the old environment binding.

**Private state** in JavaScript has historically been done with closures (WeakMap is a cleaner alternative now, covered in lesson 5). The module pattern above is the foundation that CommonJS and AMD module systems are built on conceptually.

**Memoization and caching** — any time you wrap a function to add behavior while preserving state between calls, you're using closures. Debounce and throttle functions are closures. The timer ID in a debounce implementation lives in the closure.

## Exercise

Implement a `makeMultiplier(factor)` function that returns a new function. The returned function should multiply its argument by `factor`. Then implement a `once(fn)` function that wraps any function so it can only be called once — subsequent calls return the result of the first call without re-invoking `fn`.

```javascript
const triple = makeMultiplier(3);
console.log(triple(5));  // 15
console.log(triple(10)); // 30

const initialize = once(() => {
  console.log('init ran');
  return { ready: true };
});

initialize(); // logs "init ran", returns { ready: true }
initialize(); // returns { ready: true } silently — fn not called again
initialize(); // same
```

<details>
<summary>Hint</summary>

`makeMultiplier` just needs to close over `factor`. For `once`, you need two variables in the closure: one to track whether `fn` has been called, and one to store the result so you can return it on subsequent calls. A boolean flag and a result variable, both initialized before the returned function is created, will do it.

</details>

<details>
<summary>Solution</summary>

```javascript
function makeMultiplier(factor) {
  // `factor` is captured in the closure of the returned function
  return (n) => n * factor;
}

const triple = makeMultiplier(3);
const half = makeMultiplier(0.5);

console.log(triple(5));   // 15
console.log(triple(10));  // 30
console.log(half(20));    // 10

function once(fn) {
  let called = false; // captured
  let result;         // captured — holds return value after first call

  return function (...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args); // preserve `this` and spread args
    }
    return result;
  };
}

const initialize = once(() => {
  console.log('init ran');
  return { ready: true };
});

console.log(initialize()); // logs "init ran", returns { ready: true }
console.log(initialize()); // returns { ready: true }, no log
console.log(initialize()); // same

// Bonus: a version that works correctly when fn returns undefined
// (the naive `if (!result)` check would fail for falsy return values)
function onceSafe(fn) {
  let called = false;
  let result;
  return function (...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}
// The boolean flag is the right approach — don't check the result value
```

</details>
