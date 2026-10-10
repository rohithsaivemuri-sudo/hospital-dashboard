-- 010_patient_abha.sql — ABHA number on patients (report Section F/K-8, ABDM identifiers).
-- Additive: one nullable column, a unique index (NULLs allowed, many patients have no ABHA), a
-- format CHECK (14 digits, stored without hyphens; shown as XX-XXXX-XXXX-XXXX) and a phone index for
-- the registration duplicate check. No backfill: no existing patient has an ABHA number.
-- Safe to re-run: every statement is guarded.

DELIMITER //
DROP PROCEDURE IF EXISTS mig010_patient_abha //
CREATE PROCEDURE mig010_patient_abha()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients' AND COLUMN_NAME = 'abha_number') THEN
    ALTER TABLE patients ADD COLUMN abha_number CHAR(14) NULL AFTER allergies;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients' AND INDEX_NAME = 'uq_patients_abha') THEN
    ALTER TABLE patients ADD UNIQUE KEY uq_patients_abha (abha_number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'patients' AND CONSTRAINT_NAME = 'chk_patients_abha_format') THEN
    ALTER TABLE patients ADD CONSTRAINT chk_patients_abha_format CHECK (abha_number IS NULL OR abha_number REGEXP '^[0-9]{14}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients' AND INDEX_NAME = 'idx_patients_phone') THEN
    ALTER TABLE patients ADD KEY idx_patients_phone (phone);
  END IF;
END //
DELIMITER ;
CALL mig010_patient_abha();
DROP PROCEDURE mig010_patient_abha;
