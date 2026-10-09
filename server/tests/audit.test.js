// Phase 1 step 3: immutable audit trail (NIST AU-2). Data changes are audited inside their own
// transaction; reads and denials are logged by non-blocking middleware.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { USERS, PASSWORD, SERVER_STDERR, api, rawRequest, login, db, closeDb, setStock } = require('./helpers');
const { sanitizeDetails } = require('../utils/audit');

after(closeDb);

const NOTE_MARKER = 'AUDIT-LEAK-CHECK confidential clinical narrative';
let admin, doctor, reception, pharmacy, lab, nurse;
let patientId;

before(async () => {
  [admin, doctor, reception, pharmacy, lab, nurse] = await Promise.all(
    [USERS.ADMIN, USERS.DOCTOR, USERS.RECEPTIONIST, USERS.PHARMACY, USERS.LABORATORY, USERS.NURSE].map(login)
  );
  [[{ patient_id: patientId }]] = await db().query('SELECT patient_id FROM appointments WHERE doctor_id = ? ORDER BY patient_id LIMIT 1', [doctor.user.doctor_id]);
});

const maxAuditId = async () => (await db().query('SELECT COALESCE(MAX(audit_id), 0) AS m FROM audit_logs'))[0][0].m;
const rowsSince = async (id) => (await db().query('SELECT * FROM audit_logs WHERE audit_id > ? ORDER BY audit_id', [id]))[0];
const parse = (row) => (row.details == null ? null : typeof row.details === 'string' ? JSON.parse(row.details) : row.details);

// Middleware rows are written after the response; poll briefly for them.
async function waitForRows(sinceId, predicate, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = (await rowsSince(sinceId)).filter(predicate);
    if (rows.length) return rows;
    await new Promise(r => setTimeout(r, 50));
  }
  return [];
}

// Runs one request and returns the in-transaction audit rows it produced (middleware READ/DENIED excluded).
async function changeRows(fn) {
  const mark = await maxAuditId();
  const res = await fn();
  const rows = (await rowsSince(mark)).filter(r => !['READ', 'ACCESS_DENIED', 'LOGIN_SUCCESS', 'LOGIN_FAILED'].includes(r.action));
  return { res, rows };
}

async function withFailingAuditInsert(action, fn) {
  await db().query('DROP TRIGGER IF EXISTS test_fail_audit_insert');
  await db().query(`CREATE TRIGGER test_fail_audit_insert BEFORE INSERT ON audit_logs FOR EACH ROW
    BEGIN IF NEW.action = '${action}' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'simulated audit failure'; END IF; END`);
  try { return await fn(); } finally { await db().query('DROP TRIGGER IF EXISTS test_fail_audit_insert'); }
}

test('audit_logs is append-only: UPDATE and DELETE are rejected by the database', async () => {
  await api('GET', `/patients/${patientId}`, { token: doctor.token });
  const [[row]] = await db().query('SELECT audit_id FROM audit_logs ORDER BY audit_id DESC LIMIT 1');
  assert.ok(row, 'there should be at least one audit row');
  await assert.rejects(db().query("UPDATE audit_logs SET action = 'TAMPERED' WHERE audit_id = ?", [row.audit_id]), /append-only/);
  await assert.rejects(db().query('DELETE FROM audit_logs WHERE audit_id = ?', [row.audit_id]), /append-only/);
  const [[still]] = await db().query('SELECT action FROM audit_logs WHERE audit_id = ?', [row.audit_id]);
  assert.notEqual(still.action, 'TAMPERED');
});

