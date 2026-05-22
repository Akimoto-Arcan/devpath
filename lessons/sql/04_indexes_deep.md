---
difficulty: advanced
---

# Index Strategy Deep Dive

Adding an index is easy. Knowing *which* index to add, in what order, whether it'll actually be used, and when an index actively hurts you — that's the work. This lesson goes past the basics: B-tree internals that explain optimizer behavior, composite index column ordering, covering indexes, selectivity, MySQL 8 invisible indexes for zero-risk testing, and expression indexes.

## B-Tree Internals (What Explains Optimizer Behavior)

InnoDB indexes are B+ trees. Internal nodes hold key values and pointers to child nodes. Leaf nodes hold the full key plus (for secondary indexes) the primary key value used to look up the row in the clustered index.

The clustered index IS the table — rows are stored in primary key order on disk. Secondary indexes are separate B+ trees whose leaf nodes contain the secondary key value + primary key value. A lookup on a secondary index therefore requires two steps: traverse the secondary index to find the PK, then traverse the clustered index to fetch the row. This is called a **double lookup** or **row lookup**, and it's why covering indexes matter.

The tree structure explains:
- **Range scans are fast** — contiguous keys are physically adjacent in the leaf level
- **Leftmost prefix rule** — the tree is sorted by (col1, col2, col3). You can seek by col1 alone, or col1+col2, but not col2 alone — there's no sorted order by col2 independent of col1
- **Low selectivity indexes are often skipped** — if an index on `status` has 3 distinct values across 10M rows, a leaf-level scan of the index + row lookups for 3M rows may be slower than just scanning the table

## Composite Index Column Order

The leftmost prefix rule governs which columns of a composite index MySQL can use:

```
Index: (a, b, c)
Can use: a | a,b | a,b,c
Cannot use for index seek: b alone | c alone | b,c
```

Order rules for composite indexes:
1. **Equality conditions first** — columns with `=` or `IN` should precede range columns
2. **Range column comes last among used columns** — after a range (`>`, `<`, `BETWEEN`, `LIKE 'x%'`), additional columns in the index cannot be used for filtering (though they can still be used for covering)
3. **High-selectivity columns first** — when two columns are both equality predicates, put the one with more distinct values first to prune the index faster

```sql
-- Query: WHERE status = 'active' AND created_at > '2025-01-01' AND region = 'west'
-- status: 3 distinct values (low selectivity)
-- region: 50 distinct values (medium)
-- created_at: range

-- Correct index: equality columns first, range last
CREATE INDEX idx ON users (region, status, created_at);
-- region=, status=, then created_at range — optimal
-- NOT: (created_at, region, status) — range first breaks use of region/status
```

## Covering Indexes

A covering index contains all columns referenced by a query — SELECT list, WHERE, JOIN, ORDER BY. MySQL can satisfy the query entirely from the index without touching the clustered index. This appears as `Using index` in `EXPLAIN`.

The performance difference is significant at scale. A secondary index scan without covering requires one clustered index lookup per row. If your query returns 100K rows from a 10M row table, that's 100K random I/O operations into the clustered index. A covering index turns that into a single sequential scan of the index leaf pages.

```sql
-- Non-covering: must fetch row for email and name columns
SELECT email, name FROM users WHERE status = 'active';

-- Covering: index contains all needed columns
CREATE INDEX idx_users_covering ON users (status, email, name);
SELECT email, name FROM users WHERE status = 'active';
-- Extra: Using index -- no table lookups
```

## Index Selectivity

Selectivity = distinct values / total rows. Higher is better. A column with 10 distinct values out of 1M rows has selectivity 0.00001 — an index on it alone is nearly useless because each key points to ~100K rows.

Check selectivity before creating an index:
```sql
SELECT
    COUNT(DISTINCT status) / COUNT(*) AS status_selectivity,
    COUNT(DISTINCT customer_id) / COUNT(*) AS customer_selectivity,
    COUNT(DISTINCT email) / COUNT(*) AS email_selectivity
FROM orders;
-- email: ~1.0 (unique), customer_id: medium, status: near 0
```

## When NOT to Add an Index

