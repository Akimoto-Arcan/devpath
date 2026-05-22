---
difficulty: intermediate
---

# Interfaces vs Abstract Classes

Both interfaces and abstract classes enforce a contract — they say "any class using me must provide these methods." The difference is in what they're allowed to include and what problem they're actually solving.

**An interface** is a pure contract. No properties, no method bodies (pre-PHP 8), no constructor. It defines a surface: the method signatures a class must implement. A class can implement any number of interfaces.

**An abstract class** is a partial implementation. It can have properties, concrete methods, a constructor, and abstract methods that subclasses must fill in. A class can only extend one abstract class.

The rule of thumb: use an interface when you're defining a role or capability that unrelated types might share. Use an abstract class when you're providing common implementation that a family of related classes builds on.

## Interfaces in Practice

The real power of interfaces is in type-hinting. When your code depends on an interface instead of a concrete class, it can work with any implementation. This is the "D" in SOLID — Dependency Inversion.

```php
interface Cache
{
    public function get(string $key): mixed;
    public function set(string $key, mixed $value, int $ttl = 3600): void;
    public function delete(string $key): void;
    public function has(string $key): bool;
}
```

Now any class that type-hints `Cache` doesn't care whether it's Redis, Memcached, or a flat array in memory:

```php
class UserRepository
{
    public function __construct(private Cache $cache, private PDO $db) {}

    public function findById(int $id): ?array
    {
        $key = "user:$id";

        if ($this->cache->has($key)) {
            return $this->cache->get($key);
        }

        $stmt = $this->db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

        if ($user) {
            $this->cache->set($key, $user);
        }

        return $user;
    }
}
```

Swap Redis for an in-memory array cache in tests — no changes to `UserRepository` needed.

## Abstract Classes in Practice

Abstract classes work well when you have real logic to share, but parts of that logic depend on specifics the subclass provides. The Template Method pattern is the classic example: define the algorithm steps in the base class, leave specific steps abstract.

```php
abstract class ReportExporter
{
    // Template method — the algorithm is fixed, steps are variable
    final public function export(array $data): string
    {
        $headers = $this->buildHeaders($data);
        $rows    = $this->buildRows($data);
        $footer  = $this->buildFooter($data);

        return $this->render($headers, $rows, $footer);
    }

    // Subclasses must implement these
    abstract protected function buildHeaders(array $data): array;
    abstract protected function buildRows(array $data): array;
    abstract protected function buildFooter(array $data): array;

    // Shared implementation — subclasses can override if needed
    protected function render(array $headers, array $rows, array $footer): string
    {
        return implode("\n", [
            implode(',', $headers),
            ...array_map(fn($row) => implode(',', $row), $rows),
            implode(',', $footer),
        ]);
    }
}

class SalesReport extends ReportExporter
{
    protected function buildHeaders(array $data): array
    {
        return ['Date', 'Product', 'Revenue'];
    }

    protected function buildRows(array $data): array
    {
        return array_map(
            fn($item) => [$item['date'], $item['product'], number_format($item['revenue'], 2)],
            $data
        );
    }

    protected function buildFooter(array $data): array
    {
        $total = array_sum(array_column($data, 'revenue'));
        return ['', 'Total', number_format($total, 2)];
    }
}

// Usage
$exporter = new SalesReport();
echo $exporter->export([
    ['date' => '2026-05-01', 'product' => 'Widget A', 'revenue' => 1200.00],
    ['date' => '2026-05-02', 'product' => 'Widget B', 'revenue' => 850.50],
]);
// Date,Product,Revenue
// 2026-05-01,Widget A,1200.00
// 2026-05-02,Widget B,850.50
// ,Total,2050.50
```

## Example

Combining both: an interface for the contract, an abstract class for shared groundwork.

