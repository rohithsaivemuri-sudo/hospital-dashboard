// BCNF conversions (docs/bcnf-analysis.md): values that were stored twice are now read from the one
// table that owns them, with API responses unchanged.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb, visitInProgress } = require('./helpers');

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

// A3: a dose's patient is its prescription's patient.
test('A3: the MAR lists each order\'s doses, found through the prescription\'s patient', async () => {
  const nurse = await login(USERS.NURSE);
  const [[seed]] = await db().query("SELECT patient_id FROM prescriptions WHERE notes = 'Demo MAR seed (migration 008)'");
  const mar = await api('GET', `/mar/patients/${seed.patient_id}`, { token: nurse.token });
  assert.equal(mar.status, 200, JSON.stringify(mar.body));
  const items = mar.body.data.items;
  assert.ok(items.some(i => i.doses.length > 0), 'the demo MAR has doses');
  for (const item of items) {
    const [[{ n }]] = await db().query(`SELECT COUNT(*) n FROM medication_administrations ma
      JOIN prescription_items pi ON pi.item_id = ma.prescription_item_id JOIN prescriptions p ON p.prescription_id = pi.prescription_id
      WHERE ma.prescription_item_id = ? AND p.patient_id = ?`, [item.item_id, seed.patient_id]);
    assert.equal(item.doses.length, Number(n), `item ${item.item_id}`);
  }
  const [orphans] = await db().query(`SELECT ma.administration_id FROM medication_administrations ma
    LEFT JOIN prescription_items pi ON pi.item_id = ma.prescription_item_id LEFT JOIN prescriptions p ON p.prescription_id = pi.prescription_id
    WHERE p.patient_id IS NULL`);
  assert.deepEqual(orphans, [], 'every dose reaches a patient');
});

// A4: copies of a patient, doctor or medicine must agree with the visit, admission, appointment,
// note or batch they are filed under (composite foreign keys fk_ctx_*, plus API checks).
test('A4: the database has a composite foreign key for every copied link', async () => {
  const [rows] = await db().query(`SELECT TABLE_NAME t, CONSTRAINT_NAME n FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME LIKE 'fk\\_ctx\\_%' ORDER BY t, n`);
  assert.deepEqual(rows.map(r => `${r.t}.${r.n}`), [
    'bills.fk_ctx_bills_admission',
    'consultations.fk_ctx_consultations_admission', 'consultations.fk_ctx_consultations_appointment', 'consultations.fk_ctx_consultations_encounter',
    'encounters.fk_ctx_encounters_admission',
    'lab_orders.fk_ctx_lab_orders_admission', 'lab_orders.fk_ctx_lab_orders_consultation', 'lab_orders.fk_ctx_lab_orders_encounter',
    'pharmacy_stock_movements.fk_ctx_stock_movements_batch',
    'prescriptions.fk_ctx_prescriptions_admission', 'prescriptions.fk_ctx_prescriptions_consultation', 'prescriptions.fk_ctx_prescriptions_encounter',
    'surgery_requests.fk_ctx_surgery_requests_encounter',
    'vital_signs.fk_ctx_vital_signs_admission', 'vital_signs.fk_ctx_vital_signs_encounter',
  ]);
});

test('A4: the database refuses a row whose patient or medicine disagrees with its link, and accepts one without a link', async () => {
  const [[enc]] = await db().query('SELECT encounter_id, patient_id, doctor_id FROM encounters ORDER BY encounter_id LIMIT 1');
  const [[other]] = await db().query('SELECT patient_id FROM patients WHERE patient_id <> ? ORDER BY patient_id LIMIT 1', [enc.patient_id]);
  const [[{ test_id }]] = await db().query('SELECT test_id FROM lab_tests ORDER BY test_id LIMIT 1');
  await assert.rejects(
    db().query("INSERT INTO lab_orders (patient_id, doctor_id, test_id, order_date, encounter_id) VALUES (?, ?, ?, NOW(), ?)", [other.patient_id, enc.doctor_id, test_id, enc.encounter_id]),
    e => e.errno === 1452 && /fk_ctx_lab_orders_encounter/.test(e.message));
  const [[batch]] = await db().query('SELECT batch_id, medicine_id FROM medicine_batches ORDER BY batch_id LIMIT 1');
  const [[{ user_id }]] = await db().query("SELECT user_id FROM users WHERE username = 'pharmacy_staff'");
  await assert.rejects(
    db().query("INSERT INTO pharmacy_stock_movements (medicine_id, movement_type, quantity, performed_by, batch_id) VALUES (?, 'ADJUSTMENT', -1, ?, ?)", [batch.medicine_id + 1, user_id, batch.batch_id]),
    e => e.errno === 1452 && /fk_ctx_stock_movements_batch/.test(e.message));
  // No link: nothing to agree with, so the row is accepted as before.
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("INSERT INTO lab_orders (patient_id, doctor_id, test_id, order_date) VALUES (?, ?, ?, NOW())", [other.patient_id, enc.doctor_id, test_id]);
  } finally { await conn.rollback(); conn.release(); }
});

