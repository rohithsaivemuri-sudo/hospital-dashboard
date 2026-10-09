USE hospital_db;

CREATE INDEX idx_beds_status_type ON beds(status, bed_type);
CREATE INDEX idx_beds_ward_status ON beds(ward_id, status);
CREATE INDEX idx_emergency_status_severity_time ON emergency_cases(status, severity, arrival_time);
CREATE INDEX idx_appointments_doc_date_time ON appointments(doctor_id, appointment_date, appointment_time);
CREATE INDEX idx_admissions_patient_status ON admissions(patient_id, status);
CREATE INDEX idx_admissions_bed_status ON admissions(bed_id, status);
CREATE INDEX idx_admissions_doctor_status ON admissions(doctor_id, status);
CREATE INDEX idx_doctors_spec_status ON doctors(specialization, status);
CREATE INDEX idx_lab_orders_patient_status ON lab_orders(patient_id, status);
CREATE INDEX idx_prescriptions_patient_status ON prescriptions(patient_id, status);
CREATE INDEX idx_bills_patient_status ON bills(patient_id, status);
CREATE INDEX idx_patients_name ON patients(name);
