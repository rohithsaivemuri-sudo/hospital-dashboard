-- 018_context_composite_fks.sql — BCNF step A4 (docs/bcnf-analysis.md).
--
-- Eight tables keep a patient (or doctor, or medicine) next to a nullable link to the visit, stay,
-- appointment, note or batch that already holds it, e.g. lab_orders.encounter_id -> patient_id.
-- Decomposing them would lose the patient of every row without that link and rewrite the access
-- rules built on these columns, so the copies stay; instead the database now makes them agree.
-- Each parent gets a UNIQUE key over its id and the copied columns, and each child a composite
-- foreign key to it (named fk_ctx_*). InnoDB checks a composite foreign key only when none of its
-- columns is NULL, so rows without the link are unaffected. The single-column foreign keys stay
-- (they carry the ON DELETE rules); the new ones are ON DELETE RESTRICT.
--
-- The migration first counts rows whose copy disagrees with the parent and stops with an error if
-- there is any, so it never changes data. Safe to re-run: every key is added only if missing.

-- Verification output: rows whose copied columns disagree with their parent (all must be 0).
SELECT '018 check' AS step,
  (SELECT COUNT(*) FROM consultations c JOIN encounters e ON e.encounter_id = c.encounter_id WHERE c.patient_id <> e.patient_id OR c.doctor_id <> e.doctor_id) AS consultations_encounter,
  (SELECT COUNT(*) FROM consultations c JOIN appointments a ON a.appointment_id = c.appointment_id WHERE c.patient_id <> a.patient_id OR c.doctor_id <> a.doctor_id) AS consultations_appointment,
  (SELECT COUNT(*) FROM consultations c JOIN admissions a ON a.admission_id = c.admission_id WHERE c.patient_id <> a.patient_id) AS consultations_admission,
  (SELECT COUNT(*) FROM lab_orders o JOIN encounters e ON e.encounter_id = o.encounter_id WHERE o.patient_id <> e.patient_id OR o.doctor_id <> e.doctor_id) AS lab_orders_encounter,
  (SELECT COUNT(*) FROM lab_orders o JOIN admissions a ON a.admission_id = o.admission_id WHERE o.patient_id <> a.patient_id) AS lab_orders_admission,
  (SELECT COUNT(*) FROM lab_orders o JOIN consultations c ON c.consultation_id = o.consultation_id WHERE o.patient_id <> c.patient_id) AS lab_orders_consultation,
  (SELECT COUNT(*) FROM prescriptions o JOIN encounters e ON e.encounter_id = o.encounter_id WHERE o.patient_id <> e.patient_id OR o.doctor_id <> e.doctor_id) AS prescriptions_encounter,
  (SELECT COUNT(*) FROM prescriptions o JOIN admissions a ON a.admission_id = o.admission_id WHERE o.patient_id <> a.patient_id) AS prescriptions_admission,
  (SELECT COUNT(*) FROM prescriptions o JOIN consultations c ON c.consultation_id = o.consultation_id WHERE o.patient_id <> c.patient_id) AS prescriptions_consultation,
  (SELECT COUNT(*) FROM surgery_requests s JOIN encounters e ON e.encounter_id = s.encounter_id WHERE s.patient_id <> e.patient_id OR s.doctor_id <> e.doctor_id) AS surgery_encounter,
  (SELECT COUNT(*) FROM vital_signs v JOIN encounters e ON e.encounter_id = v.encounter_id WHERE v.patient_id <> e.patient_id) AS vitals_encounter,
  (SELECT COUNT(*) FROM vital_signs v JOIN admissions a ON a.admission_id = v.admission_id WHERE v.patient_id <> a.patient_id) AS vitals_admission,
  (SELECT COUNT(*) FROM encounters e JOIN admissions a ON a.admission_id = e.admission_id WHERE e.patient_id <> a.patient_id) AS encounters_admission,
  (SELECT COUNT(*) FROM pharmacy_stock_movements s JOIN medicine_batches b ON b.batch_id = s.batch_id WHERE s.medicine_id <> b.medicine_id) AS stock_movements_batch,
  (SELECT COUNT(*) FROM bills b JOIN admissions a ON a.admission_id = b.admission_id WHERE b.patient_id <> a.patient_id) AS bills_admission;

DELIMITER //
DROP PROCEDURE IF EXISTS mig018_add_key //
CREATE PROCEDURE mig018_add_key(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_name) THEN
    SET @mig018_sql = CONCAT('ALTER TABLE ', p_table, ' ', p_ddl);
    PREPARE stmt FROM @mig018_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //

