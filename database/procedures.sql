USE hospital_db;

DELIMITER //

DROP PROCEDURE IF EXISTS sp_allocate_emergency //
CREATE PROCEDURE sp_allocate_emergency(IN p_emergency_id INT)
BEGIN
    DECLARE v_severity VARCHAR(20);
    DECLARE v_req_spec VARCHAR(100);
    DECLARE v_req_bed VARCHAR(50);
    DECLARE v_patient_id INT;
    DECLARE v_arrival_time DATETIME;
    
    DECLARE v_best_bed_id INT;
    DECLARE v_bed_dept_id INT;
    DECLARE v_best_doctor_id INT;
    
    DECLARE v_admission_id INT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Emergency allocation failed due to an error. Rolled back.';
    END;

    START TRANSACTION;

    -- 1. Get emergency details
    SELECT severity, required_specialization, required_bed_type, patient_id, arrival_time
    INTO v_severity, v_req_spec, v_req_bed, v_patient_id, v_arrival_time
    FROM emergency_cases 
    WHERE emergency_id = p_emergency_id AND status IN ('WAITING', 'TRIAGED')
    FOR UPDATE;
    
    IF v_patient_id IS NULL THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Emergency case not found or not waiting.';
    END IF;

    -- 2. Find and lock the best available bed (by requested type)
    SELECT b.bed_id, w.department_id 
    INTO v_best_bed_id, v_bed_dept_id
    FROM beds b
    JOIN wards w ON b.ward_id = w.ward_id
    WHERE b.status = 'AVAILABLE' 
      AND b.bed_type = COALESCE(v_req_bed, b.bed_type)
    ORDER BY b.bed_id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_best_bed_id IS NULL THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No available bed of required type.';
    END IF;

    -- 3. Find and lock the best available doctor (by workload)
    SELECT doctor_id 
    INTO v_best_doctor_id
    FROM doctors
    WHERE status = 'AVAILABLE'
      AND specialization = COALESCE(v_req_spec, specialization)
      AND current_workload < max_workload
    ORDER BY current_workload ASC, doctor_id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_best_doctor_id IS NULL THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No available doctor for required specialization.';
    END IF;

    -- 4. Create admission record
    INSERT INTO admissions (patient_id, doctor_id, bed_id, department_id, emergency_id, admission_date, status, diagnosis)
    VALUES (v_patient_id, v_best_doctor_id, v_best_bed_id, v_bed_dept_id, p_emergency_id, NOW(), 'ACTIVE', 'Emergency Admission');
    
    SET v_admission_id = LAST_INSERT_ID();

    -- 5. Update emergency case
    UPDATE emergency_cases
    SET status = 'ADMITTED', assigned_doctor_id = v_best_doctor_id, assigned_bed_id = v_best_bed_id
    WHERE emergency_id = p_emergency_id;

    COMMIT;
END //

DROP PROCEDURE IF EXISTS sp_admit_patient //
CREATE PROCEDURE sp_admit_patient(
    IN p_patient_id INT,
    IN p_doctor_id INT,
    IN p_bed_id INT,
    IN p_department_id INT,
    IN p_diagnosis TEXT
)
BEGIN
    INSERT INTO admissions (patient_id, doctor_id, bed_id, department_id, admission_date, status, diagnosis)
    VALUES (p_patient_id, p_doctor_id, p_bed_id, p_department_id, NOW(), 'ACTIVE', p_diagnosis);
END //

DROP PROCEDURE IF EXISTS sp_discharge_patient //
CREATE PROCEDURE sp_discharge_patient(IN p_admission_id INT)
BEGIN
    UPDATE admissions 
    SET discharge_date = NOW(), status = 'DISCHARGED'
    WHERE admission_id = p_admission_id AND status = 'ACTIVE';
END //

DROP PROCEDURE IF EXISTS sp_generate_bill //
CREATE PROCEDURE sp_generate_bill(IN p_admission_id INT)
BEGIN
    DECLARE v_patient_id INT;
    DECLARE v_bill_id INT;
    DECLARE v_total DECIMAL(12,2) DEFAULT 0;
    
    SELECT patient_id INTO v_patient_id FROM admissions WHERE admission_id = p_admission_id;
    
    INSERT INTO bills (patient_id, admission_id, bill_date, status)
    VALUES (v_patient_id, p_admission_id, NOW(), 'PENDING');
    
    SET v_bill_id = LAST_INSERT_ID();
    
    -- Insert generic consultation fee
    INSERT INTO bill_items (bill_id, description, category, quantity, unit_price, total_price)
    VALUES (v_bill_id, 'Base Consultation Fee', 'CONSULTATION', 1, 500.00, 500.00);
    
    SELECT SUM(total_price) INTO v_total FROM bill_items WHERE bill_id = v_bill_id;
    
    UPDATE bills SET total_amount = v_total WHERE bill_id = v_bill_id;
END //

DROP PROCEDURE IF EXISTS sp_get_emergency_queue //
CREATE PROCEDURE sp_get_emergency_queue()
BEGIN
    SELECT * FROM emergency_queue_view;
END //

DELIMITER ;
