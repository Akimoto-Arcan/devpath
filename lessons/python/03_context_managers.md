---
difficulty: intermediate
---

# Context Managers

A context manager controls what happens when you enter and exit a `with` block. The `with` statement calls `__enter__` on entry and guarantees `__exit__` runs on exit — even if an exception occurs. This is the mechanism behind reliable resource cleanup.

`__enter__` can return a value (bound to the `as` target), or return `None`. `__exit__` receives three arguments: the exception type, value, and traceback. If it returns a truthy value, the exception is suppressed. If it returns `None` or `False`, the exception propagates normally.

```python
class ManagedResource:
    def __enter__(self):
        # acquire the resource
        return self          # this becomes the 'as' target

    def __exit__(self, exc_type, exc_val, exc_tb):
        # release the resource
        # return True to suppress exceptions, False/None to propagate
        return False
```

## The `contextlib` Shortcut

Writing a full class for simple cases is verbose. `contextlib.contextmanager` lets you express the same pattern as a generator function. Everything before `yield` is `__enter__`, everything after is `__exit__`, and the yielded value becomes the `as` target.

## Example

```python
import time
import threading
import contextlib
import sqlite3
from pathlib import Path

# --- Class-based: database connection manager ---
class DatabaseConnection:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = None

    def __enter__(self):
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row   # rows accessible by column name
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self.conn.commit()    # no exception: commit the transaction
        else:
            self.conn.rollback()  # exception: roll back
        self.conn.close()
        return False              # never suppress exceptions

with DatabaseConnection(":memory:") as conn:
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO users (name) VALUES (?)", ("Alice",))
    row = conn.execute("SELECT * FROM users").fetchone()
    print(dict(row))   # {'id': 1, 'name': 'Alice'}
# connection closed, transaction committed

# --- contextlib.contextmanager: timer ---
@contextlib.contextmanager
def timer(label: str):
    start = time.perf_counter()
    try:
        yield   # body of the with block runs here
    finally:
        elapsed = time.perf_counter() - start
        print(f"{label}: {elapsed:.4f}s")

with timer("list comprehension"):
    result = [x**2 for x in range(500_000)]

# --- contextlib.contextmanager: file lock ---
@contextlib.contextmanager
def file_lock(path: str):
    lock_path = Path(path + ".lock")
    if lock_path.exists():
        raise RuntimeError(f"Resource is locked: {path}")
    lock_path.touch()
    try:
        yield path
    finally:
        lock_path.unlink(missing_ok=True)

# --- contextlib.suppress: ignore specific exceptions ---
with contextlib.suppress(FileNotFoundError):
    Path("/tmp/nonexistent_devpath_file.txt").unlink()
# No error raised — the FileNotFoundError was suppressed

# --- Nested context managers ---
# Old style (still valid, just more verbose):
# with open("a") as a:
#     with open("b") as b:
#         ...

# Modern style — one with statement:
import io
buf1 = io.StringIO("hello")
buf2 = io.StringIO("world")

with buf1 as a, buf2 as b:
    print(a.read(), b.read())   # hello world

# --- contextlib.ExitStack: dynamic number of context managers ---
@contextlib.contextmanager
def managed(name):
    print(f"Enter {name}")
    yield name
    print(f"Exit {name}")

names = ["db", "cache", "queue"]

with contextlib.ExitStack() as stack:
    resources = [stack.enter_context(managed(n)) for n in names]
    print(f"Working with: {resources}")
# All three exit in reverse order when the with block ends
```

## Why This Matters

Any time you acquire something that must be released — a file handle, a database connection, a lock, a network socket, a temporary directory — a context manager is the right abstraction. It keeps acquisition and release co-located, and the guarantee that `__exit__` always runs eliminates a whole class of resource leak bugs.

`contextlib.suppress` is a clean replacement for try/except blocks that catch an exception and do nothing. `ExitStack` solves the problem of needing to open a variable number of resources whose count is only known at runtime — common when processing batches of files or managing a pool of connections.

## Exercise

Write a context manager called `temp_directory` using `contextlib.contextmanager` that creates a temporary directory, yields its path, and deletes the directory and all its contents when the block exits — even if an exception is raised inside the block.

Test it by writing a file inside the directory, then verifying the directory no longer exists after the `with` block.

<details>
<summary>Hint</summary>

Use `tempfile.mkdtemp()` to create the directory and `shutil.rmtree()` to delete it. Put the cleanup in a `finally` block inside your generator to ensure it runs on exception as well as normal exit. Yield a `pathlib.Path` object for convenient use.
</details>

<details>
<summary>Solution</summary>

```python
import contextlib
import tempfile
import shutil
from pathlib import Path

@contextlib.contextmanager
def temp_directory():
    path = Path(tempfile.mkdtemp())
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)

# Test it
with temp_directory() as tmpdir:
    test_file = tmpdir / "test.txt"
    test_file.write_text("hello from temp dir")
    print(f"File exists inside block: {test_file.exists()}")  # True
    print(f"Contents: {test_file.read_text()}")

print(f"Directory exists after block: {tmpdir.exists()}")  # False
```

</details>
