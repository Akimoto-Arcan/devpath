---
difficulty: intermediate
---

# PHP 8.x Features Worth Knowing

PHP 8.0, 8.1, and 8.2 shipped features that change how you write everyday code — not just edge cases. If your codebase predates these versions or you adopted them without studying the changes, this covers what actually matters in production.

## `match` Expression

`switch` has two problems: loose comparison (`==`, not `===`) and fall-through requiring explicit `break`. `match` fixes both and returns a value directly.

```php
// Old switch — fall-through bug waiting to happen, no return value
$label = '';
switch ($status) {
    case 'active':
        $label = 'Active';
        break;
    case 'inactive':
        $label = 'Inactive';
        break;
    default:
        $label = 'Unknown';
}

// match — strict comparison, returns a value, throws UnhandledMatchError on no match
$label = match($status) {
    'active'   => 'Active',
    'inactive' => 'Inactive',
    default    => 'Unknown',
};

// Multiple conditions per arm
$group = match(true) {
    $score >= 90 => 'A',
    $score >= 80 => 'B',
    $score >= 70 => 'C',
    default      => 'F',
};
```

If no arm matches and there's no `default`, PHP throws `\UnhandledMatchError`. That's better than silently returning null.

## Named Arguments

Named arguments let you pass arguments by name, skipping optional ones you don't care about. This is particularly useful for built-in functions with many parameters.

```php
// Before — had to look up parameter order, couldn't skip middle args
$result = array_slice($array, 0, 5, true);

// After — self-documenting, order doesn't matter
$result = array_slice(array: $array, offset: 0, length: 5, preserve_keys: true);

// More practical — skipping parameters with defaults
function createUser(
    string $name,
    string $role   = 'user',
    bool   $active = true,
    ?string $email = null
): array {
    return compact('name', 'role', 'active', 'email');
}

// Without named args — have to pass all intermediates
$user = createUser('Alice', 'user', true, 'alice@example.com');

// With named args — skip what you don't need
$user = createUser(name: 'Alice', email: 'alice@example.com');
```

## Nullsafe Operator

`?->` short-circuits the chain when it encounters null, returning null instead of throwing an error. It replaces nested null checks.

```php
// Before — deeply nested null guards
$city = null;
if ($user !== null) {
    $address = $user->getAddress();
    if ($address !== null) {
        $city = $address->getCity();
    }
}

// After — chains until something is null, then returns null
$city = $user?->getAddress()?->getCity();

// Also works with array access in PHP 8
$zip = $user?->getAddress()?->getZip() ?? 'N/A';
```

## Union Types and Constructor Property Promotion

Union types allow a parameter or return to accept more than one type. Constructor property promotion eliminates the boilerplate of declaring properties, listing constructor parameters, and assigning them.

```php
// Union types
function formatId(int|string $id): string
{
    return is_int($id) ? "ID-{$id}" : $id;
}

// Constructor property promotion — before
class Order
{
    private int    $id;
    private string $status;
    private float  $total;

    public function __construct(int $id, string $status, float $total)
    {
        $this->id     = $id;
        $this->status = $status;
        $this->total  = $total;
    }
}

// Constructor property promotion — after (PHP 8.0+)
class Order
{
    public function __construct(
        private int    $id,
        private string $status,
        private float  $total,
    ) {}
    // Properties are declared, assigned, and typed in one line
}
```

## Readonly Properties (PHP 8.1)

`readonly` prevents a property from being written to after initialization. It's not the same as `private` — it can be `public readonly` and still be readable everywhere, just not writable after construction.

```php
class UserId
{
    public function __construct(
        public readonly int $value
    ) {
        if ($value <= 0) {
            throw new \InvalidArgumentException('UserId must be positive');
        }
    }
}

$id = new UserId(42);
echo $id->value;  // 42 — readable
$id->value = 99;  // Fatal error: Cannot modify readonly property
```

This is valuable for value objects and DTOs where immutability is the point.

## Example

All the features together in a realistic context:

