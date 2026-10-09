// Phase 1 step 4b: report Section E permission matrix, enforced in the backend.
// 1. Route gates: every route x every role — allowed roles pass the gate, all others get 403.
// 2. Patient scope: DR* (care set) and NU* (ward assignments + open outpatient visits).
// 3. Staff accounts, deactivation, nurse assignments, data needed by pharmacy and lab screens.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { USERS, LAB_REPORT_DIR, api, rawRequest, login, db, closeDb } = require('./helpers');

after(closeDb);

const ROLES = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LABORATORY', 'PHARMACY'];
const ALL = ROLES;
const AD = 'ADMIN', DR = 'DOCTOR', NU = 'NURSE', RC = 'RECEPTIONIST', LB = 'LABORATORY', PH = 'PHARMACY';
const STAFF = [AD, RC, DR, NU];
const GATE = /^Forbidden: this is available to /;

const tokens = {};
let doctor, nurse;
let P; // a patient inside both dr.smith's care set and the nurse's scope (open outpatient visit)
let E; // that patient's open encounter

before(async () => {
  for (const r of ROLES) tokens[r] = (await login(USERS[r])).token;
  doctor = await login(USERS.DOCTOR);
  nurse = await login(USERS.NURSE);
  const reception = await login(USERS.RECEPTIONIST);
  P = 1;
  const booked = await api('POST', '/appointments', { token: reception.token, body: { patient_id: P, doctor_id: doctor.user.doctor_id, appointment_date: '2033-01-10', appointment_time: '09:00:00' } });
  const enc = await api('POST', '/encounters', { token: reception.token, body: { appointment_id: booked.body.data.id } });
  assert.equal(enc.status, 201, JSON.stringify(enc.body));
  E = enc.body.data.encounter_id;
});

