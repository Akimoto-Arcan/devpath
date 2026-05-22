---
difficulty: intermediate
---

# Prototypes and the Prototype Chain

JavaScript's inheritance model is prototype-based, not class-based. The `class` keyword added in ES6 is syntactic sugar — under the hood it creates the same prototype chain that's always been there. Understanding prototypes lets you debug inheritance bugs that class syntax hides, use `Object.create()` effectively, and know exactly what `hasOwnProperty`, `instanceof`, and `Object.getPrototypeOf` are actually doing.

## How the Prototype Chain Works

Every object in JavaScript has an internal `[[Prototype]]` link — accessible via `Object.getPrototypeOf(obj)` or the legacy `obj.__proto__`. When you access a property on an object, the engine:

1. Checks the object itself for an own property with that name
2. If not found, follows the `[[Prototype]]` link to the next object up the chain
3. Repeats until it finds the property or reaches `null` (the end of the chain)

This chain is how method lookup works. When you call `arr.map()`, the `map` method isn't on the array itself — it's on `Array.prototype`, which is in the array's prototype chain.

## Example

```javascript
// --- 1. Examining the chain directly ---
const arr = [1, 2, 3];

console.log(Object.getPrototypeOf(arr) === Array.prototype);      // true
console.log(Object.getPrototypeOf(Array.prototype) === Object.prototype); // true
console.log(Object.getPrototypeOf(Object.prototype));             // null — end of chain

// map lives on Array.prototype, not on arr itself
console.log(arr.hasOwnProperty('map'));              // false
console.log(Array.prototype.hasOwnProperty('map')); // true

// --- 2. class is syntactic sugar — same prototype chain underneath ---
class Animal {
  constructor(name) {
    this.name = name; // own property on the instance
  }

  speak() {
    // This method lives on Animal.prototype, not on each instance
    return `${this.name} makes a sound.`;
  }
}

class Dog extends Animal {
  speak() {
    return `${this.name} barks.`;
  }
}

const d = new Dog('Rex');

// The prototype chain for d:
// d -> Dog.prototype -> Animal.prototype -> Object.prototype -> null
console.log(Object.getPrototypeOf(d) === Dog.prototype);          // true
console.log(Object.getPrototypeOf(Dog.prototype) === Animal.prototype); // true

// d.speak() resolves on Dog.prototype — Animal.prototype.speak is shadowed
console.log(d.speak()); // "Rex barks."

// You can call the shadowed method explicitly:
console.log(Animal.prototype.speak.call(d)); // "Rex makes a sound."

// --- 3. Object.create() — prototype-based inheritance without classes ---
// Object.create(proto) returns a new object with [[Prototype]] set to proto
const animalProto = {
  speak() {
    return `${this.name} makes a sound.`;
  },
  toString() {
    return `[Animal: ${this.name}]`;
  },
};

function createAnimal(name) {
  const obj = Object.create(animalProto); // chain: obj -> animalProto -> Object.prototype
  obj.name = name;
  return obj;
}

const cat = createAnimal('Whiskers');
console.log(cat.speak());    // "Whiskers makes a sound."
console.log(cat.name);       // own property
console.log(cat.hasOwnProperty('speak')); // false — speak is on the prototype

// Object.create(null) creates an object with NO prototype — useful for
// pure hash maps with no inherited methods to worry about
const safeMap = Object.create(null);
safeMap.key = 'value';
// safeMap.hasOwnProperty('key') — TypeError! hasOwnProperty isn't inherited
// Use Object.prototype.hasOwnProperty.call(safeMap, 'key') instead
console.log(Object.prototype.hasOwnProperty.call(safeMap, 'key')); // true

// --- 4. hasOwnProperty vs. in operator ---
function Vehicle(make) {
  this.make = make; // own property
}
Vehicle.prototype.type = 'vehicle'; // prototype property

const car = new Vehicle('Toyota');

console.log(car.hasOwnProperty('make'));  // true — own
console.log(car.hasOwnProperty('type'));  // false — inherited
console.log('make' in car);               // true
console.log('type' in car);               // true — checks entire chain

// Modern alternative: Object.hasOwn() — same as hasOwnProperty but static,
// works on null-prototype objects too
console.log(Object.hasOwn(car, 'make')); // true (ES2022)

// --- 5. Why class syntax hides prototype bugs ---
class Base {
  greet() { return 'hello from Base'; }
}

class Child extends Base {}

const c = new Child();
// Dynamically adding to a prototype affects ALL instances — class syntax
// doesn't prevent this, it just makes it less obvious it's happening
Base.prototype.greet = function () { return 'hello MODIFIED'; };
console.log(c.greet()); // "hello MODIFIED" — mutation reached through the chain

// This is why libraries don't extend Array.prototype or Object.prototype
// in shared code — it affects every object in the runtime
```

