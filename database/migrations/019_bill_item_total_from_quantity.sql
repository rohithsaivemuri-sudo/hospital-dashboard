-- 019_bill_item_total_from_quantity.sql — BCNF step A5 (docs/bcnf-analysis.md), additive part.
--
-- bill_items.total_price is always quantity * unit_price: (quantity, unit_price) -> total_price, whose
-- left side is not a key (a 3NF violation). The value is to be computed, not stored: a later migration
-- turns the column into a generated column. Until then this migration checks that every row already
-- satisfies the rule (stopping with an error otherwise), gives the column that expression as its
-- default so writers can stop supplying it, and redefines sp_generate_bill without it.
-- Safe to re-run.

DELIMITER //
DROP PROCEDURE IF EXISTS mig019_bill_item_total //
CREATE PROCEDURE mig019_bill_item_total()
BEGIN
  DECLARE mismatched INT DEFAULT 0;
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bill_items' AND COLUMN_NAME = 'total_price' AND GENERATION_EXPRESSION = '') THEN
    SELECT COUNT(*) INTO mismatched FROM bill_items WHERE total_price <> quantity * unit_price;
    IF mismatched > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '019: some bill items have total_price <> quantity * unit_price; correct them before this migration';
    END IF;
    ALTER TABLE bill_items ALTER COLUMN total_price SET DEFAULT (quantity * unit_price);
  END IF;
END //

DROP PROCEDURE IF EXISTS sp_generate_bill //
CREATE PROCEDURE sp_generate_bill(IN p_admission_id INT)
BEGIN
    DECLARE v_patient_id INT;
    DECLARE v_bill_id INT;
    DECLARE v_total DECIMAL(12,2) DEFAULT 0;

    SELECT patient_id INTO v_patient_id FROM admissions WHERE admission_id = p_admission_id;

    INSERT INTO bills (patient_id, admission_id, bill_date, status)
    VALUES (v_patient_id, p_admission_id, NOW(), 'PENDING');

    SET v_bill_id = LAST_INSERT_ID();

    -- Generic consultation fee; total_price is quantity * unit_price.
    INSERT INTO bill_items (bill_id, description, category, quantity, unit_price)
    VALUES (v_bill_id, 'Base Consultation Fee', 'CONSULTATION', 1, 500.00);

    SELECT SUM(total_price) INTO v_total FROM bill_items WHERE bill_id = v_bill_id;

    UPDATE bills SET total_amount = v_total WHERE bill_id = v_bill_id;
END //
DELIMITER ;
CALL mig019_bill_item_total();
DROP PROCEDURE mig019_bill_item_total;

-- Verification output: every bill item's total equals quantity * unit_price.
SELECT '019 verification' AS step, COUNT(*) AS bill_items, SUM(total_price = quantity * unit_price) AS consistent FROM bill_items;
