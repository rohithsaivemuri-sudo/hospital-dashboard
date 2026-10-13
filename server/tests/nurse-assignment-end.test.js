// Ending a nurse assignment takes the ward away at once (ended_at), not at midnight: the very next
// request from the nurse no longer sees the ward or its patients.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');
const { todayIst, addDays } = require('../utils/clock');

let admin; let nurse; let ward; let inpatient;
const created = new Set();

before(async () => {
  [admin, nurse] = await Promise.all([login(USERS.ADMIN), login(USERS.NURSE)]);
  [[inpatient]] = await db().query(`SELECT b.ward_id, a.patient_id, a.admission_id FROM admissions a JOIN beds b ON b.bed_id = a.bed_id
    JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = 'General Ward A' AND a.status = 'ACTIVE'
      AND a.patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS')) LIMIT 1`);
  assert.ok(inpatient, 'seed data has an inpatient on General Ward A');
  ward = inpatient.ward_id;
});

after(async () => {
  if (created.size) await db().query('DELETE FROM nurse_ward_assignments WHERE assignment_id IN (?)', [[...created]]);
  await closeDb();
});

const assign = async (body = {}) => {
  const res = await api('POST', '/nurse-assignments', { token: admin.token, body: { nurse_user_id: nurse.user.user_id, ward_id: ward, ...body } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  created.add(res.body.data.assignment_id);
  return res.body.data;
};
const end = (id, body = {}) => api('PUT', `/nurse-assignments/${id}`, { token: admin.token, body });

// Everything that gives a nurse a ward: patient reads, the nurse station, current admissions, and
// recording vitals against the admission.
async function nurseHasWard() {
  const patient = (await api('GET', `/patients/${inpatient.patient_id}`, { token: nurse.token })).status;
  const station = (await api('GET', '/nurse/station', { token: nurse.token })).body.data.wards.some(w => w.ward_id === ward);
  const admissions = (await api('GET', '/admissions/current', { token: nurse.token })).body.data.some(a => a.patient_id === inpatient.patient_id);
  const vitals = (await api('POST', '/vitals', { token: nurse.token, body: { patient_id: inpatient.patient_id, admission_id: inpatient.admission_id, pulse_bpm: 72 } })).status;
  return { patient, station, admissions, vitals };
}
const HAS = { patient: 200, station: true, admissions: true, vitals: 201 };
const LACKS = { patient: 403, station: false, admissions: false, vitals: 403 };

test('a nurse loses the ward the moment the assignment is ended', async () => {
  const a = await assign();
  assert.deepEqual(await nurseHasWard(), HAS);

  const ended = await end(a.assignment_id);
  assert.equal(ended.status, 200, JSON.stringify(ended.body));
  assert.deepEqual(await nurseHasWard(), LACKS, 'the very next request has no access');
  assert.deepEqual([ended.body.data.status, ended.body.data.is_current, ended.body.data.end_date], ['ENDED', false, todayIst()]);
  assert.ok(Date.now() - Date.parse(ended.body.data.ended_at) < 60000, 'ended_at is now');
  const own = (await api('GET', '/nurse-assignments', { token: nurse.token })).body.data.find(r => r.assignment_id === a.assignment_id);
  assert.equal(own.status, 'ENDED', 'the nurse sees it ended too');
  const [[audit]] = await db().query("SELECT details FROM audit_logs WHERE action = 'END_NURSE_ASSIGNMENT' AND entity_id = ? ORDER BY audit_id DESC LIMIT 1", [a.assignment_id]);
  assert.deepEqual((typeof audit.details === 'string' ? JSON.parse(audit.details) : audit.details).changed_fields, ['end_date', 'ended_at']);

  assert.equal((await end(a.assignment_id)).status, 409, 'an ended assignment cannot be ended again');
});

test('after ending, the nurse can be given the same ward again the same day', async () => {
  const again = await assign();
  assert.deepEqual([again.start_date, again.status], [todayIst(), 'CURRENT']);
  assert.deepEqual(await nurseHasWard(), HAS);
  assert.equal((await end(again.assignment_id)).status, 200);
  assert.deepEqual(await nurseHasWard(), LACKS);
});

test('a later end date keeps access until that day; ending today on it still means now', async () => {
  const a = await assign();
  const later = await end(a.assignment_id, { end_date: addDays(todayIst(), 3) });
  assert.equal(later.status, 200, JSON.stringify(later.body));
  assert.deepEqual([later.body.data.status, later.body.data.ended_at], ['CURRENT', null]);
  assert.deepEqual(await nurseHasWard(), HAS, 'access continues until the end date');
  const now = await end(a.assignment_id, { end_date: todayIst() });
  assert.equal(now.status, 200);
  assert.equal(now.body.data.status, 'ENDED');
  assert.deepEqual(await nurseHasWard(), LACKS);
});