DROP PROCEDURE IF EXISTS mig018_context_fks //
CREATE PROCEDURE mig018_context_fks()
BEGIN
  DECLARE bad INT DEFAULT 0;
  SELECT
    (SELECT COUNT(*) FROM consultations c JOIN encounters e ON e.encounter_id = c.encounter_id WHERE c.patient_id <> e.patient_id OR c.doctor_id <> e.doctor_id)
  + (SELECT COUNT(*) FROM consultations c JOIN appointments a ON a.appointment_id = c.appointment_id WHERE c.patient_id <> a.patient_id OR c.doctor_id <> a.doctor_id)
  + (SELECT COUNT(*) FROM consultations c JOIN admissions a ON a.admission_id = c.admission_id WHERE c.patient_id <> a.patient_id)
  + (SELECT COUNT(*) FROM lab_orders o JOIN encounters e ON e.encounter_id = o.encounter_id WHERE o.patient_id <> e.patient_id OR o.doctor_id <> e.doctor_id)
  + (SELECT COUNT(*) FROM lab_orders o JOIN admissions a ON a.admission_id = o.admission_id WHERE o.patient_id <> a.patient_id)
  + (SELECT COUNT(*) FROM lab_orders o JOIN consultations c ON c.consultation_id = o.consultation_id WHERE o.patient_id <> c.patient_id)
  + (SELECT COUNT(*) FROM prescriptions o JOIN encounters e ON e.encounter_id = o.encounter_id WHERE o.patient_id <> e.patient_id OR o.doctor_id <> e.doctor_id)
  + (SELECT COUNT(*) FROM prescriptions o JOIN admissions a ON a.admission_id = o.admission_id WHERE o.patient_id <> a.patient_id)
  + (SELECT COUNT(*) FROM prescriptions o JOIN consultations c ON c.consultation_id = o.consultation_id WHERE o.patient_id <> c.patient_id)
  + (SELECT COUNT(*) FROM surgery_requests s JOIN encounters e ON e.encounter_id = s.encounter_id WHERE s.patient_id <> e.patient_id OR s.doctor_id <> e.doctor_id)
  + (SELECT COUNT(*) FROM vital_signs v JOIN encounters e ON e.encounter_id = v.encounter_id WHERE v.patient_id <> e.patient_id)
  + (SELECT COUNT(*) FROM vital_signs v JOIN admissions a ON a.admission_id = v.admission_id WHERE v.patient_id <> a.patient_id)
  + (SELECT COUNT(*) FROM encounters e JOIN admissions a ON a.admission_id = e.admission_id WHERE e.patient_id <> a.patient_id)
  + (SELECT COUNT(*) FROM pharmacy_stock_movements s JOIN medicine_batches b ON b.batch_id = s.batch_id WHERE s.medicine_id <> b.medicine_id)
  + (SELECT COUNT(*) FROM bills b JOIN admissions a ON a.admission_id = b.admission_id WHERE b.patient_id <> a.patient_id)
  INTO bad;
  IF bad > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '018: some rows disagree with their visit, stay, appointment, note or batch (see the 018 check output); correct them before this migration';
  END IF;

  -- Parent keys: the id together with the columns children copy.
  CALL mig018_add_key('encounters', 'uq_encounters_id_patient_doctor', 'ADD CONSTRAINT uq_encounters_id_patient_doctor UNIQUE (encounter_id, patient_id, doctor_id)');
  CALL mig018_add_key('encounters', 'uq_encounters_id_patient', 'ADD CONSTRAINT uq_encounters_id_patient UNIQUE (encounter_id, patient_id)');
  CALL mig018_add_key('admissions', 'uq_admissions_id_patient', 'ADD CONSTRAINT uq_admissions_id_patient UNIQUE (admission_id, patient_id)');
  CALL mig018_add_key('appointments', 'uq_appointments_id_patient_doctor', 'ADD CONSTRAINT uq_appointments_id_patient_doctor UNIQUE (appointment_id, patient_id, doctor_id)');
  CALL mig018_add_key('consultations', 'uq_consultations_id_patient', 'ADD CONSTRAINT uq_consultations_id_patient UNIQUE (consultation_id, patient_id)');
  CALL mig018_add_key('medicine_batches', 'uq_medicine_batches_id_medicine', 'ADD CONSTRAINT uq_medicine_batches_id_medicine UNIQUE (batch_id, medicine_id)');

  -- Children: a composite foreign key per copied link.
  CALL mig018_add_key('consultations', 'fk_ctx_consultations_encounter', 'ADD CONSTRAINT fk_ctx_consultations_encounter FOREIGN KEY (encounter_id, patient_id, doctor_id) REFERENCES encounters (encounter_id, patient_id, doctor_id) ON DELETE RESTRICT');
  CALL mig018_add_key('consultations', 'fk_ctx_consultations_appointment', 'ADD CONSTRAINT fk_ctx_consultations_appointment FOREIGN KEY (appointment_id, patient_id, doctor_id) REFERENCES appointments (appointment_id, patient_id, doctor_id) ON DELETE RESTRICT');
  CALL mig018_add_key('consultations', 'fk_ctx_consultations_admission', 'ADD CONSTRAINT fk_ctx_consultations_admission FOREIGN KEY (admission_id, patient_id) REFERENCES admissions (admission_id, patient_id) ON DELETE RESTRICT');
  CALL mig018_add_key('lab_orders', 'fk_ctx_lab_orders_encounter', 'ADD CONSTRAINT fk_ctx_lab_orders_encounter FOREIGN KEY (encounter_id, patient_id, doctor_id) REFERENCES encounters (encounter_id, patient_id, doctor_id) ON DELETE RESTRICT');
  CALL mig018_add_key('lab_orders', 'fk_ctx_lab_orders_admission', 'ADD CONSTRAINT fk_ctx_lab_orders_admission FOREIGN KEY (admission_id, patient_id) REFERENCES admissions (admission_id, patient_id) ON DELETE RESTRICT');
  CALL mig018_add_key('lab_orders', 'fk_ctx_lab_orders_consultation', 'ADD CONSTRAINT fk_ctx_lab_orders_consultation FOREIGN KEY (consultation_id, patient_id) REFERENCES consultations (consultation_id, patient_id) ON DELETE RESTRICT');
  CALL mig018_add_key('prescriptions', 'fk_ctx_prescriptions_encounter', 'ADD CONSTRAINT fk_ctx_prescriptions_encounter FOREIGN KEY (encounter_id, patient_id, doctor_id) REFERENCES encounters (encounter_id, patient_id, doctor_id) ON DELETE RESTRICT');
  CALL mig018_add_key('prescriptions', 'fk_ctx_prescriptions_admission', 'ADD CONSTRAINT fk_ctx_prescriptions_admission FOREIGN KEY (admission_id, patient_id) REFERENCES admissions (admission_id, patient_id) ON DELETE RESTRICT');
  CALL mig018_add_key('prescriptions', 'fk_ctx_prescriptions_consultation', 'ADD CONSTRAINT fk_ctx_prescriptions_consultation FOREIGN KEY (consultation_id, patient_id) REFERENCES consultations (consultation_id, patient_id) ON DELETE RESTRICT');
  CALL mig018_add_key('surgery_requests', 'fk_ctx_surgery_requests_encounter', 'ADD CONSTRAINT fk_ctx_surgery_requests_encounter FOREIGN KEY (encounter_id, patient_id, doctor_id) REFERENCES encounters (encounter_id, patient_id, doctor_id) ON DELETE RESTRICT');
  CALL mig018_add_key('vital_signs', 'fk_ctx_vital_signs_encounter', 'ADD CONSTRAINT fk_ctx_vital_signs_encounter FOREIGN KEY (encounter_id, patient_id) REFERENCES encounters (encounter_id, patient_id) ON DELETE RESTRICT');
  CALL mig018_add_key('vital_signs', 'fk_ctx_vital_signs_admission', 'ADD CONSTRAINT fk_ctx_vital_signs_admission FOREIGN KEY (admission_id, patient_id) REFERENCES admissions (admission_id, patient_id) ON DELETE RESTRICT');
  CALL mig018_add_key('encounters', 'fk_ctx_encounters_admission', 'ADD CONSTRAINT fk_ctx_encounters_admission FOREIGN KEY (admission_id, patient_id) REFERENCES admissions (admission_id, patient_id) ON DELETE RESTRICT');
  CALL mig018_add_key('pharmacy_stock_movements', 'fk_ctx_stock_movements_batch', 'ADD CONSTRAINT fk_ctx_stock_movements_batch FOREIGN KEY (batch_id, medicine_id) REFERENCES medicine_batches (batch_id, medicine_id) ON DELETE RESTRICT');
  CALL mig018_add_key('bills', 'fk_ctx_bills_admission', 'ADD CONSTRAINT fk_ctx_bills_admission FOREIGN KEY (admission_id, patient_id) REFERENCES admissions (admission_id, patient_id) ON DELETE RESTRICT');

  -- Five single-column indexes are now left prefixes of a composite key's index, which also serves their
  -- single-column foreign key. Where MySQL created them for that foreign key it has already dropped them;
  -- where a schema dump declared them explicitly they are dropped here, so every database ends up alike.
  CALL mig018_drop_index('bills', 'admission_id');
  CALL mig018_drop_index('consultations', 'admission_id');
  CALL mig018_drop_index('consultations', 'appointment_id');
  CALL mig018_drop_index('lab_orders', 'consultation_id');
  CALL mig018_drop_index('prescriptions', 'consultation_id');
END //

DROP PROCEDURE IF EXISTS mig018_drop_index //
CREATE PROCEDURE mig018_drop_index(IN p_table VARCHAR(64), IN p_index VARCHAR(64))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index) THEN
    SET @mig018_sql = CONCAT('ALTER TABLE ', p_table, ' DROP INDEX ', p_index);
    PREPARE stmt FROM @mig018_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;
CALL mig018_context_fks();
DROP PROCEDURE mig018_context_fks;
DROP PROCEDURE mig018_add_key;
DROP PROCEDURE mig018_drop_index;
