---
difficulty: advanced
---

# Transactions and Isolation Levels

Transactions exist because concurrent database access without coordination produces data corruption. The rules governing how transactions behave are codified in ACID properties and controlled with isolation levels. If you've written transactions but never deliberately chosen an isolation level, you're accepting MySQL's default (REPEATABLE READ) without understanding what guarantees it provides — or what it doesn't.

## ACID Properties

**Atomicity** — all operations in a transaction succeed or all are rolled back. There is no partial commit. If a transaction inserts 3 rows and fails on the 4th, the first 3 are rolled back.

**Consistency** — a transaction brings the database from one valid state to another valid state. Constraints (foreign keys, CHECK, NOT NULL, UNIQUE) are enforced at commit time. A transaction that would violate a constraint is rejected.

**Isolation** — concurrent transactions behave as if they executed serially. The degree of isolation is configurable — full isolation (SERIALIZABLE) has the highest cost; reduced isolation levels trade some guarantees for throughput.

**Durability** — once committed, the transaction survives crashes. InnoDB achieves this via the write-ahead log (redo log). Committed data is flushed to durable storage before the commit acknowledgment is returned.

## Read Phenomena: What Can Go Wrong

Before covering isolation levels, understand the three problems they control:

**Dirty read** — Transaction A reads data written by Transaction B that has not yet committed. If B rolls back, A has read data that never officially existed.

**Non-repeatable read** — Transaction A reads a row. Transaction B updates and commits that row. Transaction A reads the same row again and gets a different value. The same read within one transaction returns different results.

**Phantom read** — Transaction A runs a range query (`WHERE amount > 1000`). Transaction B inserts a new row that matches that range and commits. Transaction A runs the same range query and sees a new row that wasn't there before — a "phantom."

## Isolation Levels

MySQL/InnoDB supports all four standard levels. Set per-session or globally:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET GLOBAL  TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

| Level | Dirty Reads | Non-Repeatable Reads | Phantom Reads |
|-------|-------------|----------------------|---------------|
| READ UNCOMMITTED | possible | possible | possible |
| READ COMMITTED | prevented | possible | possible |
| REPEATABLE READ | prevented | prevented | prevented* |
| SERIALIZABLE | prevented | prevented | prevented |

*InnoDB's REPEATABLE READ prevents phantoms via gap locks, which is stronger than the SQL standard requires.

**READ UNCOMMITTED** — transactions can read uncommitted changes from other transactions. Almost never appropriate in production. Useful only for approximate analytics where consistency doesn't matter and you want maximum throughput.

**READ COMMITTED** — each read sees the latest committed snapshot at the time of *that read statement*. Dirty reads are prevented. Non-repeatable reads are possible — two identical SELECT statements in the same transaction can return different results if another transaction commits between them. Common in OLTP systems where you want to see fresh data and can tolerate non-repeatability.

**REPEATABLE READ** (InnoDB default) — each read sees the snapshot as of the *first read in the transaction*. Subsequent reads see the same snapshot even if other transactions commit changes. Non-repeatable reads are prevented. InnoDB's implementation also prevents most phantoms via gap locking, which goes beyond the standard definition of REPEATABLE READ.

**SERIALIZABLE** — reads are converted to `SELECT ... FOR SHARE`. Full lock-based isolation. Prevents all anomalies but dramatically reduces concurrency. Use only when the absolute correctness of reads is required and you've modeled the contention.

## SELECT ... FOR UPDATE and FOR SHARE

By default, `SELECT` acquires no locks. Two mechanisms add locking:

**`SELECT ... FOR UPDATE`** — acquires an exclusive lock on selected rows. Other transactions cannot acquire any lock on those rows (neither read nor write) until the holding transaction commits or rolls back. Use this when you intend to update rows and need to prevent concurrent modification between your read and write.

**`SELECT ... FOR SHARE`** — acquires a shared lock on selected rows. Other transactions can also acquire shared locks and read the rows, but cannot acquire exclusive locks or modify them until all shared locks are released.

```sql
-- Classic pattern: read-modify-write without race condition
START TRANSACTION;

SELECT balance FROM accounts WHERE id = 101 FOR UPDATE;
-- Row is now exclusively locked. No other transaction can read-for-update or write it.

UPDATE accounts SET balance = balance - 500 WHERE id = 101;

COMMIT;
-- Lock released. Other transactions waiting on this row can now proceed.
```

Without `FOR UPDATE`, two concurrent transactions could both read `balance = 1000`, both subtract 500, and both write 500 — losing one update entirely. This is a lost update anomaly.

