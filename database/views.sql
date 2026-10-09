USE hospital_db;

CREATE OR REPLACE VIEW available_beds_view AS
SELECT 
    b.bed_id,
    b.bed_number,
    b.floor,
    b.bed_type,
    b.has_ventilator,
    w.name AS ward_name,
    d.name AS department_name
FROM beds b
JOIN wards w ON b.ward_id = w.ward_id
JOIN departments d ON w.department_id = d.department_id
WHERE b.status = 'AVAILABLE';

CREATE OR REPLACE VIEW available_doctors_view AS
SELECT 
    doc.doctor_id,
    doc.name AS doctor_name,
    doc.specialization,
    doc.phone,
    doc.current_workload,
    doc.max_workload,
    dep.name AS department_name
FROM doctors doc
JOIN departments dep ON doc.department_id = dep.department_id
WHERE doc.status = 'AVAILABLE' AND doc.current_workload < doc.max_workload;

CREATE OR REPLACE VIEW emergency_queue_view AS
SELECT 
    e.emergency_id,
    e.severity,
    e.arrival_time,
    e.symptoms,
    e.required_specialization,
    e.required_bed_type,
    e.ventilator_required,
    p.name AS patient_name,
    a.vehicle_number AS ambulance_number
FROM emergency_cases e
LEFT JOIN patients p ON e.patient_id = p.patient_id
LEFT JOIN ambulances a ON e.ambulance_id = a.ambulance_id
WHERE e.status IN ('WAITING', 'TRIAGED')
ORDER BY 
    CASE e.severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'VERY_SERIOUS' THEN 2
        WHEN 'SERIOUS' THEN 3
        WHEN 'MODERATE' THEN 4
        WHEN 'STABLE' THEN 5
    END,
    e.arrival_time ASC;

CREATE OR REPLACE VIEW current_admissions_view AS
SELECT 
    a.admission_id,
    a.admission_date,
    a.diagnosis,
    p.name AS patient_name,
    p.patient_id,
    doc.name AS doctor_name,
    doc.doctor_id,
    b.bed_number,
    b.bed_type,
    w.name AS ward_name,
    dep.name AS department_name
FROM admissions a
JOIN patients p ON a.patient_id = p.patient_id
JOIN doctors doc ON a.doctor_id = doc.doctor_id
JOIN beds b ON a.bed_id = b.bed_id
JOIN wards w ON b.ward_id = w.ward_id
JOIN departments dep ON a.department_id = dep.department_id
WHERE a.status = 'ACTIVE';

CREATE OR REPLACE VIEW hospital_occupancy_view AS
SELECT 
    bed_type,
    COUNT(*) as total_beds,
    SUM(CASE WHEN status = 'OCCUPIED' THEN 1 ELSE 0 END) as occupied_beds,
    SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available_beds,
    SUM(CASE WHEN status IN ('MAINTENANCE', 'RESERVED') THEN 1 ELSE 0 END) as unavailable_beds,
    ROUND((SUM(CASE WHEN status = 'OCCUPIED' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as occupancy_rate
FROM beds
GROUP BY bed_type;

CREATE OR REPLACE VIEW doctor_workload_view AS
SELECT 
    doc.doctor_id,
    doc.name,
    doc.specialization,
    dep.name AS department,
    doc.status,
    doc.shift,
    doc.current_workload,
    doc.max_workload,
    (doc.max_workload - doc.current_workload) AS available_capacity
FROM doctors doc
JOIN departments dep ON doc.department_id = dep.department_id;

CREATE OR REPLACE VIEW pending_bills_view AS
SELECT 
    b.bill_id,
    b.bill_date,
    p.name AS patient_name,
    p.phone,
    b.total_amount,
    b.paid_amount,
    (b.total_amount - b.paid_amount) AS balance_due,
    b.status
FROM bills b
JOIN patients p ON b.patient_id = p.patient_id
WHERE b.status IN ('PENDING', 'PARTIAL');

CREATE OR REPLACE VIEW bed_status_summary_view AS
SELECT 
    w.name AS ward_name,
    d.name AS department_name,
    b.bed_type,
    b.status,
    COUNT(b.bed_id) as count
FROM beds b
JOIN wards w ON b.ward_id = w.ward_id
JOIN departments d ON w.department_id = d.department_id
GROUP BY w.name, d.name, b.bed_type, b.status;
