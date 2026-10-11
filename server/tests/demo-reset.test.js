// npm run demo:reset: rebuilds a _demo database with demo activity and new random passwords
// (printed once, stored nowhere); refuses any other database name.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { assertDemoName } = require('../scripts/demo-reset');
const { buildFromSeed } = require('../scripts/lib/build-db');
const { adminCredentials } = require('../scripts/lib/admin-credentials');

const CI_DEMO = 'hospital_ci_demo';
const run = (env) => spawnSync(process.execPath, ['scripts/demo-reset.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, ...env }, encoding: 'utf8', timeout: 180000 });
const admin = () => mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, ...adminCredentials() });

after(async () => {
  const c = await admin();
  await c.query(`DROP DATABASE IF EXISTS \`${CI_DEMO}\``);
  const [hosts] = await c.query('SELECT host FROM mysql.user WHERE user = ?', [process.env.DB_USER]);
  for (const { host } of hosts) await c.query('REVOKE ALL PRIVILEGES ON ??.* FROM ?@?', [CI_DEMO, process.env.DB_USER, host]).catch(() => {});
  await c.end();
});

test('only a _demo database can be reset; hospital_db is refused before anything is touched', async () => {
  for (const name of ['hospital_db', 'hospital_db_test', 'hospital', 'demo', 'hospital_demo; DROP DATABASE x']) assert.throws(() => assertDemoName(name), /must end in _demo/, name);
  assert.doesNotThrow(() => assertDemoName('hospital_demo'));
  await assert.rejects(buildFromSeed('hospital_db'), /Refusing to rebuild/);
  const r = run({ DEMO_DB_NAME: 'hospital_db' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to reset "hospital_db"/);
  assert.ok(!/rebuilding/.test(r.stdout), 'stopped before building');
});

test('a reset builds the demo with every role\'s workflow and new random passwords', async () => {
  const r = run({ DEMO_DB_NAME: CI_DEMO, DEMO_BUILD_PORT: '5087' });
  assert.equal(r.status, 0, r.stderr.slice(0, 500));
  const accounts = r.stdout.split('\n').filter(l => /^ {2}(ADMIN|DOCTOR|NURSE|RECEPTIONIST|LABORATORY|PHARMACY) /.test(l)).map(l => l.trim().split(/\s+/));
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, ...adminCredentials(), database: CI_DEMO });
  try {
    const q = async (sql) => (await c.query(sql))[0];
    const users = await q('SELECT username, role, password_hash FROM users');
    assert.equal(accounts.length, users.length, 'every account printed once');
    assert.deepEqual(new Set(accounts.map(a => a[0])), new Set(users.map(u => u.role)), 'every role has an account');
    for (const [, username, password] of accounts) {
      assert.match(password, /^[A-Za-z0-9_-]{16}$/, username);
      const u = users.find(x => x.username === username);
      assert.ok(await bcrypt.compare(password, u.password_hash), `${username}: the printed password logs in`);
      assert.ok(!(await bcrypt.compare('password123', u.password_hash)), `${username}: not password123`);
    }
    const audit = JSON.stringify(await q('SELECT details, path FROM audit_logs'));
    assert.ok(accounts.every(a => !audit.includes(a[2])), 'passwords are not in the audit log');

    assert.ok((await q('SELECT COUNT(*) n FROM appointments WHERE appointment_date = CURDATE()'))[0].n >= 7, "today's appointments");
    const visits = Object.fromEntries((await q("SELECT status, COUNT(*) n FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS') GROUP BY status")).map(v => [v.status, v.n]));
    assert.ok(visits.ARRIVED >= 2 && visits.TRIAGED >= 1 && visits.IN_PROGRESS >= 1, JSON.stringify(visits));
    const labs = Object.fromEntries((await q('SELECT status, COUNT(*) n FROM lab_orders GROUP BY status')).map(v => [v.status, v.n]));
    assert.ok(labs.ORDERED >= 1 && labs.PROCESSING >= 1 && labs.COMPLETED >= 1, JSON.stringify(labs));
    assert.ok((await q("SELECT COUNT(*) n FROM prescriptions WHERE status = 'CREATED'"))[0].n >= 1, 'prescriptions waiting for pharmacy');
    assert.ok((await q('SELECT COUNT(*) n FROM medication_administrations'))[0].n >= 1, 'a medication record for the ward nurse');
    assert.ok((await q('SELECT COUNT(*) n FROM vital_signs'))[0].n >= 1, 'vitals');
    assert.ok((await q("SELECT COUNT(*) n FROM emergency_cases WHERE status = 'WAITING' AND patient_id IS NULL"))[0].n >= 1, 'an unregistered emergency arrival');
    assert.ok((await q("SELECT COUNT(*) n FROM consultations WHERE DATE(consultation_time) = CURDATE()"))[0].n >= 1, "a note on today's visit");
  } finally { await c.end(); }
});
