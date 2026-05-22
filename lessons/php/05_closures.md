---
difficulty: intermediate
---

# Closures and First-Class Callables

A closure is an anonymous function that captures variables from its surrounding scope. PHP closures are instances of the built-in `Closure` class, which means they're objects — you can store them in variables, pass them as arguments, return them from functions, and call methods on them.

## Variable Capture with `use`

Unlike JavaScript, PHP closures do not automatically capture outer variables. You must explicitly list what to bring in with `use`.

```php
$multiplier = 3;

// Without `use` — $multiplier is not available inside
$fn = function(int $n): int {
    return $n * $multiplier; // Error: Undefined variable $multiplier
};

// With `use` — captured by value (a copy at the time of closure creation)
$fn = function(int $n) use ($multiplier): int {
    return $n * $multiplier;
};

echo $fn(5); // 15

// Changing $multiplier after the fact doesn't affect the closure
$multiplier = 10;
echo $fn(5); // Still 15 — the copy was taken at creation time
```

To capture by reference, add `&`:

```php
$count = 0;

$increment = function() use (&$count): void {
    $count++;
};

$increment();
$increment();
echo $count; // 2 — the closure holds a reference to the original variable
```

By-reference capture is useful for accumulators, but be careful — it creates a hidden dependency on outer state. Use it deliberately.

## Closures as First-Class Values

Because closures are objects, you can return them from functions to build specialized functions on the fly:

```php
// Factory that produces closures
function multiplierOf(int $factor): Closure
{
    return fn(int $n): int => $n * $factor;
}

$double = multiplierOf(2);
$triple = multiplierOf(3);

echo $double(5); // 10
echo $triple(5); // 15

// Each closure holds its own copy of $factor
```

Short closures (`fn() =>`) automatically capture outer variables by value without `use`. They're read-only captures — you can't modify outer variables from a short closure.

```php
$prefix = 'Hello';
$greet  = fn(string $name): string => "$prefix, $name!";
echo $greet('Alice'); // Hello, Alice!
```

## `Closure::bind()` and `bindTo()`

Closures can be bound to a specific object and class scope, giving them access to `$this` and private members. This is how some frameworks implement "magic" — calling a closure as if it were a method on another object.

```php
class Config
{
    private array $data = ['debug' => true, 'version' => '2.1'];
}

// A closure that reads private state — normally impossible from outside
$reader = Closure::bind(
    function(string $key): mixed {
        return $this->data[$key] ?? null;  // $this = Config instance
    },
    new Config(),
    Config::class  // scope — grants access to private members
);

echo $reader('version'); // 2.1
echo $reader('debug');   // 1 (true)

// bindTo() is the instance method equivalent
$config  = new Config();
$reader2 = (function(string $key) {
    return $this->data[$key] ?? null;
})->bindTo($config, Config::class);

echo $reader2('version'); // 2.1
```

This is primarily useful when building frameworks, testing utilities, or macro systems. Don't use it to bypass encapsulation in normal application code.

## Array Functions with Closures

`array_map`, `array_filter`, and `array_reduce` become genuinely expressive with closures:

```php
$orders = [
    ['id' => 1, 'total' => 120.00, 'status' => 'paid'],
    ['id' => 2, 'total' =>  45.50, 'status' => 'pending'],
    ['id' => 3, 'total' => 300.00, 'status' => 'paid'],
    ['id' => 4, 'total' =>  15.00, 'status' => 'cancelled'],
];

// Filter to paid orders only
$paidOrders = array_filter($orders, fn($o) => $o['status'] === 'paid');

// Extract totals
$totals = array_map(fn($o) => $o['total'], $paidOrders);

// Sum them — array_reduce with a closure
$revenue = array_reduce($totals, fn($carry, $total) => $carry + $total, 0.0);

echo number_format($revenue, 2); // 420.00

// Pipeline-style: chain operations without intermediate named variables
$result = array_reduce(
    array_map(
        fn($o) => $o['total'],
        array_filter($orders, fn($o) => $o['status'] === 'paid')
    ),
    fn($carry, $total) => $carry + $total,
    0.0
);
```

## First-Class Callable Syntax (PHP 8.1)

Before PHP 8.1, passing a built-in function as a callable required wrapping it in a closure:

```php
// Old way — verbose wrapper
$lengths = array_map(fn($s) => strlen($s), $strings);
$trimmed = array_map(fn($s) => trim($s), $strings);
```

PHP 8.1 adds first-class callable syntax: `functionName(...)` creates a `Closure` from any callable — built-in functions, static methods, instance methods:

