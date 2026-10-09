// Phase 1 step 2 (report Section L, Spec 2): authenticated, ownership-checked lab report retrieval.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { USERS, LAB_REPORT_DIR, api, rawRequest, login, db, closeDb } = require('./helpers');

after(closeDb);

const PDF_BYTES = Buffer.from('%PDF-1.4\n% test lab report\n%%EOF\n');
const careSetSql = `SELECT DISTINCT patient_id FROM (
  SELECT patient_id, doctor_id FROM appointments UNION SELECT patient_id, doctor_id FROM admissions
  UNION SELECT patient_id, doctor_id FROM consultations UNION SELECT patient_id, doctor_id FROM lab_orders
  UNION SELECT patient_id, doctor_id FROM prescriptions) cs WHERE doctor_id = ?`;

let lab, doctor, otherDoctor;
let fixture; // { orderId, resultId, attachmentId, patientId }

async function completedOrderWithReport(patientId) {
  const order = await api('POST', '/lab/orders', { token: doctor.token, body: {
    patient_id: patientId, doctor_id: doctor.user.doctor_id, tests: [{ test_id: 1 }], notes: 'report test',
  } });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  const orderId = order.body.data.id;
  assert.equal((await api('PUT', `/lab/orders/${orderId}/status`, { token: lab.token, body: { status: 'PROCESSING' } })).status, 200);
  const result = await api('POST', '/lab/results', { token: lab.token, body: { order_id: orderId, result_value: '13.9', unit: 'g/dL' } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return { orderId, resultId: result.body.data.id };
}

async function upload(orderId, bytes = PDF_BYTES, name = 'cbc-report.pdf') {
  const form = new FormData();
  form.append('report', new Blob([bytes], { type: 'application/pdf' }), name);
  const res = await rawRequest('POST', `/lab/results/${orderId}/attachments`, { token: lab.token, body: form });
  assert.equal(res.status, 201, await res.text());
}

before(async () => {
  lab = await login(USERS.LABORATORY);
  doctor = await login(USERS.DOCTOR);
  otherDoctor = await login(USERS.DOCTOR_2);
  // A patient under dr.smith's care that dr.patel has never been associated with.
  const [mine] = await db().query(careSetSql, [doctor.user.doctor_id]);
  const [theirs] = await db().query(careSetSql, [otherDoctor.user.doctor_id]);
  const theirIds = new Set(theirs.map(r => r.patient_id));
  const patientId = mine.map(r => r.patient_id).find(id => !theirIds.has(id));
  assert.ok(patientId, 'seed data needs a dr.smith patient outside dr.patel\'s care set');

  const { orderId, resultId } = await completedOrderWithReport(patientId);
  await upload(orderId);
  const [[{ attachment_id }]] = await db().query('SELECT attachment_id FROM lab_result_attachments WHERE result_id = ?', [resultId]);
  fixture = { orderId, resultId, attachmentId: attachment_id, patientId };
});

const endpoints = () => [
  `/lab/reports/${fixture.resultId}/download`,
  `/lab/attachments/${fixture.attachmentId}`,
  `/lab/results/${fixture.orderId}`,
];
const downloads = () => endpoints().slice(0, 2);

test('upload is stored in the report directory, not a public path', async () => {
  const [[row]] = await db().query('SELECT stored_filename, original_filename FROM lab_result_attachments WHERE attachment_id = ?', [fixture.attachmentId]);
  assert.equal(row.original_filename, 'cbc-report.pdf');
  assert.ok(!row.stored_filename.includes('/'), 'only a bare filename is stored, never a URL or path');
  assert.deepEqual(fs.readFileSync(path.join(LAB_REPORT_DIR, row.stored_filename)), PDF_BYTES);
});

test('authentication bypass: no JWT returns 401 on every report endpoint', async () => {
  for (const url of endpoints()) {
    const res = await api('GET', url);
    assert.equal(res.status, 401, url);
  }
  const bad = await api('GET', endpoints()[0], { token: 'not-a-jwt' });
  assert.equal(bad.status, 401);
});

test('laboratory staff can stream the report through both download endpoints', async () => {
  for (const url of downloads()) {
    const res = await rawRequest('GET', url, { token: lab.token });
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.match(res.headers.get('content-disposition'), /attachment; filename="cbc-report\.pdf"/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PDF_BYTES);
  }
});

test('the treating doctor can view the result and download the report', async () => {
  const result = await api('GET', `/lab/results/${fixture.orderId}`, { token: doctor.token });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.result.result_id, fixture.resultId);
  assert.equal(result.body.data.attachments.length, 1);
  for (const url of downloads()) {
    const res = await rawRequest('GET', url, { token: doctor.token });
    assert.equal(res.status, 200, url);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PDF_BYTES);
  }
});

