---
difficulty: intermediate
---

# Type Hints and Dataclasses

Python's type hints are annotations — they don't affect runtime behavior by default, but they communicate intent, enable static analysis with tools like `mypy` or `pyright`, and power editor autocomplete. Used well, they make large codebases dramatically easier to navigate.

The `typing` module provides the building blocks. Since Python 3.10, many of these have native syntax equivalents, but the `typing` forms still work and remain common in codebases targeting 3.8 or 3.9.

Key types to know:

- `Optional[X]` — either `X` or `None`. Equivalent to `Union[X, None]` or (3.10+) `X | None`
- `Union[X, Y]` — one of several types. (3.10+) `X | Y`
- `List[X]`, `Dict[K, V]`, `Tuple[X, Y]`, `Set[X]` — typed collections. (3.9+) use lowercase `list[X]` etc.
- `Callable[[ArgType, ...], ReturnType]` — a callable with a specific signature
- `TypeVar` — a placeholder for a type that should be consistent within a function (generics)

## Dataclasses

`@dataclass` generates `__init__`, `__repr__`, and `__eq__` automatically from class-level annotations. It eliminates the boilerplate of writing `self.x = x` for every field while keeping the class readable and type-checkable.

`field()` gives you control over individual fields: default factories, exclusion from `__repr__` or `__init__`, metadata. `__post_init__` runs after the generated `__init__`, letting you add validation or derived fields.

## Example

```python
from __future__ import annotations   # enables PEP 563 postponed evaluation

import math
from dataclasses import dataclass, field
from typing import Optional, Union, Callable, TypeVar, List

# --- TypeVar for generic functions ---
T = TypeVar("T")

def first_or_default(items: List[T], default: T) -> T:
    """Return the first item or a default — type-safe regardless of list type."""
    return items[0] if items else default

print(first_or_default([1, 2, 3], 0))     # 1  (int)
print(first_or_default([], "fallback"))    # fallback  (str)

# --- Callable type hint ---
def apply_twice(func: Callable[[int], int], value: int) -> int:
    return func(func(value))

print(apply_twice(lambda x: x * 2, 3))    # 12

# --- Basic dataclass ---
@dataclass
class Point:
    x: float
    y: float

    def distance_to(self, other: Point) -> float:
        return math.sqrt((self.x - other.x)**2 + (self.y - other.y)**2)

p1 = Point(0.0, 0.0)
p2 = Point(3.0, 4.0)
print(p1.distance_to(p2))   # 5.0
print(p1)                   # Point(x=0.0, y=0.0) — __repr__ for free

# --- Dataclass with field(), defaults, and __post_init__ ---
@dataclass
class Employee:
    name: str
    department: str
    salary: float
    # field() with default_factory avoids the mutable default trap
    tags: List[str] = field(default_factory=list)
    # init=False means this field is not a constructor parameter
    _id: str = field(init=False, repr=False)

    def __post_init__(self):
        if self.salary < 0:
            raise ValueError(f"Salary cannot be negative: {self.salary}")
        # Derive _id after init runs
        self._id = f"{self.department[:3].upper()}-{self.name.replace(' ', '_')}"

    @property
    def employee_id(self) -> str:
        return self._id

emp = Employee("Alice Smith", "Engineering", 95000.0, tags=["python", "backend"])
print(emp)             # Employee(name='Alice Smith', department='Engineering', salary=95000.0, tags=['python', 'backend'])
print(emp.employee_id) # ENG-Alice_Smith

# --- frozen=True: immutable dataclass (hashable, usable as dict key) ---
@dataclass(frozen=True)
class Color:
    r: int
    g: int
    b: int

    def as_hex(self) -> str:
        return f"#{self.r:02x}{self.g:02x}{self.b:02x}"

red = Color(255, 0, 0)
print(red.as_hex())    # #ff0000
# red.r = 100          # would raise FrozenInstanceError

# --- Optional and Union in a realistic context ---
@dataclass
class ApiResponse:
    status: int
    data: Optional[dict]       # present on success, None on error
    error: Optional[str]       # present on error, None on success

    def is_success(self) -> bool:
        return 200 <= self.status < 300

def parse_response(raw: dict) -> ApiResponse:
    return ApiResponse(
        status=raw["status"],
        data=raw.get("data"),
        error=raw.get("error"),
    )

ok  = parse_response({"status": 200, "data": {"id": 1}})
err = parse_response({"status": 404, "error": "Not found"})
print(ok.is_success(), ok.data)     # True {'id': 1}
print(err.is_success(), err.error)  # False Not found
```

## Why This Matters

Type hints pay off at scale. In a codebase with dozens of modules and multiple contributors, `Optional[str]` tells every reader — and every static analysis tool — that `None` is a valid value that must be handled. Catching `AttributeError: 'NoneType' object has no attribute 'strip'` in the type checker beats finding it in production.

Dataclasses replace repetitive `__init__` boilerplate cleanly. `frozen=True` is useful for value objects (coordinates, config records, cache keys) that should not change after creation. For production API work, **Pydantic** builds on the same annotation syntax and adds runtime validation, JSON serialization, and error messages — it's the standard choice for request/response models in FastAPI.

## Exercise

Define a `@dataclass` called `Rectangle` with fields `width: float` and `height: float`. Add `__post_init__` validation that raises `ValueError` if either dimension is not positive. Add computed properties `area` and `perimeter`. Make it `frozen=True`.

Then write a function `largest_rectangle(rectangles: List[Rectangle]) -> Optional[Rectangle]` that returns the rectangle with the greatest area, or `None` for an empty list.

<details>
<summary>Hint</summary>

Use the built-in `max()` with a `key` argument to find the rectangle with the largest area. For `Optional` return type, handle the empty list case first. Properties on frozen dataclasses work normally — `frozen=True` only prevents attribute assignment.
</details>

<details>
<summary>Solution</summary>

```python
from dataclasses import dataclass
from typing import Optional, List

@dataclass(frozen=True)
class Rectangle:
    width: float
    height: float

    def __post_init__(self):
        if self.width <= 0 or self.height <= 0:
            raise ValueError(
                f"Dimensions must be positive, got width={self.width}, height={self.height}"
            )

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def perimeter(self) -> float:
        return 2 * (self.width + self.height)

def largest_rectangle(rectangles: List[Rectangle]) -> Optional[Rectangle]:
    if not rectangles:
        return None
    return max(rectangles, key=lambda r: r.area)

rects = [Rectangle(3, 4), Rectangle(10, 1), Rectangle(2, 6)]
biggest = largest_rectangle(rects)
print(biggest)          # Rectangle(width=3, height=4) — area 12
print(biggest.area)     # 12.0

print(largest_rectangle([]))  # None
```

</details>