// [method, path, allowed roles, body]
const matrix = () => [
  ['GET', '/auth/me', ALL],
  ['POST', '/auth/register', [AD], {}],
  ['GET', '/dashboard/stats', [AD]],
  ['GET', '/users', [AD]],
  ['PUT', '/users/999999/deactivate', [AD]],
  ['PUT', '/users/999999/reactivate', [AD]],
  ['GET', '/nurse-assignments', [AD, NU]],
  ['POST', '/nurse-assignments', [AD], {}],
  ['PUT', '/nurse-assignments/999999', [AD], {}],
  ['GET', '/nurse/station', [NU]],

  ['GET', '/patients', STAFF],
  ['POST', '/patients', [AD, RC], {}],
  ['POST', '/patients/duplicates', [AD, RC], {}],
  ['GET', `/patients/${P}`, STAFF],
  ['PUT', '/patients/999999', [AD, RC], {}],
  ['GET', `/patients/${P}/history`, [DR, NU]],
  ['GET', `/patients/${P}/admissions`, STAFF],
  ['GET', `/patients/${P}/appointments`, STAFF],
  ['GET', `/patients/${P}/prescriptions`, [DR, NU, PH]],
  ['GET', `/patients/${P}/lab-results`, [DR, NU, LB]],

  ['GET', '/doctors', ALL], ['GET', '/doctors/available', ALL], ['GET', '/doctors/1', ALL], ['GET', '/doctors/1/schedule', ALL],
  ['GET', '/doctors/me/analytics', [DR]],
  ['POST', '/doctors', [AD], {}],
  ['PUT', '/doctors/999999', [AD], {}],
  ['PUT', '/doctors/999999/status', [AD, DR], {}],
  ['GET', '/departments', ALL], ['GET', '/departments/1', ALL],
  ['POST', '/departments', [AD], {}], ['PUT', '/departments/999999', [AD], {}],
  ['GET', '/wards', ALL], ['GET', '/wards/1', ALL], ['POST', '/wards', [AD], {}],

  ['GET', '/beds', ALL], ['GET', '/beds/available', ALL], ['GET', '/beds/summary', ALL], ['GET', '/beds/1', ALL], ['GET', '/beds/ward/1', ALL],
  ['PUT', '/beds/999999/status', STAFF, { status: 'AVAILABLE' }],
  ['GET', '/ambulances', ALL],
  ['POST', '/ambulances', STAFF, {}],
  ['PUT', '/ambulances/999999', STAFF, {}],
  ['PUT', '/ambulances/999999/status', STAFF, { status: 'AVAILABLE' }],
  ['POST', '/ambulances/999999/report-emergency', STAFF, {}],
  ['GET', '/emergency', STAFF], ['GET', '/emergency/queue', STAFF], ['GET', '/emergency/1', STAFF],
  ['POST', '/emergency', STAFF, {}],
  ['PUT', '/emergency/999999', STAFF, {}],
  ['POST', '/emergency/999999/allocate', STAFF],

  ['GET', '/appointments', STAFF], ['GET', '/appointments/1', STAFF], ['GET', '/appointments/doctor/1', STAFF],
  ['POST', '/appointments', [AD, RC], {}],
  ['PUT', '/appointments/999999/status', [AD, RC], { status: 'CHECKED_IN' }],
  ['GET', '/encounters/queue', STAFF],
  ['GET', `/encounters/${E}`, STAFF],
  ['POST', '/encounters', [AD, RC], {}],
  ['POST', '/encounters/999999/triage', [NU]],
  ['POST', '/encounters/999999/start', [DR]],
  ['POST', '/encounters/999999/finish', [DR]],
  ['POST', '/encounters/999999/entered-in-error', [DR]],
  ['POST', '/encounters/999999/cancel', [AD, RC]],

  ['POST', '/consultations', [DR], {}], ['GET', '/consultations/1', [DR]], ['GET', `/consultations/patient/${P}`, [DR]], ['PUT', '/consultations/999999', [DR], {}],
  ['GET', '/prescriptions', [DR, NU, PH]],
  ['POST', '/prescriptions', [DR], {}],
  ['GET', '/prescriptions/1', [DR, NU, PH]], ['GET', `/prescriptions/patient/${P}`, [DR, NU, PH]],
  ['POST', '/prescriptions/999999/dispense', [PH]],
  ['GET', '/medicines', [AD, DR, NU, PH]],
  ['GET', '/medicines/1/batches', [AD, PH]],
  ['POST', '/prescriptions/999999/cancel', [DR]],
  ['GET', `/mar/patients/${P}`, [NU, DR]],
  ['POST', '/mar/doses/999999/administer', [NU], {}],
  ['POST', '/mar/doses/999999/refuse', [NU], {}],
  ['POST', '/mar/doses/999999/missed', [NU], {}],
  ['POST', '/mar/items/999999/given', [NU], {}],
  ['POST', '/medicines/999999/stock', [PH], { quantity: 1, type: 'RECEIPT' }],

  ['GET', '/lab/tests', [AD, DR, NU, LB]],
  ['POST', '/lab/orders', [DR], {}],
  ['GET', '/lab/orders', [LB, DR, NU]],
  ['PUT', '/lab/orders/999999/status', [LB], { status: 'PROCESSING' }],
  ['POST', '/lab/results', [LB], {}],
  ['GET', '/lab/results/1', [LB, DR, NU]],
  ['POST', '/lab/results/999999/attachments', [LB]],
  ['GET', '/lab/attachments/999999', [LB, DR, NU]],
  ['GET', '/lab/reports/999999/download', [LB, DR, NU]],

  ['GET', '/admissions', STAFF], ['GET', '/admissions/current', STAFF], ['GET', '/admissions/1', STAFF],
  ['POST', '/admissions', [AD, RC, DR], {}],
  ['POST', '/admissions/999999/discharge', [AD, DR]],

  ['POST', '/bills', [AD, RC], {}], ['GET', '/bills', [AD, RC]], ['GET', '/bills/1', [AD, RC]], ['POST', '/bills/999999/items', [AD, RC], {}],
  ['PUT', '/bills/999999/pay', [AD, RC], {}], ['GET', `/bills/patient/${P}`, [AD, RC]], ['POST', '/bills/generate/999999', [AD, RC]],

  ['POST', '/surgery', [DR], {}], ['GET', `/surgery/patient/${P}`, [DR]], ['PUT', '/surgery/999999/status', [DR], {}],
];

