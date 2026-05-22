---
difficulty: intermediate
---

# Decorators

A decorator is a function that takes another function as an argument, wraps it with additional behavior, and returns the wrapped version. The `@syntax` is just shorthand — `@my_decorator` above a function definition is identical to writing `func = my_decorator(func)` after it.

The wrapping works through closures. The decorator returns an inner function (`wrapper`) that has access to the original function via the enclosing scope. When you call the decorated function, you're actually calling `wrapper`, which can run code before and after delegating to the original.

```python
def my_decorator(func):
    def wrapper(*args, **kwargs):
        # runs before the original function
        result = func(*args, **kwargs)
        # runs after the original function
        return result
    return wrapper
```

The `*args, **kwargs` passthrough is essential — without it, your decorator breaks any function with arguments.

## The `functools.wraps` Problem

Without `functools.wraps`, your decorated function loses its identity. Its `__name__`, `__doc__`, and other metadata get replaced by the wrapper's. This breaks introspection, documentation tools, and sometimes logging.

Always use `@functools.wraps(func)` on your wrapper:

## Example

```python
import functools
import time
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

# --- Timing decorator ---
def timer(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        print(f"{func.__name__} took {elapsed:.4f}s")
        return result
    return wrapper

# --- Logging decorator ---
def log_calls(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        logging.info(f"Calling {func.__name__} with args={args} kwargs={kwargs}")
        result = func(*args, **kwargs)
        logging.info(f"{func.__name__} returned {result!r}")
        return result
    return wrapper

# --- Auth guard decorator (factory pattern) ---
def require_role(role: str):
    """Decorator factory — takes config, returns a decorator."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(user, *args, **kwargs):
            if user.get("role") != role:
                raise PermissionError(
                    f"{func.__name__} requires role '{role}', "
                    f"user has '{user.get('role')}'"
                )
            return func(user, *args, **kwargs)
        return wrapper
    return decorator

# Usage
@timer
@log_calls
def slow_sum(n: int) -> int:
    """Sum integers from 0 to n."""
    return sum(range(n))

@require_role("admin")
def delete_record(user: dict, record_id: int) -> str:
    return f"Deleted record {record_id}"

# Decorators stack bottom-up: log_calls wraps slow_sum first,
# then timer wraps the result.
result = slow_sum(1_000_000)

admin = {"name": "Alice", "role": "admin"}
guest = {"name": "Bob", "role": "guest"}

print(delete_record(admin, 42))          # works
try:
    delete_record(guest, 42)             # raises PermissionError
except PermissionError as e:
    print(e)

# functools.wraps preserved the metadata
print(slow_sum.__name__)   # "slow_sum", not "wrapper"
print(slow_sum.__doc__)    # "Sum integers from 0 to n."
```

## Why This Matters

Decorators show up constantly in real Python codebases. Django and Flask use them for routes (`@app.route`), authentication (`@login_required`), and caching. pytest uses `@pytest.fixture`. `@property`, `@staticmethod`, and `@classmethod` are all built-in decorators.

The decorator factory pattern — a function that returns a decorator — is what you need when the decorator needs configuration (a role name, a timeout value, a cache size). It adds one layer of nesting but follows the same closure logic.

Stacking decorators is common. Execution order matters: decorators apply bottom-up at definition time, but the outermost decorator's wrapper runs first at call time.

## Exercise

Write a `retry(max_attempts, exceptions)` decorator factory that re-calls a function up to `max_attempts` times if it raises one of the listed exception types. After all attempts are exhausted, re-raise the last exception. Include a 0.1-second delay between attempts using `time.sleep`.

Test it with a function that fails the first two times (use a counter in a list or `nonlocal`) and succeeds on the third.

<details>
<summary>Hint</summary>

Use a loop inside the wrapper: `for attempt in range(max_attempts)`. Catch with `except tuple(exceptions)`. On the final attempt, let the exception propagate by only catching when `attempt < max_attempts - 1`, or re-raise after the loop ends.
</details>

<details>
<summary>Solution</summary>

```python
import functools
import time

def retry(max_attempts: int, exceptions: tuple):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except tuple(exceptions) as e:
                    last_exc = e
                    if attempt < max_attempts - 1:
                        print(f"Attempt {attempt + 1} failed: {e}. Retrying...")
                        time.sleep(0.1)
            raise last_exc
        return wrapper
    return decorator

# Test: fails twice, succeeds on third call
call_count = [0]

@retry(max_attempts=3, exceptions=(ValueError,))
def flaky_operation():
    call_count[0] += 1
    if call_count[0] < 3:
        raise ValueError(f"Not ready yet (attempt {call_count[0]})")
    return "success"

print(flaky_operation())   # prints two retry messages, then "success"
```

</details>
