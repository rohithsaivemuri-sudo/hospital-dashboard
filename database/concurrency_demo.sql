-- CONCURRENCY DEMONSTRATION SCRIPT
-- This script demonstrates row-level locking during emergency allocation.

-- INSTRUCTIONS:
-- 1. Open two separate terminal windows or MySQL client tabs.
-- 2. In both windows, connect to the hospital_db: `USE hospital_db;`
-- 3. Execute the commands under SESSION 1 in the first window.
-- 4. Execute the commands under SESSION 2 in the second window.

/* ==============================================================
   SESSION 1
   ============================================================== */

-- Step 1: Start a transaction in Session 1
START TRANSACTION;

-- Step 2: Lock the ONLY available ICU bed
-- This mimics what sp_allocate_emergency does internally.
SELECT b.bed_id, b.bed_number, b.status
FROM beds b
WHERE b.status = 'AVAILABLE' AND b.bed_type = 'ICU'
ORDER BY b.bed_id ASC
LIMIT 1
FOR UPDATE;

-- At this point, Session 1 holds an exclusive row lock on ICU-04.
-- Do not commit yet! Go to Session 2.

/* ==============================================================
   SESSION 2
   ============================================================== */

-- Step 3: Try to find and lock an available ICU bed in Session 2
START TRANSACTION;

-- If you run this exact query without SKIP LOCKED, Session 2 will HANG (block)
-- because Session 1 holds the lock on the only available ICU bed.
-- Let's observe the non-blocking behavior using SKIP LOCKED as implemented in the SP:
SELECT b.bed_id, b.bed_number, b.status
FROM beds b
WHERE b.status = 'AVAILABLE' AND b.bed_type = 'ICU'
ORDER BY b.bed_id ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- Notice that Session 2 immediately returns EMPTY set, because the only 
-- available bed is locked by Session 1, and SKIP LOCKED skips it.
-- This prevents the SP from crashing or deadlocking, allowing it to gracefully fail or queue.

ROLLBACK; -- End Session 2 transaction

/* ==============================================================
   BACK TO SESSION 1
   ============================================================== */

-- Step 4: Complete the transaction in Session 1
UPDATE beds SET status = 'OCCUPIED' WHERE bed_number = 'ICU-04';
COMMIT;

-- Now the bed is officially occupied. If you try Session 2 again, it will naturally find 0 beds.
