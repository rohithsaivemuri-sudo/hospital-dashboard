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