- **Write-heavy tables** — every INSERT, UPDATE, DELETE must maintain every index. A table with 8 indexes pays 8 index update costs per write.
- **Low-selectivity columns in isolation** — `status`, `boolean flags`, `type` columns with few distinct values
- **Small tables** — MySQL will choose a full table scan over an index on tables under a few thousand rows because the overhead of index traversal + row lookup exceeds sequential scan cost
- **Columns with skewed distributions** — if 95% of rows have `status = 'active'`, an index on status is useless for queries filtering on `active` (the optimizer will skip it)

## FORCE INDEX

MySQL's optimizer occasionally makes wrong choices — usually due to stale statistics or unusual data distributions. `FORCE INDEX` overrides the optimizer and requires use of a specific index.

```sql
SELECT * FROM orders FORCE INDEX (idx_orders_customer_date)
WHERE customer_id = 123
  AND order_date >= '2025-01-01';
```

Use it sparingly. It's a code smell in long-lived queries — statistics should be kept current with `ANALYZE TABLE`, and `FORCE INDEX` can become a liability when data distributions change. It's most appropriate in two scenarios: emergency production fixes while you investigate root cause, and benchmarking (forcing MySQL to use a specific index so you can compare execution times).

## Invisible Indexes (MySQL 8)

An invisible index is maintained by the storage engine but ignored by the optimizer. It lets you test "what happens if I drop this index" without actually dropping it — a zero-risk way to validate that an index is unused before removing it.

```sql
-- Make an index invisible (optimizer ignores it)
ALTER TABLE orders ALTER INDEX idx_old_column INVISIBLE;

-- Run your workload, check slow query log — did anything get slower?
-- If not, the index was unused. Safe to drop.
ALTER TABLE orders DROP INDEX idx_old_column;

-- Make visible again if needed
ALTER TABLE orders ALTER INDEX idx_old_column VISIBLE;
```

You can also force the optimizer to use invisible indexes in a session for testing:
```sql
SET SESSION optimizer_switch = 'use_invisible_indexes=on';
```

## Index on Expressions (MySQL 8 Functional Indexes)

Before MySQL 8, you couldn't index a computed value directly — a common workaround was generated columns. MySQL 8 adds functional indexes: indexes on expressions, backed by a hidden generated column internally.

```sql
-- Common problem: query filters on LOWER(email) for case-insensitive search
-- Without functional index: full table scan, can't use index on email column
SELECT * FROM users WHERE LOWER(email) = 'user@example.com';

-- Solution: functional index
CREATE INDEX idx_users_email_lower ON users ((LOWER(email)));
-- Note the double parentheses — expression indexes require them

-- MySQL uses this index automatically for:
SELECT * FROM users WHERE LOWER(email) = 'user@example.com';

-- Other useful examples:
CREATE INDEX idx_orders_year ON orders ((YEAR(created_at)));
CREATE INDEX idx_json_field ON events ((JSON_UNQUOTE(metadata->>'$.user_id')));
```

## Example

```sql
-- Demonstrate all concepts against: orders(id, customer_id, status, region, created_at, total)

-- Check selectivity first
SELECT
    COUNT(DISTINCT status)      / COUNT(*) AS sel_status,
    COUNT(DISTINCT region)      / COUNT(*) AS sel_region,
    COUNT(DISTINCT customer_id) / COUNT(*) AS sel_customer,
    COUNT(DISTINCT created_at)  / COUNT(*) AS sel_created_at
FROM orders;

-- Design composite + covering index for this query:
-- SELECT customer_id, total FROM orders
-- WHERE region = 'west' AND status = 'shipped' AND created_at >= '2025-01-01'
-- ORDER BY created_at

-- Index: equality cols (region, status) + range col (created_at) + SELECT cols (customer_id, total)
CREATE INDEX idx_orders_region_status_date_covering
    ON orders (region, status, created_at, customer_id, total);

-- Verify with EXPLAIN: should show type=range, Extra=Using index (no table lookup)
EXPLAIN SELECT customer_id, total FROM orders
WHERE region = 'west' AND status = 'shipped' AND created_at >= '2025-01-01'
ORDER BY created_at;

-- Test dropping an index safely
ALTER TABLE orders ALTER INDEX idx_old_unused INVISIBLE;
-- ... run load tests / monitor for 24h ...
ALTER TABLE orders DROP INDEX idx_old_unused;  -- if no slowdowns observed

-- Functional index for case-insensitive customer email lookup
CREATE INDEX idx_customers_email_ci ON customers ((LOWER(email)));
```