test('A4: a consultation filed under another patient\'s appointment is refused with 400, and nothing is saved', async () => {
  const doctor = await login(USERS.DOCTOR);
  const [[appt]] = await db().query('SELECT appointment_id, patient_id FROM appointments WHERE doctor_id = ? ORDER BY appointment_id LIMIT 1', [doctor.user.doctor_id]);
  const [[other]] = await db().query('SELECT patient_id FROM appointments WHERE doctor_id = ? AND patient_id <> ? ORDER BY appointment_id LIMIT 1', [doctor.user.doctor_id, appt.patient_id]);
  const [[{ n_before }]] = await db().query('SELECT COUNT(*) n_before FROM consultations');
  const res = await api('POST', '/consultations', { token: doctor.token, body: {
    appointment_id: appt.appointment_id, patient_id: other.patient_id, doctor_id: doctor.user.doctor_id, symptoms: 's', diagnosis: 'd' } });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, { success: false, message: 'Appointment belongs to a different patient or doctor' });
  const [[{ n_after }]] = await db().query('SELECT COUNT(*) n_after FROM consultations');
  assert.equal(n_after, n_before);
});

test('A4: a prescription filed under another patient\'s consultation is refused with 400, and nothing is saved', async () => {
  const doctor = await login(USERS.DOCTOR);
  const [patients] = await db().query('SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = ? ORDER BY patient_id LIMIT 2', [doctor.user.doctor_id]);
  const [a, b] = patients.map(p => p.patient_id);
  const visit = await visitInProgress(doctor, a);
  let consultationId;
  try {
    const note = await api('POST', '/consultations', { token: doctor.token, body: { patient_id: a, doctor_id: doctor.user.doctor_id, encounter_id: visit.encounterId, symptoms: 's', diagnosis: 'd' } });
    assert.equal(note.status, 201, JSON.stringify(note.body));
    consultationId = note.body.data.id;
  } finally { await visit.close(); }
  const [[{ n_before }]] = await db().query('SELECT COUNT(*) n_before FROM prescriptions');
  const res = await api('POST', '/prescriptions', { token: doctor.token, body: {
    consultation_id: consultationId, patient_id: b, doctor_id: doctor.user.doctor_id,
    items: [{ medicine_id: 1, dosage: '1 tablet', frequency: 'once', duration: '1 day', quantity: 1 }] } });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, { success: false, message: 'Consultation belongs to a different patient or doctor' });
  const [[{ n_after }]] = await db().query('SELECT COUNT(*) n_after FROM prescriptions');
  assert.equal(n_after, n_before);
});

test('A4: a bill for another patient\'s admission is refused with 400; the admission\'s own patient is billed as before', async () => {
  const reception = await login(USERS.RECEPTIONIST);
  const [[adm]] = await db().query('SELECT admission_id, patient_id FROM admissions ORDER BY admission_id LIMIT 1');
  const [[other]] = await db().query('SELECT patient_id FROM patients WHERE patient_id <> ? ORDER BY patient_id LIMIT 1', [adm.patient_id]);
  const wrong = await api('POST', '/bills', { token: reception.token, body: { patient_id: other.patient_id, admission_id: adm.admission_id, total_amount: 100 } });
  assert.equal(wrong.status, 400, JSON.stringify(wrong.body));
  assert.deepEqual(wrong.body, { success: false, message: 'That admission belongs to a different patient' });
  const missing = await api('POST', '/bills', { token: reception.token, body: { patient_id: adm.patient_id, admission_id: 999999, total_amount: 100 } });
  assert.deepEqual([missing.status, missing.body], [400, { success: false, message: 'Admission not found' }]);
  const right = await api('POST', '/bills', { token: reception.token, body: { patient_id: adm.patient_id, admission_id: adm.admission_id, total_amount: 100 } });
  assert.equal(right.status, 201, JSON.stringify(right.body));
  assert.equal(right.body.success, true);
});

