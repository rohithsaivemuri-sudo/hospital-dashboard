// Orders bound to a visit or admission (item 5): a lab order or prescription is filed under the
// doctor's in-progress visit, else under the active admission they are the admitting doctor for,
// else refused with "Start the visit first".
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);
let reception, doctor, other, visitPatient, admittedPatient, bystander, encounterId, admissionId;
const today = new Date().toISOString().slice(0, 10);
const lab = (who, patient) => api('POST', '/lab/orders', { token: who.token, body: { patient_id: patient, doctor_id: who.user.doctor_id, tests: [{ test_id: 1 }] } });
const rx = (who, patient) => api('POST', '/prescriptions', { token: who.token, body: { patient_id: patient, doctor_id: who.user.doctor_id, items: [{ medicine_id: 1, dosage: '1 tablet', frequency: 'Once daily', duration: '3 days', quantity: 3 }] } });

before(async () => {
  [reception, doctor, other] = await Promise.all([login(USERS.RECEPTIONIST), login(USERS.DOCTOR), login(USERS.DOCTOR_2)]);
  const [free] = await db().query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS'))
    AND patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE') ORDER BY patient_id DESC LIMIT 3`);
  [visitPatient, admittedPatient, bystander] = free.map(p => p.patient_id);

  // A visit the doctor has started.
  const appt = (await api('POST', '/appointments', { token: reception.token, body: { patient_id: visitPatient, doctor_id: doctor.user.doctor_id, appointment_date: today, appointment_time: '23:40:00' } })).body.data.id;
  encounterId = (await api('POST', '/encounters', { token: reception.token, body: { appointment_id: appt } })).body.data.encounter_id;
  assert.equal((await api('POST', `/encounters/${encounterId}/start`, { token: doctor.token })).status, 200);
  // An admission with the doctor as admitting doctor, and no open visit.
  const [[bed]] = await db().query("SELECT bed_id FROM beds WHERE status = 'AVAILABLE' ORDER BY bed_id LIMIT 1");
  const adm = await api('POST', '/admissions', { token: reception.token, body: { patient_id: admittedPatient, doctor_id: doctor.user.doctor_id, bed_id: bed.bed_id, department_id: 1, diagnosis: 'Order context test' } });
  assert.equal(adm.status, 201, JSON.stringify(adm.body));
  [[{ admission_id: admissionId }]] = await db().query("SELECT admission_id FROM admissions WHERE patient_id = ? AND status = 'ACTIVE'", [admittedPatient]);
  await db().query("UPDATE encounters SET status = 'FINISHED', end_timestamp = NOW() WHERE patient_id = ? AND status IN ('ARRIVED','TRIAGED','IN_PROGRESS')", [admittedPatient]);
  // A patient the doctor has a booked appointment with (care set), but no visit started.
  await api('POST', '/appointments', { token: reception.token, body: { patient_id: bystander, doctor_id: doctor.user.doctor_id, appointment_date: today, appointment_time: '23:45:00' } });
});
after(async () => {
  await api('POST', `/encounters/${encounterId}/finish`, { token: doctor.token });
  await api('POST', `/admissions/${admissionId}/discharge`, { token: doctor.token, body: {} });
});

test('orders during an in-progress visit are filed under that visit', async () => {
  const l = await lab(doctor, visitPatient); const p = await rx(doctor, visitPatient);
  assert.equal(l.status, 201); assert.equal(p.status, 201);
  const [[order]] = await db().query('SELECT encounter_id, admission_id FROM lab_orders WHERE order_id = ?', [l.body.data.id]);
  const [[presc]] = await db().query('SELECT encounter_id, admission_id FROM prescriptions WHERE prescription_id = ?', [p.body.data.id]);
  assert.deepEqual({ ...order }, { encounter_id: encounterId, admission_id: null });
  assert.deepEqual({ ...presc }, { encounter_id: encounterId, admission_id: null });
});

test('the admitting doctor\'s orders without a visit are filed under the admission', async () => {
  const l = await lab(doctor, admittedPatient); const p = await rx(doctor, admittedPatient);
  assert.equal(l.status, 201, JSON.stringify(l.body)); assert.equal(p.status, 201, JSON.stringify(p.body));
  const [[order]] = await db().query('SELECT encounter_id, admission_id FROM lab_orders WHERE order_id = ?', [l.body.data.id]);
  const [[presc]] = await db().query('SELECT encounter_id, admission_id FROM prescriptions WHERE prescription_id = ?', [p.body.data.id]);
  assert.deepEqual({ ...order }, { encounter_id: null, admission_id: admissionId });
  assert.deepEqual({ ...presc }, { encounter_id: null, admission_id: admissionId });
});

test('with no in-progress visit and no admission of theirs, the order is refused: "Start the visit first"', async () => {
  for (const res of [await lab(doctor, bystander), await rx(doctor, bystander)]) {
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.message, /Start the visit first/);
  }
  const [[{ n }]] = await db().query('SELECT (SELECT COUNT(*) FROM lab_orders WHERE patient_id = ?) + (SELECT COUNT(*) FROM prescriptions WHERE patient_id = ?) AS n', [bystander, bystander]);
  assert.equal(n, 0);
});
