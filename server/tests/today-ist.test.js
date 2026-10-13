// Every date-only "today" decision uses India time (utils/clock.js), not the MySQL server's CURDATE()
// or the process time zone. The same checks run against two servers in TZ=UTC whose clocks read
// 00:30 IST (the UTC date is still the day before) and 06:00 IST (the UTC date has caught up) on a
// day far from the seed data, so CURDATE() could never pass by chance: nurse assignment statuses,
// nurse access, the "today" lists and counts, ages and expiry must be the same at both times.
// DATETIME columns are UTC (config/dbTime.js): 00:10 IST on DAY is 18:40 UTC the day before.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { USERS, TEST_PORT, login, db, closeDb, serverAt } = require('./helpers');
const { addDays, istDayUtc } = require('../utils/clock');

const DAY = '2031-10-14';
const YESTERDAY = addDays(DAY, -1);
const TOMORROW = addDays(DAY, 1);
const TIMES = ['00:30', '06:00'];
const JUST_AFTER_MIDNIGHT = '2031-10-13 18:40:00';  // 00:10 IST on DAY, in UTC
const JUST_BEFORE_MIDNIGHT = '2031-10-13 18:20:00'; // 23:50 IST the day before, in UTC

const servers = {};
let admin; let doctor; let pharmacy; let nurse;
const fx = {};          // fixtures shared by both times
const cleanup = [];

async function inpatientOf(wardName) {
  const [[row]] = await db().query(`SELECT w.ward_id, a.patient_id FROM wards w JOIN beds b ON b.ward_id = w.ward_id
    JOIN admissions a ON a.bed_id = b.bed_id AND a.status = 'ACTIVE'
    WHERE w.name = ? AND a.patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS'))
    ORDER BY a.admission_id LIMIT 1`, [wardName]);
  assert.ok(row, `seed data has an inpatient on ${wardName}`);
  return row;
}