## Example

```sql
-- ============================================================
-- Demonstrating isolation levels with concrete scenarios
-- ============================================================

-- Setup
CREATE TABLE accounts (
    id      INT PRIMARY KEY,
    owner   VARCHAR(100),
    balance DECIMAL(12,2)
);
INSERT INTO accounts VALUES (1, 'Alice', 1000.00), (2, 'Bob', 500.00);

-- ============================================================
-- Dirty read (requires READ UNCOMMITTED to observe)
-- Session A:
SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
START TRANSACTION;
UPDATE accounts SET balance = 9999.00 WHERE id = 1;
-- Do NOT commit yet

-- Session B (READ UNCOMMITTED):
SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
SELECT balance FROM accounts WHERE id = 1;
-- Returns 9999.00 -- dirty read: A hasn't committed

-- Session A:
ROLLBACK;
-- That 9999 never existed officially. Session B read phantom data.

-- ============================================================
-- Non-repeatable read (READ COMMITTED)
-- Session A:
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
SELECT balance FROM accounts WHERE id = 1;  -- returns 1000

-- Session B commits a change:
UPDATE accounts SET balance = 750.00 WHERE id = 1;
COMMIT;

-- Session A reads again:
SELECT balance FROM accounts WHERE id = 1;  -- now returns 750 -- non-repeatable
COMMIT;

-- ============================================================
-- REPEATABLE READ prevents the above
-- Session A:
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;
SELECT balance FROM accounts WHERE id = 1;  -- returns 1000 (snapshot established)

-- Session B commits change to 750
-- Session A reads again:
SELECT balance FROM accounts WHERE id = 1;  -- still returns 1000 -- snapshot preserved
COMMIT;

-- ============================================================
-- Correct fund transfer with FOR UPDATE
-- ============================================================
START TRANSACTION;

-- Lock both rows before reading to prevent concurrent modification
SELECT balance FROM accounts WHERE id IN (1, 2) FOR UPDATE;

-- Check funds
-- (application logic: if balance[1] >= 300, proceed)

UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;

COMMIT;

-- ============================================================
-- SERIALIZABLE: all reads become FOR SHARE automatically
-- ============================================================
SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE;
START TRANSACTION;
SELECT SUM(balance) FROM accounts;
-- This SELECT now holds shared locks on all rows read
-- Another transaction trying to INSERT/UPDATE those rows will block until this commits
COMMIT;
```

## Deadlocks

A deadlock occurs when Transaction A holds a lock that B needs, and B holds a lock that A needs. Neither can proceed. InnoDB detects deadlocks automatically and rolls back the transaction with the smallest undo log (lowest cost to retry).

**Common deadlock pattern — lock ordering:**
```sql
-- Transaction A:
UPDATE accounts SET balance = balance - 100 WHERE id = 1;  -- locks row 1
UPDATE accounts SET balance = balance + 100 WHERE id = 2;  -- waits for row 2

-- Transaction B (concurrent):
UPDATE accounts SET balance = balance - 50 WHERE id = 2;   -- locks row 2
UPDATE accounts SET balance = balance + 50 WHERE id = 1;   -- waits for row 1
-- Deadlock: A waits for B, B waits for A
```

**How to avoid deadlocks:**

1. **Consistent lock ordering** — always acquire locks in the same order across all transactions. If all code locks account rows by ascending `id`, circular dependencies can't form.

2. **Lock all resources upfront** — use `SELECT ... FOR UPDATE` with all needed rows at the transaction start rather than acquiring locks incrementally.

3. **Keep transactions short** — the longer a transaction holds locks, the higher the probability of contention. Do computation outside the transaction, then open-modify-commit.

4. **Retry on deadlock** — InnoDB rolls back the victim transaction. Application code should catch error 1213 and retry.

```sql
-- Checking recent deadlock details
SHOW ENGINE INNODB STATUS;
-- Look for the LATEST DETECTED DEADLOCK section
-- Shows which transactions were involved, which locks they held/waited for
```

## Why This Matters

Most production bugs involving transactions are not crashes — they're silent data corruption. A fund transfer that loses an update because two threads read the same balance without locking. An inventory system that oversells because two checkouts read the same stock count simultaneously. An audit log that misses events because a long-running READ COMMITTED transaction saw a stale snapshot mid-report.

