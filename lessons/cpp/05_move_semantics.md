---
difficulty: intermediate
---

# Move Semantics

Move semantics lets C++ transfer resources from one object to another instead of copying them. For large objects — vectors, strings, open file handles — this is the difference between O(n) copying and O(1) pointer swaps.

## Lvalues and Rvalues

An **lvalue** has a name and a persistent location in memory. You can take its address. An **rvalue** is temporary — it's the result of an expression, a literal, or a return value that has no name. After the current expression, it's gone.

```cpp
int x = 5;       // x is an lvalue; 5 is an rvalue
std::string s = std::string("hello");   // the temporary is an rvalue
```

## Rvalue References (`&&`)

An rvalue reference (`T&&`) binds to temporaries. A function overloaded on `T&&` is called when the argument is an rvalue — either a temporary or an object explicitly cast with `std::move`.

`std::move(x)` does **not** move anything. It's a cast: it turns an lvalue into an rvalue reference, signaling "I'm done with this object, you can steal its guts." The actual stealing happens in the move constructor or move assignment operator.

## The Move Constructor and Move Assignment Operator

A move constructor takes `T&&` and leaves the source in a valid but empty state (typically nulling out pointers). It's called by the compiler when a temporary is passed or when you explicitly `std::move`.

After a move, the source object is in a **valid but unspecified state**. You can assign to it or destroy it, but you cannot rely on its contents.

## Perfect Forwarding

`std::forward<T>(arg)` preserves the value category of a forwarded argument: lvalues stay lvalues, rvalues stay rvalues. Use it in template functions that need to forward arguments to another function without changing their category.

## When the Compiler Moves Automatically

- Returning a local variable by value (NRVO — Named Return Value Optimization may apply, or a move happens).
- Passing a temporary to a function taking `T` by value.
- Initializing a new object from a temporary.

You only need `std::move` explicitly when you want to treat an lvalue as an rvalue — most commonly when returning a named local or when putting an object into a container.

## Example

```cpp
#include <iostream>
#include <string>
#include <vector>
#include <utility>
#include <memory>

// --- A class with explicit move support ---

class HeavyBuffer {
public:
    explicit HeavyBuffer(std::size_t size)
        : size_(size), data_(new int[size]) {
        std::cout << "[HeavyBuffer] allocated " << size << " ints\n";
        for (std::size_t i = 0; i < size; ++i) data_[i] = static_cast<int>(i);
    }

    // Copy constructor: expensive — O(n)
    HeavyBuffer(const HeavyBuffer& other)
        : size_(other.size_), data_(new int[other.size_]) {
        std::cout << "[HeavyBuffer] COPY constructed (" << size_ << " ints)\n";
        std::copy(other.data_, other.data_ + size_, data_);
    }

    // Move constructor: cheap — O(1)
    HeavyBuffer(HeavyBuffer&& other) noexcept
        : size_(other.size_), data_(other.data_) {
        std::cout << "[HeavyBuffer] MOVE constructed\n";
        other.data_ = nullptr;   // leave source in valid empty state
        other.size_ = 0;
    }

    // Copy assignment
    HeavyBuffer& operator=(const HeavyBuffer& other) {
        if (this == &other) return *this;
        std::cout << "[HeavyBuffer] COPY assigned\n";
        delete[] data_;
        size_ = other.size_;
        data_ = new int[size_];
        std::copy(other.data_, other.data_ + size_, data_);
        return *this;
    }

    // Move assignment
    HeavyBuffer& operator=(HeavyBuffer&& other) noexcept {
        std::cout << "[HeavyBuffer] MOVE assigned\n";
        if (this == &other) return *this;
        delete[] data_;
        size_ = other.size_;
        data_ = other.data_;
        other.data_ = nullptr;
        other.size_ = 0;
        return *this;
    }

    ~HeavyBuffer() {
        if (data_) {
            std::cout << "[HeavyBuffer] destroyed (" << size_ << " ints)\n";
        } else {
            std::cout << "[HeavyBuffer] destroyed (moved-from, empty)\n";
        }
        delete[] data_;
    }

    std::size_t size() const { return size_; }
    int operator[](std::size_t i) const { return data_[i]; }

private:
    std::size_t size_;
    int*        data_;
};

// --- Factory: returning by value triggers move or NRVO ---

HeavyBuffer make_buffer(std::size_t size) {
    HeavyBuffer buf(size);
    // Compiler may apply NRVO (no move at all) or will move — either is O(1)
    return buf;
}

// --- std::move in practice: moving into a container ---

void demo_move_into_vector() {
    std::cout << "\n--- move into vector ---\n";
    std::vector<HeavyBuffer> v;
    v.reserve(2);

    HeavyBuffer b(100);
    v.push_back(std::move(b));    // MOVE into vector — b is now empty
    std::cout << "b.size() after move: " << b.size() << '\n';   // 0

    v.emplace_back(200);          // construct directly in-place — best option
}

// --- Perfect forwarding ---

template<typename T>
void log_and_store(std::vector<T>& container, T&& item) {
    std::cout << "storing...\n";
    container.push_back(std::forward<T>(item));   // forward preserves lvalue/rvalue
}

// --- std::move with strings (common performance pattern) ---

void demo_string_move() {
    std::cout << "\n--- string move ---\n";

    std::string a = "a long string that would be expensive to copy";
    std::string b = std::move(a);   // O(1): pointer swap, not copy

    std::cout << "b: " << b << '\n';
    std::cout << "a after move: '" << a << "'\n";   // valid but unspecified

    // Practical: building a vector of strings from another source
    std::vector<std::string> tokens = {"alpha", "beta", "gamma"};
    std::vector<std::string> dest;
    dest.reserve(tokens.size());

    for (auto& token : tokens) {
        dest.push_back(std::move(token));   // move each string instead of copying
    }

    std::cout << "dest[1]: " << dest[1] << '\n';   // beta
}

// --- Swap using move (how std::swap works internally) ---

template<typename T>
void my_swap(T& a, T& b) {
    T temp = std::move(a);   // a is now "empty"
    a = std::move(b);        // b's contents into a
    b = std::move(temp);     // temp's (original a's) contents into b
    // Three moves instead of three copies — critical for large objects
}

int main() {
    std::cout << "--- factory ---\n";
    HeavyBuffer buf = make_buffer(50);
    std::cout << "buf[5] = " << buf[5] << '\n';

    std::cout << "\n--- explicit copy vs move ---\n";
    HeavyBuffer original(20);
    HeavyBuffer copied = original;             // copy
    HeavyBuffer moved  = std::move(original);  // move — original is now empty

    demo_move_into_vector();
    demo_string_move();

    std::cout << "\n--- my_swap ---\n";
    HeavyBuffer x(10), y(30);
    std::cout << "before: x=" << x.size() << " y=" << y.size() << '\n';
    my_swap(x, y);
    std::cout << "after:  x=" << x.size() << " y=" << y.size() << '\n';

    return 0;
}
```