test('patient create and update each write one audit row with ids and changed field names only', async () => {
  const created = await changeRows(() => api('POST', '/patients', { token: reception.token, body: {
    name: 'Audit Test Patient', date_of_birth: '1990-05-01', gender: 'FEMALE', blood_group: 'O+', phone: '9000000099', address: '1 Test Road', emergency_contact: 'Kin',
  } }));
  assert.equal(created.res.status, 201);
  const id = created.res.body.data.id;
  assert.equal(created.rows.length, 1);
  const [c] = created.rows;
  assert.deepEqual([c.action, c.entity_type, c.entity_id, c.patient_id, c.user_id, c.role, c.outcome],
    ['CREATE_PATIENT', 'patient', id, id, reception.user.user_id, 'RECEPTIONIST', 'SUCCESS']);
  assert.equal(c.path, '/api/patients/');
  assert.equal(c.method, 'POST');

  const updated = await changeRows(() => api('PUT', `/patients/${id}`, { token: reception.token, body: {
    name: 'Audit Test Patient', date_of_birth: '1990-05-01', gender: 'FEMALE', blood_group: 'O+', phone: '9000000100', address: '2 New Road', emergency_contact: 'Kin',
  } }));
  assert.equal(updated.res.status, 200);
  assert.equal(updated.rows.length, 1);
  assert.equal(updated.rows[0].action, 'UPDATE_PATIENT');
  assert.deepEqual(parse(updated.rows[0]), { changed_fields: ['phone', 'address'] });

  const noop = await changeRows(() => api('PUT', `/patients/${id}`, { token: reception.token, body: {
    name: 'Audit Test Patient', date_of_birth: '1990-05-01', gender: 'FEMALE', blood_group: 'O+', phone: '9000000100', address: '2 New Road', emergency_contact: 'Kin',
  } }));
  assert.equal(noop.rows.length, 0, 'an update that changes nothing writes no audit row');
});

test('consultation audit rows never contain note text', async () => {
  const created = await changeRows(() => api('POST', '/consultations', { token: doctor.token, body: {
    patient_id: patientId, doctor_id: doctor.user.doctor_id, symptoms: NOTE_MARKER, diagnosis: NOTE_MARKER, assessment: '', plan: NOTE_MARKER,
  } }));
  assert.equal(created.res.status, 201, JSON.stringify(created.res.body));
  assert.equal(created.rows[0].action, 'CREATE_CONSULTATION');
  assert.deepEqual(parse(created.rows[0]).fields_recorded, ['symptoms', 'diagnosis', 'plan']);

  const id = created.res.body.data.id;
  const updated = await changeRows(() => api('PUT', `/consultations/${id}`, { token: doctor.token, body: {
    symptoms: NOTE_MARKER, diagnosis: NOTE_MARKER, assessment: `${NOTE_MARKER} revised`, plan: NOTE_MARKER, notes: 'x'.repeat(500),
  } }));
  assert.equal(updated.rows[0].action, 'UPDATE_CONSULTATION');
  assert.deepEqual(parse(updated.rows[0]), { changed_fields: ['assessment', 'notes'] });
});

test('prescription create, dispense and stock movements are audited with item ids and quantities', async () => {
  await setStock(16, 500);
  await setStock(17, 500);
  const created = await changeRows(() => api('POST', '/prescriptions', { token: doctor.token, body: {
    patient_id: patientId, doctor_id: doctor.user.doctor_id, notes: NOTE_MARKER,
    items: [16, 17].map(m => ({ medicine_id: m, dosage: '1', frequency: 'Once daily', duration: '2 days', quantity: 2 })),
  } }));
  assert.equal(created.rows.length, 1);
  assert.equal(created.rows[0].action, 'CREATE_PRESCRIPTION');
  assert.deepEqual(parse(created.rows[0]).medicine_ids, [16, 17]);

  const id = created.res.body.data.id;
  const dispensed = await changeRows(() => api('POST', `/prescriptions/${id}/dispense`, { token: pharmacy.token }));
  assert.equal(dispensed.res.status, 200);
  assert.equal(dispensed.rows.length, 1);
  const d = dispensed.rows[0];
  assert.deepEqual([d.action, d.entity_id, d.patient_id, d.role], ['DISPENSE_PRESCRIPTION', id, patientId, 'PHARMACY']);
  const details = parse(d);
  assert.equal(details.from, 'CREATED');
  assert.equal(details.to, 'DISPENSED');
  assert.deepEqual(details.items.map(i => [i.medicine_id, i.quantity]), [[16, 2], [17, 2]]);

  const receipt = await changeRows(() => api('POST', '/medicines/16/stock', { token: pharmacy.token, body: { quantity: 10, type: 'RECEIPT', reason: 'Restock', notes: NOTE_MARKER } }));
  assert.equal(receipt.rows[0].action, 'STOCK_RECEIPT');
  const r = parse(receipt.rows[0]);
  assert.deepEqual([r.quantity, r.from, r.to, r.reason], [10, 498, 508, 'Restock']);
  assert.equal('notes' in r, false);
});