Choosing the right isolation level and locking strategy is not theoretical. REPEATABLE READ is safe for most OLTP but can be surprising — a transaction started at 9:00 AM will read 9:00 AM data even if it runs until 10:00 AM, regardless of what commits in between. READ COMMITTED is often better for analytics queries within transactions. FOR UPDATE is essential for any read-then-write pattern where correctness matters.

## Exercise

You're building a seat reservation system. A `seats` table has: `id`, `event_id`, `section`, `row_num`, `seat_num`, `status` (`available` or `reserved`), `reserved_by_user_id`.

Write a transaction that:
1. Finds 2 adjacent available seats in section `'A'` for `event_id = 5`
2. Locks them to prevent concurrent reservation
3. Marks them as reserved for `user_id = 42`
4. Handles the case where no adjacent seats are available

Then explain: why would using REPEATABLE READ without FOR UPDATE allow double-booking, and what isolation level + locking combination prevents it?

<details>
<summary>Hint</summary>

"Adjacent" means `row_num` is the same and `seat_num` values differ by 1. You'll need `LAG()` or a self-join to find adjacent pairs. The critical locking question: two users submit requests simultaneously. Both read the same seats as `available` before either writes. How do you prevent both from reserving the same seats? `FOR UPDATE` on the candidate rows causes the second transaction to block until the first commits or rolls back — then the second transaction re-reads and finds the seats already reserved.
</details>

<details>
<summary>Solution</summary>

```sql
-- ============================================================
-- Seat reservation transaction
-- ============================================================
START TRANSACTION;

-- Step 1: Find adjacent available seats and lock them immediately
-- Self-join to find pairs where same row, seat numbers consecutive, both available
SELECT s1.id AS seat1_id, s2.id AS seat2_id,
       s1.row_num, s1.seat_num, s2.seat_num AS seat2_num
FROM seats s1
JOIN seats s2
    ON  s1.event_id = s2.event_id
    AND s1.section  = s2.section
    AND s1.row_num  = s2.row_num
    AND s2.seat_num = s1.seat_num + 1  -- adjacent: consecutive seat numbers
WHERE s1.event_id = 5
  AND s1.section  = 'A'
  AND s1.status   = 'available'
  AND s2.status   = 'available'
ORDER BY s1.row_num, s1.seat_num
LIMIT 1
FOR UPDATE;                            -- lock both rows before reading result

-- Step 2: If no rows returned, no adjacent seats available — rollback
-- (Application checks rowcount; if 0, ROLLBACK and notify user)

-- Step 3: Reserve both seats (using IDs from step 1 result)
-- In application code, bind the seat IDs from the SELECT above:
UPDATE seats
SET status = 'reserved', reserved_by_user_id = 42
WHERE id IN (:seat1_id, :seat2_id)
  AND status = 'available';  -- double-check status as safety net

-- Step 4: Verify 2 rows were updated (application checks affected rows)
-- If UPDATE affected_rows != 2, another transaction snuck in -- ROLLBACK

COMMIT;

-- ============================================================
-- Why REPEATABLE READ without FOR UPDATE allows double-booking:
-- ============================================================
-- Scenario: User A and User B request the same adjacent seats simultaneously.
--
-- T=1: Transaction A reads seats 10 and 11 as 'available' (snapshot established)
-- T=2: Transaction B reads seats 10 and 11 as 'available' (own snapshot established)
-- T=3: Transaction A updates seats 10 and 11 to 'reserved', commits
-- T=4: Transaction B's REPEATABLE READ snapshot still shows seats as 'available'
--      (it reads its own snapshot, not committed changes from A)
--      Transaction B updates seats 10 and 11 to 'reserved' for a different user
--      Both users believe they successfully reserved the same seats.
--
-- FOR UPDATE prevents this:
-- T=1: Transaction A: SELECT ... FOR UPDATE -- acquires exclusive lock on rows 10, 11
-- T=2: Transaction B: SELECT ... FOR UPDATE -- BLOCKS, waiting for A's locks
-- T=3: Transaction A commits, releases locks
-- T=4: Transaction B's SELECT unblocks, re-reads the rows -- they're now 'reserved'
--      No rows returned (status != 'available'), transaction B rolls back cleanly.
--
-- Isolation level for this use case:
-- READ COMMITTED + FOR UPDATE is the right combination.
-- READ COMMITTED ensures Transaction B sees the committed reservation from A
-- after acquiring the lock (rather than its original snapshot).
-- REPEATABLE READ + FOR UPDATE also works but B would read stale data;
-- the safety net WHERE status = 'available' in the UPDATE catches it.
-- READ COMMITTED is cleaner and more explicit about intent here.
```

</details>
