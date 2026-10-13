CREATE TRIGGER after_admission_insert AFTER INSERT ON admissions FOR EACH ROW
BEGIN
    UPDATE beds SET status = 'OCCUPIED' WHERE bed_id = NEW.bed_id;
    -- Workload is the number of ACTIVE admissions; one inserted already discharged does not count.
    IF NEW.status = 'ACTIVE' THEN
        UPDATE doctors SET current_workload = current_workload + 1 WHERE doctor_id = NEW.doctor_id;
    END IF;

    INSERT INTO bed_assignment_log (bed_id, patient_id, admission_id, assigned_at, status)
    VALUES (NEW.bed_id, NEW.patient_id, NEW.admission_id, NEW.admission_date, 'ACTIVE');
END
