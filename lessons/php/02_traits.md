---
difficulty: intermediate
---

# Traits

Inheritance is vertical — one class extends another in a single chain. That works until you need the same behavior in two classes that don't share a meaningful parent. Traits solve this: they are reusable method and property bundles that get copied into a class at compile time. PHP calls this horizontal code reuse.

The key distinction from interfaces: interfaces define what a class must do (method signatures only). Traits define how (they include the actual implementation). The key distinction from abstract classes: you can use multiple traits in one class; you can only extend one class.

A trait is declared with `trait` instead of `class`:

```php
trait Timestamps
{
    private ?DateTime $createdAt = null;
    private ?DateTime $updatedAt = null;

    public function touch(): void
    {
        $this->updatedAt = new DateTime();
    }

    public function getCreatedAt(): ?DateTime
    {
        return $this->createdAt;
    }
}
```

A class pulls it in with `use`:

```php
class User
{
    use Timestamps;
    // All of Timestamps' methods and properties are now part of User
}
```

## Conflict Resolution

When two traits define a method with the same name, PHP requires you to resolve the conflict explicitly using `insteadof` and optionally `as` for aliasing:

```php
trait Logger
{
    public function log(string $message): void
    {
        echo "[LOG] $message\n";
    }
}

trait Auditor
{
    public function log(string $message): void
    {
        echo "[AUDIT] $message\n";
    }
}

class OrderService
{
    use Logger, Auditor {
        Logger::log    insteadof Auditor; // Logger wins for `log()`
        Auditor::log   as auditLog;       // Auditor's version still accessible as `auditLog()`
    }
}
```

`as` can also change visibility:

```php
trait InternalHelper
{
    public function sensitiveMethod(): void {}
}

class MyClass
{
    use InternalHelper {
        sensitiveMethod as private; // expose it internally only
    }
}
```

## Example

Two real-world traits common in data persistence layers:

```php
// Timestamps trait — auto-manages created_at / updated_at
trait HasTimestamps
{
    protected ?DateTime $createdAt = null;
    protected ?DateTime $updatedAt = null;

    public function initTimestamps(): void
    {
        $now = new DateTime();
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    public function touchUpdated(): void
    {
        $this->updatedAt = new DateTime();
    }

    public function getCreatedAt(): ?DateTime { return $this->createdAt; }
    public function getUpdatedAt(): ?DateTime { return $this->updatedAt; }
}

// SoftDeletes trait — marks records deleted without removing them
trait SoftDeletes
{
    protected ?DateTime $deletedAt = null;

    public function delete(): void
    {
        $this->deletedAt = new DateTime();
    }

    public function restore(): void
    {
        $this->deletedAt = null;
    }

    public function isDeleted(): bool
    {
        return $this->deletedAt !== null;
    }

    public function getDeletedAt(): ?DateTime { return $this->deletedAt; }
}

// A model class using both traits
class Article
{
    use HasTimestamps, SoftDeletes;

    public function __construct(
        private string $title,
        private string $body
    ) {
        $this->initTimestamps();
    }

    public function getTitle(): string { return $this->title; }
}

// Usage
$article = new Article('PHP Traits Explained', 'Traits solve horizontal reuse...');

echo $article->getCreatedAt()->format('Y-m-d H:i:s') . "\n"; // just now
echo $article->isDeleted() ? 'deleted' : 'active';            // active

$article->delete();
echo $article->isDeleted() ? 'deleted' : 'active';            // deleted

$article->restore();
echo $article->isDeleted() ? 'deleted' : 'active';            // active
```

Now `Post`, `Comment`, `Order` — any model — can use these same traits without sharing a base class.

## Why This Matters

The alternative to traits is often one of these bad paths: copying the same methods into multiple classes (duplication), forcing unrelated classes to inherit from a common base just to share a method (inappropriate coupling), or creating a helper class and passing it around everywhere (more complexity than needed).

Traits are best when:
- The behavior is genuinely reusable across unrelated classes (`Loggable`, `Cacheable`, `HasUuid`)
- You want to keep model files focused while adding cross-cutting concerns
- The trait doesn't need to know much about the host class (stateless helpers work best)

Prefer abstract classes when the shared behavior is tightly coupled to a class hierarchy and you need constructor logic or guaranteed initialization order. Traits have no constructor enforcement — a trait method that calls `$this->connection` will silently fail if the host class doesn't have that property.

## Exercise

Write a `HasUuid` trait that generates and stores a UUID (you can use `bin2hex(random_bytes(16))` as a simple stand-in). The trait should set the UUID in an `initUuid()` method, expose a `getUuid(): string` getter, and prevent the UUID from being changed after it's set. Use it in two unrelated classes: `Product` and `Session`.

<details>
<summary>Hint</summary>
Use a private property so subclasses can't accidentally overwrite it. Call `initUuid()` from each host class constructor, or use a trait constructor — but be careful: if the host class also defines `__construct`, PHP will raise an error. `initUuid()` as an explicit method is safer.
</details>

<details>
<summary>Solution</summary>

```php
trait HasUuid
{
    private ?string $uuid = null;

    public function initUuid(): void
    {
        // Only set once — subsequent calls are no-ops
        if ($this->uuid === null) {
            $this->uuid = sprintf(
                '%s-%s-%s-%s-%s',
                bin2hex(random_bytes(4)),
                bin2hex(random_bytes(2)),
                bin2hex(random_bytes(2)),
                bin2hex(random_bytes(2)),
                bin2hex(random_bytes(6))
            );
        }
    }

    public function getUuid(): string
    {
        if ($this->uuid === null) {
            throw new \RuntimeException('UUID not initialized. Call initUuid() first.');
        }
        return $this->uuid;
    }
}

class Product
{
    use HasUuid;

    public function __construct(private string $name, private float $price)
    {
        $this->initUuid();
    }

    public function getName(): string  { return $this->name; }
    public function getPrice(): float  { return $this->price; }
}

class Session
{
    use HasUuid;

    private DateTime $startedAt;

    public function __construct(private int $userId)
    {
        $this->initUuid();
        $this->startedAt = new DateTime();
    }

    public function getUserId(): int       { return $this->userId; }
    public function getStartedAt(): DateTime { return $this->startedAt; }
}

// Usage
$product = new Product('Keyboard', 79.99);
$session = new Session(42);

echo $product->getUuid() . "\n"; // e.g. 3f2a1b4c-8e9d-4f1a-b2c3-1a2b3c4d5e6f
echo $session->getUuid()  . "\n"; // different UUID

// Both have UUIDs, but Product and Session share no inheritance relationship
```

</details>
