---
difficulty: intermediate
---

# Namespaces and PSR-4 Autoloading

Before namespaces, PHP global scope was a collision waiting to happen. Two libraries both defining a class called `Request` or `User` would break each other. Namespaces solve this by scoping class, function, and constant names to a declared path — similar to how directories prevent filename conflicts on a filesystem.

A namespace declaration must be the first statement in a file (after `<?php`):

```php
namespace App\Http;
```

From that point on, any class defined in the file lives under `App\Http`. To reference it elsewhere, you either use the fully-qualified name (`\App\Http\Request`) or import it with `use`:

```php
use App\Http\Request;
use App\Http\Response;
use App\Database\Connection as DB; // alias to avoid name conflicts
```

`use` is a compile-time directive — it just tells PHP how to resolve short names. It does not load files. That's what autoloading does.

## PSR-4 Autoloading

PSR-4 is a standard that maps namespace prefixes to filesystem directories. When PHP encounters a class it hasn't seen yet, it fires registered autoloaders. Composer registers one that follows PSR-4.

The rule: strip the namespace prefix, replace backslashes with directory separators, append `.php`. Given a prefix of `App\\` mapped to `src/`, the class `App\Http\Request` maps to `src/Http/Request.php`.

Your `composer.json` autoload block:

```json
{
    "autoload": {
        "psr-4": {
            "App\\": "src/"
        }
    }
}
```

After editing `composer.json`, regenerate the autoloader:

```bash
composer dump-autoload
```

Then in your entry point (`public/index.php` or bootstrap):

```php
require_once __DIR__ . '/../vendor/autoload.php';
```

That single line gives you access to every class in your codebase and every Composer dependency — no more `require_once` chains.

## Example

```php
// src/Http/Request.php
namespace App\Http;

class Request
{
    public function __construct(
        private string $method,
        private string $uri,
        private array  $body = []
    ) {}

    public function method(): string
    {
        return strtoupper($this->method);
    }

    public function uri(): string
    {
        return $this->uri;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $default;
    }
}
```

```php
// src/Http/Router.php
namespace App\Http;

// Both classes live under App\Http — no `use` needed for same-namespace references.
// But if you needed App\Database\Connection, you'd `use` it here.

class Router
{
    private array $routes = [];

    public function get(string $uri, callable $handler): void
    {
        $this->routes['GET'][$uri] = $handler;
    }

    public function dispatch(Request $request): string
    {
        $handler = $this->routes[$request->method()][$request->uri()] ?? null;

        if ($handler === null) {
            return '404 Not Found';
        }

        return ($handler)($request);
    }
}
```

```php
// public/index.php
require_once __DIR__ . '/../vendor/autoload.php';

use App\Http\Request;
use App\Http\Router;

$router = new Router();
$router->get('/hello', fn(Request $req) => 'Hello, world!');

$request = new Request('GET', '/hello');
echo $router->dispatch($request); // Hello, world!
```

The directory structure mirrors the namespace exactly:

```
project/
├── composer.json
├── public/
│   └── index.php
├── src/
│   └── Http/
│       ├── Request.php
│       └── Router.php
└── vendor/
    └── autoload.php
```

## Why This Matters

If you built your MVC framework with manual `require_once` calls, adding a new class means remembering to require it. With PSR-4 autoloading, you create the file in the right directory and it's immediately available everywhere. It also makes third-party library integration seamless — Composer handles all of it through the same autoloader.

Type-hinting and interface contracts become practical at scale. You can reference `App\Contracts\Cache` in a class without caring whether `RedisCache` or `FileCache` is actually loaded — the autoloader handles it when PHP first encounters the class name.

## Exercise

You have a flat project with these files all in one directory, using `require_once` to wire everything together:

```
Database.php
UserRepository.php
EmailService.php
index.php
```

Restructure it to use PSR-4 autoloading under the namespace `MyApp\\`. Move `Database` to `MyApp\Database`, `UserRepository` to `MyApp\Repository\UserRepository`, and `EmailService` to `MyApp\Services\EmailService`. Write the `composer.json` autoload block and update `index.php` to use the new structure.

<details>
<summary>Hint</summary>
The namespace in each file must match the directory path relative to your PSR-4 root. If `src/` maps to `MyApp\\`, then `src/Repository/UserRepository.php` must declare `namespace MyApp\Repository;`. Run `composer dump-autoload` after updating `composer.json`.
</details>

<details>
<summary>Solution</summary>

```json
{
    "autoload": {
        "psr-4": {
            "MyApp\\": "src/"
        }
    }
}
```

```php
// src/Database.php
namespace MyApp;

class Database
{
    public function __construct(private \PDO $pdo) {}

    public function query(string $sql, array $params = []): array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }
}
```

```php
// src/Repository/UserRepository.php
namespace MyApp\Repository;

use MyApp\Database;

class UserRepository
{
    public function __construct(private Database $db) {}

    public function findById(int $id): ?array
    {
        $results = $this->db->query('SELECT * FROM users WHERE id = ?', [$id]);
        return $results[0] ?? null;
    }
}
```

```php
// src/Services/EmailService.php
namespace MyApp\Services;

class EmailService
{
    public function send(string $to, string $subject, string $body): bool
    {
        // mail() or mailer library call here
        return mail($to, $subject, $body);
    }
}
```

```php
// index.php
require_once __DIR__ . '/vendor/autoload.php';

use MyApp\Database;
use MyApp\Repository\UserRepository;
use MyApp\Services\EmailService;

$pdo  = new PDO('sqlite::memory:');
$db   = new Database($pdo);
$repo = new UserRepository($db);
$mail = new EmailService();

$user = $repo->findById(1);
if ($user) {
    $mail->send($user['email'], 'Welcome', 'Hello!');
}
```

</details>
