---
difficulty: intermediate
---

# Pointers vs References

Both pointers and references give you indirect access to a value. The difference is in syntax, safety guarantees, and what operations are allowed. Choosing correctly between them is one of the most consistent signals of C++ fluency.

## Core Differences

A **pointer** stores an address. It can be null, can be reassigned to point elsewhere, supports arithmetic, and must be explicitly dereferenced. A **reference** is an alias — it must be initialized on declaration, cannot be reseated, cannot be null, and uses the same syntax as the object it refers to.

```
int x = 10;
int* p = &x;     // pointer — stores address
int& r = x;      // reference — alias for x
```

After this, `*p = 20` and `r = 20` both modify `x`. But `p = nullptr` is legal while there is no equivalent for `r`.

## `const` Correctness

Four combinations exist, and mixing them up is a constant source of bugs:

| Declaration | Pointer movable | Value changeable |
|---|---|---|
| `int* p` | yes | yes |
| `const int* p` | yes | no |
| `int* const p` | no | yes |
| `const int* const p` | no | no |

Read right-to-left: `const int* p` = "p is a pointer to const int." `int* const p` = "p is a const pointer to int."

References follow the same rule. `const int& r` is a reference to a const int — you can read through it but not write. This is the standard way to accept large objects in functions without copying and without allowing modification.

## Example

```cpp
#include <iostream>
#include <string>
#include <vector>

// --- Const correctness in function signatures ---

// Bad: copies the entire string on every call
void print_bad(std::string s) {
    std::cout << s << '\n';
}

// Good: no copy, no modification allowed
void print_good(const std::string& s) {
    std::cout << s << '\n';
}

// Good: pointer version — useful when null is a valid state
void print_ptr(const std::string* s) {
    if (s) std::cout << *s << '\n';
    else   std::cout << "(null)\n";
}

// --- Returning by reference: pitfall ---

// WRONG: returns reference to local variable — undefined behavior
// const std::string& dangerous() {
//     std::string local = "hello";
//     return local;   // local dies here!
// }

// OK: returning reference to something that outlives the function
const std::string& get_name(const std::vector<std::string>& names, int i) {
    return names[i];   // vector owns the data; reference is valid as long as vector lives
}

// --- Pointer arithmetic ---
void demonstrate_pointer_arithmetic() {
    int arr[] = {10, 20, 30, 40, 50};
    int* p = arr;           // points to arr[0]

    std::cout << *p         << '\n';  // 10
    std::cout << *(p + 2)   << '\n';  // 30  — two ints forward
    std::cout << p[3]       << '\n';  // 40  — array indexing is pointer arithmetic
    p += 1;
    std::cout << *p         << '\n';  // 20  — pointer advanced
}

// --- nullptr vs NULL ---
// NULL is typically defined as 0 (an int), which creates ambiguity with overloads.
// nullptr is a proper null pointer constant (type std::nullptr_t).
void overloaded(int n)    { std::cout << "int: " << n << '\n'; }
void overloaded(int* p)   { std::cout << "ptr: " << (p ? *p : -1) << '\n'; }

// --- Modifying through pointer vs reference ---
void increment_by_ref(int& n) { n++; }     // clean — no dereference syntax at call site
void increment_by_ptr(int* p) { (*p)++; }  // explicit null check possible here

// --- const pointer to non-const: iterator-like usage ---
void walk_array(const int* const data, int size) {
    // data = other_ptr;    // compile error: pointer is const
    // data[0] = 99;        // compile error: pointed-to value is const
    for (int i = 0; i < size; ++i) {
        std::cout << data[i] << ' ';
    }
    std::cout << '\n';
}

int main() {
    std::string msg = "Hello, C++";
    print_good(msg);
    print_ptr(&msg);
    print_ptr(nullptr);   // safe because function checks

    std::vector<std::string> names = {"Alice", "Bob", "Carol"};
    const std::string& name_ref = get_name(names, 1);
    std::cout << name_ref << '\n';   // Bob
    // name_ref = "other";           // compile error: const ref

    demonstrate_pointer_arithmetic();

    // overload resolution: nullptr picks the pointer overload
    overloaded(0);        // int: 0   (ambiguous without nullptr)
    overloaded(nullptr);  // ptr: -1

    int value = 5;
    increment_by_ref(value);
    std::cout << value << '\n';   // 6

    increment_by_ptr(&value);
    std::cout << value << '\n';   // 7

    int arr[] = {1, 2, 3, 4, 5};
    walk_array(arr, 5);   // 1 2 3 4 5

    return 0;
}
```

## Why This Matters

Every C++ API you write or consume is full of these choices. The standard library uses `const T&` for input parameters and `T&` for output parameters where null isn't valid. When you see `const std::string&` in a function signature, you know: no copy, caller retains ownership, function won't modify it. That's a contract encoded in the type system.

Pointer arithmetic is the foundation of how iterators work, how raw memory buffers are processed, and how C APIs are wrapped. Understanding it cleanly separates "I use C++" from "I understand C++."

## Exercise

Write a function `find_and_replace` with this signature:

```cpp
int find_and_replace(std::vector<int>& data, const int* search, int replace_val);
```

- `data`: the vector to modify in-place.
- `search`: pointer to the value to find. If null, replace nothing.
- `replace_val`: value to substitute.
- Returns the count of replacements made.

Then write a second overload:

```cpp
int find_and_replace(std::vector<int>& data, const int& search, int replace_val);
```

Call both in `main` and verify they produce identical results.

<details>
<summary>Hint</summary>
In the pointer version, check `if (search == nullptr) return 0;` first. Dereference with `*search` to get the value to compare against. In the reference version, you already have the value directly. The body of both versions can be nearly identical — the only difference is how you get the search value.
</details>

<details>
<summary>Solution</summary>

```cpp
#include <iostream>
#include <vector>

int find_and_replace(std::vector<int>& data, const int* search, int replace_val) {
    if (search == nullptr) return 0;
    int count = 0;
    for (int& elem : data) {
        if (elem == *search) {
            elem = replace_val;
            ++count;
        }
    }
    return count;
}

int find_and_replace(std::vector<int>& data, const int& search, int replace_val) {
    int count = 0;
    for (int& elem : data) {
        if (elem == search) {
            elem = replace_val;
            ++count;
        }
    }
    return count;
}

int main() {
    std::vector<int> v1 = {1, 2, 3, 2, 4, 2};
    std::vector<int> v2 = v1;

    int target = 2;
    int n1 = find_and_replace(v1, &target, 99);
    int n2 = find_and_replace(v2,  target, 99);

    std::cout << "Replacements (ptr): " << n1 << '\n';  // 3
    std::cout << "Replacements (ref): " << n2 << '\n';  // 3

    for (int x : v1) std::cout << x << ' ';  // 1 99 3 99 4 99
    std::cout << '\n';

    // Null pointer: no replacements
    int n3 = find_and_replace(v1, nullptr, 0);
    std::cout << "Null replacements: " << n3 << '\n';   // 0

    return 0;
}
```

</details>