## Why This Matters

Even if you write only `class` syntax, knowing prototypes matters:

- **Debugging** — when a method is "not a function" or returns unexpected results, checking whether it's an own property vs. inherited (via DevTools or `hasOwnProperty`) tells you where it's actually defined and whether it's been overwritten.
- **Performance** — methods on the prototype are shared across all instances. If you accidentally define methods in the constructor (`this.method = function(){}`) you create a new function object per instance. For 10,000 chart data points as objects, that's significant.
- **Mixins and composition** — `Object.assign(Target.prototype, mixin)` copies methods onto a prototype directly. This is how many mixin patterns work and why you'll see it in older codebase code.
- **`instanceof` internals** — `instanceof` checks the prototype chain, not the constructor function directly. It can return unexpected results if `Symbol.hasInstance` is overridden or if objects cross iframe boundaries (different `Array.prototype`).

## Exercise

Implement a `LinkedList` class using ES6 class syntax. Then verify your understanding of prototypes by answering — without running the code — whether each method you define lives on the instance or on `LinkedList.prototype`. Finally, implement the same `LinkedList` using `Object.create()` and a factory function instead of `class`.

The list needs: `push(value)`, `pop()`, `toArray()`, and a `length` property.

<details>
<summary>Hint</summary>

For the class version, methods defined inside the `class` body (not in the constructor) go on `LinkedList.prototype`, not on each instance. The `length` property you track in the constructor (`this.length = 0`) is an own property on each instance.

For the `Object.create()` version, define the methods on a plain object (`linkedListProto`), then use `Object.create(linkedListProto)` in your factory function and initialize own properties (`head`, `length`) on the returned object.

</details>

<details>
<summary>Solution</summary>

```javascript
// --- Class version ---
class LinkedList {
  constructor() {
    this.head = null;  // own property per instance
    this.length = 0;   // own property per instance
    // push, pop, toArray are on LinkedList.prototype — shared
  }

  push(value) {
    const node = { value, next: null };
    if (!this.head) {
      this.head = node;
    } else {
      let current = this.head;
      while (current.next) current = current.next;
      current.next = node;
    }
    this.length++;
  }

  pop() {
    if (!this.head) return undefined;
    if (!this.head.next) {
      const val = this.head.value;
      this.head = null;
      this.length--;
      return val;
    }
    let current = this.head;
    while (current.next.next) current = current.next;
    const val = current.next.value;
    current.next = null;
    this.length--;
    return val;
  }

  toArray() {
    const result = [];
    let current = this.head;
    while (current) {
      result.push(current.value);
      current = current.next;
    }
    return result;
  }
}

const list = new LinkedList();
list.push(1); list.push(2); list.push(3);
console.log(list.toArray()); // [1, 2, 3]
console.log(list.pop());     // 3
console.log(list.length);    // 2

// Prototype check:
console.log(list.hasOwnProperty('push'));   // false — on prototype
console.log(list.hasOwnProperty('head'));   // true — own property
console.log(list.hasOwnProperty('length')); // true — own property

// --- Object.create() version — same chain, explicit ---
const linkedListProto = {
  push(value) {
    const node = { value, next: null };
    if (!this.head) {
      this.head = node;
    } else {
      let current = this.head;
      while (current.next) current = current.next;
      current.next = node;
    }
    this.length++;
  },
  pop() {
    if (!this.head) return undefined;
    if (!this.head.next) {
      const val = this.head.value;
      this.head = null;
      this.length--;
      return val;
    }
    let current = this.head;
    while (current.next.next) current = current.next;
    const val = current.next.value;
    current.next = null;
    this.length--;
    return val;
  },
  toArray() {
    const result = [];
    let current = this.head;
    while (current) { result.push(current.value); current = current.next; }
    return result;
  },
};

function createLinkedList() {
  const list = Object.create(linkedListProto); // prototype chain set here
  list.head = null;
  list.length = 0;
  return list;
}

const list2 = createLinkedList();
list2.push('a'); list2.push('b');
console.log(list2.toArray()); // ['a', 'b']
console.log(Object.getPrototypeOf(list2) === linkedListProto); // true
```

</details>
