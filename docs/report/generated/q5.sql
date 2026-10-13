SELECT a.appointment_time, p.name AS patient, d.name AS doctor,
       dep.name AS department, a.status
FROM v_appointments a
INNER JOIN patients p     ON p.patient_id = a.patient_id
INNER JOIN doctors d      ON d.doctor_id = a.doctor_id
INNER JOIN departments dep ON dep.department_id = a.department_id
WHERE a.appointment_date = CURDATE()
ORDER BY a.appointment_time;
