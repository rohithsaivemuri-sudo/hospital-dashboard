// npm run demo:reset — rebuilds the demo database (default hospital_demo) for trying every role's
// workflow: the bundled seed data plus every migration, then "today" activity created through the
// app's own API (so every rule, trigger and audit row applies), and a new random password for every
// account, printed once and never stored. Refuses any database whose name does not end in _demo.
//
// Uses the admin account (DB_ADMIN_USER) to build the database and to give the app account
// (DB_USER) data access to it; the temporary API server it starts runs as DB_USER.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { buildFromSeed } = require('./lib/build-db');
const { adminCredentials } = require('./lib/admin-credentials');

const DEMO_DB = process.env.DEMO_DB_NAME || 'hospital_demo';
const PORT = Number(process.env.DEMO_BUILD_PORT || 5088);
const API = `http://127.0.0.1:${PORT}/api`;

// Strong and still typeable: 16 characters from a URL-safe alphabet.
const newPassword = () => crypto.randomBytes(12).toString('base64url');

const pad = (n) => String(n).padStart(2, '0');
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function assertDemoName(name) {
  if (!/^[a-z0-9_]+_demo$/.test(name) || name === 'hospital_db') {
    throw new Error(`Refusing to reset "${name}": the demo database name must end in _demo (it is dropped and rebuilt)`);
  }
}

const portFree = (port) => new Promise(resolve => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); resolve(false); });
  s.on('error', () => resolve(true));
});

async function adminConnection(database) {
  return mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, ...adminCredentials(), database });
}

// The app account gets the same five data privileges on the demo database as on hospital_db.
async function grantAppAccount(conn) {
  const user = process.env.DB_USER;
  if (!user || user.toLowerCase() === 'root') throw new Error('DB_USER must be the restricted app account (see docs/mysql-app-user.sql)');
  const [hosts] = await conn.query('SELECT host FROM mysql.user WHERE user = ?', [user]);
  if (!hosts.length) throw new Error(`MySQL account ${user} not found; run docs/mysql-app-user.sql first`);
  for (const { host } of hosts) await conn.query('GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON ??.* TO ?@?', [DEMO_DB, user, host]);
}

// Every account gets a new random password; returns [{ username, role, full_name, password }].
async function rotatePasswords(conn) {
  const [users] = await conn.query('SELECT user_id, username, role, full_name FROM users ORDER BY FIELD(role, "ADMIN", "DOCTOR", "NURSE", "RECEPTIONIST", "LABORATORY", "PHARMACY"), username');
  const out = [];
  for (const u of users) {
    const password = newPassword();
    await conn.query('UPDATE users SET password_hash = ?, is_active = TRUE WHERE user_id = ?', [await bcrypt.hash(password, 10), u.user_id]);
    out.push({ ...u, password });
  }
  return out;
}

