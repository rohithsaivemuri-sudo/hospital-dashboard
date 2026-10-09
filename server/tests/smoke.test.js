// Regression smoke suite for flows that worked before the HIS roadmap changes.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

test('every seeded role can log in and call /auth/me', async () => {
  for (const [role, username] of Object.entries(USERS)) {
    const { token, user } = await login(username);
    assert.equal(user.role, role.replace('_2', ''));
    const me = await api('GET', '/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.username, username);
  }
});

test('login rejects a wrong password', async () => {
  const res = await api('POST', '/auth/login', { body: { username: USERS.ADMIN, password: 'nope' } });
  assert.equal(res.status, 401);
});

test('protected routes reject requests without a JWT', async () => {
  const res = await api('GET', '/patients');
  assert.equal(res.status, 401);
});

test('emergency case can be created and allocated a bed and doctor', async () => {
  const { token } = await login(USERS.ADMIN);
  const [[bed]] = await db().query("SELECT bed_type FROM beds WHERE status = 'AVAILABLE' AND bed_type = 'GENERAL' LIMIT 1");
  assert.ok(bed, 'seed data should contain an available GENERAL bed');

  const created = await api('POST', '/emergency', { token, body: {
    patient_id: 1, severity: 'SERIOUS', required_bed_type: 'GENERAL', required_specialization: null,
    symptoms: 'smoke test', ventilator_required: false,
  } });
  assert.equal(created.status, 201);

  const allocated = await api('POST', `/emergency/${created.body.data.id}/allocate`, { token });
  assert.equal(allocated.status, 200, JSON.stringify(allocated.body));
  assert.equal(allocated.body.success, true);
  const [[admission]] = await db().query('SELECT status FROM admissions WHERE admission_id = ?', [allocated.body.allocation.admissionId]);
  assert.equal(admission.status, 'ACTIVE');
});

test('doctor prescribes and pharmacy dispenses, decrementing stock', async () => {
  const doctor = await login(USERS.DOCTOR);
  const pharmacy = await login(USERS.PHARMACY);
  const doctorId = doctor.user.doctor_id;
  const [[{ patient_id }]] = await db().query('SELECT patient_id FROM appointments WHERE doctor_id = ? LIMIT 1', [doctorId]);
  const [[before]] = await db().query('SELECT stock_quantity FROM medicines WHERE medicine_id = 1');

  const created = await api('POST', '/prescriptions', { token: doctor.token, body: {
    patient_id, doctor_id: doctorId, notes: 'smoke',
    items: [{ medicine_id: 1, dosage: '500mg', frequency: 'Twice daily', duration: '3 days', quantity: 6 }],
  } });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const dispensed = await api('POST', `/prescriptions/${created.body.data.id}/dispense`, { token: pharmacy.token });
  assert.equal(dispensed.status, 200, JSON.stringify(dispensed.body));
  const [[afterRow]] = await db().query('SELECT stock_quantity FROM medicines WHERE medicine_id = 1');
  assert.equal(afterRow.stock_quantity, before.stock_quantity - 6);
  const [[rx]] = await db().query('SELECT status FROM prescriptions WHERE prescription_id = ?', [created.body.data.id]);
  assert.equal(rx.status, 'DISPENSED');
});

test('doctor orders a lab test and the lab processes and completes it', async () => {
  const doctor = await login(USERS.DOCTOR);
  const lab = await login(USERS.LABORATORY);
  const doctorId = doctor.user.doctor_id;
  const [[{ patient_id }]] = await db().query('SELECT patient_id FROM appointments WHERE doctor_id = ? LIMIT 1', [doctorId]);

  const order = await api('POST', '/lab/orders', { token: doctor.token, body: {
    patient_id, doctor_id: doctorId, tests: [{ test_id: 1 }], notes: 'smoke',
  } });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  const orderId = order.body.data.id;

  assert.equal((await api('PUT', `/lab/orders/${orderId}/status`, { token: lab.token, body: { status: 'PROCESSING' } })).status, 200);
  const result = await api('POST', '/lab/results', { token: lab.token, body: {
    order_id: orderId, result_value: '14.5', unit: 'g/dL', reference_range: '13.5-17.5', interpretation: 'NORMAL',
  } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const [[o]] = await db().query('SELECT status FROM lab_orders WHERE order_id = ?', [orderId]);
  assert.equal(o.status, 'COMPLETED');
});
