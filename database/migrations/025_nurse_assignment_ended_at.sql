-- 025_nurse_assignment_ended_at.sql — ending a nurse assignment takes the ward away at once.
--
-- end_date is a calendar date and is inclusive, so an assignment ended "today" used to keep the
-- nurse's access until midnight IST. ended_at (UTC, NULL until the assignment is ended) records the
-- moment it was ended: from then on it is no longer current, whatever its end_date. end_date is
-- still set (to the IST date of ended_at) so reports by date keep working.
-- Additive: one nullable column and a CHECK (ended_at needs an end_date). No backfill: assignments
-- ended before this migration keep their end-of-day behaviour. Safe to re-run: every statement is guarded.

DELIMITER //
DROP PROCEDURE IF EXISTS mig025_ended_at //
CREATE PROCEDURE mig025_ended_at()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nurse_ward_assignments' AND COLUMN_NAME = 'ended_at') THEN
    ALTER TABLE nurse_ward_assignments ADD COLUMN ended_at DATETIME NULL AFTER end_date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'nurse_ward_assignments' AND CONSTRAINT_NAME = 'chk_nwa_ended_at') THEN
    ALTER TABLE nurse_ward_assignments ADD CONSTRAINT chk_nwa_ended_at CHECK (ended_at IS NULL OR end_date IS NOT NULL);
  END IF;
END //
DELIMITER ;
CALL mig025_ended_at();
DROP PROCEDURE mig025_ended_at;
