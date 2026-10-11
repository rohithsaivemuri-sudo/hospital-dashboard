// Emergency visits: allocating an emergency case creates (or links) an EMERGENCY visit for the
// allocated doctor in the same transaction, which then follows the normal visit lifecycle.
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { io: connectSocket } = require(require.resolve('socket.io-client', { paths: [path.join(__dirname, '..', '..', 'client')] }));
const { TEST_PORT, TEST_DB, USERS, api, login, db, closeDb } = require('./helpers');
const { runSqlFile } = require('../scripts/lib/sql');

// Pediatrics has exactly one available doctor in the test data (dr.reddy), and no other test file
// uses dr.reddy, so allocation is deterministic and cannot disturb other files' care-set fixtures.
const SPECIALIZATION = 'Pediatrics';
let admin, reception, nurse, reddy, reddyUser, otherDoctor;
const sockets = [];
const cleanup = { admissions: new Set(), encounters: new Set() };

before(async () => {
  [admin, reception, nurse, otherDoctor] = await Promise.all([USERS.ADMIN, USERS.RECEPTIONIST, USERS.NURSE, USERS.DOCTOR].map(login));
  reddy = await login('dr.reddy');
  [[reddyUser]] = await db().query("SELECT d.doctor_id, d.max_workload FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = 'dr.reddy'");
  await db().query('UPDATE doctors SET max_workload = 50 WHERE doctor_id = ?', [reddyUser.doctor_id]); // room for every test's allocations
});
// Each test frees what it used (beds are limited: every allocation occupies one).
async function release() {
  for (const id of cleanup.encounters) await api('POST', `/encounters/${id}/entered-in-error`, { token: reddy.token });
  const ids = [0, ...cleanup.admissions];
  for (const id of cleanup.admissions) await api('POST', `/admissions/${id}/discharge`, { token: admin.token });
  await db().query("UPDATE beds SET status = 'AVAILABLE' WHERE status <> 'AVAILABLE' AND bed_id IN (SELECT bed_id FROM admissions WHERE admission_id IN (?))", [ids]);
  cleanup.encounters.clear(); cleanup.admissions.clear();
}
afterEach(release);
after(async () => {
  for (const s of sockets) s.close();
  await db().query('UPDATE doctors SET max_workload = ? WHERE doctor_id = ?', [reddyUser.max_workload, reddyUser.doctor_id]);
  await closeDb();
});

