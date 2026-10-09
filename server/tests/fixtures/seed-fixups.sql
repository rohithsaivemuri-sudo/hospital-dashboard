-- Test-only data fixups applied after database/seed.sql, so the test DB matches the live demo data.
-- seed.sql hashes lab_staff / pharmacy_staff as "password"; the live DB (and README) use "password123"
-- for every demo user. Reuse admin's hash rather than hard-coding one here.
UPDATE users u
JOIN (SELECT password_hash FROM users WHERE username = 'admin') a
SET u.password_hash = a.password_hash
WHERE u.username IN ('lab_staff', 'pharmacy_staff');
