// Step 9: admin audit viewer (read-only, paginated, filtered; viewing is itself audited) and the
// "denied access in the last 24 hours" dashboard figure.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, rawRequest, login, db, closeDb } = require('./helpers');

after(closeDb);

let admin, doctor, nurse, reception, pharmacy, lab;
before(async () => {
  [admin, doctor, nurse, reception, pharmacy, lab] = await Promise.all(
    [USERS.ADMIN, USERS.DOCTOR, USERS.NURSE, USERS.RECEPTIONIST, USERS.PHARMACY, USERS.LABORATORY].map(login));
});

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const lastId = async () => (await db().query('SELECT MAX(audit_id) m FROM audit_logs'))[0][0].m;
// Middleware rows are written after the response; give them a moment.
const settle = () => new Promise(r => setTimeout(r, 150));

test('only ADMIN can read the audit trail; every other role gets 403 and no token gets 401', async () => {
  for (const u of [doctor, nurse, reception, pharmacy, lab]) {
    assert.equal((await api('GET', '/audit-logs', { token: u.token })).status, 403, u.user.role);
    assert.equal((await api('GET', '/audit-logs/actions', { token: u.token })).status, 403, u.user.role);
  }
  assert.equal((await api('GET', '/audit-logs')).status, 401);
  assert.equal((await api('GET', '/audit-logs', { token: admin.token })).status, 200);
});

test('the viewer is read-only: no write methods exist', async () => {
  const [[row]] = await db().query('SELECT audit_id FROM audit_logs ORDER BY audit_id LIMIT 1');
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const res = await api(method, `/audit-logs/${row.audit_id}`, { token: admin.token, body: {} });
    assert.equal(res.status, 404, method);
  }
  const [[still]] = await db().query('SELECT audit_id FROM audit_logs WHERE audit_id = ?', [row.audit_id]);
  assert.ok(still);
});

test('opening the viewer writes a VIEW_AUDIT_LOG row with the filters, in the same request', async () => {
  const mark = await lastId();
  const res = await api('GET', `/audit-logs?action=ACCESS_DENIED&from=${today()}&page_size=5`, { token: admin.token });
  assert.equal(res.status, 200);
  const [rows] = await db().query("SELECT * FROM audit_logs WHERE audit_id > ? AND action = 'VIEW_AUDIT_LOG'", [mark]);
  assert.equal(rows.length, 1);
  const [v] = rows;
  assert.deepEqual([v.user_id, v.role, v.entity_type, v.outcome, v.method, v.path], [admin.user.user_id, 'ADMIN', 'audit_logs', 'SUCCESS', 'GET', '/api/audit-logs/']);
  const details = typeof v.details === 'string' ? JSON.parse(v.details) : v.details;
  assert.deepEqual(details, { action: 'ACCESS_DENIED', from: today(), page: 1, page_size: 5 });
  // The viewer's own row is visible to the next search, and the search does not add a second READ row.
  await settle();
  const [extra] = await db().query("SELECT action FROM audit_logs WHERE audit_id > ? AND path LIKE '/api/audit-logs%' AND action <> 'VIEW_AUDIT_LOG'", [mark]);
  assert.deepEqual(extra, []);
  const next = await api('GET', '/audit-logs?action=VIEW_AUDIT_LOG&page_size=1', { token: admin.token });
  assert.ok(next.body.data[0].audit_id > v.audit_id, 'newest first, including this search');
});

test('a search by patient records that patient on the view row', async () => {
  const mark = await lastId();
  await api('GET', '/audit-logs?patient_id=MRN-000001', { token: admin.token });
  const [[v]] = await db().query("SELECT patient_id FROM audit_logs WHERE audit_id > ? AND action = 'VIEW_AUDIT_LOG'", [mark]);
  assert.equal(v.patient_id, 1);
});

test('if the view cannot be audited, no audit data is returned', async () => {
  // Simulate an audit write failure for this one request: a trigger that rejects VIEW_AUDIT_LOG rows.
  await db().query('DROP TRIGGER IF EXISTS test_fail_view_audit');
  await db().query(`CREATE TRIGGER test_fail_view_audit BEFORE INSERT ON audit_logs FOR EACH ROW
    BEGIN IF NEW.action = 'VIEW_AUDIT_LOG' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'simulated audit failure'; END IF; END`);
  try {
    const res = await api('GET', '/audit-logs', { token: admin.token });
    assert.equal(res.status, 500);
    assert.equal(res.body.data, undefined);
  } finally {
    await db().query('DROP TRIGGER test_fail_view_audit');
  }
});

