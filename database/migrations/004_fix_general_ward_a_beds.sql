-- 004_fix_general_ward_a_beds.sql — data fix, no schema change.
--
-- seed.sql leaves three General Ward A beds marked OCCUPIED with no active admission:
--   GEN-A01, GEN-A04: their admissions (#10, #11) were inserted already DISCHARGED, so the
--                     after_admission_insert trigger occupied the bed and opened a bed_assignment_log
--                     row, but after_admission_discharge (which only fires on ACTIVE -> DISCHARGED)
--                     never released them.
--   GEN-A06:          seeded OCCUPIED with no admission at all.
-- This frees those beds and closes the two stale assignment-log rows with the admission's discharge
-- time. Only rows still in that inconsistent state are touched, so re-running changes nothing.
-- (General Ward B GEN-B02 / GEN-B05 have the same problem and are deliberately left for a decision.)

START TRANSACTION;

UPDATE bed_assignment_log l
JOIN beds b ON b.bed_id = l.bed_id
JOIN wards w ON w.ward_id = b.ward_id
JOIN admissions a ON a.admission_id = l.admission_id
SET l.status = 'RELEASED', l.released_at = a.discharge_date
WHERE w.name = 'General Ward A' AND b.bed_number IN ('GEN-A01', 'GEN-A04', 'GEN-A06')
  AND l.status = 'ACTIVE' AND a.status = 'DISCHARGED' AND a.discharge_date IS NOT NULL;
SET @logs_closed = ROW_COUNT();

UPDATE beds b
JOIN wards w ON w.ward_id = b.ward_id
SET b.status = 'AVAILABLE'
WHERE w.name = 'General Ward A' AND b.bed_number IN ('GEN-A01', 'GEN-A04', 'GEN-A06')
  AND b.status = 'OCCUPIED'
  AND NOT EXISTS (SELECT 1 FROM admissions a WHERE a.bed_id = b.bed_id AND a.status = 'ACTIVE');
SET @beds_freed = ROW_COUNT();

INSERT INTO audit_logs (action, entity_type, outcome, path, details)
SELECT 'MIGRATION_DATA_FIX', 'beds', 'SUCCESS', '004_fix_general_ward_a_beds.sql',
       JSON_OBJECT('beds_freed', @beds_freed, 'assignment_logs_closed', @logs_closed,
                   'bed_numbers', JSON_ARRAY('GEN-A01', 'GEN-A04', 'GEN-A06'))
WHERE @beds_freed + @logs_closed > 0;

COMMIT;
