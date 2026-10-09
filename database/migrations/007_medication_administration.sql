-- 007_medication_administration.sql — bedside Medication Administration Record (report Section F.2).
-- Additive: nullable structured-order columns on prescription_items (the free-text dosage,
-- frequency and duration stay as they are) and a new medication_administrations table.
-- Safe to re-run: guarded DDL.
--
-- Times in medication_administrations are UTC ('*_at_utc'), written and compared by the
-- application (utils/marTime.js), never with MySQL NOW(), which uses the server's local zone.
-- They are displayed in IST.

DELIMITER //
DROP PROCEDURE IF EXISTS mig007_add_item_columns //
CREATE PROCEDURE mig007_add_item_columns()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescription_items' AND COLUMN_NAME = 'frequency_code') THEN
    ALTER TABLE prescription_items ADD COLUMN frequency_code ENUM('OD', 'BD', 'TDS', 'QID', 'Q6H', 'Q8H', 'STAT', 'PRN') NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescription_items' AND COLUMN_NAME = 'duration_days') THEN
    ALTER TABLE prescription_items ADD COLUMN duration_days SMALLINT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescription_items' AND COLUMN_NAME = 'route') THEN
    ALTER TABLE prescription_items ADD COLUMN route ENUM('ORAL', 'IV', 'IM', 'SC', 'SUBLINGUAL', 'INHALED', 'TOPICAL', 'RECTAL', 'OTHER') NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescription_items' AND COLUMN_NAME = 'units_per_dose') THEN
    ALTER TABLE prescription_items ADD COLUMN units_per_dose SMALLINT NULL;  -- units of `quantity` per dose (NULL = 1)
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'chk_prescription_items_structured') THEN
    ALTER TABLE prescription_items ADD CONSTRAINT chk_prescription_items_structured
      CHECK ((duration_days IS NULL OR duration_days > 0) AND (units_per_dose IS NULL OR units_per_dose > 0));
  END IF;
END //
DELIMITER ;
CALL mig007_add_item_columns();
DROP PROCEDURE mig007_add_item_columns;

CREATE TABLE IF NOT EXISTS medication_administrations (
  administration_id INT NOT NULL AUTO_INCREMENT,
  prescription_item_id INT NOT NULL,
  patient_id INT NOT NULL,
  admission_id INT NULL,
  scheduled_at_utc DATETIME NULL,           -- NULL for PRN / unscheduled doses recorded as given
  status ENUM('PENDING', 'ADMINISTERED', 'REFUSED', 'MISSED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  administered_at_utc DATETIME NULL,
  dose_given VARCHAR(50) NULL,
  route_given ENUM('ORAL', 'IV', 'IM', 'SC', 'SUBLINGUAL', 'INHALED', 'TOPICAL', 'RECTAL', 'OTHER') NULL,
  reason VARCHAR(255) NULL,                 -- late, refused, missed, PRN or cancellation reason
  recorded_by INT NULL,
  recorded_at_utc DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (administration_id),
  UNIQUE KEY uq_mar_item_slot (prescription_item_id, scheduled_at_utc),
  KEY idx_mar_patient_time (patient_id, scheduled_at_utc),
  KEY idx_mar_admission_status (admission_id, status),
  CONSTRAINT fk_mar_item FOREIGN KEY (prescription_item_id) REFERENCES prescription_items (item_id) ON DELETE RESTRICT,
  CONSTRAINT fk_mar_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id) ON DELETE RESTRICT,
  CONSTRAINT fk_mar_admission FOREIGN KEY (admission_id) REFERENCES admissions (admission_id) ON DELETE RESTRICT,
  CONSTRAINT fk_mar_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT chk_mar_given CHECK (status <> 'ADMINISTERED' OR administered_at_utc IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
