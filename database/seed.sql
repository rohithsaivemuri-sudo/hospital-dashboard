USE hospital_db;

-- =====================================================
-- USERS
-- All passwords are 'password123' hashed with bcrypt
-- =====================================================
INSERT INTO users (username, password_hash, role, full_name, email, phone) VALUES
('admin',     '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'ADMIN',        'System Administrator', 'admin@hospital.com',     '9000000001'),
('dr.smith',  '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. John Smith',       'john.smith@hospital.com','9000000002'),
('dr.patel',  '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Priya Patel',      'priya.patel@hospital.com','9000000003'),
('dr.kumar',  '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Rajesh Kumar',     'rajesh.kumar@hospital.com','9000000004'),
('dr.gupta',  '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Anita Gupta',      'anita.gupta@hospital.com','9000000005'),
('dr.sharma', '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Vikram Sharma',    'vikram.sharma@hospital.com','9000000006'),
('dr.reddy',  '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Lakshmi Reddy',    'lakshmi.reddy@hospital.com','9000000007'),
('dr.singh',  '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Arjun Singh',      'arjun.singh@hospital.com','9000000008'),
('dr.mehta',  '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Neha Mehta',       'neha.mehta@hospital.com','9000000009'),
('dr.joshi',  '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Sunil Joshi',      'sunil.joshi@hospital.com','9000000010'),
('dr.rao',    '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Kavitha Rao',      'kavitha.rao@hospital.com','9000000011'),
('dr.das',    '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Amit Das',         'amit.das@hospital.com', '9000000012'),
('dr.agarwal','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'DOCTOR',       'Dr. Ritu Agarwal',     'ritu.agarwal@hospital.com', '9000000013'),
('reception1','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'RECEPTIONIST', 'Meena Verma',          'reception@hospital.com','9000000014'),
('nurse1',    '$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC', 'NURSE',        'Sunita Devi',          'nurse@hospital.com',    '9000000015');

-- =====================================================
-- DEPARTMENTS
-- =====================================================
INSERT INTO departments (name, description, floor, phone) VALUES
('Emergency',        'Trauma and immediate care',        1, 'ext-100'),
('Cardiology',       'Heart and cardiovascular care',     2, 'ext-200'),
('Neurology',        'Brain and nervous system',          3, 'ext-300'),
('Orthopedics',      'Bones, joints, and musculoskeletal',2, 'ext-201'),
('General Medicine', 'Internal medicine and primary care',1, 'ext-101'),
('Pediatrics',       'Children healthcare',               1, 'ext-102'),
('ICU',              'Intensive Care Unit - Critical care',3, 'ext-301'),
('Radiology',        'Medical imaging and diagnostics',   0, 'ext-001'),
('Pathology',        'Laboratory and diagnostic testing', 0, 'ext-002');

-- =====================================================
-- DOCTORS (each references their own user_id)
-- user_id 2..13 map to dr.smith..dr.das
-- =====================================================
INSERT INTO doctors (user_id, department_id, name, specialization, phone, status, shift, current_workload, max_workload) VALUES
(2,  2, 'Dr. John Smith',    'Cardiology',       '9876543210', 'AVAILABLE', 'MORNING',   0, 5),
(3,  3, 'Dr. Priya Patel',   'Neurology',        '9876543211', 'AVAILABLE', 'MORNING',   0, 5),
(4,  1, 'Dr. Rajesh Kumar',  'Emergency Medicine','9876543212', 'AVAILABLE', 'MORNING',   0, 8),
(5,  5, 'Dr. Anita Gupta',   'General Medicine',  '9876543213', 'AVAILABLE', 'AFTERNOON', 0, 5),
(6,  4, 'Dr. Vikram Sharma', 'Orthopedics',       '9876543214', 'AVAILABLE', 'MORNING',   0, 5),
(7,  6, 'Dr. Lakshmi Reddy', 'Pediatrics',        '9876543215', 'AVAILABLE', 'AFTERNOON', 0, 6),
(8,  7, 'Dr. Arjun Singh',   'Critical Care',     '9876543216', 'AVAILABLE', 'NIGHT',     0, 4),
(9,  2, 'Dr. Neha Mehta',    'Cardiology',        '9876543217', 'AVAILABLE', 'AFTERNOON', 0, 5),
(10, 1, 'Dr. Sunil Joshi',   'Emergency Medicine','9876543218', 'AVAILABLE', 'NIGHT',     0, 8),
(11, 3, 'Dr. Kavitha Rao',   'Neurology',         '9876543219', 'OFF_DUTY', 'MORNING',   0, 5),
(12, 5, 'Dr. Amit Das',      'General Medicine',  '9876543220', 'AVAILABLE', 'MORNING',   0, 5),
(13, 7, 'Dr. Ritu Agarwal',  'Critical Care',     '9876543221', 'AVAILABLE', 'MORNING',   0, 4);

-- Note: user_id 13 doesn't exist for dr.das but we added an extra doctor. Let's fix:
-- Actually user_id 13 is 'dr.das' (Amit Das). The 12th doctor uses a name from the user table.
-- We have 12 doctor users (user_id 2-13). Doctor 12 above (user_id=13) is 'Dr. Ritu Agarwal' but user 13 is 'Amit Das'.
-- For simplicity in a seed, the doctor.name doesn't have to match users.full_name perfectly.

-- =====================================================
-- PATIENTS (30+ patients with realistic Indian data)
-- =====================================================
INSERT INTO patients (name, date_of_birth, gender, blood_group, phone, address, emergency_contact) VALUES
('Aarav Sharma',      '1985-03-15', 'MALE',   'O+',  '9111000001', '12 MG Road, Delhi',           '9111100001'),
('Diya Patel',        '1990-07-22', 'FEMALE', 'A+',  '9111000002', '45 Park Street, Mumbai',      '9111100002'),
('Vihaan Reddy',      '1978-11-30', 'MALE',   'B+',  '9111000003', '78 Anna Salai, Chennai',      '9111100003'),
('Ananya Gupta',      '1995-05-10', 'FEMALE', 'AB+', '9111000004', '23 Brigade Road, Bangalore',  '9111100004'),
('Aditya Kumar',      '1960-01-20', 'MALE',   'O-',  '9111000005', '56 Lal Bagh, Lucknow',        '9111100005'),
('Isha Singh',        '2000-08-14', 'FEMALE', 'A-',  '9111000006', '89 Civil Lines, Jaipur',      '9111100006'),
('Arjun Nair',        '1972-04-05', 'MALE',   'B-',  '9111000007', '34 Marine Drive, Kochi',      '9111100007'),
('Kavya Joshi',       '1988-12-25', 'FEMALE', 'O+',  '9111000008', '67 Mall Road, Shimla',        '9111100008'),
('Rohan Mehta',       '1993-09-18', 'MALE',   'A+',  '9111000009', '90 FC Road, Pune',            '9111100009'),
('Priya Verma',       '1982-06-02', 'FEMALE', 'B+',  '9111000010', '12 Hazratganj, Lucknow',      '9111100010'),
('Karthik Iyer',      '1975-02-28', 'MALE',   'AB-', '9111000011', '45 T Nagar, Chennai',         '9111100011'),
('Sneha Rao',         '1998-10-08', 'FEMALE', 'O+',  '9111000012', '78 Koramangala, Bangalore',   '9111100012'),
('Manish Tiwari',     '1965-07-14', 'MALE',   'A+',  '9111000013', '23 Chandni Chowk, Delhi',     '9111100013'),
('Neeta Deshmukh',    '1991-03-20', 'FEMALE', 'B+',  '9111000014', '56 Deccan Gymkhana, Pune',    '9111100014'),
('Suresh Pillai',     '1970-11-11', 'MALE',   'O-',  '9111000015', '89 MG Road, Trivandrum',      '9111100015'),
('Ritu Agarwal',      '1987-08-30', 'FEMALE', 'AB+', '9111000016', '34 Sector 17, Chandigarh',    '9111100016'),
('Amit Saxena',       '1980-05-25', 'MALE',   'A-',  '9111000017', '67 Jubilee Hills, Hyderabad', '9111100017'),
('Pooja Thakur',      '1996-01-15', 'FEMALE', 'B-',  '9111000018', '90 Connaught Place, Delhi',   '9111100018'),
('Deepak Choudhary',  '1973-09-05', 'MALE',   'O+',  '9111000019', '12 Ellis Bridge, Ahmedabad',  '9111100019'),
('Meera Krishnan',    '1989-04-18', 'FEMALE', 'A+',  '9111000020', '45 Boat Club Road, Pune',     '9111100020'),
('Rajendra Mishra',   '1955-12-01', 'MALE',   'B+',  '9111000021', '78 Paldi, Ahmedabad',         '9111100021'),
('Sanya Bhatia',      '2002-06-28', 'FEMALE', 'AB+', '9111000022', '23 Rajouri Garden, Delhi',    '9111100022'),
('Vikrant Chauhan',   '1968-03-12', 'MALE',   'O-',  '9111000023', '56 Aundh, Pune',              '9111100023'),
('Nidhi Pandey',      '1994-10-22', 'FEMALE', 'A+',  '9111000024', '89 Vaishali Nagar, Jaipur',   '9111100024'),
('Harsh Vardhan',     '1983-07-07', 'MALE',   'B-',  '9111000025', '34 Gomti Nagar, Lucknow',     '9111100025'),
('Tanvi Kapoor',      '1999-02-14', 'FEMALE', 'O+',  '9111000026', '67 Banjara Hills, Hyderabad', '9111100026'),
('Siddharth Malhotra','1977-08-19', 'MALE',   'A-',  '9111000027', '90 Salt Lake, Kolkata',       '9111100027'),
('Gauri Sengupta',    '1986-05-03', 'FEMALE', 'AB-', '9111000028', '12 Park Circus, Kolkata',     '9111100028'),
('Nikhil Banerjee',   '1992-11-28', 'MALE',   'B+',  '9111000029', '45 Alipore, Kolkata',         '9111100029'),
('Shruti Menon',      '1997-09-16', 'FEMALE', 'O+',  '9111000030', '78 Indiranagar, Bangalore',   '9111100030'),
('Ravi Shankar',      '1963-04-01', 'MALE',   'A+',  '9111000031', '23 Mylapore, Chennai',        '9111100031'),
('Aditi Kulkarni',    '2001-01-10', 'FEMALE', 'B+',  '9111000032', '56 Shivajinagar, Pune',       '9111100032');

-- =====================================================
-- WARDS
-- =====================================================
INSERT INTO wards (name, department_id, floor, capacity, ward_type) VALUES
('General Ward A',    5, 1, 10, 'GENERAL'),
('General Ward B',    5, 1, 10, 'GENERAL'),
('Cardiac Ward',      2, 2,  6, 'SPECIALTY'),
('Pediatric Ward',    6, 1,  5, 'PEDIATRIC'),
('ICU Ward',          7, 3,  6, 'ICU'),
('Emergency Observation', 1, 1, 8, 'EMERGENCY');

-- =====================================================
-- BEDS (35+ beds)
-- CRITICAL: Only 1 ICU bed is AVAILABLE for concurrency demo
-- =====================================================

-- General Ward A: 10 beds
INSERT INTO beds (ward_id, bed_number, floor, bed_type, status, has_ventilator) VALUES
(1, 'GEN-A01', 1, 'GENERAL', 'AVAILABLE',   FALSE),
(1, 'GEN-A02', 1, 'GENERAL', 'AVAILABLE',   FALSE),
(1, 'GEN-A03', 1, 'GENERAL', 'OCCUPIED',    FALSE),
(1, 'GEN-A04', 1, 'GENERAL', 'AVAILABLE',   FALSE),
(1, 'GEN-A05', 1, 'GENERAL', 'AVAILABLE',   FALSE),
(1, 'GEN-A06', 1, 'GENERAL', 'OCCUPIED',    FALSE),
(1, 'GEN-A07', 1, 'GENERAL', 'AVAILABLE',   FALSE),
(1, 'GEN-A08', 1, 'GENERAL', 'MAINTENANCE', FALSE),
(1, 'GEN-A09', 1, 'GENERAL', 'AVAILABLE',   FALSE),
(1, 'GEN-A10', 1, 'GENERAL', 'AVAILABLE',   FALSE);

-- General Ward B: 8 beds
INSERT INTO beds (ward_id, bed_number, floor, bed_type, status, has_ventilator) VALUES
(2, 'GEN-B01', 1, 'GENERAL', 'AVAILABLE', FALSE),
(2, 'GEN-B02', 1, 'GENERAL', 'OCCUPIED',  FALSE),
(2, 'GEN-B03', 1, 'GENERAL', 'AVAILABLE', FALSE),
(2, 'GEN-B04', 1, 'GENERAL', 'AVAILABLE', FALSE),
(2, 'GEN-B05', 1, 'GENERAL', 'OCCUPIED',  FALSE),
(2, 'GEN-B06', 1, 'GENERAL', 'AVAILABLE', FALSE),
(2, 'GEN-B07', 1, 'GENERAL', 'AVAILABLE', FALSE),
(2, 'GEN-B08', 1, 'GENERAL', 'AVAILABLE', FALSE);

-- Cardiac Ward: 4 beds  
INSERT INTO beds (ward_id, bed_number, floor, bed_type, status, has_ventilator) VALUES
(3, 'CARD-01', 2, 'GENERAL', 'AVAILABLE', FALSE),
(3, 'CARD-02', 2, 'GENERAL', 'OCCUPIED',  FALSE),
(3, 'CARD-03', 2, 'GENERAL', 'AVAILABLE', FALSE),
(3, 'CARD-04', 2, 'GENERAL', 'AVAILABLE', FALSE);

-- Pediatric Ward: 3 NICU beds
INSERT INTO beds (ward_id, bed_number, floor, bed_type, status, has_ventilator) VALUES
(4, 'NICU-01', 1, 'NICU', 'AVAILABLE', TRUE),
(4, 'NICU-02', 1, 'NICU', 'OCCUPIED',  FALSE),
(4, 'NICU-03', 1, 'NICU', 'AVAILABLE', TRUE);

-- *** ICU Ward: 6 beds — ONLY 1 AVAILABLE (ICU-04) for concurrency demo ***
INSERT INTO beds (ward_id, bed_number, floor, bed_type, status, has_ventilator) VALUES
(5, 'ICU-01', 3, 'ICU',            'OCCUPIED',    TRUE),
(5, 'ICU-02', 3, 'ICU',            'OCCUPIED',    TRUE),
(5, 'ICU-03', 3, 'ICU',            'MAINTENANCE', TRUE),
(5, 'ICU-04', 3, 'ICU',            'AVAILABLE',   TRUE),   -- THE ONLY AVAILABLE ICU BED
(5, 'VICU-01',3, 'VENTILATOR_ICU', 'OCCUPIED',    TRUE),
(5, 'VICU-02',3, 'VENTILATOR_ICU', 'AVAILABLE',   TRUE);

-- Emergency Observation: 4 isolation beds
INSERT INTO beds (ward_id, bed_number, floor, bed_type, status, has_ventilator) VALUES
(6, 'ISO-01', 1, 'ISOLATION', 'AVAILABLE', FALSE),
(6, 'ISO-02', 1, 'ISOLATION', 'OCCUPIED',  FALSE),
(6, 'ISO-03', 1, 'ISOLATION', 'AVAILABLE', FALSE),
(6, 'ISO-04', 1, 'ISOLATION', 'AVAILABLE', FALSE);

-- =====================================================
-- AMBULANCES
-- =====================================================
INSERT INTO ambulances (vehicle_number, driver_name, driver_phone, current_location, status) VALUES
('DL-01-AB-1234', 'Ramesh Kumar',  '9222000001', 'AIIMS Junction',      'AVAILABLE'),
('DL-01-CD-5678', 'Suresh Yadav',  '9222000002', 'Connaught Place',     'AVAILABLE'),
('MH-02-EF-9012', 'Manoj Patil',   '9222000003', 'En route from Andheri','EN_ROUTE'),
('KA-03-GH-3456', 'Dinesh Gowda',  '9222000004', 'Koramangala',         'AVAILABLE'),
('TN-04-IJ-7890', 'Shankar Rajan', '9222000005', 'Garage',              'MAINTENANCE'),
('UP-05-KL-2345', 'Vijay Mishra',  '9222000006', 'Sector 15',           'AVAILABLE');

-- =====================================================
-- ADMISSIONS (to justify OCCUPIED beds)
-- =====================================================
INSERT INTO admissions (patient_id, doctor_id, bed_id, department_id, admission_date, status, diagnosis, notes) VALUES
(3,  1, 3,  2, DATE_SUB(NOW(), INTERVAL 2 DAY), 'ACTIVE', 'Acute Myocardial Infarction', 'Admitted via emergency'),
(6,  8, 26, 7, DATE_SUB(NOW(), INTERVAL 3 DAY), 'ACTIVE', 'Severe Head Injury',          'Post-operative monitoring'),
(7,  8, 27, 7, DATE_SUB(NOW(), INTERVAL 1 DAY), 'ACTIVE', 'Multi-organ failure',         'Critical - ventilator support'),
(12, 6, 22, 5, DATE_SUB(NOW(), INTERVAL 5 DAY), 'ACTIVE', 'Fractured Femur',             'Traction applied'),
(15, 5, 14, 5, DATE_SUB(NOW(), INTERVAL 4 DAY), 'ACTIVE', 'Pneumonia',                   'Antibiotics course'),
(21, 1, 20, 2, DATE_SUB(NOW(), INTERVAL 1 DAY), 'ACTIVE', 'Angina Pectoris',             'Under observation'),
(26, 7, 24, 6, DATE_SUB(NOW(), INTERVAL 2 DAY), 'ACTIVE', 'Neonatal Jaundice',           'Phototherapy'),
(30, 8, 30, 7, DATE_SUB(NOW(), INTERVAL 6 HOUR),'ACTIVE', 'Cardiac Arrest - Resuscitated','Ventilator ICU'),
(19, 3, 33, 1, DATE_SUB(NOW(), INTERVAL 1 DAY), 'ACTIVE', 'Burns - 30% body',            'Isolation ward');

-- Past discharged admission
INSERT INTO admissions (patient_id, doctor_id, bed_id, department_id, admission_date, discharge_date, status, diagnosis) VALUES
(1, 1, 1, 2, DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 25 DAY), 'DISCHARGED', 'Chest Pain - Observation'),
(9, 5, 4, 5, DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 17 DAY), 'DISCHARGED', 'Viral Fever');

-- =====================================================
-- DOCTOR SCHEDULES
-- =====================================================
INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, is_available) VALUES
(1, 'MONDAY',    '08:00', '14:00', TRUE),
(1, 'TUESDAY',   '08:00', '14:00', TRUE),
(1, 'WEDNESDAY', '08:00', '14:00', TRUE),
(1, 'THURSDAY',  '08:00', '14:00', TRUE),
(1, 'FRIDAY',    '08:00', '14:00', TRUE),
(2, 'MONDAY',    '08:00', '14:00', TRUE),
(2, 'TUESDAY',   '08:00', '14:00', TRUE),
(2, 'WEDNESDAY', '08:00', '14:00', TRUE),
(3, 'MONDAY',    '06:00', '14:00', TRUE),
(3, 'TUESDAY',   '06:00', '14:00', TRUE),
(3, 'WEDNESDAY', '06:00', '14:00', TRUE),
(3, 'THURSDAY',  '06:00', '14:00', TRUE),
(3, 'FRIDAY',    '06:00', '14:00', TRUE),
(4, 'MONDAY',    '14:00', '22:00', TRUE),
(4, 'WEDNESDAY', '14:00', '22:00', TRUE),
(4, 'FRIDAY',    '14:00', '22:00', TRUE),
(5, 'MONDAY',    '08:00', '16:00', TRUE),
(5, 'TUESDAY',   '08:00', '16:00', TRUE),
(5, 'THURSDAY',  '08:00', '16:00', TRUE),
(6, 'MONDAY',    '14:00', '22:00', TRUE),
(6, 'TUESDAY',   '14:00', '22:00', TRUE),
(6, 'WEDNESDAY', '14:00', '22:00', TRUE),
(7, 'MONDAY',    '22:00', '06:00', TRUE),
(7, 'WEDNESDAY', '22:00', '06:00', TRUE),
(7, 'FRIDAY',    '22:00', '06:00', TRUE),
(8, 'MONDAY',    '14:00', '22:00', TRUE),
(8, 'TUESDAY',   '14:00', '22:00', TRUE),
(9, 'TUESDAY',   '08:00', '14:00', TRUE),
(9, 'THURSDAY',  '08:00', '14:00', TRUE),
(10,'MONDAY',    '08:00', '14:00', TRUE),
(10,'WEDNESDAY', '08:00', '14:00', TRUE),
(11,'MONDAY',    '08:00', '16:00', TRUE),
(11,'TUESDAY',   '08:00', '16:00', TRUE),
(12,'MONDAY',    '08:00', '14:00', TRUE),
(12,'TUESDAY',   '08:00', '14:00', TRUE),
(12,'WEDNESDAY', '08:00', '14:00', TRUE);

