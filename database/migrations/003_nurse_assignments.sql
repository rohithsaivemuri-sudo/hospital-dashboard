-- 003_nurse_assignments.sql — standing nurse-to-ward assignments (report Section E "Assigned Only")
-- and a patients.allergies column for the pharmacy and patient context header.
-- Additive only. Safe to re-run: CREATE TABLE IF NOT EXISTS, guarded ALTER, NOT EXISTS seed.
--
-- An assignment is active on a date when start_date <= date and (end_date IS NULL or end_date >= date).
-- A nurse's assigned patients: active admissions in their currently assigned wards, plus every open
-- outpatient encounter (shared triage area).

CREATE TABLE IF NOT EXISTS nurse_ward_assignments (
  assignment_id INT NOT NULL AUTO_INCREMENT,
  nurse_user_id INT NOT NULL,
  ward_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  assigned_by INT NULL,            -- NULL for the migration seed
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (assignment_id),
  KEY idx_nwa_nurse_dates (nurse_user_id, start_date, end_date),
  KEY idx_nwa_ward (ward_id),
  CONSTRAINT fk_nwa_nurse FOREIGN KEY (nurse_user_id) REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_nwa_ward FOREIGN KEY (ward_id) REFERENCES wards (ward_id) ON DELETE RESTRICT,
  CONSTRAINT fk_nwa_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT chk_nwa_dates CHECK (end_date IS NULL OR end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER //
DROP PROCEDURE IF EXISTS mig003_add_allergies //
CREATE PROCEDURE mig003_add_allergies()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients' AND COLUMN_NAME = 'allergies') THEN
    ALTER TABLE patients ADD COLUMN allergies TEXT NULL;
  END IF;
END //
DELIMITER ;
CALL mig003_add_allergies();
DROP PROCEDURE mig003_add_allergies;

-- Seed: the demo nurse covers the ICU and General Ward B from today, so the Nurse Station is never empty.
START TRANSACTION;
INSERT INTO nurse_ward_assignments (nurse_user_id, ward_id, start_date)
SELECT u.user_id, w.ward_id, CURDATE()
FROM users u
JOIN wards w ON w.name IN ('ICU Ward', 'General Ward B')
WHERE u.username = 'nurse1' AND u.role = 'NURSE'
  AND NOT EXISTS (SELECT 1 FROM nurse_ward_assignments x WHERE x.nurse_user_id = u.user_id AND x.ward_id = w.ward_id);
SET @seeded = ROW_COUNT();
INSERT INTO audit_logs (action, entity_type, outcome, path, details)
SELECT 'MIGRATION_SEED', 'nurse_ward_assignments', 'SUCCESS', '003_nurse_assignments.sql', JSON_OBJECT('assignments_created', @seeded)
WHERE @seeded > 0;
COMMIT;
