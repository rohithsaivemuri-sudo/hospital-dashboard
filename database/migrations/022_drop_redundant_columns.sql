-- 022_drop_redundant_columns.sql — BCNF steps A1, A2, A3 and A5 (docs/bcnf-analysis.md), final part.
--
-- Migrations 015, 016, 017 and 019 checked the data and moved every reader and writer off the stored
-- copies. This one removes them:
--   A1  beds.floor                          (read from wards.floor)
--   A2  appointments.department_id          (read from doctors.department_id, through v_appointments)
--   A3  medication_administrations.patient_id (read through prescription_items -> prescriptions)
--   A5  bill_items.total_price becomes GENERATED ALWAYS AS (quantity * unit_price) VIRTUAL
-- Each step re-checks its rule first and stops with an error if a row written since then breaks it.
-- Safe to re-run: every step is skipped once done.

DELIMITER //
DROP PROCEDURE IF EXISTS mig022_drop //
CREATE PROCEDURE mig022_drop()
BEGIN
  -- A1: beds.floor
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'beds' AND COLUMN_NAME = 'floor') THEN
    IF EXISTS (SELECT 1 FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE b.floor IS NOT NULL AND b.floor <> w.floor) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '022: a bed''s floor differs from its ward''s floor';
    END IF;
    ALTER TABLE beds DROP COLUMN floor;
  END IF;

  -- A2: appointments.department_id (its foreign key and index go first)
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'department_id') THEN
    IF EXISTS (SELECT 1 FROM appointments a JOIN doctors d ON d.doctor_id = a.doctor_id WHERE a.department_id IS NOT NULL AND a.department_id <> d.department_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '022: an appointment''s department differs from its doctor''s';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND CONSTRAINT_NAME = 'appointments_ibfk_3') THEN
      ALTER TABLE appointments DROP FOREIGN KEY appointments_ibfk_3;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND INDEX_NAME = 'department_id') THEN
      ALTER TABLE appointments DROP INDEX department_id;
    END IF;
    ALTER TABLE appointments DROP COLUMN department_id;
  END IF;

  -- A3: medication_administrations.patient_id (its foreign key and index go first)
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medication_administrations' AND COLUMN_NAME = 'patient_id') THEN
    IF EXISTS (SELECT 1 FROM medication_administrations ma JOIN prescription_items pi ON pi.item_id = ma.prescription_item_id
               JOIN prescriptions p ON p.prescription_id = pi.prescription_id WHERE ma.patient_id IS NOT NULL AND ma.patient_id <> p.patient_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '022: a dose''s patient differs from its prescription''s';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'medication_administrations' AND CONSTRAINT_NAME = 'fk_mar_patient') THEN
      ALTER TABLE medication_administrations DROP FOREIGN KEY fk_mar_patient;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medication_administrations' AND INDEX_NAME = 'idx_mar_patient_time') THEN
      ALTER TABLE medication_administrations DROP INDEX idx_mar_patient_time;
    END IF;
    ALTER TABLE medication_administrations DROP COLUMN patient_id;
  END IF;

  -- A5: bill_items.total_price, stored -> generated (a stored column cannot be altered into a
  -- VIRTUAL one, so it is dropped and re-added in the same place with its CHECK).
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bill_items' AND COLUMN_NAME = 'total_price' AND GENERATION_EXPRESSION = '') THEN
    IF EXISTS (SELECT 1 FROM bill_items WHERE total_price <> quantity * unit_price) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '022: a bill item''s total differs from quantity * unit_price';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'bill_items' AND CONSTRAINT_NAME = 'bill_items_chk_3') THEN
      ALTER TABLE bill_items DROP CHECK bill_items_chk_3;
    END IF;
    ALTER TABLE bill_items DROP COLUMN total_price;
    ALTER TABLE bill_items
      ADD COLUMN total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) VIRTUAL NOT NULL AFTER unit_price,
      ADD CONSTRAINT bill_items_chk_3 CHECK (total_price >= 0);
  END IF;
END //
DELIMITER ;
CALL mig022_drop();
DROP PROCEDURE mig022_drop;
