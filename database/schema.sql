CREATE DATABASE IF NOT EXISTS hospital_db;
USE hospital_db;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS bill_items;
DROP TABLE IF EXISTS bills;
DROP TABLE IF EXISTS lab_results;
DROP TABLE IF EXISTS lab_orders;
DROP TABLE IF EXISTS lab_tests;
DROP TABLE IF EXISTS prescription_items;
DROP TABLE IF EXISTS prescriptions;
DROP TABLE IF EXISTS medicines;
DROP TABLE IF EXISTS bed_assignment_log;
DROP TABLE IF EXISTS admissions;
DROP TABLE IF EXISTS consultations;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS doctor_schedules;
DROP TABLE IF EXISTS emergency_cases;
DROP TABLE IF EXISTS ambulances;
DROP TABLE IF EXISTS beds;
DROP TABLE IF EXISTS wards;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS doctors;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE', 'LABORATORY', 'PHARMACY') NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE departments (
    department_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    floor INT NOT NULL,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE doctors (
    doctor_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    department_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    specialization VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    status ENUM('AVAILABLE', 'BUSY', 'OFF_DUTY', 'ON_LEAVE') DEFAULT 'AVAILABLE',
    shift ENUM('MORNING', 'AFTERNOON', 'NIGHT') NOT NULL,
    current_workload INT DEFAULT 0,
    max_workload INT DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
    CHECK (current_workload <= max_workload AND current_workload >= 0)
) ENGINE=InnoDB;

