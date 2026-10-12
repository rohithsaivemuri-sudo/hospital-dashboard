// BCNF conversions (docs/bcnf-analysis.md): values that were stored twice are now read from the one
// table that owns them, with API responses unchanged.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

// A1: a bed's floor is its ward's floor.
test('A1: every bed endpoint reports the ward\'s floor, with the same fields as before', async () => {
  const admin = await login(USERS.ADMIN);
  const [wards] = await db().query('SELECT ward_id, floor FROM wards');
  const floorOf = new Map(wards.map(w => [w.ward_id, w.floor]));
  const res = await api('GET', '/beds', { token: admin.token });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length > 0);
  for (const bed of res.body.data) {
    assert.deepEqual(Object.keys(bed), ['bed_id', 'ward_id', 'bed_number', 'floor', 'bed_type', 'status', 'has_ventilator', 'ward_name']);
    assert.equal(bed.floor, floorOf.get(bed.ward_id), `bed ${bed.bed_number}`);
  }
});

test('A1: a bed stored without a floor of its own shows its ward\'s floor everywhere', async () => {
  const admin = await login(USERS.ADMIN);
  const stamp = Date.now() % 1e8;
  const [ward] = await db().query("INSERT INTO wards (name, department_id, floor, capacity, ward_type) VALUES (?, 1, 7, 1, 'GENERAL')", [`Floor Test Ward ${stamp}`]);
  const [bed] = await db().query("INSERT INTO beds (ward_id, bed_number, bed_type, status) VALUES (?, ?, 'GENERAL', 'AVAILABLE')", [ward.insertId, `FL-${stamp}`]);
  try {
    const one = await api('GET', `/beds/${bed.insertId}`, { token: admin.token });
    assert.equal(one.status, 200);
    assert.deepEqual(Object.keys(one.body.data), ['bed_id', 'ward_id', 'bed_number', 'floor', 'bed_type', 'status', 'has_ventilator']);
    assert.equal(one.body.data.floor, 7);
    const byWard = await api('GET', `/beds/ward/${ward.insertId}`, { token: admin.token });
    assert.deepEqual(byWard.body.data.map(b => b.floor), [7]);
    const available = await api('GET', '/beds/available?type=GENERAL', { token: admin.token });
    assert.equal(available.body.data.find(b => b.bed_id === bed.insertId)?.floor, 7);
    const wardRes = await api('GET', `/wards/${ward.insertId}`, { token: admin.token });
    assert.equal(wardRes.status, 200);
    assert.deepEqual(wardRes.body.data.beds.map(b => b.floor), [7]);
    const [[view]] = await db().query('SELECT floor FROM available_beds_view WHERE bed_id = ?', [bed.insertId]);
    assert.equal(view.floor, 7);
  } finally {
    // Keep the fixture bed out of every later allocation.
    await db().query("UPDATE beds SET status = 'MAINTENANCE' WHERE bed_id = ?", [bed.insertId]);
  }
});

// A2: an appointment's department is its doctor's department.
const APPOINTMENT_FIELDS = ['appointment_id', 'patient_id', 'doctor_id', 'department_id', 'appointment_date', 'appointment_time', 'status', 'reason', 'notes', 'created_at', 'updated_at'];

test('A2: a new booking reports its doctor\'s department on every appointment endpoint, with the same fields as before', async () => {
  const reception = await login(USERS.RECEPTIONIST);
  const admin = await login(USERS.ADMIN);
  const [[doctor]] = await db().query('SELECT doctor_id, department_id FROM doctors ORDER BY doctor_id DESC LIMIT 1');
  const booked = await api('POST', '/appointments', { token: reception.token, body: {
    patient_id: 3, doctor_id: doctor.doctor_id, appointment_date: '2031-02-03', appointment_time: '09:15:00', reason: 'Department check' } });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  const id = booked.body.data.id;

  const one = await api('GET', `/appointments/${id}`, { token: reception.token });
  assert.equal(one.status, 200);
  assert.deepEqual(Object.keys(one.body.data), APPOINTMENT_FIELDS);
  assert.equal(one.body.data.department_id, doctor.department_id);

  const list = await api('GET', `/appointments?doctor_id=${doctor.doctor_id}`, { token: reception.token });
  const listed = list.body.data.find(a => a.appointment_id === id);
  assert.deepEqual(Object.keys(listed).slice(0, APPOINTMENT_FIELDS.length), APPOINTMENT_FIELDS);
  assert.equal(listed.department_id, doctor.department_id);

  const byDoctor = await api('GET', `/appointments/doctor/${doctor.doctor_id}`, { token: reception.token });
  assert.equal(byDoctor.body.data.find(a => a.appointment_id === id)?.department_id, doctor.department_id);

  const forPatient = await api('GET', '/patients/3/appointments', { token: admin.token });
  assert.equal(forPatient.status, 200);
  assert.equal(forPatient.body.data.find(a => a.appointment_id === id)?.department_id, doctor.department_id);
});

test('A2: seed.sql books every appointment under its doctor\'s department', async () => {
  const seed = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'database', 'seed.sql'), 'utf8');
  const block = seed.slice(seed.indexOf('INSERT INTO appointments'), seed.indexOf(';', seed.indexOf('INSERT INTO appointments')));
  const rows = [...block.matchAll(/^\((\d+),\s*(\d+),\s*(\d+),/gm)].map(m => ({ doctor: Number(m[2]), department: Number(m[3]) }));
  assert.equal(rows.length, 9);
  const [doctors] = await db().query('SELECT doctor_id, department_id FROM doctors WHERE doctor_id <= 12');
  const departmentOf = new Map(doctors.map(d => [d.doctor_id, d.department_id]));
  for (const r of rows) assert.equal(r.department, departmentOf.get(r.doctor), `doctor ${r.doctor}`);
});
