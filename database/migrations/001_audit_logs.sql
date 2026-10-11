-- 001_audit_logs.sql — append-only audit trail (report Section F.4, NIST SP 800-53 AU-2).
-- Additive only: one new table and two triggers on it. Nothing existing is altered.
--
-- Data changes are written to this table inside the same transaction as the change.
-- Reads and denied requests are written after the response by middleware.
-- details holds ids, enum values and changed field names only: never passwords, tokens
-- or free-text clinical notes.

CREATE TABLE audit_logs (
  audit_id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NULL,                -- NULL for unauthenticated requests
  role VARCHAR(20) NULL,
  action VARCHAR(64) NOT NULL,     -- e.g. READ, CREATE_PATIENT, DISPENSE_PRESCRIPTION, ACCESS_DENIED
  entity_type VARCHAR(50) NULL,
  entity_id INT NULL,
  patient_id INT NULL,             -- no FK: the trail must outlive any patient-record change
  outcome ENUM('SUCCESS', 'DENIED') NOT NULL DEFAULT 'SUCCESS',
  status_code SMALLINT NULL,
  method VARCHAR(10) NULL,
  path VARCHAR(255) NULL,          -- route pattern, e.g. /api/patients/:id/history
  ip_address VARCHAR(45) NULL,
  details JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (audit_id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_user_created (user_id, created_at),
  KEY idx_audit_patient_created (patient_id, created_at),
  KEY idx_audit_action_created (action, created_at),
  KEY idx_audit_outcome_created (outcome, created_at),
  -- RESTRICT, not SET NULL: a cascading SET NULL would silently rewrite audit rows
  -- (FK cascades bypass triggers). Deactivate users (users.is_active) instead of deleting them.
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER //

CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only: rows cannot be updated';
END //

CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only: rows cannot be deleted';
END //

DELIMITER ;