// A5: a bill item's total is quantity * unit_price, computed by the database.
test('A5: a bill item\'s total is computed from quantity and unit price, and the API shows it as before', async () => {
  const reception = await login(USERS.RECEPTIONIST);
  const bill = await api('POST', '/bills', { token: reception.token, body: { patient_id: 4, total_amount: 0 } });
  assert.equal(bill.status, 201, JSON.stringify(bill.body));
  const add = await api('POST', `/bills/${bill.body.data.id}/items`, { token: reception.token, body: { description: 'Dressing', amount: 125.5, category: 'PROCEDURE' } });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  const got = await api('GET', `/bills/${bill.body.data.id}`, { token: reception.token });
  const [item] = got.body.data.items;
  assert.deepEqual(Object.keys(item), ['item_id', 'bill_id', 'description', 'category', 'quantity', 'unit_price', 'total_price', 'created_at']);
  assert.equal(Number(item.total_price), 125.5);
  const [[{ inconsistent }]] = await db().query('SELECT COUNT(*) inconsistent FROM bill_items WHERE total_price <> quantity * unit_price');
  assert.equal(inconsistent, 0);
});

// Workload: doctors.current_workload counts ACTIVE admissions only (migration 020).
test('workload: every doctor\'s workload equals their ACTIVE admissions (the seed\'s discharged admissions no longer count)', async () => {
  const [rows] = await db().query(`SELECT d.doctor_id, d.current_workload,
    (SELECT COUNT(*) FROM admissions a WHERE a.doctor_id = d.doctor_id AND a.status = 'ACTIVE') AS active FROM doctors d`);
  for (const r of rows) assert.equal(r.current_workload, Number(r.active), `doctor ${r.doctor_id}`);
});

test('workload: inserting an already discharged admission leaves the doctor\'s workload unchanged; an ACTIVE one adds 1', async () => {
  const [[doctor]] = await db().query('SELECT doctor_id, current_workload FROM doctors WHERE current_workload + 1 < max_workload ORDER BY doctor_id DESC LIMIT 1');
  const [[bed]] = await db().query("SELECT bed_id FROM beds WHERE status = 'AVAILABLE' ORDER BY bed_id DESC LIMIT 1");
  const workload = async () => (await db().query('SELECT current_workload FROM doctors WHERE doctor_id = ?', [doctor.doctor_id]))[0][0].current_workload;
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`INSERT INTO admissions (patient_id, doctor_id, bed_id, department_id, admission_date, discharge_date, status, diagnosis)
      VALUES (1, ?, ?, 1, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 1 DAY, 'DISCHARGED', 'Past stay')`, [doctor.doctor_id, bed.bed_id]);
    const [[{ afterDischarged }]] = await conn.query('SELECT current_workload AS afterDischarged FROM doctors WHERE doctor_id = ?', [doctor.doctor_id]);
    assert.equal(afterDischarged, doctor.current_workload, 'a discharged admission does not count');
    await conn.query(`INSERT INTO admissions (patient_id, doctor_id, bed_id, department_id, admission_date, status, diagnosis)
      VALUES (1, ?, ?, 1, NOW(), 'ACTIVE', 'Current stay')`, [doctor.doctor_id, bed.bed_id]);
    const [[{ afterActive }]] = await conn.query('SELECT current_workload AS afterActive FROM doctors WHERE doctor_id = ?', [doctor.doctor_id]);
    assert.equal(afterActive, doctor.current_workload + 1, 'an ACTIVE admission counts');
  } finally { await conn.rollback(); conn.release(); }
  assert.equal(await workload(), doctor.current_workload, 'rolled back');
});
