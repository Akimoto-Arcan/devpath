---
difficulty: advanced
---

# CTEs and Recursive CTEs

A Common Table Expression (CTE) is a named result set defined at the top of a query with the `WITH` keyword. It exists only for the duration of the statement. CTEs don't inherently change performance — in MySQL 8, a non-recursive CTE is typically materialized or merged by the optimizer the same way a derived table would be. Their primary value is structural: they let you name intermediate results, break complex logic into legible steps, and reuse the same subquery result multiple times without repeating it.

Recursive CTEs are a different beast. They unlock a category of queries that are otherwise extremely awkward in SQL: traversing hierarchical data, generating sequences, and walking graph-like structures.

## Non-Recursive CTE Syntax

```sql
WITH cte_name AS (
    SELECT ...
),
second_cte AS (
    SELECT ... FROM cte_name ...  -- can reference prior CTEs
)
SELECT * FROM second_cte;
```

Multiple CTEs are comma-separated. Each can reference any CTE defined before it in the same `WITH` clause.

## Why CTEs Over Subqueries

- **Readability** — complex queries with 4+ layers of nesting become a linear sequence of named steps
- **Reuse** — reference the same CTE multiple times in the outer query; a subquery would be re-evaluated each time (or require a temp table)
- **Debuggability** — you can `SELECT * FROM cte_name` during development by temporarily making it the outer query

What CTEs are *not*: they're not a performance feature. In MySQL 8, a non-recursive CTE is not cached by default the way a temp table is — if you reference it twice in the outer query, MySQL may materialize it into an internal temp table automatically, or it may re-execute it. If you need guaranteed single-execution of an expensive intermediate result, use a temporary table explicitly.

## Recursive CTE Structure

A recursive CTE has two mandatory parts joined by `UNION ALL`:

1. **Anchor member** — the base case, executed once, produces the starting row(s)
2. **Recursive member** — references the CTE itself, executed repeatedly until it produces no new rows

```sql
WITH RECURSIVE cte_name AS (
    -- Anchor: starting point
    SELECT ...

    UNION ALL

    -- Recursive member: references cte_name
    SELECT ... FROM source_table JOIN cte_name ON ...
    -- Must have a termination condition or MySQL will hit cte_max_recursion_depth (default 1000)
)
SELECT * FROM cte_name;
```

`UNION ALL` is required (not `UNION`). The recursive member must eventually produce zero rows — either through a JOIN that finds no more matches, or an explicit `WHERE` depth limit.

## Example

```sql
-- ============================================================
-- Setup: employee org chart
-- ============================================================
-- employees (id, name, manager_id, department, salary)
-- manager_id is NULL for the CEO

-- ============================================================
-- 1. Recursive CTE: full org chart traversal
-- ============================================================
WITH RECURSIVE org_chart AS (
    -- Anchor: start at the CEO (no manager)
    SELECT
        id,
        name,
        manager_id,
        department,
        0 AS depth,                          -- track hierarchy level
        CAST(name AS CHAR(500)) AS path      -- breadcrumb path
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive member: join each employee to their manager row
    SELECT
        e.id,
        e.name,
        e.manager_id,
        e.department,
        oc.depth + 1,
        CONCAT(oc.path, ' > ', e.name)
    FROM employees e
    JOIN org_chart oc ON e.manager_id = oc.id
)
SELECT
    LPAD('', depth * 4, ' ') || name AS indented_name,  -- visual indent
    depth,
    path
FROM org_chart
ORDER BY path;

-- ============================================================
-- 2. Find all reports under a specific manager (subtree)
-- ============================================================
WITH RECURSIVE reports AS (
    SELECT id, name, manager_id
    FROM employees
    WHERE id = 42  -- anchor: start at manager with id=42

    UNION ALL

    SELECT e.id, e.name, e.manager_id
    FROM employees e
    JOIN reports r ON e.manager_id = r.id
)
SELECT * FROM reports WHERE id != 42;  -- exclude the manager themselves

-- ============================================================
-- 3. Generate a number sequence (no source table needed)
-- ============================================================
WITH RECURSIVE seq AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 100
)
SELECT n FROM seq;
-- Useful for generating date ranges, test data, or filling sparse series

-- ============================================================
-- 4. Generate a date range
-- ============================================================
WITH RECURSIVE dates AS (
    SELECT CAST('2025-01-01' AS DATE) AS d
    UNION ALL
    SELECT d + INTERVAL 1 DAY FROM dates WHERE d < '2025-01-31'
)
SELECT d FROM dates;

-- ============================================================
-- 5. Non-recursive: multi-step data pipeline (readable)
-- ============================================================
WITH
monthly_revenue AS (
    SELECT
        YEAR(order_date)  AS yr,
        MONTH(order_date) AS mo,
        SUM(amount)       AS revenue
    FROM orders
    WHERE status = 'completed'
    GROUP BY YEAR(order_date), MONTH(order_date)
),
revenue_with_prev AS (
    SELECT
        yr, mo, revenue,
        LAG(revenue) OVER (ORDER BY yr, mo) AS prev_revenue
    FROM monthly_revenue
),
growth AS (
    SELECT
        yr, mo, revenue,
        ROUND(100.0 * (revenue - prev_revenue) / prev_revenue, 2) AS pct_growth
    FROM revenue_with_prev
    WHERE prev_revenue IS NOT NULL
)
SELECT * FROM growth ORDER BY yr, mo;
```

