-- 002_encounters.sql — clinical encounter lifecycle (report Section F.1, FHIR Encounter).
-- Additive: one new table, one nullable encounter_id column (+ index + FK) on consultations,
-- lab_orders, prescriptions and surgery_requests, and a backfill that only fills the new column.
--
-- Safe to re-run after a failure at any point (MySQL commits each DDL statement on its own):
--   * CREATE TABLE IF NOT EXISTS; each ALTER runs only if information_schema shows it is missing.
--   * Backfilled encounters carry a unique backfilled_from key ('appointment:<id>' or
--     'consultation:<id>'), so an encounter is never created twice.
--   * Links are only written where encounter_id IS NULL.
-- Status values use the codebase's uppercase style; FHIR codes: planned, arrived, triaged,
-- in-progress, finished, cancelled, entered-in-error.

CREATE TABLE IF NOT EXISTS encounters (
  encounter_id INT NOT NULL AUTO_INCREMENT,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  appointment_id INT NULL,
  admission_id INT NULL,
  encounter_type ENUM('OUTPATIENT', 'INPATIENT', 'EMERGENCY') NOT NULL DEFAULT 'OUTPATIENT',
  status ENUM('PLANNED', 'ARRIVED', 'TRIAGED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED', 'ENTERED_IN_ERROR') NOT NULL,
  arrived_at DATETIME NULL,
  triaged_at DATETIME NULL,
  start_timestamp DATETIME NULL,
  end_timestamp DATETIME NULL,
  created_by INT NULL,
  backfilled_from VARCHAR(40) NULL,  -- set only by this migration's backfill; NULL for live encounters
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (encounter_id),
  UNIQUE KEY uq_encounters_appointment (appointment_id),
  UNIQUE KEY uq_encounters_backfilled_from (backfilled_from),
  KEY idx_encounters_doctor_status (doctor_id, status),
  KEY idx_encounters_patient_status (patient_id, status),
  KEY idx_encounters_admission (admission_id),
  CONSTRAINT fk_encounters_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id) ON DELETE RESTRICT,
  CONSTRAINT fk_encounters_doctor FOREIGN KEY (doctor_id) REFERENCES doctors (doctor_id) ON DELETE RESTRICT,
  CONSTRAINT fk_encounters_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (appointment_id) ON DELETE RESTRICT,
  CONSTRAINT fk_encounters_admission FOREIGN KEY (admission_id) REFERENCES admissions (admission_id) ON DELETE RESTRICT,
  CONSTRAINT fk_encounters_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT chk_encounters_times CHECK (end_timestamp IS NULL OR start_timestamp IS NULL OR end_timestamp >= start_timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER //

DROP PROCEDURE IF EXISTS mig002_add_encounter_link //
CREATE PROCEDURE mig002_add_encounter_link(IN tbl VARCHAR(64))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = 'encounter_id') THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN encounter_id INT NULL');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = CONCAT('idx_', tbl, '_encounter')) THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX idx_', tbl, '_encounter (encounter_id)');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                 WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND CONSTRAINT_NAME = CONCAT('fk_', tbl, '_encounter')) THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD CONSTRAINT fk_', tbl, '_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (encounter_id) ON DELETE RESTRICT');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //

DELIMITER ;

CALL mig002_add_encounter_link('consultations');
CALL mig002_add_encounter_link('lab_orders');
CALL mig002_add_encounter_link('prescriptions');
CALL mig002_add_encounter_link('surgery_requests');
DROP PROCEDURE mig002_add_encounter_link;

-- ---------------------------------------------------------------------------------------------
-- Backfill (DML only, one transaction; every statement is also individually idempotent).
-- ---------------------------------------------------------------------------------------------
START TRANSACTION;

-- Only rows that existed before this migration are backfilled. On a re-run after a failure, rows
-- the application created since then (e.g. inpatient notes legitimately written without an
-- encounter) are left alone. The cutoff is when the encounters table was first created.
SET @mig002_cutoff = (SELECT CREATE_TIME FROM information_schema.TABLES
                      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'encounters');

-- 1. One encounter per appointment that reached the clinic, mirroring its current state so
--    in-flight visits keep working: CHECKED_IN -> ARRIVED, IN_PROGRESS -> IN_PROGRESS,
--    COMPLETED -> FINISHED.
INSERT INTO encounters (patient_id, doctor_id, appointment_id, encounter_type, status,
                        arrived_at, start_timestamp, end_timestamp, backfilled_from)
