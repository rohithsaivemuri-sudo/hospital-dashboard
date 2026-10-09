USE hospital_db;

ALTER TABLE lab_results
  ADD COLUMN unit VARCHAR(50) NULL AFTER result_value,
  ADD COLUMN reference_range VARCHAR(100) NULL AFTER unit,
  ADD COLUMN interpretation ENUM('NORMAL', 'LOW', 'HIGH', 'CRITICAL') NULL AFTER reference_range,
  ADD COLUMN performed_by INT NULL AFTER technician_notes,
  ADD CONSTRAINT fk_lab_results_performed_by FOREIGN KEY (performed_by) REFERENCES users(user_id) ON DELETE SET NULL;

CREATE TABLE lab_result_attachments (
  attachment_id INT AUTO_INCREMENT PRIMARY KEY,
  result_id INT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT NOT NULL,
  uploaded_by INT NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (result_id) REFERENCES lab_results(result_id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  INDEX idx_lab_attachment_result (result_id)
) ENGINE=InnoDB;

ALTER TABLE medicines ADD COLUMN reorder_level INT NOT NULL DEFAULT 50 AFTER stock_quantity;

CREATE TABLE pharmacy_stock_movements (
  movement_id INT AUTO_INCREMENT PRIMARY KEY,
  medicine_id INT NOT NULL,
  movement_type ENUM('RECEIPT', 'ADJUSTMENT') NOT NULL,
  quantity INT NOT NULL,
  reason VARCHAR(50) NULL,
  notes TEXT NULL,
  performed_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id) ON DELETE RESTRICT,
  FOREIGN KEY (performed_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  INDEX idx_stock_movement_medicine (medicine_id)
) ENGINE=InnoDB;
