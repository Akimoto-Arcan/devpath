---
difficulty: intermediate
---

# Closures and Upvalues

A closure is a function that captures variables from its surrounding scope. In Lua, every function is potentially a closure. The captured variables are called **upvalues**.

This is not just lexical scoping — the closure holds a live reference to the variable, not a copy of its value at the time of creation. If the variable changes, the closure sees the new value. Multiple closures created in the same scope share the same upvalue.

## Open vs Closed Upvalues

Lua's VM makes a distinction the language doesn't expose directly:

- **Open upvalue**: the captured variable is still live on the stack (the enclosing function is still running). The closure holds a pointer into the stack.
- **Closed upvalue**: the enclosing function has returned, so the variable has been moved off the stack onto the heap. The closure now owns it.

You never interact with this distinction directly, but it explains why closures don't become invalid when the function that created them returns — Lua automatically migrates the value to the heap.

## Shared Upvalues

Two closures defined in the same scope share upvalues. This is how you create private mutable state that multiple functions can read and write while the outside world sees nothing.

## Example

```lua
-- 1. Basic counter — classic closure demo
local function make_counter(start, step)
    local n = start or 0          -- n is an upvalue for both inner functions
    step = step or 1

    local function increment()
        n = n + step
        return n
    end

    local function reset()
        n = start or 0
    end

    local function value()
        return n
    end

    -- Return multiple closures sharing the same upvalue n
    return increment, reset, value
end

local inc, rst, val = make_counter(0, 2)
print(inc())  -- 2
print(inc())  -- 4
print(inc())  -- 6
print(val())  -- 6
rst()
print(val())  -- 0


-- 2. Memoization — cache expensive results using a closure-held table
local function memoize(f)
    local cache = {}   -- upvalue: private to the returned function
    return function(n)
        if cache[n] == nil then
            cache[n] = f(n)
        end
        return cache[n]
    end
end

-- Fibonacci without memoize: exponential time
local fib
fib = memoize(function(n)
    if n < 2 then return n end
    return fib(n-1) + fib(n-2)   -- fib upvalue is the memoized version
end)

for i = 0, 10 do
    io.write(fib(i) .. " ")
end
print()  -- 0 1 1 2 3 5 8 13 21 34 55


-- 3. Partial application (currying)
local function partial(f, ...)
    local bound = { ... }   -- upvalue: captured arguments
    return function(...)
        local args = {}
        for _, v in ipairs(bound) do args[#args+1] = v end
        for i = 1, select('#', ...) do args[#args+1] = select(i, ...) end
        return f(table.unpack(args))
    end
end

local function add(a, b) return a + b end
local add10 = partial(add, 10)
print(add10(5))   -- 15
print(add10(32))  -- 42


-- 4. Module pattern — closures as private encapsulation
-- This is the standard way to write modules in Lua 5.1-style codebases
-- (before require's module system was formalised)

local BankAccount = (function()
    -- Everything in this IIFE is private

    local function validate_amount(amount)
        if type(amount) ~= "number" or amount <= 0 then
            error("invalid amount: " .. tostring(amount), 3)
        end
    end

    -- The "class" factory returned to callers
    local function new(owner, initial_balance)
        local balance = initial_balance or 0   -- private per-instance upvalue
        local log = {}

        -- Public interface — all closures over balance and log
        return {
            deposit = function(amount)
                validate_amount(amount)
                balance = balance + amount
                log[#log+1] = string.format("+%.2f", amount)
            end,
            withdraw = function(amount)
                validate_amount(amount)
                if amount > balance then
                    error("insufficient funds", 2)
                end
                balance = balance - amount
                log[#log+1] = string.format("-%.2f", amount)
            end,
            get_balance = function() return balance end,
            statement = function()
                print(string.format("Account: %s | Balance: %.2f", owner, balance))
                for _, entry in ipairs(log) do
                    print("  " .. entry)
                end
            end
        }
    end

    return { new = new }
end)()

local acct = BankAccount.new("Alice", 100)
acct.deposit(50)
acct.withdraw(30)
acct.statement()
-- Account: Alice | Balance: 120.00
--   +50.00
--   -30.00

-- balance is completely inaccessible except through the returned functions
-- print(balance) -- would error: no such global


-- 5. Shared upvalue gotcha — the classic loop closure bug
-- BAD: all closures capture the same 'i' variable
local bad_funcs = {}
for i = 1, 3 do
    bad_funcs[i] = function() return i end  -- all share the same loop var i
end
-- After the loop, i == 3 in all of them (Lua 5.2+ actually creates new i each iteration, but worth knowing)

-- GOOD: force a new local per iteration by introducing a new scope
local good_funcs = {}
for i = 1, 3 do
    local captured = i           -- new local each iteration = new upvalue
    good_funcs[i] = function() return captured end
end
for _, f in ipairs(good_funcs) do io.write(f() .. " ") end
print()  -- 1 2 3
```

## Why This Matters

Closures are the primary tool for encapsulation in Lua. Without them, every variable is either global (dangerous) or local-to-a-block (can't persist). With closures, you get private per-instance state without a class system, memoized functions with zero boilerplate, and stateful iterators that work with the standard `for` loop.

The module pattern (`return` a table of closures from a file) is how every `require()`-able Lua module works. When you call `require("json")` and get back a table with `encode`/`decode`, those are closures over the module's private state.

## Exercise

Write a `make_pipeline` function that accepts a list of transform functions and returns a single function. Calling the returned function with a value should pass it through each transform in order.

```lua
local process = make_pipeline({
    function(x) return x * 2 end,
    function(x) return x + 10 end,
    function(x) return x * x end,
})
print(process(3))  -- ((3*2)+10)^2 = 16^2 = 256
```

Then add a `make_cached_pipeline` variant that memoizes previously seen inputs.

<details>
<summary>Hint</summary>
`make_pipeline` captures the `transforms` table as an upvalue. The returned closure iterates through it each call. For the cached version, add a `cache` table as a second upvalue in the same scope. Check the cache before running the pipeline and store results after.
</details>

<details>
<summary>Solution</summary>

```lua
local function make_pipeline(transforms)
    return function(value)
        local result = value
        for _, fn in ipairs(transforms) do
            result = fn(result)
        end
        return result
    end
end

local function make_cached_pipeline(transforms)
    local cache = {}
    local pipe  = make_pipeline(transforms)
    return function(value)
        if cache[value] == nil then
            cache[value] = pipe(value)
        end
        return cache[value]
    end
end

local process = make_pipeline({
    function(x) return x * 2  end,
    function(x) return x + 10 end,
    function(x) return x * x  end,
})

print(process(3))   -- 256
print(process(5))   -- ((5*2)+10)^2 = 20^2 = 400

local cached = make_cached_pipeline({
    function(x) return x * 2  end,
    function(x) return x + 10 end,
    function(x) return x * x  end,
})

print(cached(3))    -- 256  (computed)
print(cached(3))    -- 256  (from cache)
print(cached(5))    -- 400  (computed)
```

</details>
