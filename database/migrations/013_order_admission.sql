-- 013_order_admission.sql — lab orders and prescriptions can be filed under an admission.
-- Additive: one nullable admission_id column (indexed, FK to admissions) on lab_orders and on
-- prescriptions. A new order is filed under the doctor's in-progress visit (encounter_id), otherwise
-- under the active admission they are the admitting doctor for (admission_id); the API refuses it
-- otherwise. No backfill: existing orders keep the context they had (their visit, or none).
-- Safe to re-run: every statement is guarded.

DELIMITER //
DROP PROCEDURE IF EXISTS mig013_order_admission //
CREATE PROCEDURE mig013_order_admission()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lab_orders' AND COLUMN_NAME = 'admission_id') THEN
    ALTER TABLE lab_orders ADD COLUMN admission_id INT NULL AFTER encounter_id,
      ADD KEY idx_lab_orders_admission (admission_id),
      ADD CONSTRAINT fk_lab_orders_admission FOREIGN KEY (admission_id) REFERENCES admissions (admission_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescriptions' AND COLUMN_NAME = 'admission_id') THEN
    ALTER TABLE prescriptions ADD COLUMN admission_id INT NULL AFTER encounter_id,
      ADD KEY idx_prescriptions_admission (admission_id),
      ADD CONSTRAINT fk_prescriptions_admission FOREIGN KEY (admission_id) REFERENCES admissions (admission_id) ON DELETE RESTRICT;
  END IF;
END //
DELIMITER ;
CALL mig013_order_admission();
DROP PROCEDURE mig013_order_admission;