test('route gates: each role passes exactly the routes the Section E matrix allows', async () => {
  const problems = [];
  for (const [method, path, allowed, body] of matrix()) {
    for (const role of ROLES) {
      const res = await api(method, path, { token: tokens[role], body });
      const gated = res.status === 403 && GATE.test(res.body?.message || '');
      if (res.status === 401) problems.push(`${role} ${method} ${path}: 401`);
      else if (allowed.includes(role) && gated) problems.push(`${role} ${method} ${path}: blocked by the role gate but should be allowed`);
      else if (!allowed.includes(role) && !gated) problems.push(`${role} ${method} ${path}: expected 403 from the role gate, got ${res.status}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every denial is a 403 with a readable reason', async () => {
  const res = await api('POST', '/prescriptions/1/dispense', { token: tokens.NURSE });
  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, 'Forbidden: this is available to pharmacy staff only');
});

// ---------------------------------------------------------------- patient scope
async function nurseScope() {
  const [rows] = await db().query(`
    SELECT a.patient_id FROM admissions a JOIN beds b ON b.bed_id = a.bed_id JOIN nurse_ward_assignments n ON n.ward_id = b.ward_id
    WHERE a.status = 'ACTIVE' AND n.nurse_user_id = ? AND n.start_date <= CURDATE() AND (n.end_date IS NULL OR n.end_date >= CURDATE())
    UNION SELECT patient_id FROM encounters WHERE encounter_type = 'OUTPATIENT' AND status IN ('ARRIVED','TRIAGED','IN_PROGRESS')`, [nurse.user.user_id]);
  return new Set(rows.map(r => r.patient_id));
}

test('nurse scope: assigned-ward inpatients and open visits only, across patients, admissions, prescriptions and lab orders', async () => {
  const scope = await nurseScope();
  assert.ok(scope.size >= 2, 'seeded assignments should give the nurse patients');
  assert.ok(scope.has(P), 'a patient with an open outpatient visit is in scope');
  const [[outsider]] = await db().query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (${[...scope].join(',')}) LIMIT 1`);

  const list = await api('GET', '/patients?limit=500', { token: nurse.token });
  assert.deepEqual(new Set(list.body.data.map(p => p.patient_id)), scope);

  assert.equal((await api('GET', `/patients/${P}`, { token: nurse.token })).status, 200);
  const denied = await api('GET', `/patients/${outsider.patient_id}`, { token: nurse.token });
  assert.equal(denied.status, 403);
  for (const sub of ['history', 'admissions', 'prescriptions', 'lab-results']) {
    assert.equal((await api('GET', `/patients/${outsider.patient_id}/${sub}`, { token: nurse.token })).status, 403, sub);
  }

  const admissions = await api('GET', '/admissions', { token: nurse.token });
  const [wards] = await db().query('SELECT ward_id FROM nurse_ward_assignments WHERE nurse_user_id = ?', [nurse.user.user_id]);
  const [admWards] = await db().query(`SELECT a.admission_id, b.ward_id FROM admissions a JOIN beds b ON b.bed_id = a.bed_id`);
  const wardOf = new Map(admWards.map(r => [r.admission_id, r.ward_id]));
  assert.ok(admissions.body.data.length > 0);
  for (const a of admissions.body.data) assert.ok(wards.some(w => w.ward_id === wardOf.get(a.admission_id)), `admission ${a.admission_id} is outside the nurse's wards`);

  for (const rx of (await api('GET', '/prescriptions', { token: nurse.token })).body.data) assert.ok(scope.has(rx.patient_id));
  for (const o of (await api('GET', '/lab/orders', { token: nurse.token })).body.data) assert.ok(scope.has(o.patient_id));
});

test('nurse history excludes consultation notes and surgery requests; the doctor sees them', async () => {
  const [[withNotes]] = await db().query('SELECT patient_id FROM consultations WHERE doctor_id = ? LIMIT 1', [doctor.user.doctor_id]);
  const docView = await api('GET', `/patients/${withNotes.patient_id}/history`, { token: doctor.token });
  assert.ok(docView.body.data.consultations.length > 0);
  const nurseView = await api('GET', `/patients/${P}/history`, { token: nurse.token });
  assert.equal(nurseView.status, 200);
  assert.deepEqual(nurseView.body.data.consultations, []);
  assert.deepEqual(nurseView.body.data.surgeries, []);
  assert.ok(Array.isArray(nurseView.body.data.prescriptions) && Array.isArray(nurseView.body.data.labs));
});

test('nurse can view lab reports for an assigned inpatient', async () => {
  const [[adm]] = await db().query(`
    SELECT a.patient_id, u.username FROM admissions a JOIN beds b ON b.bed_id = a.bed_id JOIN doctors d ON d.doctor_id = a.doctor_id JOIN users u ON u.user_id = d.user_id
    JOIN nurse_ward_assignments n ON n.ward_id = b.ward_id AND n.nurse_user_id = ? WHERE a.status = 'ACTIVE' LIMIT 1`, [nurse.user.user_id]);
  const attending = await login(adm.username);
  const lab = await login(USERS.LABORATORY);
  const order = await api('POST', '/lab/orders', { token: attending.token, body: { patient_id: adm.patient_id, doctor_id: attending.user.doctor_id, tests: [{ test_id: 1 }], notes: '' } });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  const orderId = order.body.data.id;
  await api('PUT', `/lab/orders/${orderId}/status`, { token: lab.token, body: { status: 'PROCESSING' } });
  const result = await api('POST', '/lab/results', { token: lab.token, body: { order_id: orderId, result_value: '7' } });
  const form = new FormData();
  form.append('report', new Blob([Buffer.from('%PDF-1.4\n%%EOF\n')], { type: 'application/pdf' }), 'icu.pdf');
  assert.equal((await rawRequest('POST', `/lab/results/${orderId}/attachments`, { token: lab.token, body: form })).status, 201);

  assert.equal((await api('GET', `/lab/results/${orderId}`, { token: nurse.token })).status, 200);
  const dl = await rawRequest('GET', `/lab/reports/${result.body.data.id}/download`, { token: nurse.token });
  assert.equal(dl.status, 200);
});

test('doctor lab order list is limited to their care set', async () => {
  const orders = (await api('GET', '/lab/orders', { token: doctor.token })).body.data;
  const [care] = await db().query(`SELECT patient_id FROM appointments WHERE doctor_id = ? UNION SELECT patient_id FROM admissions WHERE doctor_id = ?
    UNION SELECT patient_id FROM consultations WHERE doctor_id = ? UNION SELECT patient_id FROM lab_orders WHERE doctor_id = ?
    UNION SELECT patient_id FROM prescriptions WHERE doctor_id = ? UNION SELECT patient_id FROM encounters WHERE doctor_id = ?`, Array(6).fill(doctor.user.doctor_id));
  const careSet = new Set(care.map(r => r.patient_id));
  for (const o of orders) assert.ok(careSet.has(o.patient_id));
  const [[{ total }]] = await db().query('SELECT COUNT(*) total FROM lab_orders');
  assert.ok(orders.length < total, 'the doctor does not see every order');
});

test('doctors can change only their own availability status', async () => {
  assert.equal((await api('PUT', `/doctors/${doctor.user.doctor_id}/status`, { token: doctor.token, body: { status: 'AVAILABLE' } })).status, 200);
  const other = await api('PUT', `/doctors/${doctor.user.doctor_id + 1}/status`, { token: doctor.token, body: { status: 'OFF_DUTY' } });
  assert.equal(other.status, 403);
  assert.match(other.body.message, /own status/);
});

// ---------------------------------------------------------------- data the screens need
test('pharmacy prescription list and detail include patient name, age and allergies', async () => {
  await db().query("UPDATE patients SET allergies = 'Penicillin' WHERE patient_id = ?", [P]);
  const rx = await api('POST', '/prescriptions', { token: doctor.token, body: { patient_id: P, doctor_id: doctor.user.doctor_id, items: [{ medicine_id: 1, dosage: '1', frequency: 'x', duration: '1', quantity: 1 }] } });
  const id = rx.body.data.id;
  const [[p]] = await db().query('SELECT name, TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) age FROM patients WHERE patient_id = ?', [P]);

  const row = (await api('GET', '/prescriptions', { token: tokens.PHARMACY })).body.data.find(r => r.prescription_id === id);
  assert.deepEqual([row.patientName, row.patient_age, row.patient_allergies], [p.name, p.age, 'Penicillin']);
  const detail = (await api('GET', `/prescriptions/${id}`, { token: tokens.PHARMACY })).body.data;
  assert.deepEqual([detail.patient_name, detail.patient_age, detail.patient_allergies], [p.name, p.age, 'Penicillin']);
  assert.ok(detail.items.length === 1);
});

test('lab order list includes patient name for laboratory staff', async () => {
  const orders = (await api('GET', '/lab/orders', { token: tokens.LABORATORY })).body.data;
  assert.ok(orders.length > 0);
  assert.ok(orders.every(o => typeof o.patient_name === 'string' && o.patient_name.length > 0));
});

test('admin dashboard stats include lab workload counts', async () => {
  const stats = (await api('GET', '/dashboard/stats', { token: tokens.ADMIN })).body.data;
  for (const k of ['ordered', 'processing', 'completedToday', 'overdue']) assert.equal(typeof stats.labWorkload[k], 'number');
});

test('a rejected lab upload never writes a file', async () => {
  const before = fs.readdirSync(LAB_REPORT_DIR).length;
  const form = new FormData();
  form.append('report', new Blob([Buffer.from('%PDF-1.4\n%%EOF\n')], { type: 'application/pdf' }), 'x.pdf');
  const res = await rawRequest('POST', '/lab/results/1/attachments', { token: tokens.PHARMACY, body: form });
  assert.equal(res.status, 403);
  assert.equal(fs.readdirSync(LAB_REPORT_DIR).length, before);
});

// ---------------------------------------------------------------- staff accounts
const unique = () => `t${Date.now() % 1e8}${Math.floor(Math.random() * 100)}`;
const register = (body, token = tokens.ADMIN) => api('POST', '/auth/register', { token, body });

test('admin creates staff accounts; a doctor account gets its doctor profile in the same transaction', async () => {
  const u = unique();
  const nurseAcc = await register({ username: `n.${u}`, password: 'Secret123!', role: 'NURSE', full_name: 'Test Nurse', email: `n.${u}@hospital.test`, phone: '9000000001' });
  assert.equal(nurseAcc.status, 201, JSON.stringify(nurseAcc.body));
  assert.equal(nurseAcc.body.message, 'User registered');
  assert.equal((await api('POST', '/auth/login', { body: { username: `n.${u}`, password: 'Secret123!' } })).status, 200);

  const docAcc = await register({ username: `d.${u}`, password: 'Secret123!', role: 'DOCTOR', full_name: 'Dr. Test Doctor', email: `d.${u}@hospital.test`, phone: '9000000002', department_id: 1, specialization: 'General Medicine', shift: 'MORNING' });
  assert.equal(docAcc.status, 201, JSON.stringify(docAcc.body));
  const [[profile]] = await db().query('SELECT name, department_id, shift FROM doctors WHERE doctor_id = ?', [docAcc.body.data.doctor_id]);
  assert.deepEqual({ ...profile }, { name: 'Dr. Test Doctor', department_id: 1, shift: 'MORNING' });
  const docLogin = await api('POST', '/auth/login', { body: { username: `d.${u}`, password: 'Secret123!' } });
  assert.equal(docLogin.body.user.doctor_id, docAcc.body.data.doctor_id);

  const users = (await api('GET', '/users', { token: tokens.ADMIN })).body.data;
  const listed = users.find(x => x.username === `d.${u}`);
  assert.equal(listed.doctor_id, docAcc.body.data.doctor_id);
  assert.ok(users.every(x => !('password_hash' in x)));
});

test('account creation validates input and rejects duplicates', async () => {
  const u = unique();
  const base = { username: `v.${u}`, password: 'Secret123!', role: 'RECEPTIONIST', full_name: 'V', email: `v.${u}@hospital.test`, phone: '1' };
  const cases = [
    [{ ...base, full_name: '' }, 400, /Missing required fields: full_name/],
    [{ ...base, role: 'JANITOR' }, 400, /Role must be one of/],
    [{ ...base, password: 'short' }, 400, /at least 8/],
    [{ ...base, email: 'nope' }, 400, /Email/],
    [{ ...base, username: 'a b' }, 400, /Username/],
    [{ ...base, role: 'DOCTOR' }, 400, /department_id, specialization, shift/],
    [{ ...base, role: 'DOCTOR', department_id: 999999, specialization: 'X', shift: 'MORNING' }, 400, /Department not found/],
  ];
  for (const [body, status, msg] of cases) {
    const res = await register(body);
    assert.equal(res.status, status, JSON.stringify(res.body));
    assert.match(res.body.message, msg);
  }
  assert.equal((await register(base)).status, 201);
  const dupUser = await register({ ...base, email: `other.${u}@hospital.test` });
  assert.equal(dupUser.status, 409);
  assert.match(dupUser.body.message, /username is already in use/);
  const dupEmail = await register({ ...base, username: `w.${u}` });
  assert.equal(dupEmail.status, 409);
  assert.match(dupEmail.body.message, /email is already in use/);
  const [[{ orphanDoctors }]] = await db().query('SELECT COUNT(*) orphanDoctors FROM doctors d LEFT JOIN users u ON u.user_id = d.user_id WHERE u.user_id IS NULL');
  assert.equal(orphanDoctors, 0);
});

test('deactivated users cannot log in and their existing token stops working; reactivation restores access', async () => {
  const u = unique();
  const acc = await register({ username: `x.${u}`, password: 'Secret123!', role: 'RECEPTIONIST', full_name: 'X', email: `x.${u}@hospital.test`, phone: '1' });
  const id = acc.body.data.user_id;
  const { body: { token } } = await api('POST', '/auth/login', { body: { username: `x.${u}`, password: 'Secret123!' } });
  assert.equal((await api('GET', '/appointments', { token })).status, 200);

  assert.equal((await api('PUT', `/users/${id}/deactivate`, { token: tokens.ADMIN })).status, 200);
  const stale = await api('GET', '/appointments', { token });
  assert.equal(stale.status, 401);
  assert.equal(stale.body.message, 'Account is deactivated');
  const relogin = await api('POST', '/auth/login', { body: { username: `x.${u}`, password: 'Secret123!' } });
  assert.equal(relogin.status, 401);
  assert.equal(relogin.body.message, 'Account is deactivated');
  const wrongPw = await api('POST', '/auth/login', { body: { username: `x.${u}`, password: 'wrong-password' } });
  assert.equal(wrongPw.body.message, 'Invalid credentials', 'the deactivated state is not revealed without the right password');
  assert.equal((await api('PUT', `/users/${id}/deactivate`, { token: tokens.ADMIN })).status, 409);

  assert.equal((await api('PUT', `/users/${id}/reactivate`, { token: tokens.ADMIN })).status, 200);
  assert.equal((await api('GET', '/appointments', { token })).status, 200);
  assert.equal((await api('PUT', `/users/${id}/reactivate`, { token: tokens.ADMIN })).status, 409);

  const [rows] = await db().query("SELECT action FROM audit_logs WHERE entity_type = 'user' AND entity_id = ? ORDER BY audit_id", [id]);
  assert.deepEqual(rows.map(r => r.action), ['CREATE_USER', 'DEACTIVATE_USER', 'REACTIVATE_USER']);
});

test('an admin cannot deactivate their own account; unknown users are 404', async () => {
  const admin = await login(USERS.ADMIN);
  const self = await api('PUT', `/users/${admin.user.user_id}/deactivate`, { token: admin.token });
  assert.equal(self.status, 400);
  assert.match(self.body.message, /your own account/);
  assert.equal((await api('PUT', '/users/999999/deactivate', { token: admin.token })).status, 404);
});

// ---------------------------------------------------------------- nurse assignments
test('nurse assignments: admin creates and ends standing assignments; access follows them', async () => {
  const [[cardiac]] = await db().query("SELECT ward_id FROM wards WHERE name = 'Cardiac Ward'");
  const [[inpatient]] = await db().query(`SELECT a.patient_id FROM admissions a JOIN beds b ON b.bed_id = a.bed_id
    WHERE a.status = 'ACTIVE' AND b.ward_id = ? AND a.patient_id NOT IN
      (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS')) LIMIT 1`, [cardiac.ward_id]);
  assert.ok(inpatient, 'seed data has an active Cardiac Ward admission');
  const see = async () => (await api('GET', `/patients/${inpatient.patient_id}`, { token: nurse.token })).status;
  assert.equal(await see(), 403);

  // A future assignment grants nothing yet.
  const d = new Date(Date.now() + 86400000);
  const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const future = await api('POST', '/nurse-assignments', { token: tokens.ADMIN, body: { nurse_user_id: nurse.user.user_id, ward_id: cardiac.ward_id, start_date: tomorrow, end_date: tomorrow } });
  assert.equal(future.status, 201, JSON.stringify(future.body));
  assert.equal(future.body.data.is_current, false);
  assert.equal(await see(), 403);

  const overlap = await api('POST', '/nurse-assignments', { token: tokens.ADMIN, body: { nurse_user_id: nurse.user.user_id, ward_id: cardiac.ward_id } });
  assert.equal(overlap.status, 409, 'an open-ended assignment from today overlaps tomorrow\'s');
  await db().query('UPDATE nurse_ward_assignments SET start_date = CURDATE(), end_date = NULL WHERE assignment_id = ?', [future.body.data.assignment_id]);
  assert.equal(await see(), 200, 'a current assignment grants access immediately');
  const station = (await api('GET', '/nurse/station', { token: nurse.token })).body.data;
  assert.ok(station.wards.some(w => w.ward_id === cardiac.ward_id));
  assert.ok(station.beds.some(b => b.patient_id === inpatient.patient_id));

  // Ending today keeps today's access (inclusive); ending yesterday-equivalent is rejected.
  const ended = await api('PUT', `/nurse-assignments/${future.body.data.assignment_id}`, { token: tokens.ADMIN, body: {} });
  assert.equal(ended.status, 200);
  assert.ok(ended.body.data.end_date);
  const tooEarly = await api('PUT', `/nurse-assignments/${future.body.data.assignment_id}`, { token: tokens.ADMIN, body: { end_date: '2000-01-01' } });
  assert.equal(tooEarly.status, 400);
  await db().query('UPDATE nurse_ward_assignments SET start_date = CURDATE() - INTERVAL 2 DAY, end_date = CURDATE() - INTERVAL 1 DAY WHERE assignment_id = ?', [future.body.data.assignment_id]);
  assert.equal(await see(), 403, 'access ends with the assignment');

  const mine = (await api('GET', '/nurse-assignments', { token: nurse.token })).body.data;
  assert.ok(mine.every(a => a.nurse_user_id === nurse.user.user_id));
  const notNurse = await api('POST', '/nurse-assignments', { token: tokens.ADMIN, body: { nurse_user_id: doctor.user.user_id, ward_id: cardiac.ward_id } });
  assert.equal(notNurse.status, 400);
});

test('nurse station: assigned wards with their beds and patients, plus open visits', async () => {
  const station = await api('GET', '/nurse/station', { token: nurse.token });
  assert.equal(station.status, 200);
  const names = station.body.data.wards.map(w => w.ward_name).sort();
  assert.deepEqual(names, ['General Ward B', 'ICU Ward']);
  assert.ok(station.body.data.beds.some(b => b.patient_id));
  assert.ok(station.body.data.open_visits.some(v => v.encounter_id === E));
});
