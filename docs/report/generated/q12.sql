SELECT p.name AS patient, w.name AS ward, b.bed_number,
       d.name AS doctor, dep.name AS department
FROM admissions a
JOIN patients p      ON p.patient_id = a.patient_id
JOIN beds b          ON b.bed_id = a.bed_id
JOIN wards w         ON w.ward_id = b.ward_id
JOIN doctors d       ON d.doctor_id = a.doctor_id
JOIN departments dep ON dep.department_id = a.department_id
WHERE a.status = 'ACTIVE'
ORDER BY w.name, b.bed_number
LIMIT 6;
