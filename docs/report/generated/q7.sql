SELECT d1.specialization, d1.name AS doctor, d2.name AS colleague
FROM doctors d1
JOIN doctors d2 ON d2.specialization = d1.specialization
               AND d2.doctor_id > d1.doctor_id
ORDER BY d1.specialization;
