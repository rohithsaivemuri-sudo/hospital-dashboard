-- Dedicated MySQL account for the running application (least privilege).
--
-- NOT run by any script in this repository. Run it yourself, once, as an administrative account:
--     mysql -u root -p < docs/mysql-app-user.sql
--
-- No password is stored here. MySQL generates a random one and prints it once, in the
-- `generated password` column of the CREATE USER result. Copy it into server/.env as DB_PASSWORD
-- (with DB_USER=hospital_app); server/.env is git-ignored. If you lose it, run the ALTER USER line at
-- the end to generate a new one.
--
-- Host: server/.env has DB_HOST=127.0.0.1 (a TCP connection), so the account is for '127.0.0.1'. If
-- you change DB_HOST to 'localhost' (Unix socket), create the account for 'localhost' instead.
--
-- What the grants cover:
--   SELECT, INSERT, UPDATE, DELETE  every table and view the API reads and writes
--   EXECUTE                         the stored procedures (sp_*); the API does not call them today
-- What it deliberately cannot do: CREATE/ALTER/DROP, TRIGGER, LOCK TABLES, GRANT, FILE, or touch any
-- other database. Triggers, views and procedures are defined by root@localhost and run with their
-- definer's rights, so they keep working. audit_logs stays append-only: its triggers reject UPDATE and
-- DELETE whatever the account's grants.
--
-- The app connects with DB_USER/DB_PASSWORD (this account) and refuses to start as root. The
-- maintenance tools use a separate administrative account from DB_ADMIN_USER/DB_ADMIN_PASSWORD:
--   npm run db:migrate, scripts/backup-db.js (mysqldump), scripts/schema-diff.js, and the test
--   suites' database build (they create and drop hospital_db_test).

CREATE USER 'hospital_app'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON `hospital_db`.* TO 'hospital_app'@'127.0.0.1';

-- Local development only (omit on a server): the test suites run the app against hospital_db_test,
-- and this lets them do so under the same restricted account. The admin account still builds that
-- database (DB_ADMIN_USER); a database-level grant survives it being dropped and rebuilt.
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON `hospital_db_test`.* TO 'hospital_app'@'127.0.0.1';

-- Check: should list USAGE and the five privileges on `hospital_db`.* (and `hospital_db_test`.* locally)
SHOW GRANTS FOR 'hospital_app'@'127.0.0.1';

-- To generate a new password later (also printed once):
-- ALTER USER 'hospital_app'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;
