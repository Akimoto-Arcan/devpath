---
difficulty: intermediate
---

# STL Containers and Algorithms

The STL containers are not interchangeable. Each has a specific performance profile, and picking the wrong one is a real bottleneck. Equally important: the algorithms in `<algorithm>` and `<numeric>` work with any container via iterators, and combining them with lambdas replaces most hand-written loops.

## `vector` — The Default Container

`vector<T>` is a contiguous array that resizes. Key behaviors:
- `push_back` is amortized O(1): the vector doubles capacity when full. Individual reallocations are O(n) but rare.
- **Iterator invalidation**: any operation that causes reallocation (push_back when at capacity, insert, erase) invalidates all iterators and pointers into the vector. Never hold a pointer to a vector element across a modification.
- `reserve(n)` pre-allocates capacity without changing size — eliminates reallocations if you know the size upfront.
- Access by index (`v[i]`) is O(1), no bounds check. `v.at(i)` checks bounds and throws.

## `map` vs `unordered_map`

| | `map<K,V>` | `unordered_map<K,V>` |
|---|---|---|
| Structure | Red-black tree | Hash table |
| Lookup | O(log n) | O(1) average, O(n) worst |
| Ordered | Yes (by key) | No |
| Iterator stability | Yes (insertion/erase don't invalidate other iterators) | No (rehash invalidates all) |
| Memory | Node-based, pointer-heavy | Dense buckets, load factor controlled |

Use `map` when you need sorted order or stable iterators. Use `unordered_map` when you need fast lookup and don't care about order. For integer or string keys, `unordered_map` is almost always faster in practice.

## `deque`, `set`, `list`

- `deque<T>`: O(1) push/pop at both ends, O(1) random access. Not contiguous. Good for queues where you need index access.
- `set<T>` / `unordered_set<T>`: unique elements, same tree/hash trade-offs as map.
- `list<T>`: doubly linked list. O(1) insert/erase anywhere with an iterator. No random access. Cache-unfriendly. Rarely the right choice — `vector` with `erase` beats it in practice due to cache behavior.

## STL Algorithms

`<algorithm>` algorithms work on iterator ranges `[first, last)`. Most algorithms accept a predicate or transform function, which is where lambdas come in. Key algorithms: `sort`, `stable_sort`, `find`, `find_if`, `count_if`, `remove_if`, `transform`, `for_each`, `any_of`, `all_of`, `none_of`. From `<numeric>`: `accumulate`, `reduce`, `iota`.

## Example

```cpp
#include <iostream>
#include <vector>
#include <map>
#include <unordered_map>
#include <set>
#include <algorithm>
#include <numeric>
#include <string>
#include <functional>

// --- vector: fundamentals and iterator invalidation ---

void demo_vector() {
    std::cout << "=== vector ===\n";

    std::vector<int> v;
    v.reserve(10);           // pre-allocate — no reallocation during next 10 pushes

    for (int i = 0; i < 8; ++i) v.push_back(i * i);

    std::cout << "size=" << v.size() << " cap=" << v.capacity() << '\n';

    // Range-based for: use const& to avoid copying
    for (const int& x : v) std::cout << x << ' ';
    std::cout << '\n';

    // Erase-remove idiom: remove all even numbers
    v.erase(
        std::remove_if(v.begin(), v.end(), [](int x){ return x % 2 == 0; }),
        v.end()
    );
    for (int x : v) std::cout << x << ' ';   // 1 9 25 49
    std::cout << '\n';

    // Iterator invalidation demo — DO NOT do this:
    // auto it = v.begin();
    // v.push_back(999);    // if reallocation occurs, 'it' is invalid!
    // std::cout << *it;    // undefined behavior
}

// --- map vs unordered_map ---

void demo_maps() {
    std::cout << "\n=== map vs unordered_map ===\n";

    // Word frequency count
    std::string text = "the cat sat on the mat the cat sat";
    std::unordered_map<std::string, int> freq;

    // Simple tokenizer using find
    std::size_t start = 0, end;
    while ((end = text.find(' ', start)) != std::string::npos) {
        freq[text.substr(start, end - start)]++;
        start = end + 1;
    }
    freq[text.substr(start)]++;

    // unordered_map iteration order is undefined
    std::cout << "Unordered (arbitrary order):\n";
    for (const auto& [word, count] : freq) {
        std::cout << "  " << word << ": " << count << '\n';
    }

    // Copy into map for sorted output
    std::map<std::string, int> sorted_freq(freq.begin(), freq.end());
    std::cout << "Sorted:\n";
    for (const auto& [word, count] : sorted_freq) {
        std::cout << "  " << word << ": " << count << '\n';
    }

    // map: ordered iteration, range queries
    std::map<int, std::string> scores = {
        {95, "Alice"}, {87, "Bob"}, {72, "Carol"}, {91, "Diana"}
    };

    // lower_bound: first key >= 90
    auto it = scores.lower_bound(90);
    std::cout << "\nScores >= 90:\n";
    for (; it != scores.end(); ++it) {
        std::cout << "  " << it->second << ": " << it->first << '\n';
    }
}

// --- STL algorithms with lambdas ---

struct Employee {
    std::string name;
    std::string dept;
    double      salary;
};

void demo_algorithms() {
    std::cout << "\n=== algorithms ===\n";

    std::vector<Employee> staff = {
        {"Alice",   "Eng",  95000},
        {"Bob",     "HR",   62000},
        {"Carol",   "Eng",  88000},
        {"Diana",   "Eng",  102000},
        {"Edward",  "HR",   58000},
    };

    // Sort by salary descending
    std::sort(staff.begin(), staff.end(),
        [](const Employee& a, const Employee& b){
            return a.salary > b.salary;
        });

    std::cout << "Sorted by salary:\n";
    for (const auto& e : staff)
        std::cout << "  " << e.name << " $" << e.salary << '\n';

    // find_if: first engineer
    auto first_eng = std::find_if(staff.begin(), staff.end(),
        [](const Employee& e){ return e.dept == "Eng"; });

    if (first_eng != staff.end())
        std::cout << "Highest-paid engineer: " << first_eng->name << '\n';

    // count_if
    int eng_count = std::count_if(staff.begin(), staff.end(),
        [](const Employee& e){ return e.dept == "Eng"; });
    std::cout << "Engineers: " << eng_count << '\n';

    // transform: extract names into a new vector
    std::vector<std::string> names;
    names.reserve(staff.size());
    std::transform(staff.begin(), staff.end(), std::back_inserter(names),
        [](const Employee& e){ return e.name; });

    std::cout << "Names: ";
    for (const auto& n : names) std::cout << n << ' ';
    std::cout << '\n';

    // accumulate: total salary
    double total = std::accumulate(staff.begin(), staff.end(), 0.0,
        [](double sum, const Employee& e){ return sum + e.salary; });
    std::cout << "Total payroll: $" << total << '\n';

    // any_of, all_of, none_of
    bool any_over_100k = std::any_of(staff.begin(), staff.end(),
        [](const Employee& e){ return e.salary > 100000; });
    bool all_over_50k = std::all_of(staff.begin(), staff.end(),
        [](const Employee& e){ return e.salary > 50000; });

    std::cout << "Any over $100k: " << std::boolalpha << any_over_100k << '\n';
    std::cout << "All over $50k: "  << all_over_50k << '\n';

    // iota: fill a vector with consecutive values
    std::vector<int> indices(staff.size());
    std::iota(indices.begin(), indices.end(), 0);   // 0, 1, 2, 3, 4
    for (int i : indices) std::cout << i << ' ';
    std::cout << '\n';
}

// --- set for unique sorted elements ---

void demo_set() {
    std::cout << "\n=== set ===\n";

    std::vector<int> dupes = {3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5};
    std::set<int> unique(dupes.begin(), dupes.end());

    for (int x : unique) std::cout << x << ' ';  // 1 2 3 4 5 6 9
    std::cout << '\n';

    std::cout << "Contains 4: " << unique.count(4) << '\n';   // 1
    std::cout << "Contains 7: " << unique.count(7) << '\n';   // 0
}

int main() {
    demo_vector();
    demo_maps();
    demo_algorithms();
    demo_set();
    return 0;
}
```

## Why This Matters

Container choice is an architectural decision. A hot loop that does `std::map::find` instead of `std::unordered_map::find` on a million lookups can be 5-10x slower. A `std::list` that seemed reasonable when elements were large structs becomes a cache miss machine when the working set grows.

The algorithm library eliminates boilerplate loops, which means less code to read, fewer off-by-one errors, and clearer intent. `std::remove_if` + `erase` is more readable than a hand-written index loop with shifting. When someone can read your algorithm chain and understand the transformation without tracing loop indices, the code is better.

## Exercise

Given this data:

```cpp
struct Order {
    int         id;
    std::string customer;
    double      amount;
    bool        fulfilled;
};
```

Write code that:

1. Starts with a `vector<Order>` of at least 8 entries.
2. Extracts all unfulfilled orders where `amount > 100.0` into a new vector (use `copy_if`).
3. Sorts them by amount descending.
4. Prints a formatted report: `Order #ID | Customer | $Amount`.
5. Computes and prints the total value of unfulfilled orders over $100.

Use only STL algorithms — no hand-written index loops.

<details>
<summary>Hint</summary>
`std::copy_if` takes an input range, an output iterator (`std::back_inserter(result)`), and a predicate. Sort with a lambda. For the total, use `std::accumulate` with a lambda that adds `o.amount` to the running sum. `std::for_each` or a range-based for loop handles the print step.
</details>

<details>
<summary>Solution</summary>

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <numeric>
#include <string>
#include <iomanip>

struct Order {
    int         id;
    std::string customer;
    double      amount;
    bool        fulfilled;
};

int main() {
    std::vector<Order> orders = {
        {1,  "Alice",   250.00, false},
        {2,  "Bob",      45.00, false},
        {3,  "Carol",   180.00, true },
        {4,  "Diana",   320.00, false},
        {5,  "Edward",   80.00, false},
        {6,  "Frank",   150.00, false},
        {7,  "Grace",   500.00, true },
        {8,  "Heidi",   210.00, false},
    };

    std::vector<Order> pending;
    std::copy_if(orders.begin(), orders.end(), std::back_inserter(pending),
        [](const Order& o){ return !o.fulfilled && o.amount > 100.0; });

    std::sort(pending.begin(), pending.end(),
        [](const Order& a, const Order& b){ return a.amount > b.amount; });

    std::cout << std::left
              << std::setw(12) << "Order"
              << std::setw(12) << "Customer"
              << "Amount\n"
              << std::string(35, '-') << '\n';

    std::for_each(pending.begin(), pending.end(), [](const Order& o){
        std::cout << std::left
                  << std::setw(12) << ("#" + std::to_string(o.id))
                  << std::setw(12) << o.customer
                  << "$" << std::fixed << std::setprecision(2) << o.amount << '\n';
    });

    double total = std::accumulate(pending.begin(), pending.end(), 0.0,
        [](double sum, const Order& o){ return sum + o.amount; });

    std::cout << std::string(35, '-') << '\n';
    std::cout << "Total pending (>$100): $"
              << std::fixed << std::setprecision(2) << total << '\n';

    return 0;
}
```

</details>
