---
difficulty: intermediate
---

# Smart Pointers

Smart pointers are RAII wrappers around raw pointers. They manage the lifetime of heap-allocated objects automatically. The three you need are `unique_ptr`, `shared_ptr`, and `weak_ptr`. They're in `<memory>`.

The rule is simple: **if you're typing `new` or `delete` in modern C++, stop and ask why.**

## `unique_ptr` — Exclusive Ownership

`unique_ptr<T>` owns its object. When it goes out of scope, the object is deleted. It cannot be copied — only moved. Moving transfers ownership.

Use it for: anything with a single owner. The default choice for heap allocation.

## `shared_ptr` — Shared Ownership

`shared_ptr<T>` maintains a reference count. Each copy increments the count; each destruction decrements it. The object is deleted when the count reaches zero.

Use it for: objects genuinely shared between multiple owners where lifetime is uncertain.

Cost: the reference count lives on the heap (the control block), increment/decrement must be atomic (thread-safe), and the indirection adds cache pressure. Don't use it reflexively — it's not "safe `unique_ptr`", it's a different tool.

## `weak_ptr` — Non-Owning Observer

`weak_ptr<T>` holds a reference to a `shared_ptr`-managed object without participating in ownership. It does not prevent deletion. To access the object, you must call `.lock()`, which returns a `shared_ptr` — empty if the object was already deleted.

Use it for: breaking reference cycles (two `shared_ptr`s owning each other = leak), and observer/cache patterns where you want to check if an object still exists.

## The Rule of Zero/Three/Five

- **Rule of Zero**: if your class uses only RAII members (`unique_ptr`, `string`, `vector`), define no special member functions. The defaults work correctly.
- **Rule of Three** (C++03): if you define destructor, copy constructor, or copy assignment, define all three.
- **Rule of Five** (C++11+): add move constructor and move assignment to the above three.

## Example

```cpp
#include <iostream>
#include <memory>
#include <string>
#include <vector>

struct Resource {
    std::string name;
    explicit Resource(std::string n) : name(std::move(n)) {
        std::cout << "[Resource] constructed: " << name << '\n';
    }
    ~Resource() {
        std::cout << "[Resource] destroyed: " << name << '\n';
    }
    void use() const { std::cout << "  using: " << name << '\n'; }
};

// --- unique_ptr ---

void demo_unique() {
    std::cout << "\n--- unique_ptr ---\n";

    // Prefer make_unique: exception-safe, no raw new
    auto r1 = std::make_unique<Resource>("alpha");
    r1->use();

    // Transfer ownership with move
    auto r2 = std::move(r1);     // r1 is now nullptr
    r2->use();
    std::cout << "r1 is null: " << (r1 == nullptr) << '\n';

    // unique_ptr in a container: vector takes ownership
    std::vector<std::unique_ptr<Resource>> pool;
    pool.push_back(std::make_unique<Resource>("beta"));
    pool.push_back(std::make_unique<Resource>("gamma"));

    for (const auto& r : pool) r->use();

    // pool destroyed at end of scope -> all Resources destroyed
}   // r2 destroyed here -> "alpha" destroyed

// --- Factory function returning unique_ptr ---
// Caller gets clear ownership semantics

std::unique_ptr<Resource> create_resource(const std::string& name) {
    return std::make_unique<Resource>(name);
}

// Accepting unique_ptr by value = taking ownership
void consume(std::unique_ptr<Resource> r) {
    r->use();
}   // r destroyed here

// Accepting by const ref = borrowing, no ownership transfer
void borrow(const Resource& r) {
    r.use();
}

// --- shared_ptr ---

void demo_shared() {
    std::cout << "\n--- shared_ptr ---\n";

    auto s1 = std::make_shared<Resource>("shared");
    std::cout << "  ref count: " << s1.use_count() << '\n';   // 1

    {
        auto s2 = s1;   // copy: both own it
        std::cout << "  ref count: " << s1.use_count() << '\n';  // 2
        s2->use();
    }   // s2 destroyed, count goes to 1 — Resource NOT destroyed yet

    std::cout << "  ref count after s2 scope: " << s1.use_count() << '\n';  // 1
}   // s1 destroyed, count = 0 -> Resource destroyed

// --- weak_ptr: breaking a reference cycle ---

struct Node {
    std::string           value;
    std::shared_ptr<Node> next;     // strong: owns next
    std::weak_ptr<Node>   prev;     // weak: does NOT own prev — breaks cycle

    explicit Node(std::string v) : value(std::move(v)) {
        std::cout << "[Node] created: " << value << '\n';
    }
    ~Node() {
        std::cout << "[Node] destroyed: " << value << '\n';
    }
};

void demo_weak() {
    std::cout << "\n--- weak_ptr cycle prevention ---\n";

    auto n1 = std::make_shared<Node>("first");
    auto n2 = std::make_shared<Node>("second");

    n1->next = n2;
    n2->prev = n1;    // weak_ptr: n2 does not keep n1 alive

    // Accessing through weak_ptr
    if (auto locked = n2->prev.lock()) {
        std::cout << "  prev of second: " << locked->value << '\n';
    }

    // n1 and n2 go out of scope: both destroyed correctly
    // If prev were shared_ptr, n1 would keep n2 alive and n2 would keep n1 alive = leak
}

// --- Rule of Zero: class with RAII members needs no special functions ---

class Config {
public:
    Config(std::string path, std::unique_ptr<Resource> res)
        : path_(std::move(path)), resource_(std::move(res)) {}

    void show() const {
        std::cout << "Config[" << path_ << "]: ";
        resource_->use();
    }

    // No destructor, no copy/move defined — unique_ptr handles it all
    // Config is non-copyable (unique_ptr is non-copyable) — correct behavior

private:
    std::string              path_;
    std::unique_ptr<Resource> resource_;
};

int main() {
    demo_unique();
    demo_shared();
    demo_weak();

    std::cout << "\n--- factory + consume + borrow ---\n";
    auto r = create_resource("delta");
    borrow(*r);              // pass raw reference for non-owning use
    consume(std::move(r));   // transfer ownership
    std::cout << "r is null after consume: " << (r == nullptr) << '\n';

    std::cout << "\n--- Rule of Zero config ---\n";
    Config cfg("app.conf", std::make_unique<Resource>("config-resource"));
    cfg.show();

    return 0;
}
```

