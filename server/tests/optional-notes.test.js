// POST /api/lab/orders and POST /api/admissions accept requests without a notes field.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

test('lab order without notes is created with notes NULL', async () => {
  const doctor = await login(USERS.DOCTOR);
  const res = await api('POST', '/lab/orders', { token: doctor.token, body: { patient_id: 1, doctor_id: doctor.user.doctor_id, tests: [{ test_id: 1 }, { test_id: 2 }] } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const [rows] = await db().query('SELECT notes FROM lab_orders WHERE order_id IN (?)', [res.body.data.ids]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.notes === null));
});

test('lab order with notes still stores them', async () => {
  const doctor = await login(USERS.DOCTOR);
  const res = await api('POST', '/lab/orders', { token: doctor.token, body: { patient_id: 1, doctor_id: doctor.user.doctor_id, tests: [{ test_id: 1 }], notes: 'fasting sample' } });
  assert.equal(res.status, 201);
  const [[row]] = await db().query('SELECT notes FROM lab_orders WHERE order_id = ?', [res.body.data.id]);
  assert.equal(row.notes, 'fasting sample');
});

test('admission without notes is created with notes NULL (and with notes still works)', async () => {
  const reception = await login(USERS.RECEPTIONIST);
  const doctor = await login(USERS.DOCTOR);
  const [beds] = await db().query("SELECT bed_id FROM beds WHERE status = 'AVAILABLE' AND bed_type = 'GENERAL' ORDER BY bed_id DESC LIMIT 2");
  const [patients] = await db().query("SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE') ORDER BY patient_id DESC LIMIT 2");
  assert.equal(beds.length, 2);

  const without = await api('POST', '/admissions', { token: reception.token, body: {
    patient_id: patients[0].patient_id, doctor_id: doctor.user.doctor_id, bed_id: beds[0].bed_id, department_id: 1, diagnosis: 'Observation',
  } });
  assert.equal(without.status, 201, JSON.stringify(without.body));
  const [[a]] = await db().query('SELECT notes, status FROM admissions WHERE admission_id = ?', [without.body.data.id]);
  assert.deepEqual({ ...a }, { notes: null, status: 'ACTIVE' });

  const withNotes = await api('POST', '/admissions', { token: reception.token, body: {
    patient_id: patients[1].patient_id, doctor_id: doctor.user.doctor_id, bed_id: beds[1].bed_id, department_id: 1, diagnosis: 'Observation', notes: 'Bring own CPAP',
  } });
  assert.equal(withNotes.status, 201);
  const [[b]] = await db().query('SELECT notes FROM admissions WHERE admission_id = ?', [withNotes.body.data.id]);
  assert.equal(b.notes, 'Bring own CPAP');
});
