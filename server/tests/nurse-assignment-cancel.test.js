// Nurse assignments that have not started can be cancelled (removed); a new assignment may not share
// any day with an existing one for the same nurse and ward. Dates are far from today so the seeded
// assignments and other tests never interfere.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');
const { todayIst, addDays } = require('../utils/clock');

let admin; let nurse; let wardA; let wardB;
const B = addDays(todayIst(), 200); // the reference assignment runs B .. B+9
const created = new Set();

before(async () => {
  [admin, nurse] = await Promise.all([login(USERS.ADMIN), login(USERS.NURSE)]);
  [[wardA], [wardB]] = [(await db().query("SELECT ward_id FROM wards WHERE name = 'Pediatric Ward'"))[0], (await db().query("SELECT ward_id FROM wards WHERE name = 'Cardiac Ward'"))[0]];
});

after(async () => {
  if (created.size) await db().query('DELETE FROM nurse_ward_assignments WHERE assignment_id IN (?)', [[...created]]);
  await closeDb();
});

const assign = async (body) => {
  const res = await api('POST', '/nurse-assignments', { token: admin.token, body: { nurse_user_id: nurse.user.user_id, ward_id: wardA.ward_id, ...body } });
  if (res.status === 201) created.add(res.body.data.assignment_id);
  return res;
};
const cancel = (id, token = admin.token) => api('DELETE', `/nurse-assignments/${id}`, { token });
const exists = async (id) => (await db().query('SELECT 1 FROM nurse_ward_assignments WHERE assignment_id = ?', [id]))[0].length === 1;

test('an assignment that has not started is UPCOMING and can be cancelled; the cancel is audited', async () => {
  const res = await assign({ start_date: addDays(todayIst(), 1), end_date: addDays(todayIst(), 3) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual([res.body.data.status, res.body.data.is_current], ['UPCOMING', false]);
  const id = res.body.data.assignment_id;
  const listed = (await api('GET', '/nurse-assignments', { token: admin.token })).body.data.find(a => a.assignment_id === id);
  assert.equal(listed.status, 'UPCOMING');

  assert.equal((await cancel(id, nurse.token)).status, 403, 'only an administrator cancels');
  const res2 = await cancel(id);
  assert.equal(res2.status, 200, JSON.stringify(res2.body));
  assert.equal(await exists(id), false, 'the row is removed');
  const [[row]] = await db().query("SELECT user_id, details FROM audit_logs WHERE action = 'CANCEL_NURSE_ASSIGNMENT' AND entity_id = ? ORDER BY audit_id DESC LIMIT 1", [id]);
  assert.ok(row, 'audited');
  const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
  assert.deepEqual([row.user_id, details.start_date, details.ward_id], [admin.user.user_id, addDays(todayIst(), 1), wardA.ward_id]);
  assert.equal((await cancel(id)).status, 404, 'cancelling twice finds nothing');
});

test('an assignment that has started (today or earlier, IST) cannot be cancelled, only ended', async () => {
  const today = await assign({ start_date: todayIst(), end_date: todayIst() });
  assert.equal(today.status, 201, JSON.stringify(today.body));
  assert.equal(today.body.data.status, 'CURRENT');
  const refused = await cancel(today.body.data.assignment_id);
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /already started; end it/);
  assert.equal(await exists(today.body.data.assignment_id), true);

  const [past] = await db().query('INSERT INTO nurse_ward_assignments (nurse_user_id, ward_id, start_date, end_date) VALUES (?, ?, ?, ?)',
    [nurse.user.user_id, wardA.ward_id, addDays(todayIst(), -20), addDays(todayIst(), -15)]);
  created.add(past.insertId);
  const ended = (await api('GET', '/nurse-assignments', { token: admin.token })).body.data.find(a => a.assignment_id === past.insertId);
  assert.deepEqual([ended.status, ended.is_current], ['ENDED', false]);
  assert.equal((await cancel(past.insertId)).status, 409);
  assert.equal((await cancel('abc')).status, 400);
});

test('a new assignment that shares any day with one for the same nurse and ward is refused', async () => {
  const ref = await assign({ start_date: B, end_date: addDays(B, 9) });
  assert.equal(ref.status, 201, JSON.stringify(ref.body));
  const cases = [
    ['inside', { start_date: addDays(B, 2), end_date: addDays(B, 4) }, 409],
    ['overlapping the end', { start_date: addDays(B, 5), end_date: addDays(B, 20) }, 409],
    ['ending on the first day (dates are inclusive)', { start_date: addDays(B, -5), end_date: B }, 409],
    ['starting on the last day', { start_date: addDays(B, 9) }, 409],
    ['open-ended from before, covering it', { start_date: addDays(B, -30) }, 409],
    ['the day after it ends', { start_date: addDays(B, 10), end_date: addDays(B, 12) }, 201],
    ['ending the day before it starts', { start_date: addDays(B, -5), end_date: addDays(B, -1) }, 201],
    ['the same days on another ward', { start_date: B, end_date: addDays(B, 9), ward_id: wardB.ward_id }, 201],
  ];
  for (const [what, body, status] of cases) {
    const res = await assign(body);
    assert.equal(res.status, status, `${what}: ${JSON.stringify(res.body)}`);
    if (status === 409) assert.match(res.body.message, /already assigned to this ward/, what);
  }
  // An open-ended assignment overlaps everything after its start.
  const open = await assign({ start_date: addDays(B, 100) });
  assert.equal(open.status, 201);
  assert.equal((await assign({ start_date: addDays(B, 150), end_date: addDays(B, 160) })).status, 409);

  // Once cancelled, the same days are free again.
  assert.equal((await cancel(ref.body.data.assignment_id)).status, 200);
  assert.equal((await assign({ start_date: addDays(B, 2), end_date: addDays(B, 4) })).status, 201);
});

test('overlapping requests sent at the same moment: exactly one is created', async () => {
  const start = addDays(B, 400); // on ward B, which has nothing then (ward A has the open-ended one above)
  const results = await Promise.all(Array.from({ length: 6 }, () => assign({ ward_id: wardB.ward_id, start_date: start, end_date: addDays(start, 5) })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409, 409, 409, 409, 409], JSON.stringify(results.map(r => r.body.message)));
  const [[{ n }]] = await db().query('SELECT COUNT(*) n FROM nurse_ward_assignments WHERE nurse_user_id = ? AND ward_id = ? AND start_date = ?', [nurse.user.user_id, wardB.ward_id, start]);
  assert.equal(Number(n), 1);
});
