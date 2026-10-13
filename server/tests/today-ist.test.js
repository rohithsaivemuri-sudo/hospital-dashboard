// Every date-only "today" decision uses India time (utils/clock.js), not the MySQL server's CURDATE()
// or the process time zone. The server here runs in TZ=UTC with its clock at 00:30 IST, when the UTC
// date is still the day before, on a day far from the seed data (so CURDATE() can never pass by
// chance). DATETIME columns are UTC (config/dbTime.js): 00:10 IST on DAY is 18:40 UTC the day before.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, TEST_PORT, login, db, closeDb, serverAt } = require('./helpers');
const { addDays, istDayUtc } = require('../utils/clock');

const DAY = '2031-10-14';
const YESTERDAY = addDays(DAY, -1);
const AT = '00:30';
const JUST_AFTER_MIDNIGHT = '2031-10-13 18:40:00';  // 00:10 IST on DAY, in UTC
const JUST_BEFORE_MIDNIGHT = '2031-10-13 18:20:00'; // 23:50 IST the day before, in UTC

let server; let admin; let doctor; let pharmacy;
const cleanup = [];

before(async () => {
  server = await serverAt(`${DAY}T${AT}:00+05:30`, TEST_PORT + 12);
  [admin, doctor, pharmacy] = await Promise.all([USERS.ADMIN, USERS.DOCTOR, USERS.PHARMACY].map(login));
});

after(async () => {
  for (const undo of cleanup.reverse()) await undo();
  if (server) await server.stop();
  await closeDb();
});

test('the DATETIME range of an IST day starts at 18:30 UTC the day before', () => {
  assert.deepEqual(istDayUtc(DAY), ['2031-10-13 18:30:00', '2031-10-14 18:30:00']);
});

test(`at ${AT} IST the admin dashboard and the doctor's daily analytics count today in India`, async () => {
  const [patients] = await db().query('SELECT patient_id FROM patients ORDER BY patient_id LIMIT 3');
  const doctorId = doctor.user.doctor_id;
  const [a] = await db().query(`INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status) VALUES
    (?, ?, ?, '09:00:00', 'BOOKED'), (?, ?, ?, '09:15:00', 'COMPLETED'), (?, ?, ?, '17:00:00', 'BOOKED')`,
  [patients[0].patient_id, doctorId, DAY, patients[1].patient_id, doctorId, DAY, patients[2].patient_id, doctorId, YESTERDAY]);
  const apptIds = [a.insertId, a.insertId + 1, a.insertId + 2];
  const [e] = await db().query(`INSERT INTO emergency_cases (patient_id, severity, symptoms, arrival_time, assigned_doctor_id, status) VALUES
    (?, 'STABLE', 'today-ist test', ?, ?, 'WAITING'), (?, 'STABLE', 'today-ist test', ?, ?, 'WAITING')`,
  [patients[2].patient_id, JUST_AFTER_MIDNIGHT, doctorId, patients[2].patient_id, JUST_BEFORE_MIDNIGHT, doctorId]);
  const [labs] = await db().query("SELECT order_id, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') u FROM lab_orders WHERE status = 'COMPLETED' ORDER BY order_id LIMIT 2");
  assert.equal(labs.length, 2, 'seed data has completed lab orders');
  await db().query('UPDATE lab_orders SET updated_at = ? WHERE order_id = ?', [JUST_AFTER_MIDNIGHT, labs[0].order_id]);
  await db().query('UPDATE lab_orders SET updated_at = ? WHERE order_id = ?', [JUST_BEFORE_MIDNIGHT, labs[1].order_id]);
  cleanup.push(async () => {
    await db().query('DELETE FROM appointments WHERE appointment_id IN (?)', [apptIds]);
    await db().query('DELETE FROM emergency_cases WHERE emergency_id IN (?)', [[e.insertId, e.insertId + 1]]);
    for (const l of labs) await db().query('UPDATE lab_orders SET updated_at = ? WHERE order_id = ?', [l.u, l.order_id]);
    await db().query('DELETE FROM doctor_daily_analytics WHERE analytics_date >= ?', [YESTERDAY]);
  });

  const stats = (await server.api('GET', '/dashboard/stats', { token: admin.token })).body.data;
  assert.equal(stats.todayAppointments, 2, "today's appointments are DAY's, not yesterday's");
  assert.equal(stats.labWorkload.completedToday, 1, 'a lab order completed at 00:10 IST counts; one at 23:50 IST yesterday does not');

  const analytics = (await server.api('GET', '/doctors/me/analytics', { token: doctor.token })).body.data.today;
  assert.equal(String(analytics.analytics_date).slice(0, 10), DAY);
  assert.equal(analytics.appointment_patients, 2);
  assert.equal(analytics.emergency_cases, 1, 'only the arrival after midnight IST is today');
  assert.equal(analytics.cases_solved, 1);
});

test(`at ${AT} IST ages turn over on the birthday in India`, async () => {
  const [[rx]] = await db().query("SELECT p.prescription_id, p.patient_id, DATE_FORMAT(pat.date_of_birth, '%Y-%m-%d') dob FROM prescriptions p JOIN patients pat ON pat.patient_id = p.patient_id ORDER BY p.prescription_id LIMIT 1");
  await db().query('UPDATE patients SET date_of_birth = ? WHERE patient_id = ?', [`1990-${DAY.slice(5)}`, rx.patient_id]);
  cleanup.push(() => db().query('UPDATE patients SET date_of_birth = ? WHERE patient_id = ?', [rx.dob, rx.patient_id]));
  const detail = (await server.api('GET', `/prescriptions/${rx.prescription_id}`, { token: pharmacy.token })).body.data;
  assert.equal(detail.patient_age, 41, 'born on this day in 1990: 41 today in India (still 40 by the UTC date)');
  const row = (await server.api('GET', '/prescriptions', { token: pharmacy.token })).body.data.find(r => r.prescription_id === rx.prescription_id);
  assert.equal(row.patient_age, 41);
});

test(`at ${AT} IST a batch that expired yesterday (IST) is expired; one expiring today is not`, async () => {
  const [[med]] = await db().query('SELECT medicine_id FROM medicines ORDER BY medicine_id LIMIT 1');
  await db().query(`INSERT INTO medicine_batches (medicine_id, batch_number, quantity, expiry_date) VALUES (?, 'IST-YESTERDAY', 0, ?), (?, 'IST-TODAY', 0, ?)`,
    [med.medicine_id, YESTERDAY, med.medicine_id, DAY]);
  cleanup.push(() => db().query("DELETE FROM medicine_batches WHERE batch_number IN ('IST-YESTERDAY', 'IST-TODAY')"));
  const lots = (await server.api('GET', `/medicines/${med.medicine_id}/batches`, { token: pharmacy.token })).body.data;
  const state = Object.fromEntries(lots.filter(l => l.batch_number.startsWith('IST-')).map(l => [l.batch_number, l.is_expired]));
  assert.deepEqual(state, { 'IST-YESTERDAY': true, 'IST-TODAY': false });
});