test('filters: user, action, patient, status code, outcome and date range', async () => {
  // Produce known rows: a denied request by the pharmacist and a patient read by the doctor.
  const [[{ patient_id }]] = await db().query('SELECT patient_id FROM appointments WHERE doctor_id = ? LIMIT 1', [doctor.user.doctor_id]);
  await api('GET', '/dashboard/stats', { token: pharmacy.token });
  await api('GET', `/patients/${patient_id}`, { token: doctor.token });
  await settle();

  const denied = await api('GET', `/audit-logs?user_id=${pharmacy.user.user_id}&status_code=403&from=${today()}&to=${today()}`, { token: admin.token });
  assert.equal(denied.status, 200);
  assert.ok(denied.body.data.length >= 1);
  for (const r of denied.body.data) {
    assert.equal(r.user_id, pharmacy.user.user_id);
    assert.equal(r.status_code, 403);
    assert.equal(r.outcome, 'DENIED');
    assert.equal(r.username, USERS.PHARMACY);
  }

  const reads = await api('GET', `/audit-logs?patient_id=${patient_id}&action=READ&user_id=${doctor.user.user_id}`, { token: admin.token });
  assert.ok(reads.body.data.some(r => r.path === '/api/patients/:id'));
  assert.ok(reads.body.data.every(r => r.patient_id === patient_id && r.action === 'READ'));

  const outcome = await api('GET', '/audit-logs?outcome=DENIED&page_size=50', { token: admin.token });
  assert.ok(outcome.body.data.every(r => r.outcome === 'DENIED'));

  const future = await api('GET', '/audit-logs?from=2099-01-01', { token: admin.token });
  assert.deepEqual([future.body.data, future.body.pagination.total], [[], 0]);
  const past = await api('GET', '/audit-logs?to=2000-01-01', { token: admin.token });
  assert.equal(past.body.pagination.total, 0);

  const actions = await api('GET', '/audit-logs/actions', { token: admin.token });
  assert.ok(actions.body.data.includes('ACCESS_DENIED') && actions.body.data.includes('VIEW_AUDIT_LOG'));
});

test('pagination: pages do not overlap, newest first, totals are consistent', async () => {
  const p1 = await api('GET', '/audit-logs?page=1&page_size=3', { token: admin.token });
  // Rows written after page 1 (including page 2's own VIEW row) must not shift page 2.
  await api('GET', '/dashboard/stats', { token: lab.token });
  const p2 = await api('GET', `/audit-logs?page=2&page_size=3&until_id=${p1.body.pagination.until_id}`, { token: admin.token });
  assert.equal(p2.body.pagination.until_id, p1.body.pagination.until_id);
  assert.equal(p2.body.pagination.total, p1.body.pagination.total);
  assert.equal(p1.body.data[0].audit_id, p1.body.pagination.until_id, 'page 1 includes the search\'s own row');
  assert.equal(p1.body.data.length, 3);
  assert.equal(p2.body.data.length, 3);
  const ids = [...p1.body.data, ...p2.body.data].map(r => r.audit_id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  assert.ok(p1.body.data.at(-1).audit_id > p2.body.data[0].audit_id);
  const [[{ n }]] = await db().query('SELECT COUNT(*) n FROM audit_logs WHERE audit_id <= ?', [p1.body.pagination.until_id]);
  assert.equal(p1.body.pagination.total, Number(n));
  assert.equal(p1.body.pagination.pages, Math.ceil(p1.body.pagination.total / 3));
});

test('invalid filters are rejected with 400 (and nothing is logged as a view)', async () => {
  const mark = await lastId();
  for (const q of ['from=2026-13-01', 'to=yesterday', 'from=2026-05-02&to=2026-05-01', 'user_id=abc', 'patient_id=1;DROP', 'action=read;', 'status_code=99', 'outcome=MAYBE', 'page=0', 'page_size=101', 'until_id=-4']) {
    const res = await api('GET', `/audit-logs?${q}`, { token: admin.token });
    assert.equal(res.status, 400, q);
  }
  const [rows] = await db().query("SELECT 1 FROM audit_logs WHERE audit_id > ? AND action = 'VIEW_AUDIT_LOG'", [mark]);
  assert.equal(rows.length, 0);
});

test('details never contain secrets: a failed login with a password does not leak it into the viewer', async () => {
  await rawRequest('POST', '/auth/login', { body: { username: USERS.NURSE, password: 'Sup3r-Secret-Pw!' } });
  await settle();
  const res = await api('GET', '/audit-logs?page_size=100', { token: admin.token });
  assert.ok(!JSON.stringify(res.body).includes('Sup3r-Secret-Pw!'));
});

test('admin dashboard reports denied access in the last 24 hours', async () => {
  const before = (await api('GET', '/dashboard/stats', { token: admin.token })).body.data.deniedAccessLast24h;
  await api('GET', '/audit-logs', { token: lab.token });
  await api('GET', '/users', { token: nurse.token });
  await api('GET', '/patients'); // 401
  await settle();
  const res = await api('GET', '/dashboard/stats', { token: admin.token });
  assert.equal(res.body.data.deniedAccessLast24h, before + 3);
  const [[{ n }]] = await db().query("SELECT COUNT(*) n FROM audit_logs WHERE outcome = 'DENIED' AND created_at >= NOW(3) - INTERVAL 24 HOUR");
  assert.equal(res.body.data.deniedAccessLast24h, Number(n));
});
