-- 006_medicine_batches.sql — pharmacy lot tracking and FEFO dispensing (report Section F.3).
-- Additive: new tables medicine_batches and prescription_item_batches, a nullable batch_id on
-- pharmacy_stock_movements, and view v_current_stock. medicines.stock_quantity is KEPT: it stays
-- the per-medicine total and the application keeps it equal to SUM(medicine_batches.quantity)
-- in the same transaction as every stock change.
--
-- Backfill: one LEGACY-<medicine_id> batch per medicine with stock, holding its current stock and
-- expiry date. Safe to re-run: guarded DDL, and medicines that already have a batch are skipped.
-- The migration refuses to run if any medicine with stock has a NULL or past expiry date: how
-- that stock is handled has to be decided first.

CREATE TABLE IF NOT EXISTS medicine_batches (
  batch_id INT NOT NULL AUTO_INCREMENT,
  medicine_id INT NOT NULL,
  batch_number VARCHAR(50) NOT NULL,
  quantity INT NOT NULL,
  expiry_date DATE NOT NULL,
  received_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id),
  UNIQUE KEY uq_medicine_batches_number (medicine_id, batch_number),
  KEY idx_medicine_batches_fefo (medicine_id, expiry_date, batch_id),  -- FEFO lock query
  CONSTRAINT fk_medicine_batches_medicine FOREIGN KEY (medicine_id) REFERENCES medicines (medicine_id) ON DELETE RESTRICT,
  CONSTRAINT fk_medicine_batches_received_by FOREIGN KEY (received_by) REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT chk_medicine_batches_quantity CHECK (quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Which batches each dispensed prescription item came from.
CREATE TABLE IF NOT EXISTS prescription_item_batches (
  id INT NOT NULL AUTO_INCREMENT,
  item_id INT NOT NULL,
  batch_id INT NOT NULL,
  quantity INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prescription_item_batches (item_id, batch_id),
  KEY idx_prescription_item_batches_batch (batch_id),
  CONSTRAINT fk_pib_item FOREIGN KEY (item_id) REFERENCES prescription_items (item_id) ON DELETE RESTRICT,
  CONSTRAINT fk_pib_batch FOREIGN KEY (batch_id) REFERENCES medicine_batches (batch_id) ON DELETE RESTRICT,
  CONSTRAINT chk_pib_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER //
DROP PROCEDURE IF EXISTS mig006_prepare //
CREATE PROCEDURE mig006_prepare()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_stock_movements' AND COLUMN_NAME = 'batch_id') THEN
    ALTER TABLE pharmacy_stock_movements ADD COLUMN batch_id INT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_stock_movements' AND INDEX_NAME = 'idx_stock_movement_batch') THEN
    ALTER TABLE pharmacy_stock_movements ADD INDEX idx_stock_movement_batch (batch_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                 WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_stock_movements' AND CONSTRAINT_NAME = 'fk_stock_movement_batch') THEN
    ALTER TABLE pharmacy_stock_movements ADD CONSTRAINT fk_stock_movement_batch FOREIGN KEY (batch_id) REFERENCES medicine_batches (batch_id) ON DELETE RESTRICT;
  END IF;
  -- Stop before any data change if stock exists without a usable expiry date.
  IF EXISTS (SELECT 1 FROM medicines m
             WHERE m.stock_quantity > 0 AND (m.expiry_date IS NULL OR m.expiry_date < CURDATE())
               AND NOT EXISTS (SELECT 1 FROM medicine_batches b WHERE b.medicine_id = m.medicine_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '006: medicines with stock have a NULL or past expiry_date; decide how to handle them before backfilling batches';
  END IF;
END //
DELIMITER ;
CALL mig006_prepare();
DROP PROCEDURE mig006_prepare;

CREATE OR REPLACE VIEW v_current_stock AS
SELECT m.medicine_id, m.name, m.stock_quantity,
       COALESCE(SUM(b.quantity), 0) AS batch_total,
       COALESCE(SUM(CASE WHEN b.expiry_date >= CURDATE() THEN b.quantity END), 0) AS usable_quantity,
       COALESCE(SUM(CASE WHEN b.expiry_date < CURDATE() THEN b.quantity END), 0) AS expired_quantity,
       MIN(CASE WHEN b.quantity > 0 AND b.expiry_date >= CURDATE() THEN b.expiry_date END) AS next_expiry
FROM medicines m
LEFT JOIN medicine_batches b ON b.medicine_id = m.medicine_id
GROUP BY m.medicine_id, m.name, m.stock_quantity;

START TRANSACTION;
INSERT INTO medicine_batches (medicine_id, batch_number, quantity, expiry_date, received_date)
SELECT m.medicine_id, CONCAT('LEGACY-', m.medicine_id), m.stock_quantity, m.expiry_date, m.created_at
FROM medicines m
WHERE m.stock_quantity > 0
  AND NOT EXISTS (SELECT 1 FROM medicine_batches b WHERE b.medicine_id = m.medicine_id);
SET @batches_created = ROW_COUNT();
INSERT INTO audit_logs (action, entity_type, outcome, path, details)
SELECT 'MIGRATION_BACKFILL', 'medicine_batches', 'SUCCESS', '006_medicine_batches.sql', JSON_OBJECT('batches_created', @batches_created)
WHERE @batches_created > 0;
COMMIT;