test('role escalation: receptionist (and other non-clinical roles) get 403', async () => {
  for (const username of [USERS.RECEPTIONIST, USERS.ADMIN, USERS.PHARMACY]) {
    const { token } = await login(username);
    for (const url of endpoints()) {
      const res = await api('GET', url, { token });
      assert.equal(res.status, 403, `${username} ${url}`);
      assert.equal(res.body.success, false);
      // Non-clinical roles are stopped by the route's role gate, which names who may use it.
      assert.match(res.body.message, /available to laboratory staff, doctors, nurses only/);
    }
  }
});

test('a nurse is denied reports of a patient who is not assigned to them', async () => {
  const { token, user } = await login(USERS.NURSE);
  const { isNurseAssignedPatient } = require('../utils/patientAccess');
  assert.equal(await isNurseAssignedPatient(user.user_id, fixture.patientId, db()), false, 'fixture patient must be outside the nurse\'s assignments');
  for (const url of endpoints()) {
    const res = await api('GET', url, { token });
    assert.equal(res.status, 403, url);
    assert.match(res.body.message, /laboratory staff and the patient's own doctors and nurses/);
  }
});

test('lateral escalation: a doctor outside the patient\'s care set gets 403', async () => {
  for (const url of endpoints()) {
    const res = await api('GET', url, { token: otherDoctor.token });
    assert.equal(res.status, 403, url);
  }
});

test('path traversal: stored filenames escaping the report directory are rejected', async () => {
  for (const evil of ['../../../etc/passwd', '../../.env', '/etc/passwd', 'sub/../../../etc/hosts']) {
    const [ins] = await db().query(
      'INSERT INTO lab_result_attachments (result_id, original_filename, stored_filename, mime_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
      [fixture.resultId, 'evil.pdf', evil, 'application/pdf', 1, lab.user.user_id]
    );
    for (const url of [`/lab/attachments/${ins.insertId}`, `/lab/reports/${fixture.resultId}/download?attachment_id=${ins.insertId}`]) {
      const res = await rawRequest('GET', url, { token: lab.token });
      const body = await res.text();
      assert.equal(res.status, 400, `${evil} via ${url}`);
      assert.doesNotMatch(body, /root:|DB_PASSWORD|localhost/);
    }
    await db().query('DELETE FROM lab_result_attachments WHERE attachment_id = ?', [ins.insertId]);
  }
});

test('path traversal: non-numeric ids in the URL or query are rejected with 400', async () => {
  for (const url of [
    '/lab/reports/..%2F..%2F..%2Fetc%2Fpasswd/download',
    '/lab/reports/1;DROP/download',
    `/lab/reports/${fixture.resultId}/download?attachment_id=../../etc/passwd`,
    '/lab/attachments/..%2F..%2Fserver.js',
    '/lab/results/abc',
  ]) {
    const res = await api('GET', url, { token: lab.token });
    assert.equal(res.status, 400, url);
  }
});

test('not found cases return 404 with a clear message', async () => {
  const { resultId: noReportResult, orderId: noReportOrder } = await completedOrderWithReport(fixture.patientId);
  const cases = [
    ['/lab/reports/999999/download', 'Lab result not found'],
    [`/lab/reports/${noReportResult}/download`, 'No report attached to this result'],
    [`/lab/reports/${noReportResult}/download?attachment_id=${fixture.attachmentId}`, 'No report attached to this result'],
    ['/lab/attachments/999999', 'Not found'],
    ['/lab/results/999999', 'Lab order not found'],
  ];
  for (const [url, message] of cases) {
    const res = await api('GET', url, { token: lab.token });
    assert.equal(res.status, 404, url);
    assert.equal(res.body.message, message);
  }
  // An order whose result has no attachment still returns the existing response shape.
  const result = await api('GET', `/lab/results/${noReportOrder}`, { token: lab.token });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.attachments, []);
});

test('a database row whose file is missing on disk returns 404, not a crash', async () => {
  const [ins] = await db().query(
    'INSERT INTO lab_result_attachments (result_id, original_filename, stored_filename, mime_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    [fixture.resultId, 'gone.pdf', 'does-not-exist.pdf', 'application/pdf', 1, lab.user.user_id]
  );
  const res = await api('GET', `/lab/attachments/${ins.insertId}`, { token: lab.token });
  assert.equal(res.status, 404);
  assert.equal(res.body.message, 'Report file not found');
  await db().query('DELETE FROM lab_result_attachments WHERE attachment_id = ?', [ins.insertId]);
});

test('without attachment_id the latest report for the result is served', async () => {
  const newer = Buffer.from('%PDF-1.4\n% amended report\n%%EOF\n');
  await upload(fixture.orderId, newer, 'cbc-report-amended.pdf');
  const res = await rawRequest('GET', `/lab/reports/${fixture.resultId}/download`, { token: doctor.token });
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), newer);
  const older = await rawRequest('GET', `/lab/reports/${fixture.resultId}/download?attachment_id=${fixture.attachmentId}`, { token: doctor.token });
  assert.deepEqual(Buffer.from(await older.arrayBuffer()), PDF_BYTES);
});
