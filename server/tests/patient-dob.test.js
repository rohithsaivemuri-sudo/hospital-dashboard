// Item 14: a date of birth in the future (or not a real date) is refused on registration and edit.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');
const { istDate } = require('../utils/marTime');

after(closeDb);
let reception, patientId;
const body = (dob) => ({ name: 'DOB Check', date_of_birth: dob, gender: 'FEMALE', blood_group: null, phone: null, address: null, emergency_contact: null });
const shift = (days) => istDate(new Date(Date.now() + days * 864e5));

before(async () => {
  reception = await login(USERS.RECEPTIONIST);
  patientId = (await api('POST', '/patients', { token: reception.token, body: body('1990-04-04') })).body.data.id;
});

test('registration refuses a future or impossible date of birth, and accepts today', async () => {
  const [[{ n: before }]] = await db().query('SELECT COUNT(*) AS n FROM patients');
  for (const dob of [shift(1), shift(400), '2999-01-01', '2020-02-30', 'not a date']) {
    const res = await api('POST', '/patients', { token: reception.token, body: body(dob) });
    assert.equal(res.status, 400, `${dob}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.message, /date of birth/i);
  }
  const [[{ n: afterCount }]] = await db().query('SELECT COUNT(*) AS n FROM patients');
  assert.equal(afterCount, before);
  assert.equal((await api('POST', '/patients', { token: reception.token, body: body(shift(0)) })).status, 201, 'a newborn registered today');
});

test('editing refuses a future date of birth and leaves the record unchanged', async () => {
  const res = await api('PUT', `/patients/${patientId}`, { token: reception.token, body: body(shift(1)) });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.match(res.body.message, /Date of birth cannot be in the future/);
  const [[row]] = await db().query("SELECT DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dob FROM patients WHERE patient_id = ?", [patientId]);
  assert.equal(row.dob, '1990-04-04');
});
