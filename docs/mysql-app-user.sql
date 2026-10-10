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
-- After switching server/.env to this account, the maintenance tools still need an administrative
-- account, because they read the same DB_USER/DB_PASSWORD:
--   npm run db:migrate, scripts/backup-db.js (mysqldump), scripts/schema-diff.js,
--   npm test / npm run test:ui (they create and drop hospital_db_test).
-- Run those with the admin account set only for that command, for example:
--   read -s ADMIN_PW && DB_USER=root DB_PASSWORD="$ADMIN_PW" npm run -s db:migrate
-- (dotenv does not override variables that are already set.)

CREATE USER 'hospital_app'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON `hospital_db`.* TO 'hospital_app'@'127.0.0.1';

-- Check: should list exactly USAGE and the five privileges above on `hospital_db`.*
SHOW GRANTS FOR 'hospital_app'@'127.0.0.1';

-- To generate a new password later (also printed once):
-- ALTER USER 'hospital_app'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;
