-- 014_patient_dob_estimated.sql — mark a date of birth that was estimated from an age.
-- Additive: one column, patients.dob_estimated (0 = date given, 1 = estimated from an age in years).
-- Existing patients keep 0: their date of birth was entered as a date. Safe to re-run: guarded.

DELIMITER //
DROP PROCEDURE IF EXISTS mig014_patient_dob_estimated //
CREATE PROCEDURE mig014_patient_dob_estimated()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients' AND COLUMN_NAME = 'dob_estimated') THEN
    ALTER TABLE patients ADD COLUMN dob_estimated TINYINT(1) NOT NULL DEFAULT 0 AFTER date_of_birth;
  END IF;
END //
DELIMITER ;
CALL mig014_patient_dob_estimated();
DROP PROCEDURE mig014_patient_dob_estimated;
