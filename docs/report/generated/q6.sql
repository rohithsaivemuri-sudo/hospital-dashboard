SELECT d.name, d.current_workload, d.max_workload,
       COUNT(a.admission_id) AS active_admissions
FROM doctors d
LEFT JOIN admissions a ON a.doctor_id = d.doctor_id AND a.status = 'ACTIVE'
GROUP BY d.doctor_id, d.name, d.current_workload, d.max_workload
ORDER BY active_admissions DESC, d.name
LIMIT 6;