## Why This Matters

Hierarchical data in relational databases is a classic hard problem. Adjacency list models (parent_id column) are easy to write but painful to query without recursion — the old approach required application-level iteration or ugly stored procedures. Recursive CTEs solve this in a single SQL statement. Category trees in e-commerce, org charts in HR systems, bill-of-materials in manufacturing, threaded comments — all are natural fits.

The date-range generation pattern is widely useful for reporting: LEFT JOIN a generated date range to your fact table so dates with zero activity appear as zeros rather than disappearing from results.

**Performance caveat:** MySQL 8 materializes recursive CTEs. They always produce a temp table. For large hierarchies, this is the cost you pay. Control maximum recursion depth with `SET SESSION cte_max_recursion_depth = 2000;` if your hierarchy is deeper than 1000 levels.

## Exercise

You have a `categories` table: `id`, `name`, `parent_id` (NULL for root categories). You also have a `products` table: `id`, `name`, `category_id`, `price`.

Write a recursive CTE that:
1. Returns the full path for every category (e.g., `Electronics > Phones > Smartphones`)
2. Includes a `depth` column (0 for root)
3. Joins to `products` to count how many products exist directly in each category
4. Filters to only show categories at depth 2 or greater

<details>
<summary>Hint</summary>

Build the recursive CTE first to get all categories with their path and depth. Then join it to `products` in the outer query using `LEFT JOIN` so categories with zero products still appear. The product count should be `COUNT(p.id)` (not `COUNT(*)`) to correctly count zero-product categories. Filter on depth in the outer query's WHERE clause — you can't filter on depth inside the recursive member without breaking traversal.
</details>

<details>
<summary>Solution</summary>

```sql
WITH RECURSIVE category_tree AS (
    -- Anchor: root categories (no parent)
    SELECT
        id,
        name,
        parent_id,
        0 AS depth,
        CAST(name AS CHAR(1000)) AS full_path
    FROM categories
    WHERE parent_id IS NULL

    UNION ALL

    -- Recursive: attach children to their parent rows
    SELECT
        c.id,
        c.name,
        c.parent_id,
        ct.depth + 1,
        CONCAT(ct.full_path, ' > ', c.name)
    FROM categories c
    JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT
    ct.id,
    ct.name,
    ct.full_path,
    ct.depth,
    COUNT(p.id) AS product_count
FROM category_tree ct
LEFT JOIN products p ON p.category_id = ct.id
WHERE ct.depth >= 2
GROUP BY ct.id, ct.name, ct.full_path, ct.depth
ORDER BY ct.full_path;

-- Notes:
-- CAST(name AS CHAR(1000)) is required because MySQL needs a defined length
-- for the recursive column; without it you'll get a "data type mismatch" error.
--
-- LEFT JOIN ensures categories with no products show product_count = 0.
--
-- COUNT(p.id) counts non-NULL product ids only — correct for zero-product rows.
--
-- Filtering depth >= 2 in the outer WHERE is correct. Filtering inside the
-- recursive member would stop traversal at depth 1 and exclude their children.
```

</details>
