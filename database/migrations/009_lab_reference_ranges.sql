-- 009_lab_reference_ranges.sql — discrete reference ranges and automatic flags (report Section F, step 7).
-- Additive: nullable numeric bounds on lab_tests (defaults per test) and on lab_results (the bounds
-- actually used for that result), lab_results.numeric_value, and interpretation_source. The existing
-- text columns (lab_tests.normal_range, lab_results.reference_range/interpretation) are kept.
--
-- Backfill: test bounds are parsed from normal_range only when it is unambiguous numeric text,
-- "a-b", "<x"/"≤x" or ">x"/"≥x" (the same rules as server/utils/labRanges.js). Anything else stays
-- NULL and is never auto-flagged. Existing results get numeric_value / bounds the same way from their
-- own result_value / reference_range; their interpretation is left exactly as it was (MANUAL).
-- Safe to re-run: guarded DDL; backfills only fill NULLs.

DELIMITER //
DROP PROCEDURE IF EXISTS mig009_add_column //
CREATE PROCEDURE mig009_add_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col) THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;
CALL mig009_add_column('lab_tests', 'reference_low', 'reference_low DECIMAL(14,4) NULL');
CALL mig009_add_column('lab_tests', 'reference_high', 'reference_high DECIMAL(14,4) NULL');
CALL mig009_add_column('lab_tests', 'critical_low', 'critical_low DECIMAL(14,4) NULL');
CALL mig009_add_column('lab_tests', 'critical_high', 'critical_high DECIMAL(14,4) NULL');
CALL mig009_add_column('lab_results', 'numeric_value', 'numeric_value DECIMAL(14,4) NULL');
CALL mig009_add_column('lab_results', 'reference_low', 'reference_low DECIMAL(14,4) NULL');
CALL mig009_add_column('lab_results', 'reference_high', 'reference_high DECIMAL(14,4) NULL');
CALL mig009_add_column('lab_results', 'interpretation_source', "interpretation_source ENUM('AUTO', 'MANUAL') NULL");
DROP PROCEDURE mig009_add_column;

START TRANSACTION;

-- Test defaults: "a-b"
UPDATE lab_tests
SET reference_low = CAST(TRIM(SUBSTRING_INDEX(normal_range, '-', 1)) AS DECIMAL(14,4)),
    reference_high = CAST(TRIM(SUBSTRING_INDEX(normal_range, '-', -1)) AS DECIMAL(14,4))
WHERE reference_low IS NULL AND reference_high IS NULL
  AND normal_range REGEXP '^[[:space:]]*[0-9]+([.][0-9]+)?[[:space:]]*-[[:space:]]*[0-9]+([.][0-9]+)?[[:space:]]*$'
  AND CAST(TRIM(SUBSTRING_INDEX(normal_range, '-', 1)) AS DECIMAL(14,4)) <= CAST(TRIM(SUBSTRING_INDEX(normal_range, '-', -1)) AS DECIMAL(14,4));
SET @tests_range = ROW_COUNT();
-- Test defaults: "<x" / "≤x" / "<=x" (upper limit only).
-- Note: MySQL 9 returns 0 for CAST(REGEXP_SUBSTR(...) AS DECIMAL); casting through CHAR first is correct.
UPDATE lab_tests
SET reference_high = CAST(CAST(REGEXP_SUBSTR(normal_range, '[0-9]+([.][0-9]+)?') AS CHAR) AS DECIMAL(14,4))
WHERE reference_low IS NULL AND reference_high IS NULL
  AND normal_range REGEXP '^[[:space:]]*(<|≤|<=)[[:space:]]*[0-9]+([.][0-9]+)?[[:space:]]*$';
SET @tests_upper = ROW_COUNT();
-- Test defaults: ">x" / "≥x" / ">=x" (lower limit only)
UPDATE lab_tests
SET reference_low = CAST(CAST(REGEXP_SUBSTR(normal_range, '[0-9]+([.][0-9]+)?') AS CHAR) AS DECIMAL(14,4))
WHERE reference_low IS NULL AND reference_high IS NULL
  AND normal_range REGEXP '^[[:space:]]*(>|≥|>=)[[:space:]]*[0-9]+([.][0-9]+)?[[:space:]]*$';
SET @tests_lower = ROW_COUNT();

-- Existing results: numeric value and their own recorded range; interpretation untouched.
UPDATE lab_results
SET numeric_value = CAST(TRIM(result_value) AS DECIMAL(14,4))
WHERE numeric_value IS NULL AND result_value REGEXP '^[[:space:]]*-?[0-9]+([.][0-9]+)?[[:space:]]*$';
SET @results_numeric = ROW_COUNT();
UPDATE lab_results
SET reference_low = CAST(TRIM(SUBSTRING_INDEX(reference_range, '-', 1)) AS DECIMAL(14,4)),
    reference_high = CAST(TRIM(SUBSTRING_INDEX(reference_range, '-', -1)) AS DECIMAL(14,4))
WHERE reference_low IS NULL AND reference_high IS NULL
  AND reference_range REGEXP '^[[:space:]]*[0-9]+([.][0-9]+)?[[:space:]]*-[[:space:]]*[0-9]+([.][0-9]+)?[[:space:]]*$';
SET @results_range = ROW_COUNT();
UPDATE lab_results SET interpretation_source = 'MANUAL' WHERE interpretation IS NOT NULL AND interpretation_source IS NULL;
SET @results_manual = ROW_COUNT();

INSERT INTO audit_logs (action, entity_type, outcome, path, details)
SELECT 'MIGRATION_BACKFILL', 'lab_ranges', 'SUCCESS', '009_lab_reference_ranges.sql',
       JSON_OBJECT('tests_with_range', @tests_range, 'tests_with_upper_limit', @tests_upper, 'tests_with_lower_limit', @tests_lower,
                   'results_numeric', @results_numeric, 'results_with_range', @results_range, 'results_marked_manual', @results_manual)
WHERE @tests_range + @tests_upper + @tests_lower + @results_numeric + @results_range + @results_manual > 0;

COMMIT;
