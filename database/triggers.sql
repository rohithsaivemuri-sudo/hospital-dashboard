USE hospital_db;

DELIMITER //

DROP TRIGGER IF EXISTS after_admission_insert //
CREATE TRIGGER after_admission_insert
AFTER INSERT ON admissions
FOR EACH ROW
BEGIN
    UPDATE beds SET status = 'OCCUPIED' WHERE bed_id = NEW.bed_id;
    UPDATE doctors SET current_workload = current_workload + 1 WHERE doctor_id = NEW.doctor_id;
    
    INSERT INTO bed_assignment_log (bed_id, patient_id, admission_id, assigned_at, status)
    VALUES (NEW.bed_id, NEW.patient_id, NEW.admission_id, NEW.admission_date, 'ACTIVE');
END //

DROP TRIGGER IF EXISTS after_admission_discharge //
CREATE TRIGGER after_admission_discharge
AFTER UPDATE ON admissions
FOR EACH ROW
BEGIN
    IF OLD.status = 'ACTIVE' AND NEW.status = 'DISCHARGED' THEN
        UPDATE beds SET status = 'AVAILABLE' WHERE bed_id = OLD.bed_id;
        UPDATE doctors SET current_workload = current_workload - 1 WHERE doctor_id = OLD.doctor_id;
        
        UPDATE bed_assignment_log 
        SET released_at = NEW.discharge_date, status = 'RELEASED'
        WHERE admission_id = NEW.admission_id AND status = 'ACTIVE';
    END IF;
END //

DROP TRIGGER IF EXISTS after_prescription_dispense //
CREATE TRIGGER after_prescription_dispense
AFTER UPDATE ON prescription_items
FOR EACH ROW
BEGIN
    IF OLD.dispensed = FALSE AND NEW.dispensed = TRUE THEN
        UPDATE medicines 
        SET stock_quantity = stock_quantity - NEW.quantity
        WHERE medicine_id = NEW.medicine_id;
    END IF;
END //

DROP TRIGGER IF EXISTS before_medicine_stock_update //
CREATE TRIGGER before_medicine_stock_update
BEFORE UPDATE ON medicines
FOR EACH ROW
BEGIN
    IF NEW.stock_quantity < 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Error: Medicine stock cannot be negative.';
    END IF;
END //

DROP TRIGGER IF EXISTS after_bed_assignment_log //
CREATE TRIGGER after_bed_assignment_log
AFTER INSERT ON bed_assignment_log
FOR EACH ROW
BEGIN
    -- This trigger is just for demonstration if we want to cascade logs or notify systems.
    -- The actual logging is handled in the after_admission_insert and update triggers.
END //

DELIMITER ;