## Why This Matters

Index decisions are permanent — they outlive the query that prompted them and affect every write on the table indefinitely. A poorly ordered composite index gets skipped silently by the optimizer, giving you the maintenance cost with none of the read benefit. Understanding the leftmost prefix rule and covering indexes lets you design indexes that serve multiple query patterns from a single structure, minimizing index count while maximizing coverage. Invisible indexes make index hygiene safe: you can remove dead indexes confidently rather than guessing.

## Exercise

You have a `transactions` table with columns: `id`, `account_id`, `merchant_category`, `amount`, `currency`, `txn_date`, `is_flagged` (TINYINT), `country_code`.

The following two queries run frequently on this table (20M rows):

**Query A:**
```sql
SELECT account_id, SUM(amount) AS total
FROM transactions
WHERE merchant_category = 'travel'
  AND txn_date BETWEEN '2025-01-01' AND '2025-03-31'
GROUP BY account_id;
```

**Query B:**
```sql
SELECT id, account_id, amount, txn_date
FROM transactions
WHERE account_id = 9981
  AND is_flagged = 1
ORDER BY txn_date DESC
LIMIT 50;
```

1. Design a single composite index that serves Query A as a covering index.
2. Design a separate index that serves Query B efficiently, explain why you'd make it a covering index here too.
3. For `is_flagged`, explain whether it deserves its own index or whether it should always be part of a composite index.
4. How would you safely test removing the old index on `(txn_date)` that existed before your new indexes?

<details>
<summary>Hint</summary>

For Query A: identify the equality predicates, the range predicate, and all columns in SELECT/GROUP BY. For Query B: `account_id` is the equality filter — it goes first. `is_flagged` is also equality. `txn_date` is the ORDER BY — placing it last enables index-ordered reads that avoid filesort. Covering means including `id` and `amount` too. For `is_flagged` alone: think about what 2 distinct values (0 and 1) means for selectivity.
</details>

<details>
<summary>Solution</summary>

```sql
-- Query A: covering index
-- Equality: merchant_category
-- Range: txn_date (BETWEEN)
-- SELECT/GROUP BY: account_id, amount
-- merchant_category first (equality), txn_date second (range), then remaining SELECT cols
CREATE INDEX idx_txn_query_a
    ON transactions (merchant_category, txn_date, account_id, amount);

-- EXPLAIN should show: type=range, Extra=Using index (covering)

-- Query B: covering index
-- Equality: account_id (high selectivity — good leading column)
-- Equality: is_flagged (low selectivity — but combined with account_id it's fine)
-- ORDER BY: txn_date DESC — put it last to enable index-ordered scan, avoid filesort
-- SELECT cols: id, amount — include for covering
CREATE INDEX idx_txn_query_b
    ON transactions (account_id, is_flagged, txn_date, id, amount);

-- account_id=, is_flagged= narrow results; txn_date in index order = no filesort
-- EXPLAIN should show: type=ref, Extra=Using index, no filesort

-- is_flagged in isolation:
-- Selectivity = 2 distinct values / 20M rows ≈ 0.0000001
-- An index on is_flagged alone is nearly useless — each key value points to ~10M rows
-- The optimizer will skip it for most queries. It belongs only in a composite index
-- where a high-selectivity leading column (account_id) dramatically narrows the scope first.

-- Safely removing the old (txn_date) index:
ALTER TABLE transactions ALTER INDEX idx_txn_date INVISIBLE;
-- Monitor slow query log and application metrics for 24-48 hours
-- If no regressions, confirm it's truly unused:
SELECT * FROM sys.schema_unused_indexes
WHERE object_schema = 'your_db'
  AND object_name = 'transactions';
-- Then permanently drop:
ALTER TABLE transactions DROP INDEX idx_txn_date;
```

</details>