SELECT a.patient_id, a.doctor_id, a.appointment_id, 'OUTPATIENT',
       CASE a.status WHEN 'CHECKED_IN' THEN 'ARRIVED' WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS' ELSE 'FINISHED' END,
       CASE a.status WHEN 'COMPLETED' THEN v.started ELSE a.updated_at END,
       CASE a.status WHEN 'CHECKED_IN' THEN NULL WHEN 'IN_PROGRESS' THEN a.updated_at ELSE v.started END,
       CASE a.status WHEN 'COMPLETED' THEN GREATEST(v.started, a.updated_at) ELSE NULL END,
       CONCAT('appointment:', a.appointment_id)
FROM appointments a
JOIN (
  SELECT ap.appointment_id,
         COALESCE((SELECT MIN(c.consultation_time) FROM consultations c WHERE c.appointment_id = ap.appointment_id),
                  TIMESTAMP(ap.appointment_date, ap.appointment_time)) AS started
  FROM appointments ap
) v ON v.appointment_id = a.appointment_id
WHERE a.status IN ('CHECKED_IN', 'IN_PROGRESS', 'COMPLETED')
  AND a.updated_at <= @mig002_cutoff
  AND NOT EXISTS (SELECT 1 FROM encounters e WHERE e.appointment_id = a.appointment_id);
SET @enc_from_appointments = ROW_COUNT();

-- 2. A FINISHED encounter for each consultation that cannot join an appointment encounter
--    (no appointment, or an appointment that never reached the clinic). Inpatient notes keep
--    their admission.
INSERT INTO encounters (patient_id, doctor_id, appointment_id, admission_id, encounter_type, status,
                        arrived_at, start_timestamp, end_timestamp, backfilled_from)
SELECT c.patient_id, c.doctor_id, NULL, c.admission_id,
       IF(c.admission_id IS NULL, 'OUTPATIENT', 'INPATIENT'), 'FINISHED',
       c.consultation_time, c.consultation_time, c.consultation_time,
       CONCAT('consultation:', c.consultation_id)
FROM consultations c
LEFT JOIN encounters ae ON ae.appointment_id = c.appointment_id
WHERE c.encounter_id IS NULL
  AND c.created_at <= @mig002_cutoff
  AND ae.encounter_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM encounters e WHERE e.backfilled_from = CONCAT('consultation:', c.consultation_id));
SET @enc_from_consultations = ROW_COUNT();

-- 3. Link consultations to their encounter.
UPDATE consultations c
JOIN encounters e ON e.appointment_id = c.appointment_id
SET c.encounter_id = e.encounter_id
WHERE c.encounter_id IS NULL AND c.created_at <= @mig002_cutoff;
SET @linked_consultations = ROW_COUNT();

UPDATE consultations c
JOIN encounters e ON e.backfilled_from = CONCAT('consultation:', c.consultation_id)
SET c.encounter_id = e.encounter_id
WHERE c.encounter_id IS NULL AND c.created_at <= @mig002_cutoff;
SET @linked_consultations = @linked_consultations + ROW_COUNT();

-- 4. Orders written during a consultation inherit its encounter. Orders with no consultation
--    are left NULL: any other match would be a guess. updated_at is set to itself so linking
--    does not disturb lab turnaround timestamps.
UPDATE lab_orders o
JOIN consultations c ON c.consultation_id = o.consultation_id
SET o.encounter_id = c.encounter_id, o.updated_at = o.updated_at
WHERE o.encounter_id IS NULL AND c.encounter_id IS NOT NULL AND o.created_at <= @mig002_cutoff;
SET @linked_lab_orders = ROW_COUNT();

UPDATE prescriptions p
JOIN consultations c ON c.consultation_id = p.consultation_id
SET p.encounter_id = c.encounter_id
WHERE p.encounter_id IS NULL AND c.encounter_id IS NOT NULL AND p.created_at <= @mig002_cutoff;
SET @linked_prescriptions = ROW_COUNT();

-- surgery_requests has no consultation link, so existing requests stay NULL.

-- 5. Record what this run did (only when it did something, so a no-op re-run adds nothing).
INSERT INTO audit_logs (action, entity_type, outcome, path, details)
SELECT 'MIGRATION_BACKFILL', 'encounters', 'SUCCESS', '002_encounters.sql',
       JSON_OBJECT('encounters_from_appointments', @enc_from_appointments,
                   'encounters_from_consultations', @enc_from_consultations,
                   'linked_consultations', @linked_consultations,
                   'linked_lab_orders', @linked_lab_orders,
                   'linked_prescriptions', @linked_prescriptions)
WHERE @enc_from_appointments + @enc_from_consultations + @linked_consultations
      + @linked_lab_orders + @linked_prescriptions > 0;

COMMIT;