## Why This Matters

Before C++11, returning a `vector` from a function meant copying the entire contents. Every `push_back` of a large object that wasn't in-place meant a copy. This made C++ "fast in theory" but "slow in practice if you weren't careful." Move semantics closed the gap: idiomatic code is now efficient code.

Modern C++ idioms like returning by value, accepting sink parameters by value, and using `emplace_back` instead of `push_back` all depend on move semantics being cheap. Understanding when a move happens — and when the compiler can optimize it away entirely with RVO — is what separates intermediate from advanced C++.

## Exercise

Write a `UniqueArray<T>` class that wraps a heap-allocated array, following the Rule of Five:

1. Constructor: takes a size, allocates `new T[size]`.
2. Destructor: deletes the array.
3. Copy constructor: deep copies.
4. Copy assignment: deep copy with self-assignment check.
5. Move constructor: steals the pointer, nulls the source.
6. Move assignment: steal pointer, null source, handle self-assignment.
7. `operator[]` for element access.
8. `size()` getter.

Then benchmark (or just print annotations): fill a `vector<UniqueArray<int>>` with 5 elements using `push_back` on a named object (copy), and compare to using `std::move` or `emplace_back`.

<details>
<summary>Hint</summary>
The move constructor and assignment should set `other.data_ = nullptr` and `other.size_ = 0`. Your destructor must handle `nullptr` (calling `delete[] nullptr` is safe in C++, but being explicit is good practice). For the comparison: declare a named `UniqueArray`, then `push_back(arr)` for a copy and `push_back(std::move(arr))` for a move — add print statements to both special members to observe which fires.
</details>

<details>
<summary>Solution</summary>

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

template<typename T>
class UniqueArray {
public:
    explicit UniqueArray(std::size_t size)
        : size_(size), data_(new T[size]()) {
        std::cout << "  [construct size=" << size_ << "]\n";
    }

    ~UniqueArray() {
        std::cout << "  [destroy size=" << size_ << "]\n";
        delete[] data_;
    }

    // Copy
    UniqueArray(const UniqueArray& o)
        : size_(o.size_), data_(new T[o.size_]) {
        std::cout << "  [copy size=" << size_ << "]\n";
        std::copy(o.data_, o.data_ + size_, data_);
    }

    UniqueArray& operator=(const UniqueArray& o) {
        std::cout << "  [copy assign]\n";
        if (this == &o) return *this;
        delete[] data_;
        size_ = o.size_;
        data_ = new T[size_];
        std::copy(o.data_, o.data_ + size_, data_);
        return *this;
    }

    // Move
    UniqueArray(UniqueArray&& o) noexcept
        : size_(o.size_), data_(o.data_) {
        std::cout << "  [move size=" << size_ << "]\n";
        o.data_ = nullptr;
        o.size_ = 0;
    }

    UniqueArray& operator=(UniqueArray&& o) noexcept {
        std::cout << "  [move assign]\n";
        if (this == &o) return *this;
        delete[] data_;
        size_ = o.size_;
        data_ = o.data_;
        o.data_ = nullptr;
        o.size_ = 0;
        return *this;
    }

    T& operator[](std::size_t i)       { return data_[i]; }
    const T& operator[](std::size_t i) const { return data_[i]; }
    std::size_t size() const { return size_; }

private:
    std::size_t size_;
    T*          data_;
};

int main() {
    std::cout << "--- push_back by copy ---\n";
    {
        std::vector<UniqueArray<int>> v;
        v.reserve(3);
        UniqueArray<int> a(5);
        a[0] = 42;
        v.push_back(a);             // copy: a still valid
        std::cout << "a[0]=" << a[0] << '\n';
    }

    std::cout << "\n--- push_back with move ---\n";
    {
        std::vector<UniqueArray<int>> v;
        v.reserve(3);
        UniqueArray<int> b(5);
        b[0] = 42;
        v.push_back(std::move(b));  // move: b is now empty
        std::cout << "b.size()=" << b.size() << '\n';   // 0
    }

    std::cout << "\n--- emplace_back (construct in-place) ---\n";
    {
        std::vector<UniqueArray<int>> v;
        v.reserve(3);
        v.emplace_back(5);          // no copy, no move — constructed directly
    }

    return 0;
}
```

</details>
