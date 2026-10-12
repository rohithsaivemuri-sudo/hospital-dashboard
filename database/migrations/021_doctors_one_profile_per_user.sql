-- 021_doctors_one_profile_per_user.sql — at most one doctor profile per user account.
--
-- Login finds a doctor by user_id, so a user with two doctor rows would be ambiguous. Until now only
-- the staff-account code kept it to one; POST /api/doctors could add a second. The migration stops
-- with an error if any user already has more than one doctor profile (listed below), and otherwise
-- replaces the plain index on doctors.user_id with a UNIQUE one. Safe to re-run.

-- Verification output: users with more than one doctor profile (must be empty).
SELECT '021 check' AS step, user_id, COUNT(*) AS doctor_profiles, GROUP_CONCAT(doctor_id ORDER BY doctor_id) AS doctor_ids
FROM doctors GROUP BY user_id HAVING COUNT(*) > 1;

DELIMITER //
DROP PROCEDURE IF EXISTS mig021_doctor_user_unique //
CREATE PROCEDURE mig021_doctor_user_unique()
BEGIN
  IF EXISTS (SELECT 1 FROM doctors GROUP BY user_id HAVING COUNT(*) > 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '021: some users have more than one doctor profile (see the 021 check output); merge them before this migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'doctors' AND CONSTRAINT_NAME = 'uq_doctors_user_id') THEN
    ALTER TABLE doctors ADD CONSTRAINT uq_doctors_user_id UNIQUE (user_id);
  END IF;
  -- The UNIQUE index now serves the foreign key to users, so the plain one is redundant.
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'doctors' AND INDEX_NAME = 'user_id') THEN
    ALTER TABLE doctors DROP INDEX user_id;
  END IF;
END //
DELIMITER ;
CALL mig021_doctor_user_unique();
DROP PROCEDURE mig021_doctor_user_unique;