before(async () => {
  [admin, doctor, pharmacy, nurse] = await Promise.all([USERS.ADMIN, USERS.DOCTOR, USERS.PHARMACY, USERS.NURSE].map(login));
  cleanup.push(() => db().query('DELETE FROM doctor_daily_analytics WHERE analytics_date >= ?', [YESTERDAY]));

  // Nurse assignments on wards the nurse has no other assignment to, one per state.
  fx.wards = {
    startsToday: await inpatientOf('General Ward A'),
    endsToday: await inpatientOf('Emergency Observation'),
    endedYesterday: await inpatientOf('Cardiac Ward'),
    startsTomorrow: await inpatientOf('Pediatric Ward'),
  };
  const dates = { startsToday: [DAY, null], endsToday: [addDays(DAY, -3), DAY], endedYesterday: [addDays(DAY, -10), YESTERDAY], startsTomorrow: [TOMORROW, null] };
  fx.assignments = {};
  for (const [k, [start, end]] of Object.entries(dates)) {
    const [r] = await db().query('INSERT INTO nurse_ward_assignments (nurse_user_id, ward_id, start_date, end_date) VALUES (?, ?, ?, ?)', [nurse.user.user_id, fx.wards[k].ward_id, start, end]);
    fx.assignments[k] = r.insertId;
  }
  cleanup.push(() => db().query('DELETE FROM nurse_ward_assignments WHERE assignment_id IN (?)', [Object.values(fx.assignments)]));

  // Today's lists: two appointments today and one yesterday; emergency arrivals and completed lab
  // orders either side of midnight IST.
  const [patients] = await db().query('SELECT patient_id FROM patients ORDER BY patient_id LIMIT 3');
  const doctorId = doctor.user.doctor_id;
  const [a] = await db().query(`INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status) VALUES
    (?, ?, ?, '09:00:00', 'BOOKED'), (?, ?, ?, '09:15:00', 'COMPLETED'), (?, ?, ?, '17:00:00', 'BOOKED')`,
  [patients[0].patient_id, doctorId, DAY, patients[1].patient_id, doctorId, DAY, patients[2].patient_id, doctorId, YESTERDAY]);
  const [e] = await db().query(`INSERT INTO emergency_cases (patient_id, severity, symptoms, arrival_time, assigned_doctor_id, status) VALUES
    (?, 'STABLE', 'today-ist test', ?, ?, 'WAITING'), (?, 'STABLE', 'today-ist test', ?, ?, 'WAITING')`,
  [patients[2].patient_id, JUST_AFTER_MIDNIGHT, doctorId, patients[2].patient_id, JUST_BEFORE_MIDNIGHT, doctorId]);
  const [labs] = await db().query("SELECT order_id, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') u FROM lab_orders WHERE status = 'COMPLETED' ORDER BY order_id LIMIT 2");
  assert.equal(labs.length, 2, 'seed data has completed lab orders');
  await db().query('UPDATE lab_orders SET updated_at = ? WHERE order_id = ?', [JUST_AFTER_MIDNIGHT, labs[0].order_id]);
  await db().query('UPDATE lab_orders SET updated_at = ? WHERE order_id = ?', [JUST_BEFORE_MIDNIGHT, labs[1].order_id]);
  cleanup.push(async () => {
    await db().query('DELETE FROM appointments WHERE appointment_id IN (?)', [[a.insertId, a.insertId + 1, a.insertId + 2]]);
    await db().query('DELETE FROM emergency_cases WHERE emergency_id IN (?)', [[e.insertId, e.insertId + 1]]);
    for (const l of labs) await db().query('UPDATE lab_orders SET updated_at = ? WHERE order_id = ?', [l.u, l.order_id]);
  });

  // A patient born on this day in 1990, and two empty batches expiring yesterday and today.
  [[fx.rx]] = await db().query("SELECT p.prescription_id, p.patient_id, DATE_FORMAT(pat.date_of_birth, '%Y-%m-%d') dob FROM prescriptions p JOIN patients pat ON pat.patient_id = p.patient_id ORDER BY p.prescription_id LIMIT 1");
  await db().query('UPDATE patients SET date_of_birth = ? WHERE patient_id = ?', [`1990-${DAY.slice(5)}`, fx.rx.patient_id]);
  cleanup.push(() => db().query('UPDATE patients SET date_of_birth = ? WHERE patient_id = ?', [fx.rx.dob, fx.rx.patient_id]));
  [[fx.med]] = await db().query('SELECT medicine_id FROM medicines ORDER BY medicine_id LIMIT 1');
  await db().query(`INSERT INTO medicine_batches (medicine_id, batch_number, quantity, expiry_date) VALUES (?, 'IST-YESTERDAY', 0, ?), (?, 'IST-TODAY', 0, ?)`,
    [fx.med.medicine_id, YESTERDAY, fx.med.medicine_id, DAY]);
  cleanup.push(() => db().query("DELETE FROM medicine_batches WHERE batch_number IN ('IST-YESTERDAY', 'IST-TODAY')"));

  let port = TEST_PORT + 12;
  for (const at of TIMES) servers[at] = await serverAt(`${DAY}T${at}:00+05:30`, port++);
});

after(async () => {
  for (const s of Object.values(servers)) await s.stop();
  for (const undo of cleanup.reverse()) await undo();
  await closeDb();
});

test('the DATETIME range of an IST day starts at 18:30 UTC the day before', () => {
  assert.deepEqual(istDayUtc(DAY), ['2031-10-13 18:30:00', '2031-10-14 18:30:00']);
});

