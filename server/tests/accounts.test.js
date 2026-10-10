// Staff accounts: the accounts script (random passwords printed once, never stored) and the rule
// that no account may keep the old default password in production or demo mode.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { TEST_DB, USERS, api, login, db, closeDb } = require('./helpers');
const { adminCredentials } = require('../scripts/lib/admin-credentials');
const { parseCsv, usernameFor } = require('../scripts/accounts');

const SERVER = path.join(__dirname, '..');
const CHECK_DEMO = 'hospital_accounts_check_demo';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-accounts-'));
const accountsCli = (args, input) => spawnSync(process.execPath, ['scripts/accounts.js', ...args, '--db', TEST_DB], { cwd: SERVER, encoding: 'utf8', input, timeout: 60000 });
const printed = (stdout) => stdout.split('\n').filter(l => /^ {2}(ADMIN|DOCTOR|NURSE|RECEPTIONIST|LABORATORY|PHARMACY) /.test(l)).map(l => { const [role, username, password] = l.trim().split(/\s+/); return { role, username, password }; });
const count = async () => (await db().query('SELECT COUNT(*) n FROM users'))[0][0].n;
const stamp = Date.now().toString(36);

after(async () => {
  fs.rmSync(tmp, { recursive: true, force: true });
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, ...adminCredentials() });
  await c.query(`DROP DATABASE IF EXISTS \`${CHECK_DEMO}\``);
  const [hosts] = await c.query('SELECT host FROM mysql.user WHERE user = ?', [process.env.DB_USER]);
  for (const { host } of hosts) await c.query('REVOKE ALL PRIVILEGES ON ??.* FROM ?@?', [CHECK_DEMO, process.env.DB_USER, host]).catch(() => {});
  await c.end();
  await closeDb();
});

test('registration refuses well-known passwords, including the old default', async () => {
  const admin = await login(USERS.ADMIN);
  for (const password of ['password123', 'Password123', '12345678']) {
    const res = await api('POST', '/auth/register', { token: admin.token, body: { username: `weak.${stamp}`, password, role: 'NURSE', full_name: 'Weak', email: `weak.${stamp}@hospital.test`, phone: '1' } });
    assert.equal(res.status, 400, password);
    assert.match(res.body.message, /too common/);
  }
});

test('usernames come from names, without titles, unique', () => {
  const taken = new Set(['asha.rao']);
  assert.equal(usernameFor('Dr. Asha Rao', taken), 'asha.rao2');
  assert.equal(usernameFor('Meera  K Nair', taken), 'meera.k.nair');
  assert.deepEqual(parseCsv('full_name,role\n"Rao, Asha",nurse\n# comment\n').map(r => [r.full_name, r.role]), [['Rao, Asha', 'nurse']]);
  assert.throws(() => parseCsv('name,role\nX,NURSE'), /must include full_name/);
});

test('create: every account gets a random password printed once; only the hash is stored; audited without secrets', async () => {
  const file = path.join(tmp, 'staff.csv');
  fs.writeFileSync(file, `full_name,role,email,phone,department,specialization,shift\nDr. Kiran ${stamp},doctor,kiran.${stamp}@hospital.test,9000011111,Cardiology,Cardiology,morning\nNurse Asha ${stamp},NURSE,,,,,\nNurse Asha ${stamp},NURSE,,,,,\n`);
  const r = accountsCli(['create', file]);
  assert.equal(r.status, 0, r.stderr);
  const accounts = printed(r.stdout);
  assert.equal(accounts.length, 3);
  assert.match(r.stdout, /stored nowhere/);
  const names = accounts.map(a => a.username);
  assert.equal(new Set(names).size, 3, 'same name twice -> distinct usernames');
  for (const a of accounts) {
    assert.match(a.password, /^[A-Za-z0-9_-]{16}$/);
    const [[u]] = await db().query('SELECT user_id, password_hash, email, phone, role FROM users WHERE username = ?', [a.username]);
    assert.ok(await bcrypt.compare(a.password, u.password_hash), `${a.username} logs in with the printed password`);
    assert.notEqual(u.password_hash, a.password);
    const audit = JSON.stringify((await db().query("SELECT * FROM audit_logs WHERE action = 'CREATE_USER' AND entity_id = ?", [u.user_id]))[0]);
    assert.match(audit, /accounts script/);
    assert.ok(!audit.includes(a.password));
  }
  const doctor = accounts.find(a => a.role === 'DOCTOR');
  const [[d]] = await db().query('SELECT d.specialization, d.shift FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = ?', [doctor.username]);
  assert.deepEqual([d.specialization, d.shift], ['Cardiology', 'MORNING']);
  const nurse = accounts.find(a => a.role === 'NURSE');
  const [[n]] = await db().query('SELECT email, phone FROM users WHERE username = ?', [nurse.username]);
  assert.deepEqual([n.email, n.phone], [`${nurse.username}@users.invalid`, '0000000000']);
  assert.match(r.stdout, /Placeholder email\/phone set for/);
  const res = await api('POST', '/auth/login', { body: { username: nurse.username, password: nurse.password } });
  assert.equal(res.status, 200, 'the new account can sign in');
});

