---
difficulty: intermediate
---

# OOP in Lua

Lua has no built-in class system. What it has is flexible enough to build one. The pattern is always the same: a table acts as the class, a metatable wires up method lookup, and a constructor function returns instances. Once you understand the mechanics, you can read any Lua OOP framework because they all do essentially the same thing.

## The `:` Syntax Sugar

The colon in `obj:method()` is syntactic sugar. These two calls are identical:

```lua
obj:method(arg)
obj.method(obj, arg)
```

The colon automatically passes the table on the left as the first argument, conventionally named `self`. When you define a method with `function Class:method()`, that's also sugar for `function Class.method(self)`.

## The Constructor Pattern

The standard constructor:
1. Creates a new empty table for the instance.
2. Sets the class table as its metatable's `__index`.
3. Returns the instance.

Setting `__index` to the class table means any key lookup that fails on the instance falls through to the class — that's where the methods live. Instances only store their own data.

## Inheritance via `__index` Chaining

Inheritance is just `__index` chaining. If `Dog` doesn't have a method, Lua checks `Dog`'s `__index`. If that's `Animal`, Lua checks `Animal`. The chain can be as long as you want. The cost is one extra table lookup per level per missing key.

## Example

```lua
-- Base class: Animal

local Animal = {}
Animal.__index = Animal

function Animal.new(name, sound)
    local self = setmetatable({}, Animal)
    self.name  = name
    self.sound = sound
    self.alive = true
    return self
end

function Animal:speak()
    if self.alive then
        print(self.name .. " says " .. self.sound)
    else
        print(self.name .. " is silent.")
    end
end

function Animal:die()
    self.alive = false
end

function Animal:__tostring()
    return string.format("Animal(%s)", self.name)
end

-- Derived class: Dog

local Dog = setmetatable({}, { __index = Animal })  -- Dog inherits from Animal
Dog.__index = Dog

function Dog.new(name)
    -- Call the parent constructor, then augment
    local self = Animal.new(name, "Woof")
    return setmetatable(self, Dog)  -- re-set metatable to Dog
end

-- Override speak
function Dog:speak()
    print(self.name .. " barks: WOOF WOOF!")
end

-- Dog-only method
function Dog:fetch(item)
    print(self.name .. " fetches the " .. item)
end

-- Further derived class: GuideDog

local GuideDog = setmetatable({}, { __index = Dog })
GuideDog.__index = GuideDog

function GuideDog.new(name, owner)
    local self = Dog.new(name)
    self.owner = owner
    return setmetatable(self, GuideDog)
end

function GuideDog:guide()
    print(self.name .. " guides " .. self.owner .. " safely.")
end

-- Calling the parent method explicitly (super pattern)
function GuideDog:speak()
    Dog.speak(self)  -- explicit parent call — no automatic super keyword
    print("(Guide dogs are very well trained.)")
end

-- instanceof check: walk the __index chain manually
local function instanceof(obj, class)
    local mt = getmetatable(obj)
    while mt do
        if mt == class then return true end
        local parent_mt = getmetatable(mt)
        mt = parent_mt and parent_mt.__index
    end
    return false
end

-- Demo
local cat    = Animal.new("Whiskers", "Meow")
local dog    = Dog.new("Rex")
local guide  = GuideDog.new("Buddy", "Alice")

cat:speak()          -- Whiskers says Meow
dog:speak()          -- Rex barks: WOOF WOOF!
dog:fetch("ball")    -- Rex fetches the ball
dog:die()
dog:speak()          -- Rex is silent.  (inherited from Animal, since Dog.speak checks alive)

guide:speak()        -- Buddy barks: WOOF WOOF! \n (Guide dogs are very well trained.)
guide:fetch("stick") -- Buddy fetches the stick   (inherited from Dog)
guide:guide()        -- Buddy guides Alice safely.

-- Inherited method still works on GuideDog
print(instanceof(guide, GuideDog))  -- true
print(instanceof(guide, Dog))       -- true
print(instanceof(guide, Animal))    -- true
print(instanceof(cat, Dog))         -- false
```

## Why This Matters

The pattern is used everywhere in Lua-land: LÖVE2D game objects, OpenResty/Nginx Lua modules, Neovim plugin frameworks, and game scripting engines like Roblox all use variations of this exact structure. Understanding the metatable chain means you can extend any class, override any method, and add mixin behavior — even to classes you didn't write.

It also forces you to be explicit about inheritance, which is often a feature. There's no hidden magic; every lookup is a table read you can trace with `getmetatable`.

## Exercise

Build a small class hierarchy for a game inventory system:

1. `Item` base class: has `name`, `weight`, `value`. Method `:describe()` prints all three.
2. `Weapon` extends `Item`: adds `damage` field. Overrides `:describe()` to include damage, calls the parent describe first.
3. `MagicWeapon` extends `Weapon`: adds `spell` field. Method `:cast()` prints the spell name.

Create one instance of each and verify that `MagicWeapon` can call `:describe()` (showing all fields from all levels) and `:cast()`.

<details>
<summary>Hint</summary>
When `MagicWeapon:describe()` calls `Weapon.describe(self)`, and `Weapon:describe()` calls `Item.describe(self)`, all three levels contribute to output without any instance needing to know about the chain — that's the payoff of the pattern. Set up each class with `setmetatable({}, { __index = ParentClass })` and `Class.__index = Class`.
</details>

<details>
<summary>Solution</summary>

```lua
-- Item base class
local Item = {}
Item.__index = Item

function Item.new(name, weight, value)
    return setmetatable({ name=name, weight=weight, value=value }, Item)
end

function Item:describe()
    print(string.format("  Name: %s | Weight: %dkg | Value: %dgp",
        self.name, self.weight, self.value))
end

-- Weapon extends Item
local Weapon = setmetatable({}, { __index = Item })
Weapon.__index = Weapon

function Weapon.new(name, weight, value, damage)
    local self = Item.new(name, weight, value)
    self.damage = damage
    return setmetatable(self, Weapon)
end

function Weapon:describe()
    Item.describe(self)
    print(string.format("  Damage: %d", self.damage))
end

-- MagicWeapon extends Weapon
local MagicWeapon = setmetatable({}, { __index = Weapon })
MagicWeapon.__index = MagicWeapon

function MagicWeapon.new(name, weight, value, damage, spell)
    local self = Weapon.new(name, weight, value, damage)
    self.spell = spell
    return setmetatable(self, MagicWeapon)
end

function MagicWeapon:describe()
    Weapon.describe(self)
    print(string.format("  Enchantment: %s", self.spell))
end

function MagicWeapon:cast()
    print(self.name .. " crackles as you cast: " .. self.spell .. "!")
end

-- Test
local rock  = Item.new("Rock", 1, 0)
local sword = Weapon.new("Iron Sword", 5, 50, 12)
local staff = MagicWeapon.new("Arcane Staff", 3, 200, 8, "Fireball")

print("--- Rock ---")
rock:describe()

print("--- Sword ---")
sword:describe()

print("--- Staff ---")
staff:describe()
staff:cast()
```

</details>
