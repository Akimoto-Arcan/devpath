---
difficulty: intermediate
---

# Metatables

A metatable is a regular Lua table that controls the behavior of another table. When Lua can't find a key in a table, or when you perform an operation like `+` on a table, it looks for a metatable and checks for handler functions called **metamethods**. Every metamethod is a key starting with two underscores.

You attach a metatable with `setmetatable(table, metatable)` and retrieve it with `getmetatable(table)`. By default, tables have no metatable — you opt in.

## The `__index` Metamethod

`__index` is the most important metamethod. It fires when you access a key that doesn't exist in the table. It can be either a function or another table.

- **Function form**: `__index = function(tbl, key) ... end` — you handle the lookup manually.
- **Table form**: `__index = some_other_table` — Lua searches that table instead. This is how prototype-based inheritance works.

## `__newindex`

`__newindex` fires when you *assign* to a key that doesn't already exist in the table. Use it to intercept writes — for read-only tables, logging, or proxies.

## Arithmetic and Other Metamethods

`__add`, `__sub`, `__mul`, `__div`, `__mod`, `__pow`, `__unm` (unary minus) let you define math operators for your tables. `__eq`, `__lt`, `__le` handle comparisons. `__tostring` controls what `tostring()` and `print()` output. `__call` makes a table callable like a function. `__len` overrides the `#` operator.

## Example

```lua
-- A 2D vector type built entirely on metatables

local Vec2 = {}
Vec2.__index = Vec2  -- when indexing a Vec2 instance, fall back to Vec2

-- __tostring: print() will use this
Vec2.__tostring = function(v)
    return string.format("Vec2(%g, %g)", v.x, v.y)
end

-- __add: v1 + v2
Vec2.__add = function(a, b)
    return Vec2.new(a.x + b.x, a.y + b.y)
end

-- __mul: v * scalar  (scalar on the right)
Vec2.__mul = function(a, scalar)
    return Vec2.new(a.x * scalar, a.y * scalar)
end

-- __eq: v1 == v2
Vec2.__eq = function(a, b)
    return a.x == b.x and a.y == b.y
end

-- __call: make the table itself callable as a constructor shorthand
Vec2.__call = function(_, x, y)
    return Vec2.new(x, y)
end

-- __len: # operator returns magnitude (unusual, but shows the mechanism)
Vec2.__len = function(v)
    return math.sqrt(v.x^2 + v.y^2)
end

-- Constructor
function Vec2.new(x, y)
    local instance = { x = x or 0, y = y or 0 }
    setmetatable(instance, Vec2)  -- attach the metatable
    return instance
end

-- Method: dot product (accessed via __index fallback to Vec2)
function Vec2:dot(other)
    return self.x * other.x + self.y * other.y
end

-- Read-only proxy example using __newindex
local function make_readonly(t)
    local proxy = {}
    local mt = {
        __index = t,
        __newindex = function(_, key, _)
            error("attempt to write read-only field: " .. tostring(key), 2)
        end,
        __tostring = function()
            return "ReadOnly{" .. table.concat(
                (function()
                    local out = {}
                    for k, v in pairs(t) do
                        out[#out+1] = k .. "=" .. tostring(v)
                    end
                    return out
                end)(), ", "
            ) .. "}"
        end
    }
    setmetatable(proxy, mt)
    return proxy
end

-- Demo
local a = Vec2.new(3, 4)
local b = Vec2(1, 2)          -- __call on Vec2 table itself

print(tostring(a))            -- Vec2(3, 4)
print(tostring(a + b))        -- Vec2(4, 6)
print(tostring(a * 2))        -- Vec2(6, 8)
print(a:dot(b))               -- 3*1 + 4*2 = 11
print(#a)                     -- 5.0  (magnitude of 3,4 triangle)
print(a == Vec2.new(3, 4))    -- true

local config = make_readonly({ host = "localhost", port = 8080 })
print(config.host)            -- localhost
-- config.host = "other"      -- would error: attempt to write read-only field: host
```

## Why This Matters

Metatables are the foundation of everything "object-oriented" in Lua. There is no `class` keyword — every OOP framework (Love2D classes, OpenResty objects, the Luvit runtime) is built on `setmetatable` and `__index` chaining. Understanding metatables means you can read and debug any Lua library, not just use it.

They also enable powerful patterns impossible in languages with fixed type systems: operator overloading for DSLs, transparent proxies for configuration, lazy loading, and sandboxing (override `__index` globally to restrict what code can access).

## Exercise

Build a `Matrix2x2` type using metatables. It should support:

1. `Matrix2x2.new(a, b, c, d)` — creates a 2x2 matrix stored as `{a, b, c, d}`
2. `__tostring` — prints as `[[a, b], [c, d]]`
3. `__add` — matrix addition
4. `__mul` — matrix multiplication (not element-wise — actual matrix product)
5. A method `:det()` that returns the determinant (`a*d - b*c`)

Test it: create two matrices, multiply them, print the result, and verify the determinant.

<details>
<summary>Hint</summary>
For matrix multiply of 2x2: result[1] = a*e + b*g, result[2] = a*f + b*h, result[3] = c*e + d*g, result[4] = c*f + d*h where the second matrix is {e,f,g,h}. Store your metamethods directly in the Matrix2x2 table and set `Matrix2x2.__index = Matrix2x2`.
</details>

<details>
<summary>Solution</summary>

```lua
local Matrix2x2 = {}
Matrix2x2.__index = Matrix2x2

function Matrix2x2.new(a, b, c, d)
    return setmetatable({ a, b, c, d }, Matrix2x2)
end

Matrix2x2.__tostring = function(m)
    return string.format("[[%g, %g], [%g, %g]]", m[1], m[2], m[3], m[4])
end

Matrix2x2.__add = function(x, y)
    return Matrix2x2.new(x[1]+y[1], x[2]+y[2], x[3]+y[3], x[4]+y[4])
end

Matrix2x2.__mul = function(x, y)
    return Matrix2x2.new(
        x[1]*y[1] + x[2]*y[3],
        x[1]*y[2] + x[2]*y[4],
        x[3]*y[1] + x[4]*y[3],
        x[3]*y[2] + x[4]*y[4]
    )
end

function Matrix2x2:det()
    return self[1]*self[4] - self[2]*self[3]
end

local m1 = Matrix2x2.new(1, 2, 3, 4)
local m2 = Matrix2x2.new(5, 6, 7, 8)

print(tostring(m1))           -- [[1, 2], [3, 4]]
print(tostring(m1 + m2))      -- [[6, 8], [10, 12]]
print(tostring(m1 * m2))      -- [[19, 22], [43, 50]]
print(m1:det())               -- 1*4 - 2*3 = -2
```

</details>