test('lab order, processing, result and report upload are each audited', async () => {
  const order = await changeRows(() => api('POST', '/lab/orders', { token: doctor.token, body: { patient_id: patientId, doctor_id: doctor.user.doctor_id, tests: [{ test_id: 1 }, { test_id: 2 }], notes: '' } }));
  assert.equal(order.rows[0].action, 'CREATE_LAB_ORDER');
  assert.equal(parse(order.rows[0]).order_ids.length, 2);
  const orderId = order.res.body.data.id;

  const processing = await changeRows(() => api('PUT', `/lab/orders/${orderId}/status`, { token: lab.token, body: { status: 'PROCESSING' } }));
  assert.deepEqual(parse(processing.rows[0]), { from: 'ORDERED', to: 'PROCESSING' });
  // A repeat (409) changes nothing and writes nothing.
  const repeat = await changeRows(() => api('PUT', `/lab/orders/${orderId}/status`, { token: lab.token, body: { status: 'PROCESSING' } }));
  assert.equal(repeat.res.status, 409);
  assert.equal(repeat.rows.length, 0);

  // CBC's default range is 4500-11000 cells/mcL: a value of 42 is flagged LOW automatically (step 7),
  // overriding the manual "HIGH" sent in the old payload shape.
  const result = await changeRows(() => api('POST', '/lab/results', { token: lab.token, body: { order_id: orderId, result_value: '42', interpretation: 'HIGH', technician_notes: NOTE_MARKER } }));
  assert.equal(result.rows[0].action, 'RECORD_LAB_RESULT');
  assert.equal(result.rows[0].patient_id, patientId);
  assert.deepEqual([parse(result.rows[0]).interpretation, parse(result.rows[0]).interpretation_source], ['LOW', 'AUTO']);

  const form = new FormData();
  form.append('report', new Blob([Buffer.from('%PDF-1.4\n%%EOF\n')], { type: 'application/pdf' }), 'Patient Name Report.pdf');
  const upload = await changeRows(() => rawRequest('POST', `/lab/results/${orderId}/attachments`, { token: lab.token, body: form }));
  assert.equal(upload.res.status, 201);
  assert.equal(upload.rows[0].action, 'UPLOAD_LAB_REPORT');
  assert.equal(JSON.stringify(parse(upload.rows[0])).includes('Patient Name'), false, 'original filename is not logged');
});

