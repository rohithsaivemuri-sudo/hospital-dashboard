-- 015_beds_floor_from_wards.sql — BCNF step A1 (docs/bcnf-analysis.md), additive part.
--
-- beds.floor depends on the ward, not the bed: ward_id -> floor, and ward_id is only part of the
-- candidate key {ward_id, bed_number} (a 2NF violation). The floor already lives in wards.floor,
-- so the decomposition needs no new table: beds keeps ward_id, the floor is read through it.
--
-- This migration checks that every bed's floor equals its ward's floor (so beds JOIN wards rebuilds
-- every row), stops with an error if one does not, makes beds.floor nullable so nothing has to write
-- it any more, and moves available_beds_view onto wards.floor. A later migration drops the column.
-- Safe to re-run.

DELIMITER //
DROP PROCEDURE IF EXISTS mig015_beds_floor //
CREATE PROCEDURE mig015_beds_floor()
BEGIN
  DECLARE mismatched INT DEFAULT 0;
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'beds' AND COLUMN_NAME = 'floor') THEN
    SELECT COUNT(*) INTO mismatched FROM beds b JOIN wards w ON w.ward_id = b.ward_id
    WHERE b.floor IS NOT NULL AND b.floor <> w.floor;
    IF mismatched > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '015: some beds.floor values differ from their ward''s floor; correct them before this migration';
    END IF;
    ALTER TABLE beds MODIFY floor INT NULL;
  END IF;
END //
DELIMITER ;
CALL mig015_beds_floor();
DROP PROCEDURE mig015_beds_floor;

-- Verification output: every bed is rebuilt from beds JOIN wards.
SELECT '015 verification' AS step, COUNT(*) AS beds, SUM(w.ward_id IS NOT NULL) AS rebuilt_by_join FROM beds b LEFT JOIN wards w ON w.ward_id = b.ward_id;

CREATE OR REPLACE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW available_beds_view AS
SELECT b.bed_id AS bed_id, b.bed_number AS bed_number, w.floor AS floor, b.bed_type AS bed_type,
       b.has_ventilator AS has_ventilator, w.name AS ward_name, d.name AS department_name
FROM beds b
JOIN wards w ON b.ward_id = w.ward_id
JOIN departments d ON w.department_id = d.department_id
WHERE b.status = 'AVAILABLE';
