---
difficulty: intermediate
---

# Promises and async/await — Deep Dive

You've used Promises and `async/await` for API calls. This lesson goes past the basics: Promise states, the difference between chaining and `async/await` in terms of behavior, all four `Promise.*` combinators and when to reach for each, and the mistakes that cause silent failures in production.

## Promise States

A Promise is always in one of three states:

- **Pending** — initial state, neither fulfilled nor rejected
- **Fulfilled** — operation completed successfully, has a value
- **Rejected** — operation failed, has a reason (usually an Error)

Once a Promise settles (fulfills or rejects), it's immutable — it never changes state again. Calling `.then` on an already-settled Promise still works; the callback is scheduled as a microtask immediately.

## Chaining vs. async/await

They're equivalent in power. `async/await` is syntax sugar over Promises — an `async` function always returns a Promise, and `await` unwraps one. The difference is readability and how error handling flows.

## Example

```javascript
// --- 1. Promise chaining vs async/await — same behavior ---
function getUser(id) {
  return fetch(`/api/users/${id}`).then(r => r.json());
}
function getPosts(userId) {
  return fetch(`/api/posts?user=${userId}`).then(r => r.json());
}

// Chaining
getUser(1)
  .then(user => getPosts(user.id))
  .then(posts => console.log(posts))
  .catch(err => console.error('chain failed:', err));

// async/await — identical behavior, clearer for sequential logic
async function loadUserPosts(id) {
  try {
    const user = await getUser(id);
    const posts = await getPosts(user.id);
    console.log(posts);
  } catch (err) {
    console.error('async failed:', err);
  }
}

// --- 2. The four combinators ---

const p1 = fetch('/api/users').then(r => r.json());
const p2 = fetch('/api/roles').then(r => r.json());
const p3 = fetch('/api/config').then(r => r.json());

// Promise.all — waits for ALL to fulfill; rejects immediately if ANY rejects
// Use when: you need all results and one failure should abort everything
const [users, roles, config] = await Promise.all([p1, p2, p3]);

// Promise.allSettled — waits for ALL to settle, regardless of outcome
// Returns array of { status: 'fulfilled'|'rejected', value|reason }
// Use when: you want results from everything that succeeded, even if some fail
const results = await Promise.allSettled([p1, p2, p3]);
const succeeded = results
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value);
const failed = results
  .filter(r => r.status === 'rejected')
  .map(r => r.reason);

// Promise.race — settles as soon as the FIRST promise settles (either way)
// Use when: implementing timeouts or taking the fastest response
function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

try {
  const data = await withTimeout(fetch('/api/slow-endpoint'), 3000);
} catch (err) {
  console.error(err.message); // "Timed out after 3000ms"
}

// Promise.any — resolves with the FIRST fulfilled promise; only rejects
// if ALL reject (with an AggregateError)
// Use when: you have multiple sources and only need one to succeed (fallbacks)
async function fetchWithFallback(urls) {
  try {
    return await Promise.any(urls.map(url => fetch(url).then(r => r.json())));
  } catch (err) {
    // err is AggregateError — has err.errors array
    console.error('all sources failed:', err.errors);
    throw err;
  }
}

// --- 3. Common mistakes ---

// MISTAKE: Missing await — promise is ignored, no error thrown
async function saveData(data) {
  fetch('/api/save', { method: 'POST', body: JSON.stringify(data) }); // no await!
  console.log('saved'); // logs immediately, before request completes
  // If fetch rejects, the rejection is unhandled — may crash Node or warn in browser
}

// FIX: always await, or explicitly handle the floating promise
async function saveDataFixed(data) {
  await fetch('/api/save', { method: 'POST', body: JSON.stringify(data) });
  console.log('saved');
}

// MISTAKE: async inside forEach — forEach ignores returned Promises
async function processAll(items) {
  items.forEach(async (item) => {
    await doWork(item); // this runs, but forEach doesn't wait for it
  });
  console.log('done'); // logs before any doWork finishes
}

// FIX: use for...of to preserve sequential await, or Promise.all for parallel
async function processAllFixed(items) {
  // Sequential:
  for (const item of items) {
    await doWork(item);
  }

  // Parallel (if order doesn't matter and they're independent):
  await Promise.all(items.map(item => doWork(item)));

  console.log('done'); // now actually done
}

// MISTAKE: Swallowing errors with empty catch
async function risky() {
  try {
    return await mightFail();
  } catch (err) {
    // silently swallowed — caller gets undefined, no idea why
  }
}

// FIX: always re-throw, log, or return a meaningful fallback
async function riskyFixed() {
  try {
    return await mightFail();
  } catch (err) {
    console.error('mightFail failed:', err);
    throw err; // or: return defaultValue;
  }
}
```

## Why This Matters

If you've built REST API consumers with Chart.js dashboards, you've almost certainly hit these issues:

- A dashboard that shows "loading" forever because a Promise rejection was swallowed
- A `forEach` with `async` callbacks where some data arrived out of order
- `Promise.all` aborting an entire dashboard load because one of six endpoints was slow or down — `Promise.allSettled` would have shown five working charts instead of zero

`Promise.race` is useful for real-world resilience: pair any slow external call with a timeout so your UI doesn't hang. `Promise.any` is useful when you have CDN fallbacks or redundant API endpoints.

## Exercise

You have three data sources for the same user profile: a primary API, a cache service, and a local storage fallback. Implement `getUserProfile(userId)` that:

1. Tries all three sources simultaneously
2. Returns the first one that succeeds
3. If all three fail, throws an error that includes all three failure reasons
4. If the primary API takes more than 2 seconds, it should be considered failed (don't wait for it)

```javascript
async function fetchFromAPI(id) { /* returns profile or throws */ }
async function fetchFromCache(id) { /* returns profile or throws */ }
async function fetchFromLocal(id) { /* returns profile or throws */ }

async function getUserProfile(userId) {
  // your implementation
}
```

<details>
<summary>Hint</summary>

`Promise.any` is exactly the right combinator here — it returns the first fulfilled result and only rejects if all fail (with `AggregateError`). For the timeout on the primary API, wrap `fetchFromAPI` in a `Promise.race` against a timeout promise before passing it to `Promise.any`.

</details>

<details>
<summary>Solution</summary>

```javascript
function withTimeout(promise, ms, label = 'operation') {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timer]);
}

async function getUserProfile(userId) {
  const apiWithTimeout = withTimeout(
    fetchFromAPI(userId),
    2000,
    'primary API'
  );

  try {
    // Promise.any returns first fulfilled; AggregateError if all reject
    const profile = await Promise.any([
      apiWithTimeout,
      fetchFromCache(userId),
      fetchFromLocal(userId),
    ]);
    return profile;
  } catch (err) {
    // err is AggregateError — err.errors is an array of all rejection reasons
    const reasons = err.errors.map((e, i) => {
      const source = ['API (or timeout)', 'cache', 'local'][i];
      return `${source}: ${e.message}`;
    });
    throw new Error(`All profile sources failed:\n${reasons.join('\n')}`);
  }
}

// Usage
try {
  const profile = await getUserProfile(42);
  console.log(profile);
} catch (err) {
  console.error(err.message);
}
```

</details>
