-- 017_mar_patient_from_prescription.sql — BCNF step A3 (docs/bcnf-analysis.md), additive part.
--
-- medication_administrations.patient_id is copied from the dose's prescription: prescription_item_id
-- -> patient_id, and prescription_item_id is only part of the candidate key {prescription_item_id,
-- scheduled_at_utc} for scheduled doses (a 2NF violation). prescription_item_id is NOT NULL, so every
-- dose reaches its patient through prescription_items -> prescriptions; no new table is needed.
--
-- This migration checks that every dose's patient equals its prescription's patient (stopping with an
-- error otherwise), and makes the column nullable so the MAR code stops writing it. A later migration
-- drops the column. Safe to re-run.

DELIMITER //
DROP PROCEDURE IF EXISTS mig017_mar_patient //
CREATE PROCEDURE mig017_mar_patient()
BEGIN
  DECLARE mismatched INT DEFAULT 0;
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medication_administrations' AND COLUMN_NAME = 'patient_id') THEN
    SELECT COUNT(*) INTO mismatched
    FROM medication_administrations ma
    JOIN prescription_items pi ON pi.item_id = ma.prescription_item_id
    JOIN prescriptions p ON p.prescription_id = pi.prescription_id
    WHERE ma.patient_id IS NOT NULL AND ma.patient_id <> p.patient_id;
    IF mismatched > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '017: some doses carry a different patient than their prescription; correct them before this migration';
    END IF;
    ALTER TABLE medication_administrations MODIFY patient_id INT NULL;
  END IF;
END //
DELIMITER ;
CALL mig017_mar_patient();
DROP PROCEDURE mig017_mar_patient;

-- Verification output: every dose is rebuilt from medication_administrations JOIN prescription_items JOIN prescriptions.
SELECT '017 verification' AS step, COUNT(*) AS doses, SUM(p.patient_id IS NOT NULL) AS rebuilt_by_join
FROM medication_administrations ma
LEFT JOIN prescription_items pi ON pi.item_id = ma.prescription_item_id
LEFT JOIN prescriptions p ON p.prescription_id = pi.prescription_id;
