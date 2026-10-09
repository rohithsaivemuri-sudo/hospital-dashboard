USE hospital_db;

-- 1. Get Top 5 busiest doctors by workload
SELECT doctor_id, name, specialization, current_workload
FROM doctors
ORDER BY current_workload DESC
LIMIT 5;

-- 2. Calculate average patient age by gender
SELECT gender, ROUND(AVG(DATEDIFF(CURDATE(), date_of_birth) / 365.25), 1) as avg_age
FROM patients
GROUP BY gender;

-- 3. Monthly revenue from paid bills
SELECT DATE_FORMAT(bill_date, '%Y-%m') as month, SUM(paid_amount) as total_revenue
FROM bills
WHERE status IN ('PAID', 'PARTIAL')
GROUP BY month
ORDER BY month DESC;

-- 4. Find patients with multiple active admissions (anomaly check)
SELECT patient_id, COUNT(*) as active_admissions
FROM admissions
WHERE status = 'ACTIVE'
GROUP BY patient_id
HAVING COUNT(*) > 1;

-- 5. Utilization rate of ventilators in ICU
SELECT 
    COUNT(*) as total_ventilator_beds,
    SUM(CASE WHEN status = 'OCCUPIED' THEN 1 ELSE 0 END) as occupied,
    (SUM(CASE WHEN status = 'OCCUPIED' THEN 1 ELSE 0 END) / COUNT(*)) * 100 as utilization_pct
FROM beds
WHERE bed_type = 'VENTILATOR_ICU' AND has_ventilator = TRUE;

-- 6. Doctors with zero appointments this week
SELECT d.doctor_id, d.name
FROM doctors d
LEFT JOIN appointments a ON d.doctor_id = a.doctor_id 
    AND a.appointment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
WHERE a.appointment_id IS NULL;

-- 7. Average wait time for emergency cases to be admitted
SELECT 
    severity,
    AVG(TIMESTAMPDIFF(MINUTE, e.arrival_time, a.admission_date)) as avg_wait_minutes
FROM emergency_cases e
JOIN admissions a ON e.emergency_id = a.emergency_id
WHERE e.status = 'ADMITTED'
GROUP BY severity;

-- 8. Top 3 prescribed medicines
SELECT m.name, SUM(pi.quantity) as total_dispensed
FROM prescription_items pi
JOIN medicines m ON pi.medicine_id = m.medicine_id
WHERE pi.dispensed = TRUE
GROUP BY m.medicine_id
ORDER BY total_dispensed DESC
LIMIT 3;

-- 9. Rank departments by number of admissions (Window Function)
SELECT 
    d.name,
    COUNT(a.admission_id) as admission_count,
    RANK() OVER(ORDER BY COUNT(a.admission_id) DESC) as dept_rank
FROM departments d
LEFT JOIN admissions a ON d.department_id = a.department_id
GROUP BY d.department_id;

-- 10. Patients who haven't paid their bills within 30 days
SELECT p.name, b.bill_id, b.bill_date, b.total_amount - b.paid_amount as pending_amount
FROM bills b
JOIN patients p ON b.patient_id = p.patient_id
WHERE b.status IN ('PENDING', 'PARTIAL') 
AND b.bill_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY);

-- 11. Average bed occupancy duration by bed type
SELECT 
    b.bed_type, 
    AVG(TIMESTAMPDIFF(DAY, l.assigned_at, COALESCE(l.released_at, CURRENT_TIMESTAMP))) as avg_days_occupied
FROM bed_assignment_log l
JOIN beds b ON l.bed_id = b.bed_id
GROUP BY b.bed_type;

-- 12. Most profitable lab tests
SELECT t.name, COUNT(o.order_id) as times_ordered, SUM(t.cost) as total_revenue
FROM lab_tests t
JOIN lab_orders o ON t.test_id = o.test_id
GROUP BY t.test_id
ORDER BY total_revenue DESC
LIMIT 5;

-- 13. Medicine inventory running low (< 10 units)
SELECT name, stock_quantity, expiry_date
FROM medicines
WHERE stock_quantity < 10;

-- 14. Doctor schedule gaps (checking for days with no available doctors)
SELECT day_of_week, COUNT(schedule_id) as available_shifts
FROM doctor_schedules
WHERE is_available = TRUE
GROUP BY day_of_week
ORDER BY available_shifts ASC;

-- 15. Emergency cases handled by ambulance
SELECT a.vehicle_number, COUNT(e.emergency_id) as cases_handled
FROM ambulances a
LEFT JOIN emergency_cases e ON a.ambulance_id = e.ambulance_id
GROUP BY a.ambulance_id;

-- 16. CTE to find doctors handling both appointments and emergencies today
WITH TodayAppointments AS (
    SELECT DISTINCT doctor_id FROM appointments WHERE appointment_date = CURDATE()
),
TodayEmergencies AS (
    SELECT DISTINCT assigned_doctor_id FROM emergency_cases WHERE DATE(arrival_time) = CURDATE()
)
SELECT d.name
FROM doctors d
JOIN TodayAppointments ta ON d.doctor_id = ta.doctor_id
JOIN TodayEmergencies te ON d.doctor_id = te.assigned_doctor_id;

-- 17. Patients who had an appointment and were admitted on the same day
SELECT p.name, a.appointment_date
FROM patients p
JOIN appointments a ON p.patient_id = a.patient_id
JOIN admissions ad ON p.patient_id = ad.patient_id 
    AND DATE(ad.admission_date) = a.appointment_date;

-- 18. Bill breakdown by category percentage
SELECT 
    category,
    SUM(total_price) as category_total,
    ROUND((SUM(total_price) / (SELECT SUM(total_price) FROM bill_items)) * 100, 2) as pct_of_total
FROM bill_items
GROUP BY category;

-- 19. Find out which shift is busiest based on consultation times
SELECT 
    CASE 
        WHEN HOUR(consultation_time) BETWEEN 6 AND 14 THEN 'MORNING'
        WHEN HOUR(consultation_time) BETWEEN 14 AND 22 THEN 'AFTERNOON'
        ELSE 'NIGHT' 
    END as shift_time,
    COUNT(*) as total_consultations
FROM consultations
GROUP BY shift_time;

-- 20. Count of lab results waiting to be reviewed by doctors
SELECT COUNT(*) as pending_reviews
FROM lab_results
WHERE reviewed_by_doctor = FALSE;
