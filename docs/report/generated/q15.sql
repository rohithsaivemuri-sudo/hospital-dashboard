SELECT patient_name, ward_name, bed_number, doctor_name, department_name
FROM current_admissions_view
ORDER BY ward_name, bed_number
LIMIT 6;
