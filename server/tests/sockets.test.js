// Step 11: Socket.IO — authenticated connections, events only to permitted roles, ids/status-only
// payloads, live doctor queue, deactivation disconnects. Uses the socket.io-client the web client
// already depends on (no new dependency).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const jwt = require('jsonwebtoken');
const { io: connectSocket } = require(require.resolve('socket.io-client', { paths: [path.join(__dirname, '..', '..', 'client')] }));
const { TEST_PORT, USERS, api, login, db, closeDb } = require('./helpers');

const URL = `http://localhost:${TEST_PORT}`;
const open = [];
after(async () => { for (const s of open) s.close(); await closeDb(); });

// Resolves with the connected socket, or rejects with the connect_error message.
function connect(token) {
  return new Promise((resolve, reject) => {
    const s = connectSocket(URL, { auth: token === undefined ? {} : { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    open.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => { s.close(); reject(e); });
  });
}
// Records every event a socket receives.
function recorder(socket) {
  const events = [];
  socket.onAny((event, payload) => events.push({ event, payload }));
  return events;
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (fn()) return true; await wait(25); }
  return false;
}
const got = (events, name, pred = () => true) => events.filter(e => e.event === name && pred(e.payload));

const ROLES = ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'DOCTOR_2', 'NURSE', 'LABORATORY', 'PHARMACY'];
const users = {}; const sockets = {}; const seen = {};
before(async () => {
  for (const r of ROLES) {
    users[r] = await login(USERS[r]);
    sockets[r] = await connect(users[r].token);
    seen[r] = recorder(sockets[r]);
  }
});
const clear = () => { for (const r of ROLES) seen[r].length = 0; };
// Waits for `expected` roles to receive the event, then a little longer so that a stray delivery to
// any other role would have arrived too.
async function deliveredTo(name, pred) {
  await wait(400);
  return ROLES.filter(r => got(seen[r], name, pred).length > 0);
}

test('connections without a valid token for an active account are rejected', async () => {
  await assert.rejects(connect(undefined), /Unauthorized/);
  await assert.rejects(connect('not-a-jwt'), /Unauthorized/);
  await assert.rejects(connect(jwt.sign({ user_id: users.ADMIN.user.user_id, role: 'ADMIN' }, 'wrong-secret')), /Unauthorized/);
  await assert.rejects(connect(jwt.sign({ user_id: users.ADMIN.user.user_id, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: -10 })), /Unauthorized/);
  await assert.rejects(connect(jwt.sign({ user_id: 99999999, role: 'ADMIN' }, process.env.JWT_SECRET)), /Unauthorized/);
  const ok = await connect(users.NURSE.token);
  assert.ok(ok.connected);
  ok.close();
});

test('deactivating a user disconnects their live sockets, and they cannot reconnect', async () => {
  const u = `socket_user_${Date.now()}`;
  const reg = await api('POST', '/auth/register', { token: users.ADMIN.token, body: { username: u, password: 'Secret123!', role: 'PHARMACY', full_name: 'Socket Test', email: `${u}@hospital.test`, phone: '1' } });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const loginRes = await api('POST', '/auth/login', { body: { username: u, password: 'Secret123!' } });
  const token = loginRes.body.token; const userId = loginRes.body.user.user_id;
  const s1 = await connect(token);
  const s2 = await connect(token);
  const reasons = [];
  s1.on('disconnect', r => reasons.push(r)); s2.on('disconnect', r => reasons.push(r));
  assert.equal((await api('PUT', `/users/${userId}/deactivate`, { token: users.ADMIN.token })).status, 200);
  assert.ok(await until(() => reasons.length === 2), 'both sockets disconnected');
  assert.deepEqual(reasons, ['io server disconnect', 'io server disconnect']);
  await assert.rejects(connect(token), /Unauthorized/);
  assert.ok(sockets.ADMIN.connected && sockets.PHARMACY.connected, 'other users stay connected');
});

