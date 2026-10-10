// Appointments list (item 3): sorted by date and time; visits left open from an earlier day can be
// listed with ?open_before=.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);
let reception, doctorId, patients, earlierOpen, earlierDone;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (offset) => iso(new Date(Date.now() + offset * 864e5));

before(async () => {
  reception = await login(USERS.RECEPTIONIST);
  const [[d]] = await db().query("SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = 'dr.gupta'");
  doctorId = d.doctor_id;
  [patients] = await db().query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS'))
    AND patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE') ORDER BY patient_id LIMIT 3`);
  const book = async (p, date, time) => (await api('POST', '/appointments', { token: reception.token, body: { patient_id: p, doctor_id: doctorId, appointment_date: date, appointment_time: time } })).body.data.id;
  earlierOpen = await book(patients[0].patient_id, day(-2), '10:05:00');
  await api('POST', '/encounters', { token: reception.token, body: { appointment_id: earlierOpen } }); // checked in two days ago, never seen
  earlierDone = await book(patients[1].patient_id, day(-2), '11:05:00');
  await api('PUT', `/appointments/${earlierDone}/status`, { token: reception.token, body: { status: 'NO_SHOW' } });
  // Booked out of order for one future day.
  for (const [p, t] of [[patients[2].patient_id, '15:40:00'], [patients[1].patient_id, '08:10:00'], [patients[0].patient_id, '12:20:00']]) await book(p, day(9), t);
});

test('the list is sorted by date, then time', async () => {
  const res = await api('GET', `/appointments?date=${day(9)}`, { token: reception.token });
  const mine = res.body.data.filter(a => a.doctor_id === doctorId).map(a => a.appointment_time);
  assert.deepEqual(mine, ['08:10:00', '12:20:00', '15:40:00']);
  const all = (await api('GET', '/appointments', { token: reception.token })).body.data.map(a => `${String(a.appointment_date).slice(0, 10)} ${a.appointment_time}`);
  assert.deepEqual(all, [...all].sort());
});

test('?open_before= lists visits from earlier days that are still open, and only those', async () => {
  const res = await api('GET', `/appointments?open_before=${day(0)}`, { token: reception.token });
  assert.equal(res.status, 200);
  const ids = res.body.data.map(a => a.appointment_id);
  assert.ok(ids.includes(earlierOpen), 'checked in two days ago and never closed');
  assert.ok(!ids.includes(earlierDone), 'a no-show is not open');
  assert.ok(res.body.data.every(a => String(a.appointment_date).slice(0, 10) < day(0) || new Date(a.appointment_date) < new Date(day(0))));
  assert.equal((await api('GET', '/appointments?open_before=yesterday', { token: reception.token })).status, 400);
});