```php
interface Notifier
{
    public function send(string $recipient, string $message): bool;
}

// Abstract class handles retry logic and logging — concrete classes handle transport
abstract class BaseNotifier implements Notifier
{
    private array $log = [];

    final public function send(string $recipient, string $message): bool
    {
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            if ($this->deliver($recipient, $message)) {
                $this->log[] = "Sent to $recipient on attempt $attempt";
                return true;
            }
        }

        $this->log[] = "Failed to send to $recipient after 3 attempts";
        return false;
    }

    abstract protected function deliver(string $recipient, string $message): bool;

    public function getLog(): array { return $this->log; }
}

class EmailNotifier extends BaseNotifier
{
    protected function deliver(string $recipient, string $message): bool
    {
        return mail($recipient, 'Notification', $message);
    }
}

class SlackNotifier extends BaseNotifier
{
    public function __construct(private string $webhookUrl) {}

    protected function deliver(string $recipient, string $message): bool
    {
        // HTTP POST to Slack webhook — simplified
        $context = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => 'Content-Type: application/json',
            'content' => json_encode(['text' => "$recipient: $message"]),
        ]]);
        return (bool) file_get_contents($this->webhookUrl, false, $context);
    }
}

// Code that accepts any Notifier — doesn't care about email vs Slack
function notifyUser(Notifier $notifier, string $email, string $message): void
{
    if (!$notifier->send($email, $message)) {
        error_log("Notification failed for $email");
    }
}
```

## Why This Matters

Type-hinting against an interface instead of a concrete class is what makes code genuinely testable and swappable. In tests, you pass a mock that implements the interface. In production, you swap implementations through a service container. The classes that use your `Cache` or `Notifier` never need to change.

If you've been building your MVC framework with concrete dependencies wired directly, this pattern is the first step toward making it extensible without modifying existing code.

## Exercise

Define a `PaymentGateway` interface with `charge(float $amount, string $token): bool` and `refund(string $transactionId): bool`. Write an abstract `AbstractGateway` that adds a `$transactionHistory` array and a `getHistory(): array` method, logging each charge and refund. Then implement two concrete classes: `StripeGateway` and `MockGateway` (for testing — always returns `true`).

<details>
<summary>Hint</summary>
The abstract class should implement `PaymentGateway` and handle the logging in `charge()` and `refund()` before delegating to abstract `processCharge()` and `processRefund()` methods. This keeps concrete classes focused on transport, not bookkeeping.
</details>

<details>
<summary>Solution</summary>

```php
interface PaymentGateway
{
    public function charge(float $amount, string $token): bool;
    public function refund(string $transactionId): bool;
}

abstract class AbstractGateway implements PaymentGateway
{
    protected array $transactionHistory = [];

    final public function charge(float $amount, string $token): bool
    {
        $result = $this->processCharge($amount, $token);

        $this->transactionHistory[] = [
            'type'   => 'charge',
            'amount' => $amount,
            'token'  => $token,
            'result' => $result,
            'time'   => date('Y-m-d H:i:s'),
        ];

        return $result;
    }

    final public function refund(string $transactionId): bool
    {
        $result = $this->processRefund($transactionId);

        $this->transactionHistory[] = [
            'type'          => 'refund',
            'transactionId' => $transactionId,
            'result'        => $result,
            'time'          => date('Y-m-d H:i:s'),
        ];

        return $result;
    }

    abstract protected function processCharge(float $amount, string $token): bool;
    abstract protected function processRefund(string $transactionId): bool;

    public function getHistory(): array { return $this->transactionHistory; }
}

class StripeGateway extends AbstractGateway
{
    public function __construct(private string $apiKey) {}

    protected function processCharge(float $amount, string $token): bool
    {
        // Real Stripe API call would go here
        // curl to api.stripe.com/v1/charges ...
        return true; // simplified
    }

    protected function processRefund(string $transactionId): bool
    {
        // Real Stripe refund API call
        return true; // simplified
    }
}

class MockGateway extends AbstractGateway
{
    protected function processCharge(float $amount, string $token): bool
    {
        return true; // always succeeds in tests
    }

    protected function processRefund(string $transactionId): bool
    {
        return true;
    }
}

// Usage
function processOrder(PaymentGateway $gateway, float $total, string $token): void
{
    if (!$gateway->charge($total, $token)) {
        throw new \RuntimeException('Payment failed');
    }
    echo "Charged \${$total}\n";
}

$gateway = new MockGateway();
processOrder($gateway, 99.99, 'tok_test_123');

print_r($gateway->getHistory());
// Array ( [0] => Array ( [type] => charge [amount] => 99.99 ... ) )
```

</details>
