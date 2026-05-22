---
difficulty: intermediate
---

# Async/Await

Async/await is Python's model for cooperative concurrency. Instead of running multiple threads simultaneously, async code runs on a single thread and voluntarily yields control at I/O boundaries — waiting for a network response, a file read, a database query. While one coroutine waits, the event loop runs another.

The key distinction: async solves **I/O-bound** problems. It does not help with **CPU-bound** work. If your bottleneck is computation — processing images, running ML inference, parsing large datasets — you need `multiprocessing` or `concurrent.futures.ProcessPoolExecutor`. Async only helps when the bottleneck is waiting.

## Coroutines and the Event Loop

An `async def` function is a coroutine function. Calling it returns a coroutine object — it doesn't execute yet. The event loop drives execution. `await` suspends the current coroutine and gives control back to the event loop until the awaited thing completes.

```python
async def fetch_data():
    result = await some_async_operation()
    return result
```

`asyncio.run()` is the standard entry point. It creates an event loop, runs a top-level coroutine, and closes the loop when done.

## Example

```python
import asyncio
import time

# --- Basic coroutines and await ---
async def slow_task(name: str, delay: float) -> str:
    print(f"{name}: starting")
    await asyncio.sleep(delay)   # yields control during the wait
    print(f"{name}: done after {delay}s")
    return f"{name} result"

# asyncio.gather runs coroutines concurrently and collects results
async def run_concurrent():
    start = time.perf_counter()
    results = await asyncio.gather(
        slow_task("A", 1.0),
        slow_task("B", 1.5),
        slow_task("C", 0.5),
    )
    elapsed = time.perf_counter() - start
    print(f"All done in {elapsed:.2f}s")   # ~1.5s, not 3.0s
    print(results)

asyncio.run(run_concurrent())

# --- asyncio.create_task: fire and don't wait immediately ---
async def background_work():
    """Runs concurrently without blocking the caller."""
    await asyncio.sleep(0.5)
    print("Background task complete")

async def main_with_tasks():
    task = asyncio.create_task(background_work())
    print("Doing other work while background task runs...")
    await asyncio.sleep(0.1)
    print("Still doing other work...")
    await task   # wait for it to finish before returning
    print("All done")

asyncio.run(main_with_tasks())

# --- Async context managers and iterators ---
class AsyncTimer:
    async def __aenter__(self):
        self._start = time.perf_counter()
        return self

    async def __aexit__(self, *args):
        elapsed = time.perf_counter() - self._start
        print(f"Block took {elapsed:.4f}s")

async def timed_work():
    async with AsyncTimer():
        await asyncio.sleep(0.2)

asyncio.run(timed_work())

# --- Realistic HTTP example with aiohttp ---
# Requires: pip install aiohttp
#
# import aiohttp
#
# async def fetch_url(session: aiohttp.ClientSession, url: str) -> dict:
#     async with session.get(url) as response:
#         response.raise_for_status()
#         return await response.json()
#
# async def fetch_all(urls: list[str]) -> list[dict]:
#     async with aiohttp.ClientSession() as session:
#         tasks = [fetch_url(session, url) for url in urls]
#         return await asyncio.gather(*tasks, return_exceptions=True)
#
# urls = [
#     "https://jsonplaceholder.typicode.com/posts/1",
#     "https://jsonplaceholder.typicode.com/posts/2",
#     "https://jsonplaceholder.typicode.com/posts/3",
# ]
# results = asyncio.run(fetch_all(urls))
# for r in results:
#     if isinstance(r, Exception):
#         print(f"Request failed: {r}")
#     else:
#         print(r["title"])
#
# With 3 URLs this saves almost nothing. With 50+ URLs,
# async fetch cuts wall time from ~50s to ~2s.

# --- Handling exceptions in gather ---
async def might_fail(name: str, should_fail: bool) -> str:
    await asyncio.sleep(0.1)
    if should_fail:
        raise ValueError(f"{name} failed")
    return f"{name} succeeded"

async def safe_gather():
    # return_exceptions=True collects exceptions as values instead of raising
    results = await asyncio.gather(
        might_fail("task1", False),
        might_fail("task2", True),
        might_fail("task3", False),
        return_exceptions=True,
    )
    for r in results:
        if isinstance(r, Exception):
            print(f"Error: {r}")
        else:
            print(r)

asyncio.run(safe_gather())
```

## Why This Matters

Async becomes worthwhile when you're making many I/O calls that can overlap — fetching 50 API endpoints, querying multiple database rows, reading from multiple network sockets. Sequential code waits for each one; async code issues them all and processes results as they arrive.

Modern Python web frameworks (FastAPI, Starlette, Litestar) are built on async. ORMs like SQLAlchemy and Tortoise-ORM have async interfaces. If you're building any service that makes outbound HTTP calls, async/await is the idiomatic tool.

`asyncio.gather` is the workhorse — pass it a list of coroutines and it runs them concurrently. `create_task` is useful when you want to fire something off and do other work before awaiting it. `return_exceptions=True` in `gather` is critical in production: without it, one failed request kills the entire batch.

Common mistake: mixing blocking calls into async code. `time.sleep(1)` inside an async function blocks the entire event loop for one second. Use `await asyncio.sleep(1)` instead. Similarly, use async-native libraries (`aiofiles`, `aiohttp`, async DB drivers) — synchronous library calls block the event loop.

## Exercise

Write an async function `fetch_with_timeout(url, timeout_seconds)` that fetches a URL using `aiohttp` and returns the response body as a string. If the request takes longer than `timeout_seconds`, return the string `"timeout"` instead of raising. If the request fails for any other reason, return `"error: <message>"`.

Then write `fetch_many(urls, timeout_seconds)` that fetches all URLs concurrently and returns a list of results in the same order as the input.

<details>
<summary>Hint</summary>

Use `asyncio.wait_for(coroutine, timeout=n)` to add a timeout to any awaitable — it raises `asyncio.TimeoutError` when the time is exceeded. Wrap it in a try/except that catches `asyncio.TimeoutError` separately from other exceptions. In `fetch_many`, build a list of coroutine calls and pass it to `asyncio.gather`.
</details>

<details>
<summary>Solution</summary>

```python
import asyncio
import aiohttp

async def fetch_with_timeout(url: str, timeout_seconds: float) -> str:
    async def _fetch():
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                response.raise_for_status()
                return await response.text()

    try:
        return await asyncio.wait_for(_fetch(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        return "timeout"
    except Exception as e:
        return f"error: {e}"

async def fetch_many(urls: list[str], timeout_seconds: float) -> list[str]:
    tasks = [fetch_with_timeout(url, timeout_seconds) for url in urls]
    return await asyncio.gather(*tasks)

# Test
urls = [
    "https://jsonplaceholder.typicode.com/posts/1",
    "https://jsonplaceholder.typicode.com/posts/2",
    "https://httpstat.us/500",   # will return an error
]

results = asyncio.run(fetch_many(urls, timeout_seconds=5.0))
for url, result in zip(urls, results):
    preview = result[:80].replace("\n", " ") if not result.startswith("error") else result
    print(f"{url}: {preview}")
```

</details>