test('admissions, billing, appointments, emergencies, surgery, beds and doctors are audited', async () => {
  const appt = await changeRows(() => api('POST', '/appointments', { token: reception.token, body: { patient_id: patientId, doctor_id: doctor.user.doctor_id, appointment_date: '2031-03-03', appointment_time: '09:15:00' } }));
  assert.equal(appt.rows[0].action, 'CREATE_APPOINTMENT');
  // Check-in goes through the encounter state machine: one row covering both records.
  const apptStatus = await changeRows(() => api('PUT', `/appointments/${appt.res.body.data.id}/status`, { token: reception.token, body: { status: 'CHECKED_IN' } }));
  assert.equal(apptStatus.rows.length, 1);
  assert.equal(apptStatus.rows[0].action, 'ENCOUNTER_ARRIVED');
  assert.equal(apptStatus.rows[0].entity_type, 'encounter');
  assert.deepEqual(parse(apptStatus.rows[0]), { from: null, to: 'ARRIVED', appointment_id: appt.res.body.data.id, appointment: { from: 'BOOKED', to: 'CHECKED_IN' } });

  const [[bed]] = await db().query("SELECT bed_id FROM beds WHERE status = 'AVAILABLE' ORDER BY bed_id DESC LIMIT 1");
  const admit = await changeRows(() => api('POST', '/admissions', { token: reception.token, body: { patient_id: 2, doctor_id: doctor.user.doctor_id, bed_id: bed.bed_id, department_id: 1, diagnosis: NOTE_MARKER, notes: '' } }));
  assert.equal(admit.res.status, 201, JSON.stringify(admit.res.body));
  assert.equal(admit.rows[0].action, 'ADMIT_PATIENT');
  const discharge = await changeRows(() => api('POST', `/admissions/${admit.res.body.data.id}/discharge`, { token: admin.token }));
  assert.equal(discharge.rows[0].action, 'DISCHARGE_PATIENT');

  const bill = await changeRows(() => api('POST', '/bills', { token: reception.token, body: { patient_id: patientId, total_amount: 0 } }));
  const billId = bill.res.body.data.id;
  const item = await changeRows(() => api('POST', `/bills/${billId}/items`, { token: reception.token, body: { description: NOTE_MARKER, amount: 100 } }));
  const pay = await changeRows(() => api('PUT', `/bills/${billId}/pay`, { token: reception.token, body: { amount: 100 } }));
  assert.deepEqual([bill.rows[0].action, item.rows[0].action, pay.rows[0].action], ['CREATE_BILL', 'ADD_BILL_ITEM', 'RECORD_PAYMENT']);
  assert.deepEqual([parse(pay.rows[0]).from, parse(pay.rows[0]).to], ['PENDING', 'PAID']);

  const emergency = await changeRows(() => api('POST', '/emergency', { token: admin.token, body: { patient_id: patientId, severity: 'MODERATE', required_bed_type: 'GENERAL', required_specialization: null, symptoms: NOTE_MARKER, ventilator_required: false } }));
  assert.equal(emergency.rows[0].action, 'CREATE_EMERGENCY');
  const allocate = await changeRows(() => api('POST', `/emergency/${emergency.res.body.data.id}/allocate`, { token: admin.token }));
  assert.equal(allocate.res.status, 200);
  assert.equal(allocate.rows.length, 1, 'allocation writes one audit row in its own transaction');
  assert.ok(['ALLOCATE_EMERGENCY', 'EMERGENCY_QUEUED'].includes(allocate.rows[0].action));

  const surgery = await changeRows(() => api('POST', '/surgery', { token: doctor.token, body: { patient_id: patientId, doctor_id: doctor.user.doctor_id, procedure_name: 'Appendectomy', diagnosis: NOTE_MARKER, requested_date: '2031-04-04', notes: NOTE_MARKER } }));
  assert.equal(surgery.rows[0].action, 'CREATE_SURGERY_REQUEST');
  const surgStatus = await changeRows(() => api('PUT', `/surgery/${surgery.res.body.data.id}/status`, { token: doctor.token, body: { status: 'SCHEDULED' } }));
  assert.deepEqual(parse(surgStatus.rows[0]), { from: 'REQUESTED', to: 'SCHEDULED' });

  const [[maint]] = await db().query("SELECT bed_id FROM beds WHERE status = 'AVAILABLE' ORDER BY bed_id LIMIT 1");
  const bedStatus = await changeRows(() => api('PUT', `/beds/${maint.bed_id}/status`, { token: admin.token, body: { status: 'MAINTENANCE' } }));
  assert.deepEqual(parse(bedStatus.rows[0]), { from: 'AVAILABLE', to: 'MAINTENANCE' });
  await api('PUT', `/beds/${maint.bed_id}/status`, { token: admin.token, body: { status: 'AVAILABLE' } });

  const docStatus = await changeRows(() => api('PUT', `/doctors/${doctor.user.doctor_id}/status`, { token: admin.token, body: { status: 'BUSY' } }));
  assert.deepEqual(parse(docStatus.rows[0]), { from: 'AVAILABLE', to: 'BUSY' });
  await api('PUT', `/doctors/${doctor.user.doctor_id}/status`, { token: admin.token, body: { status: 'AVAILABLE' } });
});

