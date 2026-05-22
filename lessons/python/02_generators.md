---
difficulty: intermediate
---

# Generators and itertools

A generator is a function that produces values one at a time, pausing at each `yield` and resuming where it left off on the next call. Unlike a regular function that computes everything and returns a list, a generator holds only the current state in memory.

When Python encounters `yield`, it suspends the function's frame — local variables, execution position, everything — and hands the yielded value to the caller. The frame stays alive until the generator is exhausted or garbage collected.

```python
def count_up(start, stop):
    n = start
    while n < stop:
        yield n    # pauses here, resumes on next()
        n += 1
```

Calling `count_up(0, 5)` returns a generator object immediately without running any code. Iteration drives it forward.

## Generator Expressions vs List Comprehensions

The syntax is nearly identical — swap `[]` for `()`:

```python
squares_list = [x**2 for x in range(1000000)]   # builds entire list in memory
squares_gen  = (x**2 for x in range(1000000))    # builds nothing yet
```

Use a generator expression when you're feeding results directly into another function (`sum`, `max`, `any`, `all`, a loop) and don't need to reuse or index the results. Use a list when you need random access, multiple passes, or `len()`.

## Example

```python
import itertools
import sys

# --- Memory comparison ---
big_list = [x**2 for x in range(100_000)]
big_gen  = (x**2 for x in range(100_000))

print(f"List size: {sys.getsizeof(big_list):,} bytes")   # ~800,000 bytes
print(f"Gen size:  {sys.getsizeof(big_gen):,} bytes")    # ~200 bytes

# --- Infinite generator ---
def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

# You can't do this with a list — it would never finish
fib = fibonacci()
first_ten = [next(fib) for _ in range(10)]
print(first_ten)  # [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]

# --- itertools.islice: take N items from any iterable ---
from itertools import islice, chain, groupby

fib_under_1000 = list(itertools.takewhile(lambda x: x < 1000, fibonacci()))
print(fib_under_1000)

# --- itertools.chain: flatten multiple iterables without building a list ---
logs_jan = ["jan_a", "jan_b"]
logs_feb = ["feb_a", "feb_b"]
logs_mar = ["mar_a"]

for entry in chain(logs_jan, logs_feb, logs_mar):
    print(entry)

# --- itertools.groupby: group consecutive items by a key ---
# NOTE: groupby requires sorted input to work as expected
data = [
    {"dept": "eng",  "name": "Alice"},
    {"dept": "eng",  "name": "Bob"},
    {"dept": "hr",   "name": "Carol"},
    {"dept": "hr",   "name": "Dave"},
    {"dept": "eng",  "name": "Eve"},   # back to eng — separate group!
]

for dept, members in groupby(data, key=lambda r: r["dept"]):
    print(f"{dept}: {[m['name'] for m in members]}")
# eng: ['Alice', 'Bob']
# hr: ['Carol', 'Dave']
# eng: ['Eve']          <- new group because it wasn't sorted

# --- Generator pipeline: process a large file line by line ---
def read_lines(filepath):
    """Yield lines from a file without loading it all into memory."""
    with open(filepath) as f:
        yield from f

def grep(lines, pattern):
    """Yield only lines containing the pattern."""
    for line in lines:
        if pattern in line:
            yield line

def strip_lines(lines):
    """Yield stripped lines."""
    for line in lines:
        yield line.strip()

# Composable pipeline — nothing runs until you consume it
# lines = strip_lines(grep(read_lines("/var/log/syslog"), "ERROR"))
# for line in lines:
#     print(line)
```

## Why This Matters

Generators are the right tool any time the dataset might not fit in memory: log files, database result sets, network streams, large CSVs. A generator pipeline processes one record at a time regardless of input size.

`itertools` is underused but powerful. `chain` eliminates unnecessary list concatenation. `islice` lets you page through infinite or large iterables. `groupby` pairs with sorted data to replace manual accumulator logic. `product`, `combinations`, and `permutations` handle combinatorics without nested loops.

The `yield from` syntax delegates to a sub-generator, which is cleaner than a loop when you want to forward another iterable's values.

## Exercise

Write a generator function `sliding_window(iterable, n)` that yields tuples of `n` consecutive elements from the iterable. For example, `list(sliding_window([1,2,3,4,5], 3))` should return `[(1,2,3), (2,3,4), (3,4,5)]`.

Then use it with `itertools.islice` to print only the first 3 windows of a `fibonacci()` sequence with window size 4.

<details>
<summary>Hint</summary>

Use `collections.deque(maxlen=n)` to maintain a rolling window. Append each element from the iterable, and once the deque reaches length `n`, yield a tuple of its current contents. A deque with `maxlen` automatically discards the oldest element when it's full.
</details>

<details>
<summary>Solution</summary>

```python
from collections import deque
from itertools import islice

def sliding_window(iterable, n):
    window = deque(maxlen=n)
    for item in iterable:
        window.append(item)
        if len(window) == n:
            yield tuple(window)

def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

# First 3 windows of fibonacci with size 4
for window in islice(sliding_window(fibonacci(), 4), 3):
    print(window)
# (0, 1, 1, 2)
# (1, 1, 2, 3)
# (1, 2, 3, 5)
```

</details>