let seq = 0;
async function newPatient() {
  const res = await api('POST', '/patients', { token: reception.token, body: { name: `Emergency Visit Test ${Date.now()}-${seq++}`, date_of_birth: '2015-04-01', gender: 'FEMALE', blood_group: 'O+', phone: null, address: null, emergency_contact: null } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}
async function newCase(patientId, extra = {}) {
  const res = await api('POST', '/emergency', { token: reception.token, body: { patient_id: patientId, severity: 'SERIOUS', required_bed_type: 'GENERAL', required_specialization: SPECIALIZATION, symptoms: 'Emergency visit test', ventilator_required: false, ...extra } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}
const allocate = (id, token = reception.token) => api('POST', `/emergency/${id}/allocate`, { token });
function track(res) {
  if (res?.body?.allocation) { cleanup.admissions.add(res.body.allocation.admissionId); cleanup.encounters.add(res.body.allocation.encounterId); }
  return res;
}
const openVisits = async (patientId) => (await db().query("SELECT * FROM encounters WHERE patient_id = ? AND doctor_id = ? AND status IN ('ARRIVED','TRIAGED','IN_PROGRESS')", [patientId, reddyUser.doctor_id]))[0];

test('allocation creates an EMERGENCY visit in ARRIVED, linked to the admission, audited in the same transaction', async () => {
  const patient = await newPatient();
  const caseId = await newCase(patient);
  const res = track(await allocate(caseId));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { admissionId, encounterId, doctor } = res.body.allocation;
  assert.equal(doctor.id, reddyUser.doctor_id);
  const [[e]] = await db().query('SELECT * FROM encounters WHERE encounter_id = ?', [encounterId]);
  assert.deepEqual([e.encounter_type, e.status, e.admission_id, e.patient_id, e.doctor_id, e.created_by, e.appointment_id],
    ['EMERGENCY', 'ARRIVED', admissionId, patient, reddyUser.doctor_id, reception.user.user_id, null]);
  assert.ok(e.arrived_at);
  const [audits] = await db().query("SELECT action, entity_id, details FROM audit_logs WHERE patient_id = ? AND action IN ('ENCOUNTER_ARRIVED', 'ALLOCATE_EMERGENCY') ORDER BY audit_id", [patient]);
  assert.deepEqual(audits.map(a => a.action), ['ENCOUNTER_ARRIVED', 'ALLOCATE_EMERGENCY']);
  const details = (a) => (typeof a.details === 'string' ? JSON.parse(a.details) : a.details);
  assert.deepEqual(details(audits[0]), { from: null, to: 'ARRIVED', source: 'EMERGENCY', emergency_id: caseId, admission_id: admissionId });
  assert.equal(details(audits[1]).encounter_id, encounterId);

  // In the doctor's open visits, and only that doctor's.
  const queue = (await api('GET', '/encounters/queue', { token: reddy.token })).body.data;
  assert.equal(queue.find(v => v.encounter_id === encounterId)?.encounter_type, 'EMERGENCY');
  assert.ok(!(await api('GET', '/encounters/queue', { token: otherDoctor.token })).body.data.some(v => v.encounter_id === encounterId));
});

test('the emergency visit follows the normal lifecycle: start, notes, orders, sign and close', async () => {
  const patient = await newPatient();
  const res = track(await allocate(await newCase(patient)));
  const id = res.body.allocation.encounterId;
  assert.equal((await api('POST', `/encounters/${id}/start`, { token: reddy.token })).status, 200);
  const note = await api('POST', '/consultations', { token: reddy.token, body: { patient_id: patient, doctor_id: reddyUser.doctor_id, symptoms: 'Fever', diagnosis: 'Viral' } });
  const order = await api('POST', '/lab/orders', { token: reddy.token, body: { patient_id: patient, doctor_id: reddyUser.doctor_id, tests: [{ test_id: 1 }], notes: '' } });
  const rx = await api('POST', '/prescriptions', { token: reddy.token, body: { patient_id: patient, doctor_id: reddyUser.doctor_id, items: [{ medicine_id: 2, dosage: '5 ml', frequency: 'TDS', duration: '3 days', quantity: 1 }] } });
  for (const r of [note, order, rx]) assert.equal(r.status, 201, JSON.stringify(r.body));
  const detail = (await api('GET', `/encounters/${id}`, { token: reddy.token })).body.data;
  assert.deepEqual([detail.consultation_ids, detail.lab_order_ids, detail.prescription_ids], [[note.body.data.id], [order.body.data.id], [rx.body.data.id]]);
  assert.equal((await api('POST', `/encounters/${id}/finish`, { token: reddy.token })).status, 200);
  cleanup.encounters.delete(id);
  const edit = await api('PUT', `/consultations/${note.body.data.id}`, { token: reddy.token, body: { symptoms: 'changed', diagnosis: 'Viral' } });
  assert.equal(edit.status, 409, 'signed notes are immutable');
});

test('if the doctor already has an open visit with the patient, allocation links it instead of creating a second', async () => {
  const patient = await newPatient();
  const walkIn = (await api('POST', '/encounters', { token: reception.token, body: { patient_id: patient, doctor_id: reddyUser.doctor_id } })).body.data.encounter_id;
  cleanup.encounters.add(walkIn);
  const res = track(await allocate(await newCase(patient)));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.allocation.encounterId, walkIn);
  const visits = await openVisits(patient);
  assert.equal(visits.length, 1);
  assert.equal(visits[0].admission_id, res.body.allocation.admissionId);
  const [[a]] = await db().query("SELECT details FROM audit_logs WHERE action = 'ENCOUNTER_LINKED_ADMISSION' AND entity_id = ?", [walkIn]);
  assert.ok(a, 'the link is audited');
});

test('a case without a registered patient waits: allocation is refused with 400 and changes nothing until a patient is linked', async () => {
  const caseId = await newCase(null);
  const [[{ n: admissionsBefore }]] = await db().query('SELECT COUNT(*) n FROM admissions');
  const refused = await allocate(caseId);
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, 'PATIENT_REQUIRED');
  const [[{ n: admissionsAfter }]] = await db().query('SELECT COUNT(*) n FROM admissions');
  assert.equal(admissionsAfter, admissionsBefore);
  const [[ec]] = await db().query('SELECT status, assigned_doctor_id FROM emergency_cases WHERE emergency_id = ?', [caseId]);
  assert.deepEqual([ec.status, ec.assigned_doctor_id], ['WAITING', null]);

  for (const u of [await login(USERS.LABORATORY), await login(USERS.PHARMACY)]) {
    assert.equal((await api('PUT', `/emergency/${caseId}/patient`, { token: u.token, body: { patient_id: 1 } })).status, 403, u.user.role);
  }
  assert.equal((await api('PUT', `/emergency/${caseId}/patient`, { token: reception.token, body: { patient_id: 99999999 } })).status, 400);
  const patient = await newPatient();
  assert.equal((await api('PUT', `/emergency/${caseId}/patient`, { token: nurse.token, body: { patient_id: patient } })).status, 200);
  const res = track(await allocate(caseId));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.allocation.patientId, patient);
  assert.equal((await api('PUT', `/emergency/${caseId}/patient`, { token: reception.token, body: { patient_id: 1 } })).status, 409, 'not once allocated');
});

test('if the visit\'s audit row cannot be written, the whole allocation rolls back', async () => {
  const patient = await newPatient();
  const caseId = await newCase(patient);
  await db().query('DROP TRIGGER IF EXISTS test_fail_emergency_visit_audit');
  await db().query(`CREATE TRIGGER test_fail_emergency_visit_audit BEFORE INSERT ON audit_logs FOR EACH ROW
    BEGIN IF NEW.action = 'ENCOUNTER_ARRIVED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'simulated audit failure'; END IF; END`);
  try {
    assert.equal((await allocate(caseId)).status, 500);
  } finally { await db().query('DROP TRIGGER test_fail_emergency_visit_audit'); }
  const [[ec]] = await db().query('SELECT status FROM emergency_cases WHERE emergency_id = ?', [caseId]);
  assert.equal(ec.status, 'WAITING');
  assert.deepEqual(await openVisits(patient), []);
  const [adm] = await db().query('SELECT admission_id FROM admissions WHERE emergency_id = ?', [caseId]);
  assert.deepEqual(adm, []);
});

test('the doctor gets the live update; other doctors do not', async () => {
  const connect = (token) => new Promise((resolve, reject) => {
    const s = connectSocket(`http://localhost:${TEST_PORT}`, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s); s.on('connect', () => resolve(s)); s.on('connect_error', reject);
  });
  const [mine, theirs] = [await connect(reddy.token), await connect(otherDoctor.token)];
  const seen = { mine: [], theirs: [] };
  mine.on('encounter:updated', p => seen.mine.push(p)); theirs.on('encounter:updated', p => seen.theirs.push(p));
  const res = track(await allocate(await newCase(await newPatient())));
  const id = res.body.allocation.encounterId;
  const start = Date.now();
  while (!seen.mine.some(p => p.encounterId === id) && Date.now() - start < 3000) await new Promise(r => setTimeout(r, 25));
  await new Promise(r => setTimeout(r, 300));
  assert.deepEqual(seen.mine.filter(p => p.encounterId === id), [{ encounterId: id, status: 'ARRIVED' }]);
  assert.deepEqual(seen.theirs.filter(p => p.encounterId === id), []);
});

test('concurrent: two cases for one patient allocated at once to the same doctor give one open visit, no errors', async () => {
  for (let round = 0; round < 6; round++) {
    const patient = await newPatient();
    const [a, b] = [await newCase(patient), await newCase(patient)];
    const results = (await Promise.all([allocate(a), allocate(b)])).map(track);
    assert.deepEqual(results.map(r => r.status), [200, 200], JSON.stringify(results.map(r => r.body)));
    const visits = await openVisits(patient);
    assert.equal(visits.length, 1, `round ${round}: ${visits.length} open visits`);
    assert.deepEqual(new Set(results.map(r => r.body.allocation.encounterId)), new Set([visits[0].encounter_id]));
    await release();
  }
});

test('concurrent: allocation while the doctor starts the patient\'s open visit never deadlocks', async () => {
  for (let round = 0; round < 8; round++) {
    const patient = await newPatient();
    const walkIn = (await api('POST', '/encounters', { token: reception.token, body: { patient_id: patient, doctor_id: reddyUser.doctor_id } })).body.data.encounter_id;
    cleanup.encounters.add(walkIn);
    const caseId = await newCase(patient);
    const [alloc, start] = await Promise.all([allocate(caseId), api('POST', `/encounters/${walkIn}/start`, { token: reddy.token })]);
    track(alloc);
    assert.equal(alloc.status, 200, `round ${round}: ${JSON.stringify(alloc.body)}`);
    assert.equal(start.status, 200, `round ${round}: ${JSON.stringify(start.body)}`);
    const visits = await openVisits(patient);
    assert.equal(visits.length, 1);
    assert.deepEqual([visits[0].encounter_id, visits[0].status, visits[0].admission_id], [walkIn, 'IN_PROGRESS', alloc.body.allocation.admissionId]);
    await release();
  }
});

test('migration 012 backfills a visit for an active emergency admission that has none, and is safe to re-run', async () => {
  // Simulate admissions made before this change: detach their visits.
  const created = track(await allocate(await newCase(await newPatient())));
  const linkedPatient = await newPatient();
  const linked = track(await allocate(await newCase(linkedPatient)));
  for (const r of [created, linked]) await db().query("UPDATE encounters SET admission_id = NULL, status = IF(encounter_id = ?, 'CANCELLED', status) WHERE encounter_id = ?", [created.body.allocation.encounterId, r.body.allocation.encounterId]);
  const run = async () => runSqlFile(TEST_DB, path.join(__dirname, '..', '..', 'database', 'migrations', '012_emergency_visits.sql'));
  await run();
  const [[made]] = await db().query('SELECT * FROM encounters WHERE admission_id = ?', [created.body.allocation.admissionId]);
  assert.deepEqual([made.encounter_type, made.status, made.backfilled_from], ['EMERGENCY', 'ARRIVED', `emergency_admission:${created.body.allocation.admissionId}`]);
  cleanup.encounters.add(made.encounter_id);
  const [[relinked]] = await db().query('SELECT encounter_id FROM encounters WHERE admission_id = ?', [linked.body.allocation.admissionId]);
  assert.equal(relinked.encounter_id, linked.body.allocation.encounterId, 'the open visit was linked, not duplicated');
  const [[{ n }]] = await db().query('SELECT COUNT(*) n FROM encounters');
  await run();
  const [[{ n: again }]] = await db().query('SELECT COUNT(*) n FROM encounters');
  assert.equal(again, n);
});
