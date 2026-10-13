SELECT p.name, a.admission_date,
       (SELECT MAX(v.recorded_at_utc) FROM vital_signs v
         WHERE v.admission_id = a.admission_id) AS last_vitals_utc
FROM admissions a JOIN patients p ON p.patient_id = a.patient_id
WHERE a.status = 'ACTIVE'
ORDER BY a.admission_date DESC
LIMIT 6;
