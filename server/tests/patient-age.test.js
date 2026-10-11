// Patient age: a date of birth, or an age in years for a patient who does not know it. An age is
// stored as an estimated date of birth (today in IST, N years back) with dob_estimated = 1.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');
const { istDate } = require('../utils/marTime');

after(closeDb);
let reception;
const base = { gender: 'MALE', blood_group: null, phone: null, address: null, emergency_contact: null };
const yearsAgo = (n) => { const [y, m, d] = istDate(new Date()).split('-').map(Number); const t = new Date(Date.UTC(y - n, m - 1, d)); if (t.getUTCMonth() !== m - 1) t.setUTCDate(0); return t.toISOString().slice(0, 10); };
const row = async (id) => (await db().query("SELECT DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dob, dob_estimated FROM patients WHERE patient_id = ?", [id]))[0][0];

before(async () => { reception = await login(USERS.RECEPTIONIST); });

test('registering with age_years stores an estimated date of birth', async () => {
  const res = await api('POST', '/patients', { token: reception.token, body: { ...base, name: 'Age Only', age_years: 40 } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual({ ...await row(res.body.data.id) }, { dob: yearsAgo(40), dob_estimated: 1 });
  const got = await api('GET', `/patients/${res.body.data.id}`, { token: reception.token });
  assert.equal(got.body.data.dob_estimated, 1);
});

test('registering with a date of birth is not estimated (unchanged contract)', async () => {
  const res = await api('POST', '/patients', { token: reception.token, body: { ...base, name: 'Date Given', date_of_birth: '1990-05-05' } });
  assert.equal(res.status, 201);
  assert.deepEqual({ ...await row(res.body.data.id) }, { dob: '1990-05-05', dob_estimated: 0 });
});

test('age_years must be a whole number from 1 to 130; a date or an age is required', async () => {
  for (const age_years of [0, 131, 2.5, 'forty', -3]) {
    const res = await api('POST', '/patients', { token: reception.token, body: { ...base, name: 'Bad Age', age_years } });
    assert.equal(res.status, 400, `${age_years}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.message, /Age in years must be a whole number from 1 to 130/);
  }
  const none = await api('POST', '/patients', { token: reception.token, body: { ...base, name: 'No Age' } });
  assert.equal(none.status, 400);
  assert.match(none.body.message, /date of birth or an age/i);
});

test('editing: switch to an age, keep an estimated date, or give the real date', async () => {
  const id = (await api('POST', '/patients', { token: reception.token, body: { ...base, name: 'Edit Age', date_of_birth: '1970-01-01' } })).body.data.id;
  const put = (body) => api('PUT', `/patients/${id}`, { token: reception.token, body: { ...base, name: 'Edit Age', ...body } });
  assert.equal((await put({ age_years: 62 })).status, 200);
  assert.deepEqual({ ...await row(id) }, { dob: yearsAgo(62), dob_estimated: 1 });
  assert.equal((await put({ date_of_birth: yearsAgo(62), dob_estimated: true })).status, 200, 'the estimate kept as it is');
  assert.deepEqual({ ...await row(id) }, { dob: yearsAgo(62), dob_estimated: 1 });
  assert.equal((await put({ date_of_birth: '1963-03-03' })).status, 200);
  assert.deepEqual({ ...await row(id) }, { dob: '1963-03-03', dob_estimated: 0 });
});

test('pages that show an age get the date of birth and whether it is estimated', async () => {
  const pharmacy = await login(USERS.PHARMACY);
  const list = await api('GET', '/prescriptions', { token: pharmacy.token });
  assert.ok(list.body.data.length && list.body.data.every(r => 'patient_dob' in r && 'patient_dob_estimated' in r));
  const detail = await api('GET', `/prescriptions/${list.body.data[0].prescription_id}`, { token: pharmacy.token });
  assert.ok('patient_dob' in detail.body.data && 'patient_dob_estimated' in detail.body.data);
  const nurse = await login(USERS.NURSE);
  const station = await api('GET', '/nurse/station', { token: nurse.token });
  const bed = station.body.data.beds.find(b => b.patient_id);
  assert.ok(bed && 'date_of_birth' in bed && 'dob_estimated' in bed);
  const mar = await api('GET', `/mar/patients/${bed.patient_id}`, { token: nurse.token });
  assert.ok('date_of_birth' in mar.body.data.patient && 'dob_estimated' in mar.body.data.patient);
});
