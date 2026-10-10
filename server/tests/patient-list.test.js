// Patients list: paging with a total, newest first, and one search across name, phone, MRN and ABHA,
// within each role's scope.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

let reception, doctor, nurse, admin, newest;
const stamp = Date.now().toString(36);
before(async () => {
  [reception, doctor, nurse, admin] = await Promise.all([USERS.RECEPTIONIST, USERS.DOCTOR, USERS.NURSE, USERS.ADMIN].map(login));
  const abha = String(Date.now()).slice(-12).padStart(12, '0') + '42';
  const res = await api('POST', '/patients', { token: reception.token, body: { name: `Paging Newest ${stamp}`, date_of_birth: '1991-01-01', gender: 'FEMALE', blood_group: 'A+', phone: '+91 98765 43210', address: null, emergency_contact: null, abha_number: abha } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  newest = { id: res.body.data.id, abha };
});
const list = (token, qs = '') => api('GET', `/patients${qs}`, { token });

test('the list is newest first, with a total and page count', async () => {
  const [[{ n }]] = await db().query('SELECT COUNT(*) n FROM patients');
  const page1 = await list(reception.token, '?limit=10');
  assert.equal(page1.status, 200);
  assert.equal(page1.body.data[0].patient_id, newest.id, 'the newest patient is first');
  assert.deepEqual(page1.body.pagination, { page: 1, limit: 10, total: Number(n), pages: Math.ceil(Number(n) / 10) });
  const ids = page1.body.data.map(p => p.patient_id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  const page2 = await list(reception.token, '?limit=10&page=2');
  assert.ok(page2.body.data.every(p => !ids.includes(p.patient_id)), 'pages do not overlap');
  assert.ok(page2.body.data[0].patient_id < ids.at(-1));
});

test('one search box finds a patient by name, phone, MRN or ABHA', async () => {
  const found = async (q) => (await list(reception.token, `?q=${encodeURIComponent(q)}`)).body.data.map(p => p.patient_id);
  assert.ok((await found(`newest ${stamp}`)).includes(newest.id), 'name (case-insensitive, partial)');
  assert.ok((await found('98765 43210')).includes(newest.id), 'phone, ignoring spaces and +91');
  assert.ok((await found('9876543210')).includes(newest.id), 'phone digits');
  assert.deepEqual(await found(`MRN-${String(newest.id).padStart(6, '0')}`), [newest.id], 'MRN');
  assert.ok((await found(String(newest.id))).includes(newest.id), 'MRN number alone');
  const dashed = `${newest.abha.slice(0, 2)}-${newest.abha.slice(2, 6)}-${newest.abha.slice(6, 10)}-${newest.abha.slice(10)}`;
  assert.deepEqual(await found(dashed), [newest.id], 'ABHA with dashes');
  assert.deepEqual(await found(newest.abha), [newest.id], 'ABHA digits');
  const none = await list(reception.token, '?q=zzzz-no-such-patient');
  assert.deepEqual([none.body.data, none.body.pagination.total], [[], 0]);
});

test('the older search= parameter still works; limits are bounded', async () => {
  const res = await list(reception.token, `?search=${encodeURIComponent(`Paging Newest ${stamp}`)}`);
  assert.deepEqual(res.body.data.map(p => p.patient_id), [newest.id]);
  assert.equal((await list(reception.token, '?limit=5000')).body.pagination.limit, 100);
  assert.equal((await list(reception.token, '?page=0')).status, 400);
});

test('doctors and nurses page and search within their own patients only; the total counts only those', async () => {
  for (const u of [doctor, nurse]) {
    const all = await list(u.token, '?limit=100');
    assert.equal(all.status, 200);
    assert.ok(all.body.pagination.total >= all.body.data.length);
    if (all.body.pagination.total <= 100) assert.equal(all.body.data.length, all.body.pagination.total, 'one page holds them all');
    assert.ok(!all.body.data.some(p => p.patient_id === newest.id), `${u.user.role} does not see an unrelated new patient`);
    const viaMrn = await list(u.token, `?q=MRN-${String(newest.id).padStart(6, '0')}`);
    assert.deepEqual([viaMrn.body.data, viaMrn.body.pagination.total], [[], 0], `${u.user.role} cannot find it by MRN either`);
  }
  const adminAll = await list(admin.token, '?limit=1');
  assert.equal(adminAll.body.data[0].patient_id, newest.id);
});
