---
difficulty: intermediate
---

# Standard Library Deep Dive

Lua's standard library is small but covers the essentials. This lesson goes past the basics: the string functions that do real text processing, table operations used in performance-sensitive code, and the error handling functions that let you write robust scripts.

## `table` Library

- `table.insert(t, val)` — appends. `table.insert(t, pos, val)` — inserts at position (shifts right).
- `table.remove(t, pos)` — removes and returns element at position (shifts left). Default pos is last element.
- `table.sort(t, comp)` — in-place sort. `comp(a, b)` returns true if `a` should come before `b`. No stable sort guarantee in standard Lua.
- `table.concat(t, sep, i, j)` — joins string elements. Faster than repeated `..` concatenation in a loop.
- `table.move(a1, f, e, t, a2)` — copies `a1[f..e]` into `a2` starting at index `t`. If `a2` omitted, copies within `a1`. Useful for bulk shifts.
- `table.unpack(t, i, j)` — returns elements as multiple values (Lua 5.2+; was `unpack` in 5.1).

## `string` Library

Lua's patterns are not full POSIX regex but are powerful and fast. Key pattern classes: `%d` digit, `%a` letter, `%l` lowercase, `%u` uppercase, `%s` whitespace, `%w` alphanumeric, `%p` punctuation, `.` any char. Uppercase versions are complements (`%D` = non-digit). Anchors: `^` start, `$` end.

- `string.find(s, pat, init, plain)` — returns start, end positions (and captures). `plain=true` disables patterns.
- `string.match(s, pat, init)` — returns captures, or whole match if no captures.
- `string.gmatch(s, pat)` — iterator over all matches.
- `string.gsub(s, pat, repl, n)` — replace all (or `n`) occurrences. `repl` can be string (with `%1` backreferences), table, or function.
- `string.format(fmt, ...)` — C-style printf formatting. `%d`, `%f`, `%s`, `%q` (quoted string), `%x` hex.

## `math`, `os`, `io`

`math`: `floor`, `ceil`, `abs`, `max`, `min`, `sqrt`, `sin`/`cos`/`tan`, `random`, `randomseed`, `huge` (infinity), `pi`, `maxinteger`/`mininteger` (Lua 5.3+).

`os`: `os.time()` — Unix timestamp. `os.date(fmt, time)` — formatted date string (`"*t"` returns a table). `os.clock()` — CPU time used by process (for profiling). `os.exit()`, `os.getenv()`.

`io`: `io.read("l")` one line, `io.read("n")` number, `io.read("a")` whole file. `io.write()` no newline. `io.lines(filename)` iterator. File handles: `f = io.open(path, mode)`, then `f:read()`, `f:write()`, `f:close()`.

## Error Handling: `pcall` and `xpcall`

`pcall(f, ...)` calls `f` in protected mode. Returns `true, results...` on success, `false, error_message` on failure. Catches errors thrown by `error()` and runtime errors alike.

`xpcall(f, handler, ...)` is the same but lets you provide a message handler that runs while the stack is still intact — use it to capture a traceback.

## Example

