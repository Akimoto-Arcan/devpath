---
difficulty: intermediate
---

# Modern ES6+ Patterns Worth Knowing Deeply

These features ship in every modern JS environment. You've probably used most of them, but the deeper behaviors — nested destructuring with defaults, `WeakMap` for genuinely private data, tagged template literals — show up less and are worth internalizing.

## Destructuring — Beyond the Basics

Destructuring is a binding pattern, not just shorthand. The left side describes the shape you expect; the runtime extracts and binds.

## Example

```javascript
// --- 1. Nested destructuring with defaults ---
const response = {
  status: 200,
  data: {
    user: {
      id: 42,
      name: 'Alex',
      // role is missing
    },
  },
};

// Nested destructuring — mirrors the shape of the object
const {
  status,
  data: {
    user: {
      id,
      name,
      role = 'viewer', // default if undefined
      settings: {
        theme = 'light',  // default on a nested key that doesn't exist at all
      } = {},             // default for `settings` itself — prevents TypeError
    },
  },
} = response;

console.log(id, name, role, theme); // 42 "Alex" "viewer" "light"

// --- 2. Destructuring in function parameters ---
// Instead of accessing options.timeout, options.retries inside the fn:
function fetchWithOptions(url, { timeout = 5000, retries = 3, headers = {} } = {}) {
  // The `= {}` at the end makes the second arg optional entirely
  console.log(`fetching ${url} with timeout=${timeout}, retries=${retries}`);
}

fetchWithOptions('/api/data');                        // uses all defaults
fetchWithOptions('/api/data', { timeout: 10000 });   // overrides timeout only

// --- 3. Spread and rest — the difference matters ---

// Rest: collects remaining items INTO an array/object
function logFirst(first, ...rest) {
  console.log('first:', first);
  console.log('rest:', rest); // rest is an Array
}
logFirst(1, 2, 3, 4); // first: 1, rest: [2, 3, 4]

// Object rest — picks off named keys, bundles the rest
const { id: userId, ...metadata } = { id: 1, name: 'Alex', role: 'admin' };
console.log(userId);   // 1
console.log(metadata); // { name: 'Alex', role: 'admin' }

// Spread: expands an iterable/object into individual elements
const base = { host: 'localhost', port: 5432 };
const devConfig  = { ...base, debug: true };
const prodConfig = { ...base, port: 5433, ssl: true };

// Spread order matters — later keys override earlier ones
const merged = { ...base, port: 9999, ...devConfig }; // devConfig's port wins
console.log(merged.port); // 5432 — devConfig spreads port: 5432 last

// --- 4. Optional chaining (?.) and nullish coalescing (??) ---

const user = {
  profile: null,
  // address is absent entirely
};

// Without ?. : TypeError: Cannot read properties of null (reading 'city')
// console.log(user.profile.city);

// With ?. : short-circuits to undefined instead of throwing
console.log(user?.profile?.city);     // undefined
console.log(user?.address?.zip);      // undefined

// Method calls and bracket notation also work
const admins = null;
console.log(admins?.find(a => a.id === 1)); // undefined, no throw

// ?. with dynamic keys
const key = 'name';
console.log(user?.profile?.[key]); // undefined

// Nullish coalescing — only treats null/undefined as missing (not 0 or '')
const config = { timeout: 0, label: '' };

console.log(config.timeout || 5000);   // 5000 — WRONG: 0 is falsy
console.log(config.timeout ?? 5000);   // 0 — correct: only null/undefined triggers ??

console.log(config.label || 'unnamed'); // 'unnamed' — WRONG: '' is falsy
console.log(config.label ?? 'unnamed'); // '' — correct

// --- 5. Logical assignment operators ---
let a = null;
let b = 0;
let c = 'hello';

a ??= 'default'; // assigns only if a is null/undefined
b ||= 42;        // assigns only if b is falsy
c &&= c.toUpperCase(); // assigns only if c is truthy

console.log(a); // 'default'
console.log(b); // 42
console.log(c); // 'HELLO'

// Real use: initializing object properties only if absent
function ensureDefaults(obj) {
  obj.timeout ??= 3000;
  obj.retries ??= 3;
  obj.cache   ??= new Map();
  return obj;
}

// --- 6. WeakMap for genuinely private instance data ---
// WeakMap keys must be objects; entries are garbage collected when the key object is
// This makes it ideal for storing per-instance private state

const _private = new WeakMap(); // module-level, not exported

class ApiClient {
  constructor(apiKey) {
    // apiKey is private — stored in WeakMap keyed by this instance
    _private.set(this, { apiKey, requestCount: 0 });
  }

  async get(path) {
    const priv = _private.get(this);
    priv.requestCount++;
    return fetch(path, {
      headers: { Authorization: `Bearer ${priv.apiKey}` },
    });
  }

  getRequestCount() {
    return _private.get(this).requestCount;
  }
}

const client = new ApiClient('secret-key-123');
// client.apiKey — undefined, not accessible
// _private.get(client) — accessible in the module, not externally
console.log(client.getRequestCount()); // 0

// When `client` is garbage collected, _private entry is freed too
// No memory leak like a regular Map would cause

// --- 7. Tagged template literals ---
// The tag function receives the string parts and interpolated values separately

function highlight(strings, ...values) {
  // strings: array of string segments between interpolations
  // values: the evaluated expressions
  return strings.reduce((result, str, i) => {
    const val = values[i - 1];
    return result + (val !== undefined ? `<mark>${val}</mark>` : '') + str;
  }, '');
}

const term = 'prototype';
const count = 3;
const html = highlight`Found ${count} results for "${term}" in the docs.`;
console.log(html);
// Found <mark>3</mark> results for "<mark>prototype</mark>" in the docs.

// Real-world use: SQL query builders use tagged templates to safely
// separate the query string from user-supplied values (preventing injection)
function sql(strings, ...values) {
  const query = strings.join('?'); // parameterized placeholders
  return { query, params: values };
}

const userId = 42;
const { query, params } = sql`SELECT * FROM users WHERE id = ${userId}`;
console.log(query);  // "SELECT * FROM users WHERE id = ?"
console.log(params); // [42]
// Safe: userId never gets concatenated into the query string
```

