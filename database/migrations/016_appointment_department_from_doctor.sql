-- 016_appointment_department_from_doctor.sql — BCNF step A2 (docs/bcnf-analysis.md), additive part.
--
-- appointments.department_id is copied from the booked doctor (appointmentController.create), and no
-- code changes a doctor's department: doctor_id -> department_id inside appointments, and doctor_id
-- is only part of the candidate key {doctor_id, appointment_date, appointment_time} (a 2NF
-- violation). The department already lives in doctors.department_id, so no new table is needed.
--
-- seed.sql booked four appointments under the wrong department for their doctor (its appointment
-- rows assumed a different doctor numbering). Those rows, and any other row whose department differs
-- from its doctor's, are set to the doctor's department. Their old values are printed below and kept
-- in an audit_logs MIGRATION_DATA_FIX row. The migration then checks that every appointment matches
-- its doctor (stopping with an error otherwise), makes the column nullable so the API stops writing
-- it, and adds v_appointments: appointments with department_id taken from the doctor, in the
-- original column order, for every read that returns whole appointment rows.
-- A later migration drops the column. Safe to re-run: a second run finds nothing to change.

-- Verification output: the rows about to change, with their old and new department.
SELECT '016 before' AS step, a.appointment_id, a.doctor_id, a.department_id AS old_department_id, d.department_id AS new_department_id
FROM appointments a JOIN doctors d ON d.doctor_id = a.doctor_id
WHERE a.department_id IS NOT NULL AND a.department_id <> d.department_id
ORDER BY a.appointment_id;

START TRANSACTION;

INSERT INTO audit_logs (action, entity_type, outcome, path, details)
SELECT 'MIGRATION_DATA_FIX', 'appointments', 'SUCCESS', '016_appointment_department_from_doctor.sql',
       JSON_OBJECT('reason', 'department set to the booked doctor''s department',
                   'changed', JSON_ARRAYAGG(JSON_OBJECT('appointment_id', a.appointment_id, 'doctor_id', a.doctor_id,
                                                        'old_department_id', a.department_id, 'new_department_id', d.department_id)))
FROM appointments a JOIN doctors d ON d.doctor_id = a.doctor_id
WHERE a.department_id IS NOT NULL AND a.department_id <> d.department_id
HAVING COUNT(*) > 0;

UPDATE appointments a JOIN doctors d ON d.doctor_id = a.doctor_id
SET a.department_id = d.department_id
WHERE a.department_id IS NOT NULL AND a.department_id <> d.department_id;

COMMIT;

DELIMITER //
DROP PROCEDURE IF EXISTS mig016_appointment_department //
CREATE PROCEDURE mig016_appointment_department()
BEGIN
  DECLARE mismatched INT DEFAULT 0;
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'department_id') THEN
    SELECT COUNT(*) INTO mismatched FROM appointments a JOIN doctors d ON d.doctor_id = a.doctor_id
    WHERE a.department_id IS NOT NULL AND a.department_id <> d.department_id;
    IF mismatched > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '016: some appointments still differ from their doctor''s department';
    END IF;
    ALTER TABLE appointments MODIFY department_id INT NULL;
  END IF;
END //
DELIMITER ;
CALL mig016_appointment_department();
DROP PROCEDURE mig016_appointment_department;

-- Verification output: every appointment is rebuilt from appointments JOIN doctors.
SELECT '016 verification' AS step, COUNT(*) AS appointments, SUM(d.doctor_id IS NOT NULL) AS rebuilt_by_join
FROM appointments a LEFT JOIN doctors d ON d.doctor_id = a.doctor_id;

CREATE OR REPLACE ALGORITHM=MERGE SQL SECURITY DEFINER VIEW v_appointments AS
SELECT a.appointment_id AS appointment_id, a.patient_id AS patient_id, a.doctor_id AS doctor_id,
       d.department_id AS department_id, a.appointment_date AS appointment_date, a.appointment_time AS appointment_time,
       a.status AS status, a.reason AS reason, a.notes AS notes, a.created_at AS created_at, a.updated_at AS updated_at
FROM appointments a
JOIN doctors d ON d.doctor_id = a.doctor_id;