test('create: one bad row creates nothing; the list can come from stdin', async () => {
  const before = await count();
  const bad = accountsCli(['create', '-'], `full_name,role\nGood Person ${stamp},NURSE\nBad Person ${stamp},SURGEON\nDr. NoDept ${stamp},DOCTOR\n`);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /nothing created/);
  assert.match(bad.stderr, /line 3: role must be one of/);
  assert.match(bad.stderr, /line 4: Missing required fields: department_id, specialization, shift/);
  assert.equal(await count(), before);
  const ok = accountsCli(['create', '-'], `full_name,role\nStdin Person ${stamp},RECEPTIONIST\n`);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(printed(ok.stdout).length, 1);
});

test('reset gives a new random password; the old one stops working', async () => {
  const made = printed(accountsCli(['create', '-'], `full_name,role\nReset Person ${stamp},PHARMACY\n`).stdout)[0];
  const r = accountsCli(['reset', made.username]);
  assert.equal(r.status, 0, r.stderr);
  const [after] = printed(r.stdout);
  assert.notEqual(after.password, made.password);
  const [[u]] = await db().query('SELECT password_hash FROM users WHERE username = ?', [made.username]);
  assert.ok(await bcrypt.compare(after.password, u.password_hash));
  assert.ok(!(await bcrypt.compare(made.password, u.password_hash)));
  assert.equal(accountsCli(['reset', 'no.such.user']).status, 1);
});

test('production and demo mode refuse to start while any account has the default password', async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<div id="root"></div>');
  const prod = spawnSync(process.execPath, ['server.js'], { cwd: SERVER, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, NODE_ENV: 'production', PORT: '0', DB_NAME: TEST_DB, CLIENT_DIST: dist, CLIENT_URL: 'https://hospital.example.org' } });
  assert.equal(prod.status, 1, prod.stderr);
  assert.match(prod.stderr, /Refusing to start in production mode: \d+ account\(s\) still use the default password password123: .*admin/);
  assert.match(prod.stderr, /npm run accounts -- reset /);

  // Demo mode is decided by a database name ending in _demo: a small one with a copy of the users.
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, ...adminCredentials() });
  await c.query(`DROP DATABASE IF EXISTS \`${CHECK_DEMO}\``);
  await c.query(`CREATE DATABASE \`${CHECK_DEMO}\``);
  await c.query(`CREATE TABLE \`${CHECK_DEMO}\`.users LIKE \`${TEST_DB}\`.users`);
  await c.query(`INSERT INTO \`${CHECK_DEMO}\`.users SELECT * FROM \`${TEST_DB}\`.users`);
  const [hosts] = await c.query('SELECT host FROM mysql.user WHERE user = ?', [process.env.DB_USER]);
  for (const { host } of hosts) await c.query('GRANT SELECT ON ??.* TO ?@?', [CHECK_DEMO, process.env.DB_USER, host]);
  await c.end();
  const demo = spawnSync(process.execPath, ['server.js'], { cwd: SERVER, encoding: 'utf8', timeout: 30000, env: { ...process.env, PORT: '0', DB_NAME: CHECK_DEMO } });
  assert.equal(demo.status, 1, demo.stderr);
  assert.match(demo.stderr, /Refusing to start in demo mode/);
  fs.rmSync(dist, { recursive: true, force: true });
});