async function startServer() {
  if (!(await portFree(PORT))) throw new Error(`Port ${PORT} is in use (set DEMO_BUILD_PORT to a free port); not stopping whatever holds it`);
  const env = { ...process.env, DB_NAME: DEMO_DB, PORT: String(PORT), NODE_ENV: 'development', LOG_REQUESTS: 'false', LOGIN_MAX_PER_IP: '100000', LOGIN_MAX_FAILURES: '100000' };
  const proc = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d; });
  const start = Date.now();
  while (Date.now() - start < 20000) {
    if (proc.exitCode !== null) throw new Error(`demo API server exited: ${stderr.trim().slice(0, 500)}`);
    try { if ((await fetch(`${API}/auth/me`)).status) return proc; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error('demo API server did not start');
}

async function call(method, p, token, body) {
  const res = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (res.status >= 400) throw new Error(`${method} ${p} -> ${res.status} ${json.message || ''}`);
  return json;
}

// "Today" for every role: a front desk queue, triage, a doctor mid-visit, lab work in each state,
// prescriptions waiting for pharmacy, and emergencies (one not yet registered).
async function createActivity(conn, accounts) {
  const tokens = {};
  for (const a of accounts) tokens[a.username] = (await call('POST', '/auth/login', null, { username: a.username, password: a.password })).token;
  const t = (username) => { if (!tokens[username]) throw new Error(`demo account ${username} missing from the seed`); return tokens[username]; };
  const doctorId = async (username) => (await conn.query('SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = ?', [username]))[0][0].doctor_id;
  const [smith, patel, kumar] = [await doctorId('dr.smith'), await doctorId('dr.patel'), await doctorId('dr.kumar')];
  const [free] = await conn.query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE')
    AND patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED', 'TRIAGED', 'IN_PROGRESS')) ORDER BY patient_id`);
  const patients = free.map(p => p.patient_id);
  if (patients.length < 12) throw new Error('not enough seed patients for the demo activity');
  const next = () => patients.shift();
  const date = today();
  const rec = t('reception1');

  // Front desk: today's appointments; some patients have arrived.
  // The seed already has some of today's appointments: take the first free slot at or after `time`.
  const book = async (doctor, time, reason) => {
    const [taken] = await conn.query("SELECT TIME_FORMAT(appointment_time, '%H:%i:%s') t FROM appointments WHERE doctor_id = ? AND appointment_date = ?", [doctor, date]);
    const busy = new Set(taken.map(r => r.t));
    let [h, m] = time.split(':').map(Number);
    while (busy.has(`${pad(h)}:${pad(m)}:00`)) { m += 15; if (m >= 60) { m -= 60; h += 1; } }
    return (await call('POST', '/appointments', rec, { patient_id: next(), doctor_id: doctor, appointment_date: date, appointment_time: `${pad(h)}:${pad(m)}:00`, reason })).data.id;
  };
  const smithAppts = [await book(smith, '09:30:00', 'Chest pain follow-up'), await book(smith, '10:15:00', 'Hypertension review'), await book(smith, '11:00:00', 'Palpitations'), await book(smith, '16:30:00', 'Post-op review')];
  const patelAppts = [await book(patel, '10:00:00', 'Migraine'), await book(patel, '15:00:00', 'Numbness in left hand')];
  await book(kumar, '12:00:00', 'Minor injury review');
  const checkIn = async (id) => (await call('POST', '/encounters', rec, { appointment_id: id })).data;
  const [inProgress, triaged] = [await checkIn(smithAppts[0]), await checkIn(smithAppts[1])];
  await checkIn(smithAppts[2]); // arrived, waiting for triage
  await checkIn(patelAppts[0]);
  await call('POST', '/encounters', rec, { patient_id: next(), doctor_id: smith }); // a walk-in

  // Nurse: vitals at triage (one abnormal temperature); the walk-in is still waiting.
  await call('POST', '/vitals', t('nurse1'), { patient_id: triaged.patient_id, encounter_id: triaged.encounter_id, temperature_c: 38.4, pulse_bpm: 96, resp_rate: 18, bp_systolic: 142, bp_diastolic: 91, spo2_pct: 97, pain_score: 2, mark_triaged: true });
  await call('POST', '/vitals', t('nurse1'), { patient_id: inProgress.patient_id, encounter_id: inProgress.encounter_id, temperature_c: 36.9, pulse_bpm: 74, bp_systolic: 128, bp_diastolic: 82, spo2_pct: 99, mark_triaged: true });

  // Doctor: one visit in progress with a note, lab orders and a prescription for pharmacy.
  const doc = t('dr.smith');
  await call('POST', `/encounters/${inProgress.encounter_id}/start`, doc);
  await call('POST', '/consultations', doc, { patient_id: inProgress.patient_id, doctor_id: smith, symptoms: 'Intermittent chest tightness on exertion for two weeks', diagnosis: 'Suspected stable angina', assessment: 'Normal vitals at rest; ECG and lipids requested', plan: 'Lipid profile, blood glucose; review with results' });
  const [tests] = await conn.query('SELECT test_id, name FROM lab_tests');
  const testId = (n) => {
    const found = tests.find(x => x.name === n || x.name.startsWith(`${n} (`));
    if (!found) throw new Error(`lab test "${n}" missing from the seed`);
    return found.test_id;
  };
  const order = async (doctorToken, doctor, patientId, name) => (await call('POST', '/lab/orders', doctorToken, { patient_id: patientId, doctor_id: doctor, tests: [{ test_id: testId(name) }], notes: '' })).data.id;
  await order(doc, smith, inProgress.patient_id, 'Lipid Profile');
  await order(doc, smith, inProgress.patient_id, 'Blood Glucose Fasting');
  const [meds] = await conn.query(`SELECT m.medicine_id FROM medicines m WHERE EXISTS (SELECT 1 FROM medicine_batches b WHERE b.medicine_id = m.medicine_id AND b.quantity >= 30 AND b.expiry_date > CURDATE()) ORDER BY m.medicine_id LIMIT 3`);
  if (meds.length < 2) throw new Error('not enough medicines in stock for the demo prescriptions');
  await call('POST', '/prescriptions', doc, { patient_id: inProgress.patient_id, doctor_id: smith, items: [
    { medicine_id: meds[0].medicine_id, dosage: '1 tablet', frequency: 'Once daily', duration: '30 days', quantity: 30, frequency_code: 'OD', duration_days: 30, route: 'ORAL' },
    { medicine_id: meds[1].medicine_id, dosage: '1 tablet', frequency: 'As needed for chest pain', duration: '30 days', quantity: 10, frequency_code: 'PRN', route: 'SUBLINGUAL' },
  ] });

  // Laboratory: work in every state (ordered, processing, completed with an automatic flag).
  const lab = t('lab_staff');
  const patelPatient = (await conn.query('SELECT patient_id FROM appointments WHERE appointment_id = ?', [patelAppts[0]]))[0][0].patient_id;
  const processing = await order(t('dr.patel'), patel, patelPatient, 'Thyroid Profile');
  await call('PUT', `/lab/orders/${processing}/status`, lab, { status: 'PROCESSING' });
  const done = await order(t('dr.patel'), patel, patelPatient, 'Blood Glucose Fasting');
  await call('PUT', `/lab/orders/${done}/status`, lab, { status: 'PROCESSING' });
  await call('POST', '/lab/results', lab, { order_id: done, result_value: '128', unit: 'mg/dL', technician_notes: 'Fasting sample' });
  await order(t('dr.patel'), patel, patelPatient, 'Complete Blood Count');

  // Emergency: one registered case waiting for a bed, one arrival not yet registered.
  await call('POST', '/emergency', rec, { patient_id: next(), severity: 'SERIOUS', required_bed_type: 'GENERAL', required_specialization: 'Emergency Medicine', symptoms: 'Fall from stairs, suspected wrist fracture', ventilator_required: false });
  await call('POST', '/emergency', rec, { patient_id: null, severity: 'VERY_SERIOUS', required_bed_type: 'GENERAL', required_specialization: 'Emergency Medicine', symptoms: 'Brought in by ambulance: road traffic accident, conscious', ventilator_required: false });
}

async function main() {
  assertDemoName(DEMO_DB);
  console.log(`[demo] rebuilding ${DEMO_DB} (seed data + migrations)...`);
  await buildFromSeed(DEMO_DB);
  const conn = await adminConnection(DEMO_DB);
  let server;
  try {
    await grantAppAccount(conn);
    const accounts = await rotatePasswords(conn);
    console.log('[demo] creating today\'s activity through the API...');
    server = await startServer();
    await createActivity(conn, accounts);
    console.log(`\n[demo] ${DEMO_DB} is ready. Start it with: npm run demo:start  (http://localhost:5000)`);
    console.log('[demo] Demo accounts — passwords are shown only now and stored nowhere (copy them before closing this window):\n');
    const w = Math.max(...accounts.map(a => a.username.length));
    for (const a of accounts) console.log(`  ${a.role.padEnd(13)} ${a.username.padEnd(w)}  ${a.password}   ${a.full_name}`);
    console.log('\n[demo] Run npm run demo:reset again for a fresh copy (new passwords).');
  } finally {
    if (server) server.kill();
    await conn.end();
  }
}

if (require.main === module) {
  main().catch(e => { console.error('[demo] failed:', e.message); process.exit(1); });
}

module.exports = { assertDemoName, DEMO_DB };
