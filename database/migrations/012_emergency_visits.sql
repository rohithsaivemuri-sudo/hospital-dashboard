-- 012_emergency_visits.sql — a visit (encounter) for every active emergency admission.
-- Data only: no schema change. Emergency allocation now creates an EMERGENCY visit with each
-- admission (services/emergencyAllocationService.js); this gives the same to emergency admissions
-- made before that change, so their doctors have a visit to document against.
--
-- For each ACTIVE admission with an emergency_id and no encounter linked to it:
--   1. if its doctor has an open visit (ARRIVED/TRIAGED/IN_PROGRESS) with the patient that has no
--      admission yet, link the most advanced such visit to the admission;
--   2. otherwise create an EMERGENCY visit in ARRIVED, arrived_at = admission_date, tagged
--      backfilled_from = 'emergency_admission:<id>' (unique, so a re-run creates nothing).
-- Safe to re-run: both steps only touch admissions that still have no linked encounter.

START TRANSACTION;

-- 1. Link an existing open visit (one per admission; most advanced status, then newest).
UPDATE encounters e
JOIN (
  SELECT a.admission_id,
         (SELECT e2.encounter_id FROM encounters e2
          WHERE e2.patient_id = a.patient_id AND e2.doctor_id = a.doctor_id AND e2.admission_id IS NULL
            AND e2.status IN ('ARRIVED', 'TRIAGED', 'IN_PROGRESS')
          ORDER BY FIELD(e2.status, 'IN_PROGRESS', 'TRIAGED', 'ARRIVED'), e2.encounter_id DESC LIMIT 1) AS encounter_id
  FROM admissions a
  WHERE a.status = 'ACTIVE' AND a.emergency_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM encounters x WHERE x.admission_id = a.admission_id)
) pick ON pick.encounter_id = e.encounter_id
SET e.admission_id = pick.admission_id;
SET @linked = ROW_COUNT();

-- 2. Create a visit for the rest.
INSERT INTO encounters (patient_id, doctor_id, admission_id, encounter_type, status, arrived_at, backfilled_from)
SELECT a.patient_id, a.doctor_id, a.admission_id, 'EMERGENCY', 'ARRIVED', a.admission_date, CONCAT('emergency_admission:', a.admission_id)
FROM admissions a
WHERE a.status = 'ACTIVE' AND a.emergency_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM encounters x WHERE x.admission_id = a.admission_id);
SET @created = ROW_COUNT();

INSERT INTO audit_logs (action, entity_type, outcome, path, details)
SELECT 'MIGRATION_BACKFILL', 'emergency_visits', 'SUCCESS', '012_emergency_visits.sql',
       JSON_OBJECT('visits_linked', @linked, 'visits_created', @created)
WHERE @linked + @created > 0;

COMMIT;
