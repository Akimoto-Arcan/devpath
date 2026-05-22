---
difficulty: advanced
---

# Reading Execution Plans

If you've used `EXPLAIN` to add an index and call it done, you're leaving most of its value on the table. MySQL's execution plan output tells you exactly how the optimizer intends to execute your query — which indexes it chose, how many rows it expects to scan, what intermediate operations it will perform, and where the real cost lives. `EXPLAIN ANALYZE` goes further: it runs the query and reports actual row counts and timing alongside the estimates.

## EXPLAIN vs EXPLAIN ANALYZE

`EXPLAIN` is the optimizer's plan — what it *thinks* will happen based on table statistics. `EXPLAIN ANALYZE` executes the query and shows both estimated and actual values. The gap between estimated and actual rows is often where tuning starts.

```sql
EXPLAIN SELECT ...;         -- plan only, no execution
EXPLAIN ANALYZE SELECT ...; -- executes query, returns timing + actuals
```

Use `EXPLAIN` during development when you can't afford to run a slow query. Use `EXPLAIN ANALYZE` when the plan looks reasonable but runtime doesn't match expectations — stale statistics often produce plausible-looking plans that behave badly.

## The `type` Column: The Most Important Field

The `type` column describes the join/access method. Reading it right tells you immediately whether a query will scale. From worst to best:

| type | Meaning |
|------|---------|
| `ALL` | Full table scan — every row read |
| `index` | Full index scan — every index entry read (still bad at scale) |
| `range` | Index range scan — reads a contiguous slice of the index |
| `ref` | Non-unique index lookup — multiple rows per key value |
| `eq_ref` | Unique index lookup per row from prior table (joins) |
| `const` / `system` | Single row matched via primary key or unique index |

`ALL` and `index` on large tables are red flags. `range` is often acceptable. `eq_ref` and `const` are what you're aiming for in joins and lookup queries.

## Key Columns to Read

- **`key`** — the index MySQL actually used (NULL means no index used)
- **`key_len`** — how many bytes of the index were used; for composite indexes, this tells you how many columns were used
- **`rows`** — estimated rows MySQL will examine; multiply across joined tables to get total work
- **`filtered`** — percentage of rows expected to pass the WHERE clause after the index access; `rows * filtered / 100` estimates rows passed to the next step
- **`ref`** — what's being compared against the index (a column, a constant, a function)
- **`Extra`** — catch-all for important behavior flags

## The `Extra` Column: Where Problems Hide

**`Using filesort`** — MySQL couldn't use an index to satisfy the `ORDER BY`. It will sort results in memory (or on disk for large result sets). This is expensive when the sorted set is large. It's not always avoidable, but if it appears on a query run frequently or on large tables, investigate whether a composite index can cover both the filter and the sort.

**`Using temporary`** — MySQL created an internal temporary table, common with `GROUP BY`, `DISTINCT`, or certain `ORDER BY` patterns that span joins. Temporary tables that spill to disk are a performance cliff. Check `tmp_table_size` and `max_heap_table_size` if you see this on hot queries.

**`Using index`** — the query was satisfied entirely from the index (a covering index). No row lookups into the clustered index were needed. This is good.

**`Using index condition`** — Index Condition Pushdown (ICP) is active. MySQL evaluates part of the WHERE clause at the storage engine level before fetching rows. Reduces row fetches.

## Example

```sql
-- Target table: orders (10M rows)
-- Columns: id, customer_id, status, created_at, total_amount

-- Step 1: baseline plan
EXPLAIN
SELECT customer_id, SUM(total_amount)
FROM orders
WHERE status = 'shipped'
  AND created_at >= '2025-01-01'
GROUP BY customer_id;

-- Likely shows: type=ALL, Extra=Using where; Using temporary; Using filesort
-- rows estimate near full table count — expensive

-- Step 2: add a composite index
-- status has low selectivity alone; created_at narrows it further
-- GROUP BY customer_id: including it allows a covering index
CREATE INDEX idx_orders_status_created_customer
    ON orders (status, created_at, customer_id, total_amount);

-- Step 3: re-examine
EXPLAIN
SELECT customer_id, SUM(total_amount)
FROM orders
WHERE status = 'shipped'
  AND created_at >= '2025-01-01'
GROUP BY customer_id;

-- Now: type=range, key=idx_orders_status_created_customer
-- key_len reflects status + created_at columns used
-- Extra=Using index (covering index — no table lookups)
-- "Using temporary" and "Using filesort" gone if MySQL can use index order

-- Step 4: confirm actuals match estimates
EXPLAIN ANALYZE
SELECT customer_id, SUM(total_amount)
FROM orders
WHERE status = 'shipped'
  AND created_at >= '2025-01-01'
GROUP BY customer_id;

-- Output includes: actual time=X..Y, rows=Z, loops=1
-- Compare "rows=Z" (actual) vs "rows=N" (estimated)
-- Large divergence means UPDATE TABLE STATISTICS via: ANALYZE TABLE orders;
```