```php
// PHP 8.1 DTO using promotion + readonly
class InvoiceLineItem
{
    public function __construct(
        public readonly string $description,
        public readonly float  $unitPrice,
        public readonly int    $quantity,
    ) {}

    public function total(): float
    {
        return $this->unitPrice * $this->quantity;
    }
}

class InvoiceService
{
    public function formatStatus(string $status): string
    {
        return match($status) {
            'draft'   => 'Draft',
            'sent'    => 'Sent to Client',
            'paid'    => 'Paid',
            'overdue' => 'Past Due',
            default   => throw new \ValueError("Unknown status: $status"),
        };
    }

    public function getClientEmail(?User $user): ?string
    {
        // Nullsafe operator — returns null if user or profile is null
        return $user?->getProfile()?->getEmail();
    }

    public function formatId(int|string $id): string
    {
        return match(true) {
            is_int($id)    => "INV-{$id}",
            default        => strtoupper($id),
        };
    }

    public function calculateTotal(InvoiceLineItem ...$items): float
    {
        return array_sum(array_map(fn($item) => $item->total(), $items));
    }
}

$service = new InvoiceService();

$items = [
    new InvoiceLineItem('Web Design', 150.00, 8),
    new InvoiceLineItem('Hosting',     25.00, 3),
];

echo $service->calculateTotal(...$items);       // 1275.00
echo $service->formatStatus('paid');            // Paid
echo $service->formatId(1042);                  // INV-1042
echo $service->getClientEmail(null) ?? 'none';  // none
```

## `array_is_list()` (PHP 8.1)

Checks whether an array is a proper list (sequential integer keys starting at 0). Solves the classic `array_values($arr) === $arr` workaround.

```php
array_is_list([]);                    // true
array_is_list(['a', 'b', 'c']);       // true
array_is_list([0 => 'a', 1 => 'b']); // true
array_is_list([1 => 'a', 0 => 'b']); // false — keys out of order
array_is_list(['key' => 'value']);    // false — string keys
```

## Fibers (PHP 8.1, brief)

Fibers are cooperative coroutines — pauseable functions. They're the foundation of async PHP, but most developers interact with them through libraries (ReactPHP, Revolt) rather than directly. The concept: a Fiber can `suspend()` mid-execution, returning control to the caller, and resume later. If you're building or maintaining async tools, learn Fibers; otherwise, use a library that handles them.

## Why This Matters

Constructor property promotion alone eliminates 30–50% of boilerplate in model and DTO classes. `match` makes intent clearer and eliminates a class of fall-through bugs. `readonly` lets you express immutability explicitly instead of relying on convention. These aren't syntax sugar — they change how you structure classes and catch mistakes at declaration time rather than runtime.

## Exercise

Refactor this pre-PHP-8 code to use constructor property promotion, `match`, nullsafe operator, and `readonly` where appropriate:

```php
class Product
{
    private string $name;
    private float  $price;
    private string $status;

    public function __construct(string $name, float $price, string $status)
    {
        $this->name   = $name;
        $this->price  = $price;
        $this->status = $status;
    }

    public function getLabel(): string
    {
        switch ($this->status) {
            case 'available':    return 'In Stock';
            case 'backordered':  return 'Backordered';
            case 'discontinued': return 'Discontinued';
            default:             return 'Unknown';
        }
    }
}

function getDiscountPercent(?Product $product): int
{
    if ($product === null) {
        return 0;
    }
    $status = $product->getStatus();
    if ($status === null) {
        return 0;
    }
    if ($status === 'backordered') {
        return 10;
    }
    return 0;
}
```

<details>
<summary>Hint</summary>
Make `name`, `price`, and `status` readonly — they shouldn't change after construction. The `getDiscountPercent` function's null checks collapse to a single nullsafe chain plus `match`. Remember `match` with no `default` throws on unmatched values, so add one if needed.
</details>

<details>
<summary>Solution</summary>

```php
class Product
{
    public function __construct(
        public readonly string $name,
        public readonly float  $price,
        public readonly string $status,
    ) {}

    public function getLabel(): string
    {
        return match($this->status) {
            'available'    => 'In Stock',
            'backordered'  => 'Backordered',
            'discontinued' => 'Discontinued',
            default        => 'Unknown',
        };
    }

    public function getStatus(): string
    {
        return $this->status;
    }
}

function getDiscountPercent(?Product $product): int
{
    return match($product?->getStatus()) {
        'backordered' => 10,
        default       => 0,
    };
}

// Usage
$product = new Product('Widget', 29.99, 'backordered');
echo $product->getLabel();              // Backordered
echo getDiscountPercent($product);      // 10
echo getDiscountPercent(null);          // 0

// $product->name = 'Other'; // Fatal: Cannot modify readonly property
```

</details>