## Why This Matters

These patterns appear together in production code constantly:

- **REST API responses** — nested destructuring with defaults handles inconsistent response shapes from third-party APIs without null-check waterfalls.
- **Config objects** — `??=` and function parameter destructuring with defaults replace boilerplate like `options = options || {}; options.timeout = options.timeout || 5000;`
- **WeakMap private data** — if you've used a library that exposes no internal state via console inspection (like some chart libraries), WeakMap is often how it's done. The `#privateField` ES2022 syntax is the newer alternative, but WeakMaps are more flexible across composed objects.
- **Template literal tags** — styled-components and emotion (CSS-in-JS libraries) are built on tagged template literals. GraphQL client libraries like `gql` from Apollo use them. They're also the right way to build safe SQL/HTML string builders.

## Exercise

Write a `createStore(initialState)` factory that returns a state management object. Requirements:

1. Store actual state in a `WeakMap` so it's not directly accessible on the returned object
2. Expose `get(key)`, `set(key, value)`, and `getAll()` methods
3. `set` should use `??=` or `??` to skip updating if the new value is `null` or `undefined`
4. Write a tagged template function `logChange` that formats a change message as: `[Store] key "name" changed to "Alex"` — where the changed key and value are highlighted (wrap in brackets)

<details>
<summary>Hint</summary>

For the WeakMap approach, create `const _stores = new WeakMap()` outside `createStore`. Inside the factory, after creating the returned object (`const store = {}`), call `_stores.set(store, { ...initialState })`. Each method uses `_stores.get(this)` to access the private state.

For the tagged template, the tag function receives `strings` as an array — `strings[0]` is everything before the first interpolation, `strings[1]` is between the first and second, etc. Values are the evaluated expressions. Build the output by interleaving them.

</details>

<details>
<summary>Solution</summary>

```javascript
const _stores = new WeakMap();

function createStore(initialState = {}) {
  const store = {
    get(key) {
      return _stores.get(this)[key];
    },

    set(key, value) {
      // Skip update if value is null or undefined
      if (value == null) return this;
      const state = _stores.get(this);
      state[key] = value;
      return this; // enable chaining
    },

    getAll() {
      // Return a shallow copy so callers can't mutate internal state directly
      return { ..._stores.get(this) };
    },
  };

  _stores.set(store, { ...initialState });
  return store;
}

// Tagged template for formatted change logging
function logChange(strings, ...values) {
  const parts = strings.reduce((acc, str, i) => {
    const val = i > 0 ? `[${values[i - 1]}]` : '';
    return acc + val + str;
  }, '');
  return `[Store] ${parts}`;
}

// Usage
const store = createStore({ name: 'guest', role: 'viewer' });

console.log(store.get('name')); // 'guest'

store.set('name', 'Alex');
store.set('role', null);  // skipped — null is ignored

console.log(store.get('name')); // 'Alex'
console.log(store.get('role')); // 'viewer' — unchanged

// Direct access to internal state: not possible
console.log(store._state);  // undefined
// _stores.get(store) would work inside this module but not externally

// Tagged template usage
const key = 'name';
const newVal = 'Alex';
console.log(logChange`key ${key} changed to ${newVal}`);
// [Store] key [name] changed to [Alex]

// Verify WeakMap isolation
const store2 = createStore({ name: 'other' });
store.set('name', 'Chris');
console.log(store.get('name'));  // 'Chris'
console.log(store2.get('name')); // 'other' — separate WeakMap entries
```

</details>