for (const at of TIMES) {
  const call = (...args) => servers[at].api(...args);

  test(`${at} IST: nurse assignment statuses and buttons follow the IST date`, async () => {
    const rows = (await call('GET', '/nurse-assignments', { token: admin.token })).body.data;
    const status = (k) => { const r = rows.find(x => x.assignment_id === fx.assignments[k]); return [r.status, r.is_current]; };
    assert.deepEqual(status('startsToday'), ['CURRENT', true], 'starts today: Current');
    assert.deepEqual(status('endsToday'), ['CURRENT', true], 'ends today: Current until midnight IST');
    assert.deepEqual(status('endedYesterday'), ['ENDED', false], 'ended yesterday: not current');
    assert.deepEqual(status('startsTomorrow'), ['UPCOMING', false], 'starts tomorrow: not started, so it gets Cancel');
    const refused = await call('DELETE', `/nurse-assignments/${fx.assignments.startsToday}`, { token: admin.token });
    assert.equal(refused.status, 409, 'an assignment starting today has started and cannot be cancelled');
    const mine = (await call('GET', '/nurse-assignments', { token: nurse.token })).body.data;
    assert.ok(mine.find(x => x.assignment_id === fx.assignments.startsToday).is_current, 'the nurse sees the same status');
  });

  test(`${at} IST: nurse access covers exactly the wards assigned today (IST)`, async () => {
    const station = (await call('GET', '/nurse/station', { token: nurse.token })).body.data;
    const wardIds = new Set(station.wards.map(w => w.ward_id));
    const sees = async (k) => (await call('GET', `/patients/${fx.wards[k].patient_id}`, { token: nurse.token })).status;
    for (const k of ['startsToday', 'endsToday']) {
      assert.ok(wardIds.has(fx.wards[k].ward_id), `${k}: ward on the nurse station`);
      assert.equal(await sees(k), 200, `${k}: inpatient visible`);
    }
    for (const k of ['endedYesterday', 'startsTomorrow']) {
      assert.ok(!wardIds.has(fx.wards[k].ward_id), `${k}: ward not on the nurse station`);
      assert.equal(await sees(k), 403, `${k}: inpatient not visible`);
    }
    const admissions = (await call('GET', '/admissions/current', { token: nurse.token })).body.data.map(r => r.patient_id);
    assert.ok(admissions.includes(fx.wards.startsToday.patient_id) && !admissions.includes(fx.wards.endedYesterday.patient_id));
  });

  test(`${at} IST: the dashboard and the doctor's daily analytics count today in India`, async () => {
    const stats = (await call('GET', '/dashboard/stats', { token: admin.token })).body.data;
    assert.equal(stats.todayAppointments, 2, "today's appointments are DAY's, not yesterday's");
    assert.equal(stats.labWorkload.completedToday, 1, 'a lab order completed at 00:10 IST counts; one at 23:50 IST yesterday does not');
    const analytics = (await call('GET', '/doctors/me/analytics', { token: doctor.token })).body.data.today;
    assert.equal(String(analytics.analytics_date).slice(0, 10), DAY);
    assert.equal(analytics.appointment_patients, 2);
    assert.equal(analytics.emergency_cases, 1, 'only the arrival after midnight IST is today');
    assert.equal(analytics.cases_solved, 1);
  });

  test(`${at} IST: ages turn over on the birthday in India; expiry is judged on the IST date`, async () => {
    const detail = (await call('GET', `/prescriptions/${fx.rx.prescription_id}`, { token: pharmacy.token })).body.data;
    assert.equal(detail.patient_age, 41, 'born on this day in 1990: 41 today in India');
    const row = (await call('GET', '/prescriptions', { token: pharmacy.token })).body.data.find(r => r.prescription_id === fx.rx.prescription_id);
    assert.equal(row.patient_age, 41);
    const lots = (await call('GET', `/medicines/${fx.med.medicine_id}/batches`, { token: pharmacy.token })).body.data;
    const state = Object.fromEntries(lots.filter(l => l.batch_number.startsWith('IST-')).map(l => [l.batch_number, l.is_expired]));
    assert.deepEqual(state, { 'IST-YESTERDAY': true, 'IST-TODAY': false });
  });

  test(`${at} IST: the client's "today", ages and lab-board filter use the IST date in any browser time zone`, async () => {
    const client = (f) => import(pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'utils', f)).href);
    const { istToday, istDate } = await client('istDate.js');
    const { ageText, estimatedBirthDate } = await client('age.js');
    const now = new Date(`${DAY}T${at}:00+05:30`);
    const tz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles'; // a browser far from India: its local date is the day before
    try {
      assert.equal(now.getDate(), 13, 'the local date here differs from India');
      assert.equal(istToday(now), DAY);
      assert.equal(ageText(`1990-${DAY.slice(5)}T00:00:00.000Z`, false, now), '41 yrs', 'a MySQL DATE value as the API sends it');
      assert.equal(ageText(`1990-${TOMORROW.slice(5)}`, false, now), '40 yrs', 'the birthday is tomorrow');
      assert.equal(estimatedBirthDate(30, now), `2001-${DAY.slice(5)}`);
      // The lab board's "Today" box keeps an order placed at 00:10 IST and drops one at 23:50 IST yesterday.
      assert.equal(istDate(`${JUST_AFTER_MIDNIGHT.replace(' ', 'T')}Z`), istToday(now));
      assert.notEqual(istDate(`${JUST_BEFORE_MIDNIGHT.replace(' ', 'T')}Z`), istToday(now));
    } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }
  });
}
