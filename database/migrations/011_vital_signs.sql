-- 011_vital_signs.sql — vitals flowsheet (report Section G/K-10, FHIR Observation vital-signs).
-- Additive: one new table. Nothing existing is altered.
--
-- Each reading belongs to a visit (encounter) or an admission, or both. CHECK constraints reject
-- physiologically impossible values (a typo such as 370 for 37.0 °C), not abnormal ones: abnormal
-- readings are stored and highlighted (server/utils/vitals.js holds both sets of limits).
-- Times are UTC, computed in Node (utils/marTime.js), shown in IST — the same rule as the MAR.

CREATE TABLE IF NOT EXISTS vital_signs (
  vital_id INT NOT NULL AUTO_INCREMENT,
  patient_id INT NOT NULL,
  encounter_id INT NULL,
  admission_id INT NULL,
  recorded_at_utc DATETIME NOT NULL,
  recorded_by INT NOT NULL,
  temperature_c DECIMAL(4,1) NULL,
  pulse_bpm SMALLINT NULL,
  resp_rate SMALLINT NULL,
  bp_systolic SMALLINT NULL,
  bp_diastolic SMALLINT NULL,
  spo2_pct SMALLINT NULL,
  pain_score TINYINT NULL,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vital_id),
  KEY idx_vitals_patient_time (patient_id, recorded_at_utc),
  KEY idx_vitals_encounter (encounter_id),
  KEY idx_vitals_admission (admission_id),
  CONSTRAINT fk_vitals_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id) ON DELETE RESTRICT,
  CONSTRAINT fk_vitals_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (encounter_id) ON DELETE RESTRICT,
  CONSTRAINT fk_vitals_admission FOREIGN KEY (admission_id) REFERENCES admissions (admission_id) ON DELETE RESTRICT,
  CONSTRAINT fk_vitals_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT chk_vitals_context CHECK (encounter_id IS NOT NULL OR admission_id IS NOT NULL),
  CONSTRAINT chk_vitals_any CHECK (temperature_c IS NOT NULL OR pulse_bpm IS NOT NULL OR resp_rate IS NOT NULL
    OR bp_systolic IS NOT NULL OR spo2_pct IS NOT NULL OR pain_score IS NOT NULL),
  CONSTRAINT chk_vitals_temperature CHECK (temperature_c IS NULL OR temperature_c BETWEEN 25.0 AND 45.0),
  CONSTRAINT chk_vitals_pulse CHECK (pulse_bpm IS NULL OR pulse_bpm BETWEEN 20 AND 250),
  CONSTRAINT chk_vitals_resp_rate CHECK (resp_rate IS NULL OR resp_rate BETWEEN 4 AND 80),
  CONSTRAINT chk_vitals_systolic CHECK (bp_systolic IS NULL OR bp_systolic BETWEEN 40 AND 300),
  CONSTRAINT chk_vitals_diastolic CHECK (bp_diastolic IS NULL OR bp_diastolic BETWEEN 20 AND 200),
  CONSTRAINT chk_vitals_bp_pair CHECK ((bp_systolic IS NULL) = (bp_diastolic IS NULL)),
  CONSTRAINT chk_vitals_bp_order CHECK (bp_systolic IS NULL OR bp_systolic > bp_diastolic),
  CONSTRAINT chk_vitals_spo2 CHECK (spo2_pct IS NULL OR spo2_pct BETWEEN 50 AND 100),
  CONSTRAINT chk_vitals_pain CHECK (pain_score IS NULL OR pain_score BETWEEN 0 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
