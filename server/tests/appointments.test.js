// Fix 0a: appointment booking (POST /api/appointments).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

// A slot far in the future so it never collides with seed data.
const slot = (minute) => ({ appointment_date: '2030-01-15', appointment_time: `10:${String(minute).padStart(2, '0')}:00` });

test('receptionist books an appointment: stored as BOOKED with the doctor\'s department', async () => {
  const { token } = await login(USERS.RECEPTIONIST);
  const [[doctor]] = await db().query('SELECT doctor_id, department_id FROM doctors ORDER BY doctor_id LIMIT 1');

  const res = await api('POST', '/appointments', { token, body: {
    patient_id: 1, doctor_id: doctor.doctor_id, reason: 'Follow-up', ...slot(1),
  } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.success, true);

  const [[row]] = await db().query('SELECT * FROM appointments WHERE appointment_id = ?', [res.body.data.id]);
  assert.equal(row.status, 'BOOKED');
  assert.equal(row.department_id, doctor.department_id);
  assert.equal(row.patient_id, 1);
  assert.equal(row.reason, 'Follow-up');

  // The booking is visible through the existing list endpoint.
  const list = await api('GET', '/appointments', { token });
  assert.ok(list.body.data.some(a => a.appointment_id === res.body.data.id));
});

test('booking the same doctor slot twice returns 409', async () => {
  const { token } = await login(USERS.RECEPTIONIST);
  const [[doctor]] = await db().query('SELECT doctor_id FROM doctors ORDER BY doctor_id LIMIT 1');
  const body = { patient_id: 2, doctor_id: doctor.doctor_id, reason: 'x', ...slot(2) };

  assert.equal((await api('POST', '/appointments', { token, body })).status, 201);
  const dup = await api('POST', '/appointments', { token, body: { ...body, patient_id: 3 } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.message, 'Double booking detected');
});

test('booking with an unknown doctor returns 400 instead of a database error', async () => {
  const { token } = await login(USERS.RECEPTIONIST);
  const res = await api('POST', '/appointments', { token, body: { patient_id: 1, doctor_id: 999999, ...slot(3) } });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'Doctor not found');
});

test('reason is optional', async () => {
  const { token } = await login(USERS.RECEPTIONIST);
  const [[doctor]] = await db().query('SELECT doctor_id FROM doctors ORDER BY doctor_id LIMIT 1');
  const res = await api('POST', '/appointments', { token, body: { patient_id: 1, doctor_id: doctor.doctor_id, ...slot(4) } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
});

test('existing rule kept: a doctor cannot book for another doctor', async () => {
  const { token, user } = await login(USERS.DOCTOR);
  const [[other]] = await db().query('SELECT doctor_id FROM doctors WHERE doctor_id <> ? LIMIT 1', [user.doctor_id]);
  const res = await api('POST', '/appointments', { token, body: { patient_id: 1, doctor_id: other.doctor_id, ...slot(5) } });
  assert.equal(res.status, 403);
});