## Why This Matters

Memory safety issues — use-after-free, double-free, leaks — are eliminated when you use smart pointers consistently. This is exactly what Rust's ownership model enforces at compile time; in C++, you do it by convention, but the convention is clear and mechanical.

`unique_ptr` alone eliminates most manual `delete` calls. `shared_ptr` is the right tool when objects are truly shared, but be aware that `shared_ptr` everywhere is a design smell — it often means ownership hasn't been thought through. Profiling C++ code in production frequently reveals unnecessary `shared_ptr` copies as a hot path; switching to `unique_ptr` with explicit borrows is often a significant speedup.

## Exercise

Build a simple **object pool** using `shared_ptr` and `weak_ptr`:

1. `ObjectPool<T>` stores a `vector<shared_ptr<T>>`.
2. `acquire()` returns a `shared_ptr<T>` to an available object, or creates a new one if all are in use.
3. Objects are "available" when no external `shared_ptr` holds them — check with `weak_ptr::expired()`.
4. Test with a simple `Connection` struct that prints on construction/destruction.

<details>
<summary>Hint</summary>
Store a `vector<weak_ptr<T>>` in the pool. In `acquire()`, iterate the vector looking for `wp.expired() == true` (the pooled object has no external holders). If found, create a new object, store a `weak_ptr` to it, and return the `shared_ptr`. If all slots are active, push a new entry. The external caller holding the `shared_ptr` is the "lease" — when they drop it, the object returns to available status automatically.
</details>

<details>
<summary>Solution</summary>

```cpp
#include <iostream>
#include <memory>
#include <vector>
#include <string>

struct Connection {
    int id;
    explicit Connection(int i) : id(i) {
        std::cout << "[Connection " << id << "] opened\n";
    }
    ~Connection() {
        std::cout << "[Connection " << id << "] closed\n";
    }
    void query(const std::string& sql) const {
        std::cout << "  conn " << id << " runs: " << sql << '\n';
    }
};

template<typename T>
class ObjectPool {
public:
    std::shared_ptr<T> acquire() {
        // Look for an expired slot (object has no external holders)
        for (auto& wp : slots_) {
            if (wp.expired()) {
                auto obj = std::make_shared<T>(next_id_++);
                wp = obj;
                return obj;
            }
        }
        // All slots active: add a new one
        auto obj = std::make_shared<T>(next_id_++);
        slots_.push_back(obj);
        return obj;
    }

    std::size_t active_count() const {
        std::size_t n = 0;
        for (const auto& wp : slots_) if (!wp.expired()) ++n;
        return n;
    }

private:
    std::vector<std::weak_ptr<T>> slots_;
    int next_id_ = 1;
};

int main() {
    ObjectPool<Connection> pool;

    auto c1 = pool.acquire();
    auto c2 = pool.acquire();
    c1->query("SELECT 1");
    c2->query("SELECT 2");

    std::cout << "Active: " << pool.active_count() << '\n';   // 2

    c1.reset();   // "release" c1 back to pool
    std::cout << "Active after release: " << pool.active_count() << '\n'; // 1

    auto c3 = pool.acquire();   // should reuse slot 1 (creates Connection 3)
    c3->query("SELECT 3");

    std::cout << "Active: " << pool.active_count() << '\n';   // 2
    return 0;   // c2 and c3 destroyed here
}
```

</details>