CREATE TABLE patients (
    patient_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
    blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
    phone VARCHAR(20),
    address TEXT,
    emergency_contact VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE wards (
    ward_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    department_id INT NOT NULL,
    floor INT NOT NULL,
    capacity INT NOT NULL,
    ward_type VARCHAR(50),
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE beds (
    bed_id INT AUTO_INCREMENT PRIMARY KEY,
    ward_id INT NOT NULL,
    bed_number VARCHAR(20) NOT NULL,
    floor INT NOT NULL,
    bed_type ENUM('GENERAL', 'ICU', 'NICU', 'ISOLATION', 'VENTILATOR_ICU') NOT NULL,
    status ENUM('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RESERVED') DEFAULT 'AVAILABLE',
    has_ventilator BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (ward_id) REFERENCES wards(ward_id) ON DELETE RESTRICT,
    UNIQUE (ward_id, bed_number)
) ENGINE=InnoDB;

CREATE TABLE ambulances (
    ambulance_id INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_number VARCHAR(20) UNIQUE NOT NULL,
    driver_name VARCHAR(100) NOT NULL,
    driver_phone VARCHAR(20) NOT NULL,
    current_location VARCHAR(255),
    status ENUM('AVAILABLE', 'EN_ROUTE', 'ARRIVED', 'IN_SERVICE', 'MAINTENANCE') DEFAULT 'AVAILABLE'
) ENGINE=InnoDB;

CREATE TABLE emergency_cases (
    emergency_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT,
    ambulance_id INT,
    severity ENUM('CRITICAL', 'VERY_SERIOUS', 'SERIOUS', 'MODERATE', 'STABLE') NOT NULL,
    symptoms TEXT NOT NULL,
    arrival_time DATETIME NOT NULL,
    required_specialization VARCHAR(100),
    required_bed_type ENUM('GENERAL', 'ICU', 'NICU', 'ISOLATION', 'VENTILATOR_ICU'),
    ventilator_required BOOLEAN DEFAULT FALSE,
    status ENUM('WAITING', 'TRIAGED', 'ALLOCATED', 'ADMITTED', 'DISCHARGED', 'CANCELLED') DEFAULT 'WAITING',
    assigned_doctor_id INT,
    assigned_bed_id INT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE RESTRICT,
    FOREIGN KEY (ambulance_id) REFERENCES ambulances(ambulance_id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_doctor_id) REFERENCES doctors(doctor_id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_bed_id) REFERENCES beds(bed_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE doctor_schedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT NOT NULL,
    day_of_week ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    UNIQUE (doctor_id, day_of_week, start_time)
) ENGINE=InnoDB;

CREATE TABLE appointments (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    department_id INT NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    status ENUM('BOOKED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW') DEFAULT 'BOOKED',
    reason TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE RESTRICT,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE RESTRICT,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
    UNIQUE (doctor_id, appointment_date, appointment_time)
) ENGINE=InnoDB;

CREATE TABLE admissions (
    admission_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    bed_id INT NOT NULL,
    department_id INT NOT NULL,
    emergency_id INT,
    admission_date DATETIME NOT NULL,
    discharge_date DATETIME,
    status ENUM('ACTIVE', 'DISCHARGED', 'TRANSFERRED') DEFAULT 'ACTIVE',
    diagnosis TEXT NOT NULL,
    
    
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE RESTRICT,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE RESTRICT,
    FOREIGN KEY (bed_id) REFERENCES beds(bed_id) ON DELETE RESTRICT,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
    FOREIGN KEY (emergency_id) REFERENCES emergency_cases(emergency_id) ON DELETE SET NULL,
    CHECK (discharge_date IS NULL OR discharge_date >= admission_date)
) ENGINE=InnoDB;

CREATE TABLE consultations (
    consultation_id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    admission_id INT,
    symptoms TEXT NOT NULL,
    diagnosis TEXT NOT NULL,
    assessment TEXT,
    plan TEXT,
    notes TEXT,
    consultation_time DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE RESTRICT,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE RESTRICT,
    FOREIGN KEY (admission_id) REFERENCES admissions(admission_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE medicines (
    medicine_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    manufacturer VARCHAR(150),
    stock_quantity INT DEFAULT 0,
    unit_price DECIMAL(10,2) NOT NULL,
    expiry_date DATE NOT NULL,
    requires_prescription BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (stock_quantity >= 0),
    CHECK (unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE prescriptions (
    prescription_id INT AUTO_INCREMENT PRIMARY KEY,
    consultation_id INT NULL,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    prescription_date DATETIME NOT NULL,
    status ENUM('CREATED', 'DISPENSED', 'PARTIALLY_DISPENSED', 'CANCELLED') DEFAULT 'CREATED',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (consultation_id) REFERENCES consultations(consultation_id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE RESTRICT,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE prescription_items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    prescription_id INT NOT NULL,
    medicine_id INT NOT NULL,
    dosage VARCHAR(50) NOT NULL,
    frequency VARCHAR(50) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    quantity INT NOT NULL,
    dispensed BOOLEAN DEFAULT FALSE,
    dispensed_at DATETIME,
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(prescription_id) ON DELETE CASCADE,
    FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id) ON DELETE RESTRICT,
    CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE lab_tests (
    test_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    department_id INT,
    normal_range VARCHAR(100),
    unit VARCHAR(50),
    cost DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE SET NULL,
    CHECK (cost >= 0)
) ENGINE=InnoDB;

CREATE TABLE lab_orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    consultation_id INT,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    test_id INT NOT NULL,
    order_date DATETIME NOT NULL,
    status ENUM('ORDERED', 'SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED', 'CANCELLED') DEFAULT 'ORDERED',
    priority ENUM('NORMAL', 'URGENT', 'STAT') DEFAULT 'NORMAL',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (consultation_id) REFERENCES consultations(consultation_id) ON DELETE SET NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE RESTRICT,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE RESTRICT,
    FOREIGN KEY (test_id) REFERENCES lab_tests(test_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE lab_results (
    result_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL UNIQUE,
    result_value TEXT NOT NULL,
    result_date DATETIME NOT NULL,
    technician_notes TEXT,
    reviewed_by_doctor BOOLEAN DEFAULT FALSE,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES lab_orders(order_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE bills (
    bill_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    admission_id INT,
    bill_date DATETIME NOT NULL,
    total_amount DECIMAL(12,2) DEFAULT 0,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    status ENUM('PENDING', 'PARTIAL', 'PAID', 'CANCELLED') DEFAULT 'PENDING',
    payment_method VARCHAR(50),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE RESTRICT,
    FOREIGN KEY (admission_id) REFERENCES admissions(admission_id) ON DELETE CASCADE,
    CHECK (total_amount >= 0),
    CHECK (paid_amount >= 0 AND paid_amount <= total_amount)
) ENGINE=InnoDB;

CREATE TABLE bill_items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    bill_id INT NOT NULL,
    description VARCHAR(255) NOT NULL,
    category ENUM('CONSULTATION', 'BED', 'ICU', 'LABORATORY', 'MEDICINE', 'PROCEDURE', 'AMBULANCE', 'OTHER') NOT NULL,
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bill_id) REFERENCES bills(bill_id) ON DELETE CASCADE,
    CHECK (quantity > 0),
    CHECK (unit_price >= 0),
    CHECK (total_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE bed_assignment_log (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    bed_id INT NOT NULL,
    patient_id INT NOT NULL,
    admission_id INT NOT NULL,
    assigned_at DATETIME NOT NULL,
    released_at DATETIME,
    status ENUM('ACTIVE', 'RELEASED') DEFAULT 'ACTIVE',
    FOREIGN KEY (bed_id) REFERENCES beds(bed_id) ON DELETE RESTRICT,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE RESTRICT,
    FOREIGN KEY (admission_id) REFERENCES admissions(admission_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS doctor_daily_analytics (
    analytics_id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT NOT NULL,
    analytics_date DATE NOT NULL,
    patients_seen INT DEFAULT 0,
    emergency_cases INT DEFAULT 0,
    appointment_patients INT DEFAULT 0,
    patients_treated INT DEFAULT 0,
    cases_solved INT DEFAULT 0,
    cases_postponed INT DEFAULT 0,
    cases_cancelled INT DEFAULT 0,
    cases_pending INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_doctor_date (doctor_id, analytics_date),
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE surgery_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,
    diagnosis TEXT NOT NULL,
    priority ENUM('ROUTINE', 'URGENT', 'EMERGENCY') DEFAULT 'ROUTINE',
    requested_date DATE NOT NULL,
    status ENUM('REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'REQUESTED',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE
) ENGINE=InnoDB;
USE hospital_db;

-- Lab Results enhancements
ALTER TABLE lab_results 
ADD COLUMN unit VARCHAR(50) AFTER result_value,
ADD COLUMN reference_range VARCHAR(100) AFTER unit,
ADD COLUMN interpretation TEXT AFTER reference_range;

-- Lab Reports for file upload
CREATE TABLE lab_reports (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    result_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INT NOT NULL,
    uploaded_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_id) REFERENCES lab_results(result_id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Medicine Reorder Level
ALTER TABLE medicines
ADD COLUMN reorder_level INT DEFAULT 20 AFTER stock_quantity;

-- Pharmacy Transactions for Audit
CREATE TABLE pharmacy_transactions (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    medicine_id INT NOT NULL,
    transaction_type ENUM('DISPENSE', 'RECEIVE', 'ADJUSTMENT') NOT NULL,
    quantity INT NOT NULL,
    reason VARCHAR(100),
    notes TEXT,
    user_id INT,
    reference_id INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;
