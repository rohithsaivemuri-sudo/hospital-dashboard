-- 023_prescription_items_dispensed_check.sql — the database enforces dispensed_at -> dispensed.
--
-- prescription_items keeps both a dispensed flag and dispensed_at (BCNF step A6 left them as they
-- are: three seed items are dispensed with no recorded time, so the flag says more than the time).
-- Until now only dispenseService kept them consistent, by setting both in one UPDATE. This adds
-- CHECK (dispensed_at IS NULL OR dispensed = 1): a recorded dispense time always means dispensed.
-- The migration stops with an error if a row already breaks it. Safe to re-run.

-- Verification output: rows that would break the CHECK (must be 0).
SELECT '023 check' AS step, COUNT(*) AS items, SUM(dispensed_at IS NOT NULL AND dispensed <> 1) AS violating FROM prescription_items;

DELIMITER //
DROP PROCEDURE IF EXISTS mig023_dispensed_check //
CREATE PROCEDURE mig023_dispensed_check()
BEGIN
  IF EXISTS (SELECT 1 FROM prescription_items WHERE dispensed_at IS NOT NULL AND dispensed <> 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '023: some prescription items have a dispense time but are not marked dispensed (see the 023 check output)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'prescription_items' AND CONSTRAINT_NAME = 'chk_prescription_items_dispensed') THEN
    ALTER TABLE prescription_items ADD CONSTRAINT chk_prescription_items_dispensed CHECK (dispensed_at IS NULL OR dispensed = 1);
  END IF;
END //
DELIMITER ;
CALL mig023_dispensed_check();
DROP PROCEDURE mig023_dispensed_check;
