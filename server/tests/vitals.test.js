// Step 10: vitals flowsheet — readings tied to a visit or admission, impossible values rejected by
// the database, nurse entry with optional triage, doctor read-only, audit in the same transaction.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');
const { parseVitals, abnormalKeys } = require('../utils/vitals');

after(closeDb);

let reception, nurse, doctor, admin, pharmacy, lab, outsiderDoctor, otherNurse;
let admitted, admissionId, admittingDoctor;   // admitted to General Ward B (nurse1's ward)
let outpatient, encounterId;                   // walk-in visit, ARRIVED
let elsewhere, elsewhereAdmission;             // admitted to General Ward A (not nurse1's)

const NORMAL = { temperature_c: 36.8, pulse_bpm: 78, resp_rate: 16, bp_systolic: 120, bp_diastolic: 80, spo2_pct: 98, pain_score: 1 };

async function freePatient() {
  const [[p]] = await db().query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE')
    AND patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS')) ORDER BY patient_id DESC LIMIT 1`);
  return p.patient_id;
}
async function admitTo(ward, patientId) {
  const [[bed]] = await db().query("SELECT b.bed_id FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = ? AND b.status = 'AVAILABLE' ORDER BY b.bed_id LIMIT 1", [ward]);
  const res = await api('POST', '/admissions', { token: reception.token, body: { patient_id: patientId, doctor_id: admittingDoctor.doctor_id, bed_id: bed.bed_id, department_id: 1, diagnosis: 'Vitals test' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}
const record = (body, token = nurse.token) => api('POST', '/vitals', { token, body });
const auditRows = async (vitalId) => (await db().query("SELECT * FROM audit_logs WHERE action = 'RECORD_VITALS' AND entity_id = ?", [vitalId]))[0];
const count = async () => (await db().query('SELECT COUNT(*) n FROM vital_signs'))[0][0].n;

before(async () => {
  [reception, nurse, doctor, admin, pharmacy, lab] = await Promise.all([USERS.RECEPTIONIST, USERS.NURSE, USERS.DOCTOR, USERS.ADMIN, USERS.PHARMACY, USERS.LABORATORY].map(login));
  [[admittingDoctor]] = await db().query('SELECT d.doctor_id, u.username FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE d.current_workload + 2 <= d.max_workload ORDER BY d.doctor_id LIMIT 1');
  admitted = await freePatient();
  admissionId = await admitTo('General Ward B', admitted);
  elsewhere = await freePatient();
  elsewhereAdmission = await admitTo('General Ward A', elsewhere);
  outpatient = await freePatient();
  const walkIn = await api('POST', '/encounters', { token: reception.token, body: { patient_id: outpatient, doctor_id: doctor.user.doctor_id } });
  assert.equal(walkIn.status, 201, JSON.stringify(walkIn.body));
  encounterId = walkIn.body.data.encounter_id;

  // A doctor with no relationship to the outpatient, and a nurse with no ward assignment.
  const [[o]] = await db().query(`SELECT u.username FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE d.doctor_id NOT IN (
      SELECT doctor_id FROM appointments WHERE patient_id = ? UNION SELECT doctor_id FROM admissions WHERE patient_id = ?
      UNION SELECT doctor_id FROM consultations WHERE patient_id = ? UNION SELECT doctor_id FROM lab_orders WHERE patient_id = ?
      UNION SELECT doctor_id FROM prescriptions WHERE patient_id = ? UNION SELECT doctor_id FROM encounters WHERE patient_id = ?) ORDER BY d.doctor_id LIMIT 1`,
    Array(6).fill(admitted));
  outsiderDoctor = await login(o.username);
  const u = `vitals_nurse_${Date.now()}`;
  await api('POST', '/auth/register', { token: admin.token, body: { username: u, password: 'Secret123!', role: 'NURSE', full_name: 'Vitals Nurse', email: `${u}@hospital.test`, phone: '1' } });
  const res = await api('POST', '/auth/login', { body: { username: u, password: 'Secret123!' } });
  otherNurse = { token: res.body.token, user: res.body.user };
});

test('parsing: blank fields skipped, whole numbers and one decimal, impossible values and BP pairs rejected', () => {
  assert.deepEqual(parseVitals({ pulse_bpm: '72', temperature_c: '37.2', resp_rate: '' }).values, { temperature_c: 37.2, pulse_bpm: 72 });
  assert.match(parseVitals({}).error, /at least one/);
  assert.match(parseVitals({ temperature_c: '370' }).error, /not a possible value/);
  assert.match(parseVitals({ temperature_c: '37.25' }).error, /one decimal/);
  assert.match(parseVitals({ pulse_bpm: '72.5' }).error, /whole number/);
  assert.match(parseVitals({ pulse_bpm: 'fast' }).error, /whole number/);
  assert.match(parseVitals({ bp_systolic: '120' }).error, /both systolic and diastolic/);
  assert.match(parseVitals({ bp_systolic: '80', bp_diastolic: '120' }).error, /higher than diastolic/);
  assert.match(parseVitals({ spo2_pct: '101' }).error, /not a possible value/);
  assert.deepEqual(abnormalKeys({ temperature_c: 39.1, pulse_bpm: 72, spo2_pct: 91 }), ['temperature_c', 'spo2_pct']);
});

test('the database CHECK constraints reject impossible values even if the API is bypassed', async () => {
  const [[u]] = await db().query("SELECT user_id FROM users WHERE username = 'nurse1'");
  const insert = (cols) => db().query(`INSERT INTO vital_signs (patient_id, admission_id, recorded_at_utc, recorded_by, ${Object.keys(cols).join(', ')}) VALUES (?, ?, UTC_TIMESTAMP(), ?, ${Object.keys(cols).map(() => '?').join(', ')})`,
    [admitted, admissionId, u.user_id, ...Object.values(cols)]);
  for (const [cols, check] of [
    [{ temperature_c: 370 }, /chk_vitals_temperature|Out of range/], [{ pulse_bpm: 0 }, /chk_vitals_pulse/], [{ resp_rate: 200 }, /chk_vitals_resp_rate/],
    [{ spo2_pct: 120 }, /chk_vitals_spo2/], [{ pain_score: 11 }, /chk_vitals_pain/], [{ bp_systolic: 120 }, /chk_vitals_bp_pair/],
    [{ bp_systolic: 70, bp_diastolic: 90 }, /chk_vitals_bp_order/],
  ]) await assert.rejects(insert(cols), check, JSON.stringify(cols));
  await assert.rejects(db().query('INSERT INTO vital_signs (patient_id, recorded_at_utc, recorded_by, pulse_bpm) VALUES (?, UTC_TIMESTAMP(), ?, 70)', [admitted, u.user_id]), /chk_vitals_context/);
  await assert.rejects(db().query('INSERT INTO vital_signs (patient_id, admission_id, recorded_at_utc, recorded_by) VALUES (?, ?, UTC_TIMESTAMP(), ?)', [admitted, admissionId, u.user_id]), /chk_vitals_any/);
});

test('a nurse records vitals for an admitted patient in their ward; it links to the admission and is audited in the same transaction', async () => {
  const res = await record({ patient_id: admitted, ...NORMAL, temperature_c: 38.6, spo2_pct: 92, notes: 'Shivering, blankets given' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const v = res.body.data;
  assert.deepEqual([v.admission_id, v.encounter_id, v.temperature_c, v.spo2_pct, v.recorded_by], [admissionId, null, 38.6, 92, nurse.user.user_id]);
  assert.deepEqual(v.abnormal, ['temperature_c', 'spo2_pct']);
  assert.match(v.recorded_at_ist, /IST$/);
  const rows = await auditRows(v.vital_id);
  assert.equal(rows.length, 1);
  const details = typeof rows[0].details === 'string' ? JSON.parse(rows[0].details) : rows[0].details;
  assert.deepEqual(details, { encounter_id: null, admission_id: admissionId, recorded: Object.keys(NORMAL), abnormal: ['temperature_c', 'spo2_pct'], marked_triaged: false });
  assert.equal(rows[0].patient_id, admitted);
  assert.ok(!JSON.stringify(rows[0]).includes('Shivering') && !JSON.stringify(rows[0]).includes('38.6'), 'no values or note text in the audit row');
});

test('if the audit row cannot be written, the reading is not saved', async () => {
  const before = await count();
  await db().query('DROP TRIGGER IF EXISTS test_fail_vitals_audit');
  await db().query(`CREATE TRIGGER test_fail_vitals_audit BEFORE INSERT ON audit_logs FOR EACH ROW
    BEGIN IF NEW.action = 'RECORD_VITALS' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'simulated audit failure'; END IF; END`);
  try {
    const res = await record({ patient_id: admitted, pulse_bpm: 80 });
    assert.equal(res.status, 500);
  } finally { await db().query('DROP TRIGGER test_fail_vitals_audit'); }
  assert.equal(await count(), before);
});

test('vitals at triage: the visit is linked and, if asked, marked TRIAGED in the same transaction (appointment mirror unchanged)', async () => {
  const res = await record({ patient_id: outpatient, encounter_id: encounterId, pulse_bpm: 88, bp_systolic: 150, bp_diastolic: 95, mark_triaged: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.encounter_id, encounterId);
  assert.equal(res.body.data.marked_triaged, true);
  assert.deepEqual(res.body.data.abnormal, ['bp_systolic', 'bp_diastolic']);
  const [[e]] = await db().query('SELECT status, triaged_at FROM encounters WHERE encounter_id = ?', [encounterId]);
  assert.equal(e.status, 'TRIAGED');
  assert.ok(e.triaged_at);
  const [triage] = await db().query("SELECT 1 FROM audit_logs WHERE action = 'ENCOUNTER_TRIAGED' AND entity_id = ?", [encounterId]);
  assert.equal(triage.length, 1);
  // Already triaged: a second reading with the option set is accepted and changes nothing.
  const again = await record({ patient_id: outpatient, pulse_bpm: 84, mark_triaged: true });
  assert.equal(again.status, 201);
  assert.equal(again.body.data.encounter_id, encounterId, 'auto-linked to the open visit');
  assert.equal(again.body.data.marked_triaged, false);
});

test('if saving the reading fails, the triage is rolled back too', async () => {
  const p = await freePatient();
  const walkIn = await api('POST', '/encounters', { token: reception.token, body: { patient_id: p, doctor_id: doctor.user.doctor_id } });
  const id = walkIn.body.data.encounter_id;
  await db().query('DROP TRIGGER IF EXISTS test_fail_vitals_audit');
  await db().query(`CREATE TRIGGER test_fail_vitals_audit BEFORE INSERT ON audit_logs FOR EACH ROW
    BEGIN IF NEW.action = 'RECORD_VITALS' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'simulated audit failure'; END IF; END`);
  try {
    assert.equal((await record({ patient_id: p, encounter_id: id, pulse_bpm: 70, mark_triaged: true })).status, 500);
  } finally { await db().query('DROP TRIGGER test_fail_vitals_audit'); }
  const [[e]] = await db().query('SELECT status FROM encounters WHERE encounter_id = ?', [id]);
  assert.equal(e.status, 'ARRIVED');
  await api('POST', `/encounters/${id}/cancel`, { token: reception.token });
});

test('context rules: wrong patient, closed visit, discharged or other-ward admission, admission with mark_triaged', async () => {
  assert.equal((await record({ patient_id: admitted, encounter_id: encounterId, pulse_bpm: 70 })).status, 400);
  assert.equal((await record({ patient_id: admitted, admission_id: elsewhereAdmission, pulse_bpm: 70 })).status, 400);
  assert.equal((await record({ patient_id: admitted, admission_id: admissionId, pulse_bpm: 70, mark_triaged: true })).status, 400);
  // The nurse can see an outpatient's chart, but not record against their admission in another ward.
  assert.equal((await record({ patient_id: elsewhere, pulse_bpm: 70 })).status, 403);
  const [[closed]] = await db().query("SELECT encounter_id, patient_id FROM encounters WHERE status = 'FINISHED' LIMIT 1");
  if (closed) {
    const res = await record({ patient_id: closed.patient_id, encounter_id: closed.encounter_id, pulse_bpm: 70 });
    assert.ok([403, 409].includes(res.status), String(res.status));
  }
});

test('invalid values are rejected with 400 and nothing is saved', async () => {
  const before = await count();
  for (const body of [{ temperature_c: 370 }, { spo2_pct: 40 }, { bp_systolic: 120 }, {}, { pulse_bpm: 'x' }, { pulse_bpm: 80, notes: 'x'.repeat(256) }]) {
    const res = await record({ patient_id: admitted, ...body });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal((await record({ patient_id: 'abc', pulse_bpm: 80 })).status, 400);
  assert.equal(await count(), before);
});

test('only nurses record; assigned only. Doctors read their own patients; other roles are denied', async () => {
  for (const u of [doctor, admin, reception, pharmacy, lab]) assert.equal((await record({ patient_id: admitted, pulse_bpm: 70 }, u.token)).status, 403, u.user.role);
  assert.equal((await record({ patient_id: admitted, pulse_bpm: 70 }, otherNurse.token)).status, 403, 'nurse without a ward assignment');

  const admittingDoc = await login(admittingDoctor.username);
  const read = await api('GET', `/vitals/patients/${admitted}`, { token: admittingDoc.token });
  assert.equal(read.status, 200);
  assert.equal(read.body.data.can_record, false);
  assert.ok(read.body.data.readings.length >= 1);
  assert.equal((await api('GET', `/vitals/patients/${outpatient}`, { token: doctor.token })).status, 200, 'the visit doctor');
  assert.equal((await api('GET', `/vitals/patients/${admitted}`, { token: outsiderDoctor.token })).status, 403, 'a doctor with no relationship');
  for (const u of [admin, reception, pharmacy, lab]) assert.equal((await api('GET', `/vitals/patients/${admitted}`, { token: u.token })).status, 403, u.user.role);
  assert.equal((await api('GET', `/vitals/patients/${admitted}`, { token: otherNurse.token })).status, 403);
});

test('the flowsheet returns readings oldest first with reference ranges, abnormal flags and the open context', async () => {
  await record({ patient_id: admitted, pulse_bpm: 112 });
  const res = await api('GET', `/vitals/patients/${admitted}`, { token: nurse.token });
  const { definitions, readings, can_record, open_admission, open_encounter } = res.body.data;
  assert.equal(can_record, true);
  assert.equal(open_admission.admission_id, admissionId);
  assert.equal(open_encounter, null);
  assert.deepEqual(definitions.map(d => d.key), ['temperature_c', 'pulse_bpm', 'resp_rate', 'bp_systolic', 'bp_diastolic', 'spo2_pct', 'pain_score']);
  const times = readings.map(r => r.recorded_at);
  assert.deepEqual(times, [...times].sort());
  assert.deepEqual(readings.at(-1).abnormal, ['pulse_bpm']);
  assert.ok(readings.every(r => r.recorded_by_name));
  // Read rows are written after the response (non-blocking middleware); allow a moment.
  let read = [];
  for (let i = 0; i < 30 && !read.length; i++) {
    [read] = await db().query("SELECT 1 FROM audit_logs WHERE action = 'READ' AND path = '/api/vitals/patients/:patientId' AND patient_id = ?", [admitted]);
    if (!read.length) await new Promise(r => setTimeout(r, 50));
  }
  assert.ok(read.length >= 1, 'flowsheet reads are logged');
});

test('nurse station visits carry the time of the last vitals recorded on each visit', async () => {
  const p = await freePatient();
  const walkIn = await api('POST', '/encounters', { token: reception.token, body: { patient_id: p, doctor_id: doctor.user.doctor_id } });
  const id = walkIn.body.data.encounter_id;
  const visit = async () => (await api('GET', '/nurse/station', { token: nurse.token })).body.data.open_visits.find(v => v.encounter_id === id);
  assert.equal((await visit()).last_vitals_at, null);
  const first = await record({ patient_id: p, encounter_id: id, pulse_bpm: 70 });
  assert.equal((await visit()).last_vitals_at, first.body.data.recorded_at);
  await new Promise(r => setTimeout(r, 1100));
  const second = await record({ patient_id: p, encounter_id: id, pulse_bpm: 72 });
  const v = await visit();
  assert.equal(v.last_vitals_at, second.body.data.recorded_at, 'the latest reading');
  assert.ok(v.last_vitals_at > first.body.data.recorded_at);
  assert.ok(!('last_vitals_utc' in v));
  await api('POST', `/encounters/${id}/cancel`, { token: reception.token });
});
