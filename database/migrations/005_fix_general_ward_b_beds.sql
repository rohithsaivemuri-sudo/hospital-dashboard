-- 005_fix_general_ward_b_beds.sql — data fix, no schema change.
--
-- seed.sql marks General Ward B beds GEN-B02 and GEN-B05 OCCUPIED although they have never had an
-- admission, assignment-log row or emergency case. Same issue as the General Ward A beds fixed in 004.
-- This frees them. Only beds still OCCUPIED with no active admission are touched, so re-running
-- changes nothing.

START TRANSACTION;

UPDATE beds b
JOIN wards w ON w.ward_id = b.ward_id
SET b.status = 'AVAILABLE'
WHERE w.name = 'General Ward B' AND b.bed_number IN ('GEN-B02', 'GEN-B05')
  AND b.status = 'OCCUPIED'
  AND NOT EXISTS (SELECT 1 FROM admissions a WHERE a.bed_id = b.bed_id AND a.status = 'ACTIVE');
SET @beds_freed = ROW_COUNT();

INSERT INTO audit_logs (action, entity_type, outcome, path, details)
SELECT 'MIGRATION_DATA_FIX', 'beds', 'SUCCESS', '005_fix_general_ward_b_beds.sql',
       JSON_OBJECT('beds_freed', @beds_freed, 'bed_numbers', JSON_ARRAY('GEN-B02', 'GEN-B05'))
WHERE @beds_freed > 0;

COMMIT;