test('atomicity: if the audit row cannot be written, the data change is rolled back', async () => {
  const name = `Rollback Probe ${Date.now()}`;
  const res = await withFailingAuditInsert('CREATE_PATIENT', () => api('POST', '/patients', { token: reception.token, body: {
    name, date_of_birth: '1980-01-01', gender: 'MALE', blood_group: null, phone: null, address: null, emergency_contact: null,
  } }));
  assert.equal(res.status, 500);
  const [rows] = await db().query('SELECT patient_id FROM patients WHERE name = ?', [name]);
  assert.equal(rows.length, 0, 'the patient must not exist without its audit row');

  await setStock(15, 100);
  const rx = await api('POST', '/prescriptions', { token: doctor.token, body: {
    patient_id: patientId, doctor_id: doctor.user.doctor_id, items: [{ medicine_id: 15, dosage: '1', frequency: 'x', duration: '1', quantity: 3 }],
  } });
  const dispense = await withFailingAuditInsert('DISPENSE_PRESCRIPTION', () => api('POST', `/prescriptions/${rx.body.data.id}/dispense`, { token: pharmacy.token }));
  assert.equal(dispense.status, 500);
  const [[med]] = await db().query('SELECT stock_quantity FROM medicines WHERE medicine_id = 15');
  assert.equal(med.stock_quantity, 100, 'stock unchanged');
  const [[p]] = await db().query('SELECT status FROM prescriptions WHERE prescription_id = ?', [rx.body.data.id]);
  assert.equal(p.status, 'CREATED');
  // Once auditing works again the same dispense succeeds.
  assert.equal((await api('POST', `/prescriptions/${rx.body.data.id}/dispense`, { token: pharmacy.token })).status, 200);
});

test('PHI reads are logged with the route pattern and patient; non-PHI reads are not', async () => {
  const mark = await maxAuditId();
  assert.equal((await api('GET', `/patients/${patientId}/history`, { token: doctor.token })).status, 200);
  const [row] = await waitForRows(mark, r => r.action === 'READ' && r.path === '/api/patients/:id/history');
  assert.ok(row, 'READ row expected');
  assert.deepEqual([row.patient_id, row.user_id, row.outcome, row.status_code, row.method], [patientId, doctor.user.user_id, 'SUCCESS', 200, 'GET']);

  const mark2 = await maxAuditId();
  await api('GET', '/beds', { token: doctor.token });
  await api('GET', '/departments', { token: doctor.token });
  await new Promise(r => setTimeout(r, 300));
  assert.equal((await rowsSince(mark2)).filter(r => r.action === 'READ').length, 0);
});

test('lab report reads record the patient resolved by the controller', async () => {
  const [[order]] = await db().query("SELECT order_id, patient_id FROM lab_orders WHERE status = 'COMPLETED' LIMIT 1");
  const mark = await maxAuditId();
  await api('GET', `/lab/results/${order.order_id}`, { token: lab.token });
  const [row] = await waitForRows(mark, r => r.action === 'READ' && r.path === '/api/lab/results/:orderId');
  assert.equal(row.patient_id, order.patient_id);
});

