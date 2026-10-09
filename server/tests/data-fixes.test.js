// Data fixes applied by migrations (the test DB is built baseline -> seed -> migrations).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { TEST_DB, db, closeDb } = require('./helpers');
const { runSqlFile } = require('../scripts/lib/sql');

after(closeDb);

const wardABeds = async () => (await db().query(`
  SELECT b.bed_number, b.status,
         (SELECT COUNT(*) FROM admissions a WHERE a.bed_id = b.bed_id AND a.status = 'ACTIVE') AS active_admissions,
         (SELECT COUNT(*) FROM bed_assignment_log l WHERE l.bed_id = b.bed_id AND l.status = 'ACTIVE') AS open_logs
  FROM beds b JOIN wards w ON w.ward_id = b.ward_id
  WHERE w.name = 'General Ward A' AND b.bed_number IN ('GEN-A01', 'GEN-A04', 'GEN-A06') ORDER BY b.bed_number`))[0];

test('004: General Ward A beds no longer show OCCUPIED without an active admission, and their stale logs are closed', async () => {
  for (const bed of await wardABeds()) {
    if (bed.active_admissions === 0) {
      assert.notEqual(bed.status, 'OCCUPIED', `${bed.bed_number} is free`);
      assert.equal(bed.open_logs, 0, `${bed.bed_number} has no open assignment log`);
    }
  }
  const [logs] = await db().query(`SELECT l.released_at, a.discharge_date FROM bed_assignment_log l JOIN admissions a ON a.admission_id = l.admission_id
    JOIN beds b ON b.bed_id = l.bed_id WHERE b.bed_number IN ('GEN-A01', 'GEN-A04') AND a.status = 'DISCHARGED'`);
  for (const l of logs) assert.deepEqual(l.released_at, l.discharge_date, 'released at the discharge time');
});

test('004 is idempotent and leaves General Ward B and all other beds untouched', async () => {
  const snapshot = async () => (await db().query("SELECT bed_id, status FROM beds ORDER BY bed_id"))[0].map(r => `${r.bed_id}:${r.status}`).join(',');
  const before = await snapshot();
  const [[{ fixes }]] = await db().query("SELECT COUNT(*) fixes FROM audit_logs WHERE action = 'MIGRATION_DATA_FIX'");
  runSqlFile(TEST_DB, path.join(__dirname, '..', '..', 'database', 'migrations', '004_fix_general_ward_a_beds.sql'));
  assert.equal(await snapshot(), before);
  const [[{ again }]] = await db().query("SELECT COUNT(*) again FROM audit_logs WHERE action = 'MIGRATION_DATA_FIX'");
  assert.equal(again, fixes, 'a no-op re-run writes no audit row');
  const [[b]] = await db().query("SELECT GROUP_CONCAT(bed_number ORDER BY bed_number) beds FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = 'General Ward B' AND b.status = 'OCCUPIED' AND NOT EXISTS (SELECT 1 FROM admissions a WHERE a.bed_id = b.bed_id AND a.status = 'ACTIVE')");
  assert.equal(b.beds, 'GEN-B02,GEN-B05', 'Ward B beds are left for a separate decision');
});
