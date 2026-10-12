-- 020_workload_counts_active_admissions.sql — doctors.current_workload counts ACTIVE admissions only.
--
-- after_admission_insert added 1 to the doctor's workload for every new admission, whatever its
-- status. seed.sql inserts two admissions that are already DISCHARGED (#10, #11), so their doctors'
-- workload went up and never came down (after_admission_discharge only runs on ACTIVE -> DISCHARGED):
-- those doctors reached max_workload one admission early. The trigger now counts only ACTIVE
-- admissions, and every doctor's workload is reset to their number of ACTIVE admissions. The old and
-- new values are printed below and kept in an audit_logs MIGRATION_DATA_FIX row.
-- Bed status and the bed assignment log are unchanged by this migration. Safe to re-run.

DROP TRIGGER IF EXISTS after_admission_insert;
DELIMITER //
CREATE TRIGGER after_admission_insert AFTER INSERT ON admissions FOR EACH ROW
BEGIN
    UPDATE beds SET status = 'OCCUPIED' WHERE bed_id = NEW.bed_id;
    -- Workload is the number of ACTIVE admissions; one inserted already discharged does not count.
    IF NEW.status = 'ACTIVE' THEN
        UPDATE doctors SET current_workload = current_workload + 1 WHERE doctor_id = NEW.doctor_id;
    END IF;

    INSERT INTO bed_assignment_log (bed_id, patient_id, admission_id, assigned_at, status)
    VALUES (NEW.bed_id, NEW.patient_id, NEW.admission_id, NEW.admission_date, 'ACTIVE');
END //
DELIMITER ;

-- Verification output: the doctors whose workload is about to change.
SELECT '020 before' AS step, d.doctor_id, d.name, d.current_workload AS old_workload, COUNT(a.admission_id) AS new_workload
FROM doctors d LEFT JOIN admissions a ON a.doctor_id = d.doctor_id AND a.status = 'ACTIVE'
GROUP BY d.doctor_id, d.name, d.current_workload
HAVING d.current_workload <> COUNT(a.admission_id)
ORDER BY d.doctor_id;

START TRANSACTION;

INSERT INTO audit_logs (action, entity_type, outcome, path, details)
SELECT 'MIGRATION_DATA_FIX', 'doctors', 'SUCCESS', '020_workload_counts_active_admissions.sql',
       JSON_OBJECT('reason', 'current_workload reset to the number of ACTIVE admissions',
                   'changed', JSON_ARRAYAGG(JSON_OBJECT('doctor_id', x.doctor_id, 'old_workload', x.current_workload, 'new_workload', x.active)))
FROM (SELECT d.doctor_id, d.current_workload,
             (SELECT COUNT(*) FROM admissions a WHERE a.doctor_id = d.doctor_id AND a.status = 'ACTIVE') AS active
      FROM doctors d) x
WHERE x.current_workload <> x.active
HAVING COUNT(*) > 0;

UPDATE doctors d
SET d.current_workload = (SELECT COUNT(*) FROM admissions a WHERE a.doctor_id = d.doctor_id AND a.status = 'ACTIVE')
WHERE d.current_workload <> (SELECT COUNT(*) FROM admissions a WHERE a.doctor_id = d.doctor_id AND a.status = 'ACTIVE');

COMMIT;

-- Verification output: every doctor's workload equals their ACTIVE admissions.
SELECT '020 verification' AS step, COUNT(*) AS doctors,
       SUM(d.current_workload = (SELECT COUNT(*) FROM admissions a WHERE a.doctor_id = d.doctor_id AND a.status = 'ACTIVE')) AS consistent
FROM doctors d;