## Why This Matters

An 8-second query that you tuned to 500ms — that optimization started with reading an execution plan. But most developers read `EXPLAIN` output once, add an obvious index, and stop. The real leverage is in understanding *why* MySQL chose the plan it did: which statistics it used, whether it estimated rows accurately, whether it's doing redundant work through temporary tables or sort passes. `EXPLAIN ANALYZE` makes the gap between optimizer theory and runtime reality visible. On a production system where a bad plan runs thousands of times per minute, that gap is the difference between a functional database and one that's saturating I/O.

## Exercise

You have a `user_events` table with columns: `id`, `user_id`, `event_type`, `session_id`, `created_at`, `metadata` (JSON). It has 50M rows. The following query takes 12 seconds:

```sql
SELECT user_id, event_type, COUNT(*) AS event_count
FROM user_events
WHERE event_type IN ('login', 'purchase', 'checkout')
  AND created_at BETWEEN '2025-01-01' AND '2025-03-31'
GROUP BY user_id, event_type
ORDER BY event_count DESC;
```

1. Write the `EXPLAIN` statement and describe what you expect to see in `type`, `key`, and `Extra` before any optimization.
2. Design a composite index that eliminates the full table scan and ideally turns this into a covering index.
3. Explain why column order in your index matters for this specific query.
4. After adding the index, what would you check in `EXPLAIN ANALYZE` output to confirm the optimization worked?

<details>
<summary>Hint</summary>

Consider what columns appear in WHERE, GROUP BY, and SELECT. A covering index must include all columns referenced by the query so MySQL never touches the base table. Think about which WHERE column has higher selectivity — that affects whether you want it first or second in the index. Also consider: can `ORDER BY event_count DESC` be satisfied by an index? (It can't — `COUNT(*)` is computed, not stored.)
</details>

<details>
<summary>Solution</summary>

```sql
-- 1. Before optimization, EXPLAIN will show:
--    type = ALL (full table scan, no usable index)
--    key  = NULL
--    rows = ~50,000,000
--    Extra = Using where; Using temporary; Using filesort

-- 2. Composite covering index
-- Column order reasoning:
--   - event_type (IN list, equality-style) — put first for leftmost prefix use
--   - created_at (range filter) — range must come after equality columns
--   - user_id (GROUP BY) — include after range for grouping
--   - Add no more: COUNT(*) doesn't need a stored column
-- But we need all SELECT columns for covering: user_id, event_type, created_at
-- COUNT(*) counts rows — needs no extra column

CREATE INDEX idx_userevents_covering
    ON user_events (event_type, created_at, user_id);

-- Why order matters:
-- Leftmost prefix rule: MySQL can use this index for:
--   WHERE event_type = ?                          (uses 1 col)
--   WHERE event_type = ? AND created_at >= ?      (uses 2 cols)
--   WHERE event_type = ? AND created_at >= ? ...  (uses 2 cols, user_id available)
-- If created_at came first, the IN list on event_type couldn't drive a range scan
-- efficiently — the range on created_at would break prefix use for event_type.

-- 3. After index creation, re-run:
EXPLAIN ANALYZE
SELECT user_id, event_type, COUNT(*) AS event_count
FROM user_events
WHERE event_type IN ('login', 'purchase', 'checkout')
  AND created_at BETWEEN '2025-01-01' AND '2025-03-31'
GROUP BY user_id, event_type
ORDER BY event_count DESC;

-- What to confirm in EXPLAIN ANALYZE output:
--   type        = range (index range scan, not ALL)
--   key         = idx_userevents_covering
--   Extra       = Using index (covering — no table lookups)
--                 "Using temporary" may still appear for GROUP BY
--                 "Using filesort" will appear for ORDER BY event_count DESC (unavoidable)
--   actual rows = should be a fraction of 50M
--   actual time = compare against 12s baseline

-- If "Using temporary" is still costly, check:
SHOW VARIABLES LIKE 'tmp_table_size';
SHOW VARIABLES LIKE 'max_heap_table_size';
-- Increase if the grouped intermediate result exceeds these limits and spills to disk.

-- Stale stats check: if estimated rows >> actual rows, run:
ANALYZE TABLE user_events;
```

</details>
