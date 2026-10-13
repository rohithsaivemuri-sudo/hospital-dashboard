// Nurse assignments decide "today" in India time (utils/clock.js). Reported on the live site at
// 00:57 IST on 14 Oct, when the UTC date was still 13 Oct: an assignment starting 14/10 showed "Not
// current" and one ended "Until 13/10" still showed "Current". The server here runs in TZ=UTC with its
// clock at that moment (on a day far from the seed data, so CURDATE() could never pass by chance).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, TEST_PORT, login, db, closeDb, serverAt } = require('./helpers');
const { addDays } = require('../utils/clock');

const DAY = '2031-10-14';
let server; let admin; let nurse; let ward; let inpatient;
const created = [];

before(async () => {
  server = await serverAt(`${DAY}T00:57:00+05:30`, TEST_PORT + 11);
  admin = await login(USERS.ADMIN);
  nurse = await login(USERS.NURSE);
  [[ward]] = await db().query("SELECT ward_id FROM wards WHERE name = 'Cardiac Ward'");
  [[inpatient]] = await db().query(`SELECT a.patient_id FROM admissions a JOIN beds b ON b.bed_id = a.bed_id
    WHERE a.status = 'ACTIVE' AND b.ward_id = ? AND a.patient_id NOT IN
      (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS')) LIMIT 1`, [ward.ward_id]);
  assert.ok(inpatient, 'seed data has an active Cardiac Ward admission');
});

after(async () => {
  if (created.length) await db().query('DELETE FROM nurse_ward_assignments WHERE assignment_id IN (?)', [created]);
  if (server) await server.stop();
  await closeDb();
});

const insert = async (start, end) => {
  const [r] = await db().query('INSERT INTO nurse_ward_assignments (nurse_user_id, ward_id, start_date, end_date) VALUES (?, ?, ?, ?)', [nurse.user.user_id, ward.ward_id, start, end]);
  created.push(r.insertId);
  return r.insertId;
};
const row = async (id) => (await server.api('GET', '/nurse-assignments', { token: admin.token })).body.data.find(a => a.assignment_id === id);
const seesInpatient = async () => (await server.api('GET', `/patients/${inpatient.patient_id}`, { token: nurse.token })).status;

test('at 00:57 IST a new assignment starts today in India, is current at once and grants access', async () => {
  const res = await server.api('POST', '/nurse-assignments', { token: admin.token, body: { nurse_user_id: nurse.user.user_id, ward_id: ward.ward_id } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  created.push(res.body.data.assignment_id);
  assert.equal(res.body.data.start_date, DAY, 'the default start is the IST date, not the UTC one');
  assert.equal(res.body.data.is_current, true);
  assert.equal(await seesInpatient(), 200);
  const station = (await server.api('GET', '/nurse/station', { token: nurse.token })).body.data;
  assert.ok(station.wards.some(w => w.ward_id === ward.ward_id), 'the ward is on the nurse station');

  const ended = await server.api('PUT', `/nurse-assignments/${res.body.data.assignment_id}`, { token: admin.token, body: {} });
  assert.equal(ended.status, 200, JSON.stringify(ended.body));
  assert.equal(ended.body.data.end_date, DAY, 'End means today in India');
  assert.deepEqual([ended.body.data.status, ended.body.data.is_current], ['ENDED', false], 'and takes effect at once');
  assert.equal(await seesInpatient(), 403);
  await db().query('DELETE FROM nurse_ward_assignments WHERE assignment_id = ?', [res.body.data.assignment_id]);
});

test('at 00:57 IST an assignment that ended yesterday (IST) is not current and grants nothing', async () => {
  const id = await insert(addDays(DAY, -5), addDays(DAY, -1));
  const r = await row(id);
  assert.equal(r.end_date, addDays(DAY, -1));
  assert.equal(r.is_current, false);
  assert.equal(await seesInpatient(), 403);
});

test('an assignment starting tomorrow (IST) is not current yet; dates come back as plain YYYY-MM-DD', async () => {
  const id = await insert(addDays(DAY, 1), null);
  const r = await row(id);
  assert.deepEqual([r.start_date, r.end_date, r.is_current], [addDays(DAY, 1), null, false]);
  assert.equal(await seesInpatient(), 403);
});