```php
// First-class callable syntax
$lengths = array_map(strlen(...), $strings);
$trimmed = array_map(trim(...),   $strings);

// Works with methods too
class Formatter
{
    public function format(string $s): string
    {
        return ucfirst(strtolower(trim($s)));
    }
}

$formatter = new Formatter();
$formatted  = array_map($formatter->format(...), $rawStrings);

// Static methods
$encoded = array_map(base64_encode(...), $binaryData);
```

## Example

A practical pipeline using closures for a data transformation:

```php
class DataPipeline
{
    private array $stages = [];

    public function pipe(Closure $stage): static
    {
        $clone          = clone $this;
        $clone->stages[] = $stage;
        return $clone;
    }

    public function process(array $data): array
    {
        return array_reduce(
            $this->stages,
            fn($carry, $stage) => $stage($carry),
            $data
        );
    }
}

// Build a pipeline of transformations
$minAmount = 50.0;

$pipeline = (new DataPipeline())
    ->pipe(fn($items) => array_filter($items, fn($i) => $i['active']))
    ->pipe(fn($items) => array_filter($items, fn($i) => $i['amount'] >= $minAmount))
    ->pipe(fn($items) => array_map(fn($i) => [
        ...$i,
        'amount_formatted' => '$' . number_format($i['amount'], 2),
    ], $items))
    ->pipe(fn($items) => array_values($items)); // re-index

$data = [
    ['name' => 'Alice', 'amount' => 120.00, 'active' => true],
    ['name' => 'Bob',   'amount' =>  30.00, 'active' => true],
    ['name' => 'Carol', 'amount' =>  80.00, 'active' => false],
    ['name' => 'Dave',  'amount' =>  75.00, 'active' => true],
];

$result = $pipeline->process($data);
// Only Alice and Dave — active AND >= $50

foreach ($result as $row) {
    echo "{$row['name']}: {$row['amount_formatted']}\n";
}
// Alice: $120.00
// Dave: $75.00
```

`$minAmount` is captured by value in the second `pipe()` closure — changing it later won't affect the built pipeline.

## Why This Matters

Named functions require a name, live at global or class scope, and can't close over local state. Closures let you express "a small piece of behavior that carries some context" without the overhead of a full class or the messiness of global state. They're the backbone of event systems, middleware stacks, pipelines, and deferred execution patterns.

When to use closures over named functions: when the function is short, contextual, and only needed in one place — or when it needs to capture surrounding state. When to use named functions or methods: when the behavior is reused across the codebase, needs documentation, or benefits from being testable in isolation.

## Exercise

Write a `memoize()` function that takes any callable and returns a closure. The returned closure caches results by argument signature, so the original function is only called once per unique set of arguments. Test it with an expensive computation (simulate with `sleep()` or a counter).

<details>
<summary>Hint</summary>
Use by-reference capture to share the cache array between calls to the returned closure. Serialize the arguments array to build a cache key — `serialize($args)` works for simple values. The inner closure uses `...$args` to accept any number of parameters.
</details>

<details>
<summary>Solution</summary>

```php
function memoize(callable $fn): Closure
{
    $cache = [];

    return function() use ($fn, &$cache) {
        $args = func_get_args();
        $key  = serialize($args);

        if (!array_key_exists($key, $cache)) {
            $cache[$key] = $fn(...$args);
        }

        return $cache[$key];
    };
}

// Test with a "slow" function
$callCount = 0;

$expensiveCalc = function(int $n) use (&$callCount): int {
    $callCount++;
    // Simulate expensive work
    usleep(100000); // 100ms
    return $n * $n;
};

$memoized = memoize($expensiveCalc);

$start = microtime(true);
echo $memoized(5) . "\n"; // 25 — computed
echo $memoized(5) . "\n"; // 25 — from cache
echo $memoized(5) . "\n"; // 25 — from cache
echo $memoized(6) . "\n"; // 36 — computed (different arg)
$elapsed = microtime(true) - $start;

echo "Call count: $callCount\n";    // 2 — only called for unique args
echo "Time: " . round($elapsed, 2) . "s\n"; // ~0.20s — only 2 real calls

// Works with first-class callable syntax too (PHP 8.1+)
function fibonacci(int $n): int
{
    if ($n <= 1) return $n;
    return fibonacci($n - 1) + fibonacci($n - 2);
}

// Note: memoize on a recursive function only caches top-level calls
// unless the recursive calls also go through the memoized version
$memoFib = memoize(fibonacci(...));
echo $memoFib(10) . "\n"; // 55
echo $memoFib(10) . "\n"; // 55 — from cache
```

</details>