```lua
-- table: sorting and manipulation
local data = {
    { name = "Charlie", score = 82 },
    { name = "Alice",   score = 95 },
    { name = "Bob",     score = 78 },
    { name = "Diana",   score = 95 },
}

-- Sort by score descending, then name ascending for ties
table.sort(data, function(a, b)
    if a.score ~= b.score then return a.score > b.score end
    return a.name < b.name
end)

for i, row in ipairs(data) do
    print(string.format("%d. %-10s %d", i, row.name, row.score))
end
-- 1. Alice      95
-- 2. Diana      95
-- 3. Charlie    82
-- 4. Bob        78

-- table.concat vs .. in loop (performance matters for large lists)
local parts = {}
for i = 1, 5 do parts[i] = "item" .. i end
print(table.concat(parts, ", "))   -- item1, item2, item3, item4, item5

-- table.move: copy a slice
local src = {10, 20, 30, 40, 50}
local dst = {0, 0, 0}
table.move(src, 2, 4, 1, dst)     -- copy src[2..4] into dst starting at 1
-- dst is now {20, 30, 40}
print(table.concat(dst, ", "))


-- string: pattern matching
local log_line = '2026-05-20 14:32:01 [ERROR] connection refused: 192.168.1.1:5432'

-- Extract date, level, and message
local date, time_str, level, msg =
    log_line:match("^(%d%d%d%d%-%d%d%-%d%d) (%d%d:%d%d:%d%d) %[(%u+)%] (.+)$")

print(date, time_str, level)   -- 2026-05-20  14:32:01  ERROR
print(msg)                     -- connection refused: 192.168.1.1:5432

-- gmatch: iterate words
local sentence = "the quick brown fox"
local words = {}
for word in sentence:gmatch("%a+") do
    words[#words+1] = word
end
print(#words, words[3])   -- 4   brown

-- gsub with function replacement
local template = "Hello, {name}! You have {count} messages."
local vars = { name = "Alice", count = "5" }
local result = template:gsub("{(%w+)}", function(key)
    return vars[key] or ("{" .. key .. "}")
end)
print(result)   -- Hello, Alice! You have 5 messages.

-- gsub with table replacement (simpler for static substitutions)
local abbrevs = { Mr = "Mister", Dr = "Doctor", St = "Street" }
local address = "Dr Smith, 42 Oak St"
print((address:gsub("%a+", abbrevs)))  -- Doctor Smith, 42 Oak Street


-- os: timing a function
local function time_it(label, f, iterations)
    local t0 = os.clock()
    for _ = 1, iterations do f() end
    local elapsed = os.clock() - t0
    print(string.format("%s: %.4fs for %d iterations", label, elapsed, iterations))
end

time_it("string.rep", function() return string.rep("x", 1000) end, 10000)
time_it("table.concat", function()
    local t = {}
    for i = 1, 1000 do t[i] = "x" end
    return table.concat(t)
end, 10000)

-- os.date
print(os.date("%Y-%m-%d %H:%M:%S"))      -- current local time
local t = os.date("*t")                  -- table with year, month, day, etc.
print(t.year, t.month, t.wday)


-- io: reading a file line by line safely
local function read_lines(path)
    local f, err = io.open(path, "r")
    if not f then return nil, err end
    local lines = {}
    for line in f:lines() do
        lines[#lines+1] = line
    end
    f:close()
    return lines
end


-- pcall / xpcall: structured error handling
local function risky(x)
    if x < 0 then error("negative input: " .. x, 2) end
    return math.sqrt(x)
end

-- Basic pcall
local ok, result = pcall(risky, 16)
print(ok, result)    -- true   4.0

ok, result = pcall(risky, -1)
print(ok, result)    -- false  [string "..."]:N: negative input: -1

-- xpcall with traceback handler
local function traceback_handler(err)
    return debug and debug.traceback(err, 2) or err
end

local ok2, msg = xpcall(function()
    risky(-5)
end, traceback_handler)
print(ok2)   -- false
print(msg)   -- error message + stack trace (if debug lib available)

-- Wrapping pcall into a cleaner try/catch style
local function try(f)
    local ok, err = pcall(f)
    if not ok then
        return { catch = function(_, handler) handler(err) end }
    end
    return { catch = function() end }  -- no-op catch
end

try(function()
    error("something went wrong")
end):catch(function(e)
    print("caught: " .. e)
end)
```

## Why This Matters

These functions come up in every non-trivial Lua project. `pcall`/`xpcall` is how you write a plugin system that doesn't crash the host when a plugin errors. `string.gmatch` and `gsub` are how config file parsers, template engines, and log analyzers are built in Lua without pulling in external dependencies. `os.clock` is the standard way to profile code during optimization.

Knowing the full API means you stop reinventing things that are already there and write code that's faster and more idiomatic.

## Exercise

Write a function `parse_csv_line(line)` that:

1. Splits a CSV line into fields (comma-separated).
2. Handles quoted fields: `"hello, world"` is one field containing `hello, world`.
3. Strips leading and trailing whitespace from unquoted fields.
4. Returns a table of string values.

Test cases:
```
'one, two, three'                    -> {"one", "two", "three"}
'"hello, world", foo, "bar"'         -> {"hello, world", "foo", "bar"}
'  spaced  , "  quoted  " , x'       -> {"spaced", "  quoted  ", "x"}
```

Use only the `string` library — no `io` or external modules.

<details>
<summary>Hint</summary>
Use `string.gmatch` with the pattern `[^,]+` as a starting point, but that breaks on quoted commas. A better approach: use `string.gsub` or a manual `string.find` loop to scan character by character, or use the pattern `"([^"]*)"` to match quoted fields and `([^,]+)` for unquoted, alternating. The pattern `%s*"([^"]*)"` | `%s*([^,]-)%s*` can work in a `gmatch` with alternation.
</details>

<details>
<summary>Solution</summary>

```lua
local function parse_csv_line(line)
    local fields = {}
    local pos = 1
    local len = #line

    while pos <= len do
        -- Skip leading whitespace
        local _, ws_end = line:find("^%s*", pos)
        pos = ws_end + 1

        if pos > len then break end

        if line:sub(pos, pos) == '"' then
            -- Quoted field
            local _, field_end, value = line:find('^"([^"]*)"', pos)
            if not field_end then
                error("unclosed quote at position " .. pos)
            end
            fields[#fields+1] = value
            pos = field_end + 1
            -- skip comma
            local _, comma_end = line:find("^%s*,?%s*", pos)
            pos = comma_end + 1
        else
            -- Unquoted field: read up to comma or end
            local field_end = line:find(",", pos, true) or (len + 1)
            local value = line:sub(pos, field_end - 1):match("^%s*(.-)%s*$")
            fields[#fields+1] = value
            pos = field_end + 1
        end
    end

    return fields
end

-- Test
local function check(line, expected)
    local got = parse_csv_line(line)
    assert(#got == #expected, "length mismatch for: " .. line)
    for i, v in ipairs(expected) do
        assert(got[i] == v,
            string.format("field %d: expected %q got %q", i, v, got[i]))
    end
    print("OK: " .. line)
end

check('one, two, three',               {"one", "two", "three"})
check('"hello, world", foo, "bar"',    {"hello, world", "foo", "bar"})
check('  spaced  , "  quoted  " , x',  {"spaced", "  quoted  ", "x"})
```

</details>