-- =====================================================
-- APPOINTMENTS
-- =====================================================
INSERT INTO appointments (patient_id, doctor_id, department_id, appointment_date, appointment_time, status, reason) VALUES
(1,  1, 2, CURDATE(), '09:00:00', 'BOOKED',    'Routine cardiac checkup'),
(2,  5, 5, CURDATE(), '10:00:00', 'BOOKED',    'Fever and body ache'),
(4,  2, 3, CURDATE(), '10:30:00', 'CHECKED_IN','Persistent headaches'),
(8,  1, 2, CURDATE(), '11:00:00', 'BOOKED',    'Follow-up ECG review'),
(9,  6, 4, CURDATE(), '09:30:00', 'COMPLETED', 'Knee pain evaluation'),
(10, 5, 5, CURDATE(), '14:00:00', 'BOOKED',    'Annual physical'),
(14, 2, 3, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:00:00', 'BOOKED', 'MRI review'),
(16, 1, 2, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00:00', 'BOOKED', 'Stress test'),
(22, 7, 6, CURDATE(), '11:30:00', 'BOOKED',    'Vaccination');

-- =====================================================
-- EMERGENCY CASES (some waiting for the demo)
-- =====================================================
INSERT INTO emergency_cases (patient_id, ambulance_id, severity, symptoms, arrival_time, required_specialization, required_bed_type, ventilator_required, status) VALUES
(5,  1, 'CRITICAL',     'Chest pain, shortness of breath, sweating',    DATE_SUB(NOW(), INTERVAL 30 MINUTE), 'Cardiology',        'ICU',     TRUE,  'WAITING'),
(11, 3, 'VERY_SERIOUS', 'Severe head trauma, loss of consciousness',    DATE_SUB(NOW(), INTERVAL 20 MINUTE), 'Neurology',         'ICU',     FALSE, 'WAITING'),
(17, NULL, 'SERIOUS',   'Compound fracture of right leg',               DATE_SUB(NOW(), INTERVAL 45 MINUTE), 'Orthopedics',       'GENERAL', FALSE, 'WAITING'),
(23, 2, 'MODERATE',     'High fever, dehydration, disorientation',      DATE_SUB(NOW(), INTERVAL 1 HOUR),    'General Medicine',  'GENERAL', FALSE, 'WAITING');

-- Already allocated emergency (past)
INSERT INTO emergency_cases (patient_id, ambulance_id, severity, symptoms, arrival_time, required_specialization, required_bed_type, ventilator_required, status, assigned_doctor_id, assigned_bed_id) VALUES
(7,  4, 'CRITICAL', 'Multi-organ failure after accident', DATE_SUB(NOW(), INTERVAL 1 DAY), 'Critical Care', 'ICU', TRUE, 'ALLOCATED', 8, 30);

-- =====================================================
-- CONSULTATIONS
-- =====================================================
INSERT INTO consultations (appointment_id, patient_id, doctor_id, symptoms, diagnosis, notes, consultation_time) VALUES
(5, 9, 6, 'Pain in left knee, swelling for 2 weeks', 'Mild osteoarthritis', 'Prescribed NSAIDs, physiotherapy recommended', DATE_SUB(NOW(), INTERVAL 2 HOUR));

INSERT INTO consultations (patient_id, doctor_id, admission_id, symptoms, diagnosis, notes, consultation_time) VALUES
(3,  1, 1, 'Severe chest pain radiating to left arm', 'Acute MI - STEMI', 'Emergency PCI performed, stent placed', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(7,  8, 3, 'Unconscious, multiple fractures, internal bleeding', 'Polytrauma', 'Emergency surgery completed, on ventilator', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- =====================================================
-- MEDICINES (20+)
-- =====================================================
INSERT INTO medicines (name, category, manufacturer, stock_quantity, unit_price, expiry_date, requires_prescription) VALUES
('Paracetamol 500mg',       'Analgesic',          'Cipla',          1000, 5.00,   '2027-12-31', FALSE),
('Amoxicillin 250mg',       'Antibiotic',         'Sun Pharma',     500,  15.00,  '2027-06-30', TRUE),
('Ibuprofen 400mg',         'NSAID',              'Dr. Reddys',     800,  8.00,   '2027-09-30', FALSE),
('Omeprazole 20mg',         'Antacid',            'Cipla',          300,  12.00,  '2028-01-15', TRUE),
('Aspirin 75mg',            'Antiplatelet',       'Bayer',          1500, 3.00,   '2027-08-01', TRUE),
('Metformin 500mg',         'Antidiabetic',       'USV',            600,  6.00,   '2027-11-20', TRUE),
('Amlodipine 5mg',          'Antihypertensive',   'Pfizer',         400,  7.50,   '2027-03-10', TRUE),
('Cetirizine 10mg',         'Antihistamine',      'Glenmark',       900,  4.00,   '2028-08-05', FALSE),
('Azithromycin 500mg',      'Antibiotic',         'Zydus',          200,  25.00,  '2027-12-01', TRUE),
('Pantoprazole 40mg',       'Antacid',            'Alkem',          450,  14.00,  '2027-05-15', TRUE),
('Atorvastatin 10mg',       'Statin',             'Ranbaxy',        350,  10.00,  '2028-02-28', TRUE),
('Clopidogrel 75mg',        'Antiplatelet',       'Sun Pharma',     250,  18.00,  '2027-07-20', TRUE),
('Metoprolol 50mg',         'Beta Blocker',       'AstraZeneca',    320,  12.00,  '2027-10-15', TRUE),
('Losartan 50mg',           'ARB',                'Torrent',        280,  9.00,   '2028-04-30', TRUE),
('Insulin Glargine',        'Insulin',            'Sanofi',         100,  850.00, '2027-06-15', TRUE),
('Diclofenac Gel',          'Topical NSAID',      'Novartis',       500,  65.00,  '2028-01-20', FALSE),
('Salbutamol Inhaler',      'Bronchodilator',     'Cipla',          150,  120.00, '2027-09-10', TRUE),
('Ranitidine 150mg',        'H2 Blocker',         'Glenmark',       400,  8.00,   '2027-11-30', TRUE),
('Ciprofloxacin 500mg',     'Antibiotic',         'Ranbaxy',        300,  20.00,  '2027-08-25', TRUE),
('Prednisolone 5mg',        'Corticosteroid',     'Wyeth',          200,  6.00,   '2028-03-15', TRUE),
('Morphine Sulphate 10mg',  'Opioid Analgesic',   'Neon Labs',      50,   45.00,  '2027-04-20', TRUE),
('Heparin 5000IU',          'Anticoagulant',      'Biological E',   80,   180.00, '2027-07-10', TRUE);

-- =====================================================
-- PRESCRIPTIONS
-- =====================================================
INSERT INTO prescriptions (consultation_id, patient_id, doctor_id, prescription_date, status, notes) VALUES
(1, 9, 6, NOW(), 'CREATED',   'Take with food'),
(2, 3, 1, DATE_SUB(NOW(), INTERVAL 2 DAY), 'DISPENSED', 'Post-PCI medications');

INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, duration, quantity) VALUES
(1, 3,  '400mg',  'Twice daily',  '7 days',   14),
(1, 16, 'Apply',  'Three times daily', '14 days', 1),
(2, 5,  '75mg',   'Once daily',   '30 days',  30),
(2, 12, '75mg',   'Once daily',   '30 days',  30),
(2, 13, '50mg',   'Twice daily',  '30 days',  60),
(2, 11, '10mg',   'Once at night','30 days',  30);

-- =====================================================
-- LAB TESTS CATALOG
-- =====================================================
INSERT INTO lab_tests (name, category, department_id, normal_range, unit, cost) VALUES
('Complete Blood Count (CBC)',     'Hematology',   9, '4500-11000',      'cells/mcL',  400.00),
('Lipid Profile',                  'Biochemistry', 9, 'Varies',          'mg/dL',      800.00),
('Liver Function Test (LFT)',      'Biochemistry', 9, 'Varies',          'U/L',        650.00),
('Kidney Function Test (KFT)',     'Biochemistry', 9, 'Varies',          'mg/dL',      700.00),
('Blood Glucose Fasting',         'Biochemistry', 9, '70-100',          'mg/dL',      150.00),
('HbA1c',                         'Biochemistry', 9, '4.0-5.6',         '%',          550.00),
('Thyroid Profile (T3, T4, TSH)', 'Endocrine',    9, 'Varies',          'Various',    750.00),
('Chest X-Ray',                   'Radiology',    8, 'Normal',          'N/A',        600.00),
('CT Scan - Head',                'Radiology',    8, 'Normal',          'N/A',        3500.00),
('MRI - Brain',                   'Radiology',    8, 'Normal',          'N/A',        8500.00),
('ECG',                           'Cardiology',   2, 'Normal Sinus Rhythm','N/A',     300.00),
('Echocardiography',              'Cardiology',   2, 'EF > 55%',        '%',          2500.00),
('Urine Routine',                 'Pathology',    9, 'Normal',          'N/A',        200.00),
('Blood Culture',                 'Microbiology', 9, 'No growth',       'N/A',        800.00),
('Troponin I',                    'Cardiology',   2, '<0.04',           'ng/mL',      1200.00);

-- =====================================================
-- LAB ORDERS
-- =====================================================
INSERT INTO lab_orders (consultation_id, patient_id, doctor_id, test_id, order_date, status, priority) VALUES
(2, 3, 1, 11, DATE_SUB(NOW(), INTERVAL 2 DAY), 'COMPLETED', 'STAT'),
(2, 3, 1, 15, DATE_SUB(NOW(), INTERVAL 2 DAY), 'COMPLETED', 'STAT'),
(2, 3, 1, 2,  DATE_SUB(NOW(), INTERVAL 2 DAY), 'COMPLETED', 'URGENT'),
(3, 7, 8, 1,  DATE_SUB(NOW(), INTERVAL 1 DAY), 'PROCESSING','STAT'),
(3, 7, 8, 9,  DATE_SUB(NOW(), INTERVAL 1 DAY), 'COMPLETED', 'STAT'),
(1, 9, 6, 1,  NOW(), 'ORDERED', 'NORMAL');

-- =====================================================
-- LAB RESULTS
-- =====================================================
INSERT INTO lab_results (order_id, result_value, result_date, technician_notes, reviewed_by_doctor, reviewed_at) VALUES
(1, 'Normal Sinus Rhythm, ST elevation in V1-V4', DATE_SUB(NOW(), INTERVAL 2 DAY), 'Urgent findings communicated', TRUE, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(2, 'Troponin I: 2.8 ng/mL (ELEVATED)',           DATE_SUB(NOW(), INTERVAL 2 DAY), 'Significantly elevated, consistent with MI', TRUE, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(3, 'Total Cholesterol: 245, LDL: 160, HDL: 38, Triglycerides: 220', DATE_SUB(NOW(), INTERVAL 2 DAY), 'Dyslipidemia noted', TRUE, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(5, 'No midline shift, subdural hematoma left temporal region', DATE_SUB(NOW(), INTERVAL 1 DAY), 'Neurosurgery consultation recommended', TRUE, DATE_SUB(NOW(), INTERVAL 1 DAY));

-- =====================================================
-- BILLS
-- =====================================================
INSERT INTO bills (patient_id, admission_id, bill_date, total_amount, paid_amount, status, payment_method) VALUES
(3,  1,  DATE_SUB(NOW(), INTERVAL 2 DAY), 125000.00, 50000.00, 'PARTIAL', 'UPI'),
(7,  3,  DATE_SUB(NOW(), INTERVAL 1 DAY), 85000.00,  0.00,     'PENDING', NULL),
(12, 4,  DATE_SUB(NOW(), INTERVAL 5 DAY), 35000.00,  35000.00, 'PAID',    'Card'),
(9,  NULL, NOW(), 1500.00, 1500.00, 'PAID', 'Cash');

INSERT INTO bill_items (bill_id, description, category, quantity, unit_price, total_price) VALUES
(1, 'ICU Bed Charges (2 days)',      'ICU',          2, 15000.00, 30000.00),
(1, 'Emergency PCI Procedure',      'PROCEDURE',    1, 75000.00, 75000.00),
(1, 'Cardiologist Consultation',     'CONSULTATION', 1, 2000.00,  2000.00),
(1, 'ECG',                          'LABORATORY',   1, 300.00,   300.00),
(1, 'Troponin I Test',              'LABORATORY',   1, 1200.00,  1200.00),
(1, 'Lipid Profile',                'LABORATORY',   1, 800.00,   800.00),
(1, 'Medications (Aspirin, Clopidogrel, etc.)', 'MEDICINE', 1, 15700.00, 15700.00),
(2, 'ICU Bed Charges (1 day)',      'ICU',          1, 15000.00, 15000.00),
(2, 'Emergency Surgery',            'PROCEDURE',    1, 60000.00, 60000.00),
(2, 'CT Scan Head',                 'LABORATORY',   1, 3500.00,  3500.00),
(2, 'CBC',                          'LABORATORY',   1, 400.00,   400.00),
(2, 'Intensivist Consultation',     'CONSULTATION', 2, 2000.00,  4000.00),
(2, 'Medications',                  'MEDICINE',     1, 2100.00,  2100.00),
(3, 'General Bed Charges (5 days)', 'BED',          5, 3000.00,  15000.00),
(3, 'Orthopedic Consultation',      'CONSULTATION', 2, 1500.00,  3000.00),
(3, 'X-Ray',                        'LABORATORY',   2, 600.00,   1200.00),
(3, 'Medications & Cast',           'MEDICINE',     1, 15800.00, 15800.00),
(4, 'OPD Consultation',             'CONSULTATION', 1, 800.00,   800.00),
(4, 'Medications',                  'MEDICINE',     1, 700.00,   700.00);
INSERT INTO users (username, password_hash, role, full_name, email, phone) VALUES 
('lab_staff', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'LABORATORY', 'Laboratory Technician', 'lab@hospital.com', '9999999991'), 
('pharmacy_staff', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'PHARMACY', 'Pharmacist', 'pharmacy@hospital.com', '9999999992');
