---
difficulty: advanced
---

# Window Functions

Window functions compute a value for each row based on a set of rows related to that row — the "window." Unlike `GROUP BY`, they don't collapse rows. Every input row produces exactly one output row, and each row can see its own values alongside aggregated or positional values from its window. This distinction — aggregation without row elimination — is what makes window functions irreplaceable for ranking, time-series analysis, and running calculations.

## The `OVER()` Clause

`OVER()` is what makes a function a window function. An empty `OVER()` means the window is the entire result set.

```sql
SELECT id, amount, SUM(amount) OVER() AS grand_total
FROM orders;
-- Every row gets the same grand_total — sum of all rows
```

`PARTITION BY` divides the result set into independent windows. `ORDER BY` within the window defines row ordering for positional and cumulative functions.

```sql
SELECT
    customer_id,
    order_date,
    amount,
    SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date) AS running_total
FROM orders;
-- Running total resets per customer, accumulates in date order
```

## Ranking Functions

`ROW_NUMBER()`, `RANK()`, and `DENSE_RANK()` are related but distinct:

- `ROW_NUMBER()` — unique sequential integer per row within the partition. Ties get arbitrary but distinct numbers.
- `RANK()` — tied rows share a rank. Next rank skips (1, 2, 2, 4).
- `DENSE_RANK()` — tied rows share a rank. Next rank does not skip (1, 2, 2, 3).

Choose based on what a tie means in your domain. For "top 3 products by revenue," `DENSE_RANK()` ensures you don't silently drop tied third-place products.

## LAG() and LEAD()

`LAG(expr, offset, default)` accesses the value of `expr` from `offset` rows *before* the current row within the window. `LEAD()` does the same looking forward. The `default` parameter handles edge rows where no prior/next row exists.

These are the clean replacement for self-joins when you need to compare a row to its neighbor.

## FIRST_VALUE() and LAST_VALUE()

`FIRST_VALUE(expr)` returns the value of `expr` from the first row of the window frame. `LAST_VALUE(expr)` returns from the last row of the frame — but be careful: the default window frame is `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, so `LAST_VALUE()` without an explicit frame clause returns the current row's value, not the partition's last. Always specify the frame explicitly when using `LAST_VALUE()`.

## Example

```sql
-- Table: sales (id, rep_id, region, sale_date, amount)

-- 1. Rank reps by total sales per region, dense ranking
SELECT
    rep_id,
    region,
    SUM(amount) AS total_sales,
    DENSE_RANK() OVER (
        PARTITION BY region
        ORDER BY SUM(amount) DESC
    ) AS region_rank
FROM sales
GROUP BY rep_id, region;
-- Note: window functions can operate on aggregated rows when query uses GROUP BY

-- 2. Month-over-month change per rep using LAG()
SELECT
    rep_id,
    YEAR(sale_date)  AS yr,
    MONTH(sale_date) AS mo,
    SUM(amount)      AS monthly_total,
    LAG(SUM(amount), 1, 0) OVER (
        PARTITION BY rep_id
        ORDER BY YEAR(sale_date), MONTH(sale_date)
    ) AS prev_month_total,
    SUM(amount) - LAG(SUM(amount), 1, 0) OVER (
        PARTITION BY rep_id
        ORDER BY YEAR(sale_date), MONTH(sale_date)
    ) AS mom_change
FROM sales
GROUP BY rep_id, YEAR(sale_date), MONTH(sale_date);