test('emergency events reach clinical and front-desk staff only (not lab or pharmacy), with ids and status only', async () => {
  clear();
  const [[p]] = await db().query('SELECT patient_id FROM patients ORDER BY patient_id LIMIT 1');
  const res = await api('POST', '/emergency', { token: users.RECEPTIONIST.token, body: { patient_id: p.patient_id, severity: 'SERIOUS', required_bed_type: 'ICU', required_specialization: null, symptoms: 'Socket test chest pain', ventilator_required: false } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.data.id;
  const to = await deliveredTo('emergency:new', pl => pl.emergencyId === id);
  assert.deepEqual(to.sort(), ['ADMIN', 'DOCTOR', 'DOCTOR_2', 'NURSE', 'RECEPTIONIST'].sort());
  const [ev] = got(seen.ADMIN, 'emergency:new', pl => pl.emergencyId === id);
  assert.deepEqual(ev.payload, { emergencyId: id, status: 'WAITING' });
  assert.deepEqual(await deliveredTo('dashboard:refresh'), ['ADMIN'], 'dashboard statistics are for administrators only');
  // Clean up the case so it does not sit in other tests' queues.
  await api('PUT', `/emergency/${id}`, { token: users.ADMIN.token, body: { status: 'CANCELLED', notes: null } });
});

test('encounter:updated reaches the visit doctor (not other doctors), the front desk, nurses and admin; the doctor queue sees check-in and triage', async () => {
  clear();
  const [[p]] = await db().query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS'))
    AND patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE') ORDER BY patient_id LIMIT 1`);
  const arrive = await api('POST', '/encounters', { token: users.RECEPTIONIST.token, body: { patient_id: p.patient_id, doctor_id: users.DOCTOR.user.doctor_id } });
  assert.equal(arrive.status, 201, JSON.stringify(arrive.body));
  const id = arrive.body.data.encounter_id;
  assert.deepEqual((await deliveredTo('encounter:updated', pl => pl.encounterId === id && pl.status === 'ARRIVED')).sort(), ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']);
  const [ev] = got(seen.DOCTOR, 'encounter:updated', pl => pl.encounterId === id);
  assert.deepEqual(ev.payload, { encounterId: id, status: 'ARRIVED' }, 'no patient details in the payload');

  // Triage recorded with vitals: same audience, after the transaction commits.
  clear();
  const v = await api('POST', '/vitals', { token: users.NURSE.token, body: { patient_id: p.patient_id, encounter_id: id, pulse_bpm: 80, mark_triaged: true } });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  assert.deepEqual((await deliveredTo('encounter:updated', pl => pl.encounterId === id && pl.status === 'TRIAGED')).sort(), ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']);

  // A failed transition sends nothing.
  clear();
  assert.equal((await api('POST', `/encounters/${id}/triage`, { token: users.NURSE.token })).status, 409);
  assert.deepEqual(await deliveredTo('encounter:updated', pl => pl.encounterId === id), []);

  clear();
  assert.equal((await api('POST', `/encounters/${id}/cancel`, { token: users.RECEPTIONIST.token })).status, 200);
  assert.ok((await deliveredTo('encounter:updated', pl => pl.encounterId === id && pl.status === 'CANCELLED')).includes('DOCTOR'));
});

test('events for a rolled-back change are never sent', async () => {
  const [[p]] = await db().query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS'))
    AND patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE') ORDER BY patient_id LIMIT 1`);
  const arrive = await api('POST', '/encounters', { token: users.RECEPTIONIST.token, body: { patient_id: p.patient_id, doctor_id: users.DOCTOR.user.doctor_id } });
  const id = arrive.body.data.encounter_id;
  await wait(200); clear();
  await db().query('DROP TRIGGER IF EXISTS test_fail_vitals_audit');
  await db().query(`CREATE TRIGGER test_fail_vitals_audit BEFORE INSERT ON audit_logs FOR EACH ROW
    BEGIN IF NEW.action = 'RECORD_VITALS' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'simulated audit failure'; END IF; END`);
  try {
    assert.equal((await api('POST', '/vitals', { token: users.NURSE.token, body: { patient_id: p.patient_id, encounter_id: id, pulse_bpm: 80, mark_triaged: true } })).status, 500);
  } finally { await db().query('DROP TRIGGER test_fail_vitals_audit'); }
  assert.deepEqual(await deliveredTo('encounter:updated', pl => pl.encounterId === id), [], 'the triage was rolled back, so no TRIAGED event');
  await api('POST', `/encounters/${id}/cancel`, { token: users.RECEPTIONIST.token });
});

test('bed:updated (beds are readable by every role) carries the bed id and status only', async () => {
  clear();
  const [[bed]] = await db().query("SELECT bed_id FROM beds WHERE status = 'AVAILABLE' ORDER BY bed_id DESC LIMIT 1");
  assert.equal((await api('PUT', `/beds/${bed.bed_id}/status`, { token: users.NURSE.token, body: { status: 'MAINTENANCE' } })).status, 200);
  assert.deepEqual((await deliveredTo('bed:updated', pl => pl.bedId === bed.bed_id)).sort(), [...ROLES].sort());
  assert.deepEqual(got(seen.LABORATORY, 'bed:updated', pl => pl.bedId === bed.bed_id)[0].payload, { bedId: bed.bed_id, status: 'MAINTENANCE' });
  await api('PUT', `/beds/${bed.bed_id}/status`, { token: users.NURSE.token, body: { status: 'AVAILABLE' } });
});

test('admission events reach admin, front desk, the admitting doctor and that ward\'s nurses only; discharge frees the bed live', async () => {
  const [[doc]] = await db().query('SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = ?', [USERS.DOCTOR_2]);
  const [[cap]] = await db().query('SELECT current_workload, max_workload FROM doctors WHERE doctor_id = ?', [doc.doctor_id]);
  if (cap.current_workload >= cap.max_workload) await db().query('UPDATE doctors SET max_workload = current_workload + 1 WHERE doctor_id = ?', [doc.doctor_id]);
  const [[p]] = await db().query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE')
    AND patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS')) ORDER BY patient_id LIMIT 1`);
  // General Ward A is not one of nurse1's wards; General Ward B is.
  for (const [ward, nurseHears] of [['General Ward A', false], ['General Ward B', true]]) {
    clear();
    const [[bed]] = await db().query("SELECT b.bed_id FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = ? AND b.status = 'AVAILABLE' ORDER BY b.bed_id LIMIT 1", [ward]);
    const res = await api('POST', '/admissions', { token: users.RECEPTIONIST.token, body: { patient_id: p.patient_id, doctor_id: doc.doctor_id, bed_id: bed.bed_id, department_id: 1, diagnosis: 'Socket test' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const admissionId = res.body.data.id;
    const expected = ['ADMIN', 'DOCTOR_2', 'RECEPTIONIST', ...(nurseHears ? ['NURSE'] : [])].sort();
    assert.deepEqual((await deliveredTo('admission:new', pl => pl.admissionId === admissionId)).sort(), expected, ward);
    assert.deepEqual(got(seen.ADMIN, 'admission:new', pl => pl.admissionId === admissionId)[0].payload, { admissionId, status: 'ACTIVE' });
    assert.ok(got(seen.PHARMACY, 'bed:updated', pl => pl.bedId === bed.bed_id && pl.status === 'OCCUPIED').length === 1);

    clear();
    assert.equal((await api('POST', `/admissions/${admissionId}/discharge`, { token: users.ADMIN.token })).status, 200);
    assert.deepEqual((await deliveredTo('admission:discharged', pl => pl.admissionId === admissionId)).sort(), expected);
    const [[after]] = await db().query('SELECT status FROM beds WHERE bed_id = ?', [bed.bed_id]);
    assert.deepEqual(got(seen.NURSE, 'bed:updated', pl => pl.bedId === bed.bed_id)[0]?.payload, { bedId: bed.bed_id, status: after.status });
    await db().query("UPDATE beds SET status = 'AVAILABLE' WHERE bed_id = ?", [bed.bed_id]);
  }
});

test('no event payload carries patient details', async () => {
  const all = ROLES.flatMap(r => seen[r]);
  const allowed = new Set(['emergencyId', 'status', 'admissionId', 'bedId', 'doctorId', 'encounterId']);
  for (const { event, payload } of all) {
    for (const k of Object.keys(payload || {})) assert.ok(allowed.has(k), `${event} carries ${k}`);
  }
});