test('denied requests are logged: 403 with the user, 401 without one', async () => {
  const mark = await maxAuditId();
  assert.equal((await api('POST', '/prescriptions/1/dispense', { token: nurse.token })).status, 403);
  const [denied] = await waitForRows(mark, r => r.action === 'ACCESS_DENIED' && r.status_code === 403);
  assert.deepEqual([denied.outcome, denied.user_id, denied.role, denied.method, denied.path], ['DENIED', nurse.user.user_id, 'NURSE', 'POST', '/api/prescriptions/:id/dispense']);

  const mark2 = await maxAuditId();
  assert.equal((await api('GET', '/patients/1/history')).status, 401);
  const [anon] = await waitForRows(mark2, r => r.action === 'ACCESS_DENIED' && r.status_code === 401);
  assert.equal(anon.user_id, null);
  assert.equal(anon.outcome, 'DENIED');
});

test('logins are logged; passwords never are', async () => {
  const wrong = 'WrongPass!audit-probe';
  const mark = await maxAuditId();
  assert.equal((await api('POST', '/auth/login', { body: { username: USERS.NURSE, password: wrong } })).status, 401);
  assert.equal((await api('POST', '/auth/login', { body: { username: 'no.such.user', password: wrong } })).status, 401);
  assert.equal((await api('POST', '/auth/login', { body: { username: USERS.NURSE, password: PASSWORD } })).status, 200);
  const rows = await waitForRows(mark, r => r.action.startsWith('LOGIN_'));
  await new Promise(r => setTimeout(r, 200));
  const logins = (await rowsSince(mark)).filter(r => r.action.startsWith('LOGIN_'));
  assert.ok(rows.length);
  assert.deepEqual(logins.map(r => [r.action, r.user_id, parse(r)?.username ?? null]), [
    ['LOGIN_FAILED', nurse.user.user_id, USERS.NURSE],
    ['LOGIN_FAILED', null, 'no.such.user'],
    ['LOGIN_SUCCESS', nurse.user.user_id, null],
  ]);
  const [[{ leaks }]] = await db().query('SELECT COUNT(*) AS leaks FROM audit_logs WHERE CAST(details AS CHAR) LIKE ? OR CAST(details AS CHAR) LIKE ?', [`%${wrong}%`, `%${PASSWORD}%`]);
  assert.equal(leaks, 0);
});

test('a failed access-log write does not fail the request and is reported on stderr', async () => {
  const before = fs.readFileSync(SERVER_STDERR, 'utf8').length;
  const res = await withFailingAuditInsert('READ', async () => {
    const r = await api('GET', `/patients/${patientId}`, { token: doctor.token });
    await new Promise(resolve => setTimeout(resolve, 300)); // let the async write fail while the trigger exists
    return r;
  });
  assert.equal(res.status, 200);
  const logged = fs.readFileSync(SERVER_STDERR, 'utf8').slice(before);
  assert.match(logged, /\[audit\] failed to write READ for \/api\/patients\/:id: simulated audit failure/);
});

test('no audit row anywhere contains note text, passwords or tokens', async () => {
  const [[{ n }]] = await db().query(
    `SELECT COUNT(*) AS n FROM audit_logs WHERE CAST(details AS CHAR) LIKE ? OR CAST(details AS CHAR) LIKE ?
       OR CAST(details AS CHAR) LIKE '%Bearer%' OR CAST(details AS CHAR) LIKE '%eyJ%' OR CAST(details AS CHAR) LIKE '%password%'`,
    [`%${NOTE_MARKER}%`, `%${PASSWORD}%`]
  );
  assert.equal(n, 0);
});

test('sanitizeDetails drops secret-looking keys and free text, keeps ids, enums and field names', () => {
  assert.deepEqual(sanitizeDetails({
    password: 'x', newPassword: 'y', token: 't', Authorization: 'Bearer z', api_secret: 's',
    id: 7, ok: true, status: 'DISPENSED', note: 'n'.repeat(65), changed_fields: ['notes', 'plan'],
    nested: { session: 'abc', medicine_id: 3 },
  }), { id: 7, ok: true, status: 'DISPENSED', changed_fields: ['notes', 'plan'], nested: { medicine_id: 3 } });
});
