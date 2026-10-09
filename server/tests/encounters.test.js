// Phase 1 step 4: encounter lifecycle, appointment mirroring, migration 002 backfill.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { USERS, TEST_DB, api, login, db, closeDb } = require('./helpers');
const { runSqlFile } = require('../scripts/lib/sql');

after(closeDb);

const MIRROR = { ARRIVED: 'CHECKED_IN', TRIAGED: 'CHECKED_IN', IN_PROGRESS: 'IN_PROGRESS', FINISHED: 'COMPLETED', CANCELLED: 'CANCELLED', ENTERED_IN_ERROR: 'CANCELLED' };
let admin, reception, nurse, doctor, doctor2, lab, pharmacy;
let slot = 0;

before(async () => {
  [admin, reception, nurse, doctor, doctor2, lab, pharmacy] = await Promise.all(
    [USERS.ADMIN, USERS.RECEPTIONIST, USERS.NURSE, USERS.DOCTOR, USERS.DOCTOR_2, USERS.LABORATORY, USERS.PHARMACY].map(login)
  );
});

async function book(doctorUser = doctor, patientId = 1) {
  slot += 1;
  const res = await api('POST', '/appointments', { token: reception.token, body: {
    patient_id: patientId, doctor_id: doctorUser.user.doctor_id,
    appointment_date: '2032-06-01', appointment_time: `${String(8 + Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}:00`,
  } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

async function checkIn(appointmentId) {
  const res = await api('POST', '/encounters', { token: reception.token, body: { appointment_id: appointmentId } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

const act = (encounterId, action, user) => api('POST', `/encounters/${encounterId}/${action}`, { token: user.token });

async function state(appointmentId) {
  const [[row]] = await db().query(
    'SELECT a.status AS appointment, e.status AS encounter, e.encounter_id FROM appointments a LEFT JOIN encounters e ON e.appointment_id = a.appointment_id WHERE a.appointment_id = ?',
    [appointmentId]
  );
  return row;
}

async function assertMirrored(appointmentId, encounterStatus) {
  const s = await state(appointmentId);
  assert.equal(s.encounter, encounterStatus);
  assert.equal(s.appointment, MIRROR[encounterStatus], `appointment should be ${MIRROR[encounterStatus]} while encounter is ${encounterStatus}`);
}

test('migration 002 backfill: in-flight and completed appointments have encounters in the matching state', async () => {
  const [rows] = await db().query(`SELECT a.appointment_id, a.status appt, e.status enc, e.backfilled_from FROM appointments a
    JOIN encounters e ON e.appointment_id = a.appointment_id WHERE e.backfilled_from IS NOT NULL ORDER BY a.appointment_id`);
  assert.ok(rows.some(r => r.appt === 'CHECKED_IN' && r.enc === 'ARRIVED'), 'the seeded CHECKED_IN appointment has an ARRIVED encounter');
  assert.ok(rows.some(r => r.appt === 'COMPLETED' && r.enc === 'FINISHED'));
  for (const r of rows) assert.equal(r.appt, MIRROR[r.enc]);

  const [[{ unlinked }]] = await db().query("SELECT COUNT(*) unlinked FROM consultations WHERE encounter_id IS NULL AND consultation_time < NOW() - INTERVAL 1 HOUR");
  assert.equal(unlinked, 0, 'every pre-existing consultation is linked');
  const [[{ orphans }]] = await db().query(`SELECT COUNT(*) orphans FROM appointments a WHERE a.status IN ('CHECKED_IN','IN_PROGRESS','COMPLETED')
    AND NOT EXISTS (SELECT 1 FROM encounters e WHERE e.appointment_id = a.appointment_id)`);
  assert.equal(orphans, 0);
});

test('backfilled in-flight appointment still works with the doctor dashboard buttons (CHECKED_IN -> IN_PROGRESS -> COMPLETED)', async () => {
  const [[appt]] = await db().query(`SELECT a.appointment_id, a.doctor_id, e.encounter_id FROM appointments a JOIN encounters e ON e.appointment_id = a.appointment_id
    WHERE e.backfilled_from IS NOT NULL AND a.status = 'CHECKED_IN' LIMIT 1`);
  const [[owner]] = await db().query('SELECT u.username FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE d.doctor_id = ?', [appt.doctor_id]);
  const { token } = await login(owner.username);
  // The dashboard buttons call the encounter endpoints (doctors no longer change appointment status directly).
  assert.equal((await api('POST', `/encounters/${appt.encounter_id}/start`, { token })).status, 200);
  await assertMirrored(appt.appointment_id, 'IN_PROGRESS');
  assert.equal((await api('POST', `/encounters/${appt.encounter_id}/finish`, { token })).status, 200);
  await assertMirrored(appt.appointment_id, 'FINISHED');
});

test('migration 002 is idempotent: re-running it after app activity creates no encounters and changes no links', async () => {
  // Activity since the migration: a standalone note (legitimately unlinked) must not be backfilled.
  await api('POST', '/consultations', { token: doctor.token, body: { patient_id: 1, doctor_id: doctor.user.doctor_id, symptoms: 'post-migration note', diagnosis: 'd' } });
  const snapshot = async () => (await db().query(`SELECT
    (SELECT COUNT(*) FROM encounters) encounters,
    (SELECT COUNT(*) FROM consultations WHERE encounter_id IS NOT NULL) c,
    (SELECT COUNT(*) FROM lab_orders WHERE encounter_id IS NOT NULL) l,
    (SELECT COUNT(*) FROM prescriptions WHERE encounter_id IS NOT NULL) p,
    (SELECT COALESCE(SUM(encounter_id), 0) FROM consultations) cs,
    (SELECT COUNT(*) FROM audit_logs WHERE action = 'MIGRATION_BACKFILL') runs`))[0][0];
  const beforeRun = await snapshot();
  runSqlFile(TEST_DB, path.join(__dirname, '..', '..', 'database', 'migrations', '002_encounters.sql'));
  assert.deepEqual(await snapshot(), beforeRun);
});

test('full path: check in -> triage -> start -> finish, appointment mirrored at every step', async () => {
  const appointmentId = await book();
  const enc = await checkIn(appointmentId);
  assert.equal(enc.status, 'ARRIVED');
  assert.equal(enc.appointment_id, appointmentId);
  await assertMirrored(appointmentId, 'ARRIVED');

  assert.equal((await act(enc.encounter_id, 'triage', nurse)).status, 200);
  await assertMirrored(appointmentId, 'TRIAGED');
  assert.equal((await act(enc.encounter_id, 'start', doctor)).status, 200);
  await assertMirrored(appointmentId, 'IN_PROGRESS');
  const finished = await act(enc.encounter_id, 'finish', doctor);
  assert.equal(finished.status, 200);
  assert.equal(finished.body.data.status, 'FINISHED');
  await assertMirrored(appointmentId, 'FINISHED');

  const [[times]] = await db().query('SELECT arrived_at, triaged_at, start_timestamp, end_timestamp FROM encounters WHERE encounter_id = ?', [enc.encounter_id]);
  assert.ok(times.arrived_at && times.triaged_at && times.start_timestamp && times.end_timestamp);
});

test('triage is not a gate: a doctor can start straight from ARRIVED', async () => {
  const appointmentId = await book();
  const enc = await checkIn(appointmentId);
  assert.equal((await act(enc.encounter_id, 'start', doctor)).status, 200);
  await assertMirrored(appointmentId, 'IN_PROGRESS');
  await act(enc.encounter_id, 'finish', doctor);
});

test('the existing appointment status endpoint drives the same state machine (front desk), and cannot start or finish visits', async () => {
  const appointmentId = await book();
  const put = (status, user = reception) => api('PUT', `/appointments/${appointmentId}/status`, { token: user.token, body: { status } });
  assert.equal((await put('CHECKED_IN')).status, 200);
  await assertMirrored(appointmentId, 'ARRIVED');
  // Starting/finishing is the assigned doctor's action, through the encounter.
  for (const user of [reception, admin]) {
    const res = await put('IN_PROGRESS', user);
    assert.equal(res.status, 403);
    assert.match(res.body.message, /started and finished by the doctor/);
  }
  assert.equal((await put('IN_PROGRESS', doctor)).status, 403);
  await assertMirrored(appointmentId, 'ARRIVED');
  const { encounter_id } = await state(appointmentId);
  assert.equal((await act(encounter_id, 'start', doctor)).status, 200);
  await assertMirrored(appointmentId, 'IN_PROGRESS');
  assert.equal((await put('COMPLETED', reception)).status, 403);
  assert.equal((await act(encounter_id, 'finish', doctor)).status, 200);
  await assertMirrored(appointmentId, 'FINISHED');
  const list = await api('GET', '/appointments', { token: reception.token });
  const row = list.body.data.find(a => a.appointment_id === appointmentId);
  assert.equal(row.encounter_status, 'FINISHED');
  assert.ok(row.encounter_id);
});

test('cancellation: left without being seen, before or after triage; no-show and cancel of a BOOKED appointment', async () => {
  const a1 = await book();
  const e1 = await checkIn(a1);
  assert.equal((await act(e1.encounter_id, 'cancel', reception)).status, 200);
  await assertMirrored(a1, 'CANCELLED');

  const a2 = await book();
  const e2 = await checkIn(a2);
  await act(e2.encounter_id, 'triage', nurse);
  assert.equal((await act(e2.encounter_id, 'cancel', admin)).status, 200);
  await assertMirrored(a2, 'CANCELLED');

  const a3 = await book();
  assert.equal((await api('PUT', `/appointments/${a3}/status`, { token: reception.token, body: { status: 'NO_SHOW' } })).status, 200);
  assert.deepEqual({ ...(await state(a3)) }, { appointment: 'NO_SHOW', encounter: null, encounter_id: null });

  const a4 = await book();
  assert.equal((await api('PUT', `/appointments/${a4}/status`, { token: reception.token, body: { status: 'CANCELLED' } })).status, 200);
  assert.equal((await state(a4)).appointment, 'CANCELLED');
});

test('entered-in-error voids an encounter and cancels its appointment', async () => {
  const appointmentId = await book();
  const enc = await checkIn(appointmentId);
  await act(enc.encounter_id, 'start', doctor);
  assert.equal((await act(enc.encounter_id, 'entered-in-error', doctor)).status, 200);
  await assertMirrored(appointmentId, 'ENTERED_IN_ERROR');
});

test('invalid transitions are rejected with 409 and change nothing', async () => {
  const appointmentId = await book();
  const enc = await checkIn(appointmentId);
  const reject = async (res, pattern) => { assert.equal(res.status, 409, JSON.stringify(res.body)); assert.match(res.body.message, pattern); };

  await reject(await act(enc.encounter_id, 'finish', doctor), /Cannot finish an encounter that is ARRIVED/);
  await reject(await api('POST', '/encounters', { token: reception.token, body: { appointment_id: appointmentId } }), /Cannot check in an appointment that is CHECKED_IN/);
  await reject(await api('PUT', `/appointments/${appointmentId}/status`, { token: reception.token, body: { status: 'NO_SHOW' } }), /Cannot mark a CHECKED_IN appointment as NO_SHOW/);
  await reject(await api('PUT', `/appointments/${appointmentId}/status`, { token: reception.token, body: { status: 'BOOKED' } }), /cannot be moved back to BOOKED/);
  await reject(await api('PUT', `/appointments/${appointmentId}/status`, { token: reception.token, body: { status: 'CHECKED_IN' } }), /already CHECKED_IN/);
  await assertMirrored(appointmentId, 'ARRIVED');

  await act(enc.encounter_id, 'start', doctor);
  await reject(await act(enc.encounter_id, 'triage', nurse), /Cannot triage an encounter that is IN_PROGRESS/);
  await reject(await act(enc.encounter_id, 'cancel', reception), /Cannot cancel an encounter that is IN_PROGRESS/);
  await reject(await act(enc.encounter_id, 'start', doctor), /Cannot start an encounter that is IN_PROGRESS/);
  await act(enc.encounter_id, 'finish', doctor);
  await reject(await act(enc.encounter_id, 'start', doctor), /Cannot start an encounter that is FINISHED/);
  await reject(await act(enc.encounter_id, 'entered-in-error', doctor), /Cannot mark as entered in error an encounter that is FINISHED/);
  await assertMirrored(appointmentId, 'FINISHED');

  const unknown = await api('PUT', `/appointments/${appointmentId}/status`, { token: reception.token, body: { status: 'TELEPORTED' } });
  assert.equal(unknown.status, 400);
  assert.match(unknown.body.message, /Unknown appointment status/);
});

test('roles: front desk checks in and cancels, nursing triages, only the encounter\'s own doctor starts/finishes/voids', async () => {
  const appointmentId = await book();
  for (const user of [doctor, nurse, lab, pharmacy]) {
    assert.equal((await api('POST', '/encounters', { token: user.token, body: { appointment_id: appointmentId } })).status, 403);
  }
  const enc = await checkIn(appointmentId);
  for (const user of [doctor, reception, admin, lab]) assert.equal((await act(enc.encounter_id, 'triage', user)).status, 403);
  for (const user of [nurse, reception, admin, pharmacy]) assert.equal((await act(enc.encounter_id, 'start', user)).status, 403);
  const other = await act(enc.encounter_id, 'start', doctor2);
  assert.equal(other.status, 403);
  assert.match(other.body.message, /only the encounter's doctor/);
  for (const user of [doctor, nurse, lab]) assert.equal((await act(enc.encounter_id, 'cancel', user)).status, 403);
  for (const user of [lab, pharmacy]) assert.equal((await api('GET', '/encounters/queue', { token: user.token })).status, 403);
  await assertMirrored(appointmentId, 'ARRIVED'); // nothing changed
  assert.equal((await api('POST', `/encounters/${enc.encounter_id}/start`)).status, 401);
});

test('queue: open encounters only; doctors see just their own', async () => {
  const mine = await checkIn(await book());
  const theirs = await checkIn(await book(doctor2));
  const done = await checkIn(await book());
  await act(done.encounter_id, 'start', doctor);
  await act(done.encounter_id, 'finish', doctor);

  const doctorQueue = (await api('GET', '/encounters/queue', { token: doctor.token })).body.data.map(e => e.encounter_id);
  assert.ok(doctorQueue.includes(mine.encounter_id));
  assert.ok(!doctorQueue.includes(theirs.encounter_id));
  assert.ok(!doctorQueue.includes(done.encounter_id));
  const nurseQueue = (await api('GET', '/encounters/queue', { token: nurse.token })).body.data.map(e => e.encounter_id);
  assert.ok(nurseQueue.includes(mine.encounter_id) && nurseQueue.includes(theirs.encounter_id));
});

test('walk-in check-in creates an ARRIVED encounter without an appointment', async () => {
  const res = await api('POST', '/encounters', { token: reception.token, body: { patient_id: 1, doctor_id: doctor.user.doctor_id } });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'ARRIVED');
  assert.equal(res.body.data.appointment_id, null);
  assert.equal((await act(res.body.data.encounter_id, 'start', doctor)).status, 200);
  assert.equal((await act(res.body.data.encounter_id, 'finish', doctor)).status, 200);
  assert.equal((await api('POST', '/encounters', { token: reception.token, body: { patient_id: 999999, doctor_id: doctor.user.doctor_id } })).status, 400);
});

test('concurrency: racing start and cancel on one encounter — exactly one wins and the mirror holds', async () => {
  for (let i = 0; i < 15; i++) {
    const appointmentId = await book();
    const enc = await checkIn(appointmentId);
    const [s, c] = await Promise.all([act(enc.encounter_id, 'start', doctor), act(enc.encounter_id, 'cancel', reception)]);
    assert.deepEqual([s.status, c.status].sort(), [200, 409], JSON.stringify([s.body, c.body]));
    await assertMirrored(appointmentId, s.status === 200 ? 'IN_PROGRESS' : 'CANCELLED');
    if (s.status === 200) await act(enc.encounter_id, 'finish', doctor);
  }
});

test('concurrency: the same appointment status change sent twice — one 200, one 409', async () => {
  for (let i = 0; i < 10; i++) {
    const appointmentId = await book();
    const results = await Promise.all([1, 2].map(() => api('PUT', `/appointments/${appointmentId}/status`, { token: reception.token, body: { status: 'CHECKED_IN' } })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const [[{ n }]] = await db().query('SELECT COUNT(*) n FROM encounters WHERE appointment_id = ?', [appointmentId]);
    assert.equal(n, 1, 'exactly one encounter per appointment');
  }
});

test('records made during an encounter are linked to it; notes are locked once it is finished', async () => {
  const appointmentId = await book();
  const enc = await checkIn(appointmentId);
  await act(enc.encounter_id, 'start', doctor);
  const doctorId = doctor.user.doctor_id;

  const consult = await api('POST', '/consultations', { token: doctor.token, body: { appointment_id: appointmentId, patient_id: 1, doctor_id: doctorId, symptoms: 's', diagnosis: 'd' } });
  const order = await api('POST', '/lab/orders', { token: doctor.token, body: { patient_id: 1, doctor_id: doctorId, tests: [{ test_id: 3 }], notes: '' } });
  const rx = await api('POST', '/prescriptions', { token: doctor.token, body: { patient_id: 1, doctor_id: doctorId, items: [{ medicine_id: 2, dosage: '1', frequency: 'x', duration: '1', quantity: 1 }] } });
  const surg = await api('POST', '/surgery', { token: doctor.token, body: { patient_id: 1, doctor_id: doctorId, procedure_name: 'Biopsy', diagnosis: 'd', requested_date: '2032-07-01' } });
  for (const r of [consult, order, rx, surg]) assert.equal(r.status, 201, JSON.stringify(r.body));

  const detail = await api('GET', `/encounters/${enc.encounter_id}`, { token: doctor.token });
  assert.deepEqual(detail.body.data.consultation_ids, [consult.body.data.id]);
  assert.deepEqual(detail.body.data.lab_order_ids, [order.body.data.id]);
  assert.deepEqual(detail.body.data.prescription_ids, [rx.body.data.id]);
  assert.deepEqual(detail.body.data.surgery_request_ids, [surg.body.data.id]);

  assert.equal((await api('PUT', `/consultations/${consult.body.data.id}`, { token: doctor.token, body: { symptoms: 's2', diagnosis: 'd' } })).status, 200);
  await act(enc.encounter_id, 'finish', doctor);

  const edit = await api('PUT', `/consultations/${consult.body.data.id}`, { token: doctor.token, body: { symptoms: 'changed after signing', diagnosis: 'd' } });
  assert.equal(edit.status, 409);
  assert.match(edit.body.message, /FINISHED encounter and can no longer be edited/);
  const [[note]] = await db().query('SELECT symptoms FROM consultations WHERE consultation_id = ?', [consult.body.data.id]);
  assert.equal(note.symptoms, 's2');

  const late = await api('POST', '/consultations', { token: doctor.token, body: { appointment_id: appointmentId, patient_id: 1, doctor_id: doctorId, symptoms: 'late', diagnosis: 'd' } });
  assert.equal(late.status, 409);
  const explicit = await api('POST', '/lab/orders', { token: doctor.token, body: { patient_id: 1, doctor_id: doctorId, tests: [{ test_id: 3 }], notes: '', encounter_id: enc.encounter_id } });
  assert.equal(explicit.status, 409);
});

test('an explicit encounter_id must belong to the same patient and doctor', async () => {
  const enc = await checkIn(await book());
  await act(enc.encounter_id, 'start', doctor);
  const res = await api('POST', '/lab/orders', { token: doctor.token, body: { patient_id: 8, doctor_id: doctor.user.doctor_id, tests: [{ test_id: 3 }], notes: '', encounter_id: enc.encounter_id } });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /different patient or doctor/);
  await act(enc.encounter_id, 'finish', doctor);
});

test('a doctor cannot have two encounters in progress with the same patient', async () => {
  const first = await checkIn(await book());
  const second = await checkIn(await book());
  assert.equal((await act(first.encounter_id, 'start', doctor)).status, 200);
  const res = await act(second.encounter_id, 'start', doctor);
  assert.equal(res.status, 409);
  assert.match(res.body.message, new RegExp(`encounter #${first.encounter_id} in progress with this patient`));
  await act(first.encounter_id, 'finish', doctor);
  assert.equal((await act(second.encounter_id, 'start', doctor)).status, 200);
  await act(second.encounter_id, 'finish', doctor);
});

test('records with no open encounter are still accepted, unlinked (e.g. inpatient rounds)', async () => {
  const [[p]] = await db().query(`SELECT patient_id FROM appointments WHERE doctor_id = ? AND patient_id NOT IN
    (SELECT patient_id FROM encounters WHERE doctor_id = ? AND status = 'IN_PROGRESS') LIMIT 1`, [doctor.user.doctor_id, doctor.user.doctor_id]);
  const res = await api('POST', '/consultations', { token: doctor.token, body: { patient_id: p.patient_id, doctor_id: doctor.user.doctor_id, symptoms: 'rounds', diagnosis: 'd' } });
  assert.equal(res.status, 201);
  const [[row]] = await db().query('SELECT encounter_id FROM consultations WHERE consultation_id = ?', [res.body.data.id]);
  assert.equal(row.encounter_id, null);
});

test('transitions are audited inside their transaction with both state changes', async () => {
  const appointmentId = await book();
  const enc = await checkIn(appointmentId);
  await act(enc.encounter_id, 'start', doctor);
  const [rows] = await db().query("SELECT action, details FROM audit_logs WHERE entity_type = 'encounter' AND entity_id = ? ORDER BY audit_id", [enc.encounter_id]);
  assert.deepEqual(rows.map(r => r.action), ['ENCOUNTER_ARRIVED', 'ENCOUNTER_STARTED']);
  assert.deepEqual(rows[1].details, { from: 'ARRIVED', to: 'IN_PROGRESS', appointment_id: appointmentId, appointment: { from: 'CHECKED_IN', to: 'IN_PROGRESS' } });
});
