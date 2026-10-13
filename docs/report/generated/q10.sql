SELECT p.patient_id, p.name
FROM patients p
WHERE EXISTS (SELECT 1 FROM admissions a
              WHERE a.patient_id = p.patient_id AND a.status = 'ACTIVE')
  AND p.patient_id IN (SELECT o.patient_id FROM lab_orders o
                       WHERE o.status <> 'COMPLETED');