-- 3. Running total and 3-month moving average
SELECT
    rep_id,
    sale_date,
    amount,
    SUM(amount) OVER (
        PARTITION BY rep_id
        ORDER BY sale_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_total,
    AVG(amount) OVER (
        PARTITION BY rep_id
        ORDER BY sale_date
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW  -- current + 2 prior rows
    ) AS moving_avg_3
FROM sales;

-- 4. FIRST_VALUE / LAST_VALUE: first and last sale amount per rep per region
SELECT
    rep_id,
    region,
    sale_date,
    amount,
    FIRST_VALUE(amount) OVER (
        PARTITION BY rep_id, region
        ORDER BY sale_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS first_sale_amount,
    LAST_VALUE(amount) OVER (
        PARTITION BY rep_id, region
        ORDER BY sale_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS last_sale_amount
FROM sales;
-- ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING required for
-- LAST_VALUE to actually see the last row in the partition

-- 5. De-duplicate: keep only the most recent row per customer
-- ROW_NUMBER() in a subquery/CTE is the standard pattern
WITH ranked AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY customer_id
            ORDER BY created_at DESC
        ) AS rn
    FROM orders
)
SELECT * FROM ranked WHERE rn = 1;
```

## Why This Matters

Before window functions, queries like "previous row value" required self-joins or correlated subqueries — both of which are expensive and hard to read. `LAG()` replaces a self-join with a single pass. Running totals that once required subqueries with `SUM(... WHERE date <= current_date)` — also a full scan per row — become a single ordered scan with `SUM() OVER`. The deduplication pattern with `ROW_NUMBER()` is ubiquitous in ETL pipelines, reporting queries, and data migrations.

Performance-wise: window functions execute after `WHERE`, `GROUP BY`, and `HAVING` but before `ORDER BY` and `LIMIT`. The window computation happens on the filtered, grouped result set. They can't be filtered in the same query level — you need a subquery or CTE to filter on a window function's result.

## Exercise

You have a `page_views` table: `id`, `user_id`, `page`, `viewed_at` (DATETIME), `session_id`.

Write a single query that returns, for each user:
1. Their total number of page views
2. The page they viewed most recently (use `FIRST_VALUE` with appropriate ordering)
3. The time gap in seconds between each consecutive page view within a session (`LAG` + `TIMESTAMPDIFF`)
4. A row number per user ordered by `viewed_at` so you can identify their 1st, 2nd, 3rd view

<details>
<summary>Hint</summary>

You'll need multiple window functions in the same SELECT. Each `OVER()` clause is independent — you can have different `PARTITION BY` and `ORDER BY` in the same query. For the most recent page, partition by `user_id` and order by `viewed_at DESC`. For the session time gap, partition by both `user_id` and `session_id`. Remember: to filter rows where `rn = 1`, you need a wrapping CTE or subquery.
</details>

<details>
<summary>Solution</summary>

```sql
SELECT
    user_id,
    session_id,
    page,
    viewed_at,

    -- 1. Total page views per user (entire partition, no ORDER BY needed)
    COUNT(*) OVER (
        PARTITION BY user_id
    ) AS total_user_views,

    -- 2. Most recently viewed page per user
    FIRST_VALUE(page) OVER (
        PARTITION BY user_id
        ORDER BY viewed_at DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS most_recent_page,

    -- 3. Seconds since previous view within same session
    TIMESTAMPDIFF(
        SECOND,
        LAG(viewed_at, 1) OVER (
            PARTITION BY user_id, session_id
            ORDER BY viewed_at
        ),
        viewed_at
    ) AS seconds_since_prev_view,
    -- NULL for first view in each session (no prior row)

    -- 4. Row number per user by time (identifies 1st, 2nd, 3rd view globally)
    ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY viewed_at
    ) AS user_view_sequence

FROM page_views
ORDER BY user_id, viewed_at;

-- To filter to only the first view per user:
WITH numbered AS (
    SELECT *,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY viewed_at) AS rn
    FROM page_views
)
SELECT * FROM numbered WHERE rn = 1;

-- Note: FIRST_VALUE with DESC ordering gives most recent page.
-- Alternative using LAST_VALUE with ASC ordering requires explicit frame:
-- LAST_VALUE(page) OVER (
--     PARTITION BY user_id
--     ORDER BY viewed_at
--     ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
-- )
```

</details>
