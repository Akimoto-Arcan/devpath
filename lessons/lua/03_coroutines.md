---
difficulty: intermediate
---

# Coroutines

A coroutine is a function that can pause its own execution and resume later, preserving its entire stack — local variables, instruction pointer, everything. Unlike threads, coroutines are **cooperative**: they only yield when they explicitly say so. There's no scheduler, no preemption, no race conditions. One coroutine runs at a time.

## The Core Functions

- `coroutine.create(f)` — wraps function `f` in a coroutine object. Does not run it.
- `coroutine.resume(co, ...)` — starts or continues `co`. Extra args become the return values of `yield` (or the initial args to `f` on first call). Returns `true, values...` on success, `false, error` on failure.
- `coroutine.yield(...)` — suspends the current coroutine. The yielded values become the extra return values of the `resume` that woke it. Execution pauses here until the next `resume`.
- `coroutine.status(co)` — returns `"running"`, `"suspended"`, `"normal"`, or `"dead"`.
- `coroutine.wrap(f)` — like `create`, but returns a plain function. Calling it resumes; it throws on error rather than returning false.

## Value Flow

The data flow is asymmetric and easy to mix up:

- **First resume**: args to `resume` become args to the coroutine function.
- **Subsequent resumes**: args to `resume` become the return value of `yield` inside the coroutine.
- **On yield**: args to `yield` become extra return values of `resume` to the caller.
- **On return**: the function's return values become extra return values of the final `resume`.

## Example

```lua
-- 1. Basic yield/resume with value passing
local function counter(start, step)
    local n = start
    while true do
        local reset = coroutine.yield(n)  -- yield current n; resume arg becomes reset
        if reset then
            n = start
        else
            n = n + step
        end
    end
end

local co = coroutine.create(counter)

local ok, v = coroutine.resume(co, 0, 5)   -- first resume: start=0, step=5
print(ok, v)                                -- true   0

ok, v = coroutine.resume(co)               -- resume with no reset
print(ok, v)                               -- true   5

ok, v = coroutine.resume(co)
print(ok, v)                               -- true   10

ok, v = coroutine.resume(co, true)         -- reset!
print(ok, v)                               -- true   0  (back to start)


-- 2. Producer-consumer pattern
-- The producer generates lines; the consumer processes them.
-- Neither needs to know the size of the data set upfront.

local function producer(items)
    for _, item in ipairs(items) do
        coroutine.yield(item)
    end
    -- returning nothing signals the consumer we're done
end

local function run_pipeline(data)
    local prod = coroutine.create(producer)
    local results = {}

    coroutine.resume(prod, data)  -- kick it off; first yield already fired
    -- actually we need to harvest from the *return* of resume:

    -- Restart: use wrap for cleaner producer syntax
    local generate = coroutine.wrap(function()
        for _, item in ipairs(data) do
            coroutine.yield(item)
        end
    end)

    for item in generate do       -- wrap's function raises StopIteration automatically
        -- consumer: upper-case string items
        results[#results+1] = type(item) == "string" and item:upper() or item
    end
    return results
end

local processed = run_pipeline({"apple", "banana", "cherry"})
for _, v in ipairs(processed) do print(v) end
-- APPLE  BANANA  CHERRY


-- 3. Cooperative scheduler — the real power of coroutines
local scheduler = {}
scheduler.queue = {}

function scheduler.spawn(f)
    local co = coroutine.create(f)
    table.insert(scheduler.queue, co)
end

function scheduler.run()
    while #scheduler.queue > 0 do
        local co = table.remove(scheduler.queue, 1)
        local ok, err = coroutine.resume(co)
        if not ok then
            print("coroutine error: " .. tostring(err))
        elseif coroutine.status(co) ~= "dead" then
            -- still has work to do, re-queue it
            table.insert(scheduler.queue, co)
        end
    end
end

-- yield control to the scheduler (simulates async wait)
local function yield() coroutine.yield() end

scheduler.spawn(function()
    for i = 1, 3 do
        print("task A, step " .. i)
        yield()
    end
end)

scheduler.spawn(function()
    for i = 1, 3 do
        print("task B, step " .. i)
        yield()
    end
end)

scheduler.run()
-- task A, step 1
-- task B, step 1
-- task A, step 2
-- task B, step 2
-- task A, step 3
-- task B, step 3


-- 4. Status inspection
local function show_status(co, label)
    print(label .. ": " .. coroutine.status(co))
end

local spy = coroutine.create(function()
    coroutine.yield()
end)

show_status(spy, "before first resume")   -- suspended
coroutine.resume(spy)
show_status(spy, "after first resume")    -- suspended (paused at yield)
coroutine.resume(spy)
show_status(spy, "after second resume")   -- dead (function returned)
```

## Why This Matters

Coroutines are how Lua implements cooperative multitasking in environments like OpenResty (Nginx+Lua), where thousands of concurrent HTTP requests run as coroutines on a single thread with zero locking overhead. The `async`/`await` model in JavaScript and Python's generators are the same concept with different syntax.

In game development, coroutines model game logic timelines cleanly: a cutscene script can `yield` for one frame at a time, animations yield until finished, AI routines yield while waiting for a path calculation. The alternative — state machines — produces code that's far harder to read and modify.

## Exercise

Write a coroutine-based **lazy number generator** and a **pipeline** that connects two coroutines:

1. `range(from, to, step)` — a coroutine that yields integers from `from` to `to` with the given step.
2. `filter(source_coro, predicate)` — a coroutine that pulls from `source_coro` and only yields values where `predicate(v)` is true.
3. Wire them together: generate 1–50 by 1, filter for numbers divisible by both 3 and 5, collect results into a table and print it.

Expected output: `{ 15, 30, 45 }`

<details>
<summary>Hint</summary>
`filter` should use `coroutine.wrap` around `source_coro` so it can call it as a plain function in a loop. When the source is exhausted, `coroutine.wrap`'d functions raise an error — catch it with `pcall` or check status, or restructure range to return a sentinel. Alternatively, have `range` return `nil` when done and check for that in `filter`.
</details>

<details>
<summary>Solution</summary>

```lua
local function range(from, to, step)
    return coroutine.wrap(function()
        for i = from, to, step do
            coroutine.yield(i)
        end
    end)
end

local function filter(source, predicate)
    return coroutine.wrap(function()
        for v in source do
            if predicate(v) then
                coroutine.yield(v)
            end
        end
    end)
end

local source    = range(1, 50, 1)
local fizzbuzz  = filter(source, function(n) return n % 15 == 0 end)

local results = {}
for v in fizzbuzz do
    results[#results+1] = v
end

-- Print result
io.write("{ ")
for i, v in ipairs(results) do
    io.write(v)
    if i < #results then io.write(", ") end
end
print(" }")
-- { 15, 30, 45 }
```

</details>
