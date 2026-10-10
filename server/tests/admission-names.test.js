// Item 8: a patient's admissions name the bed code, ward and admitting doctor.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

test('/patients/:id/admissions and /history carry bed_number, ward_name and doctor_name', async () => {
  const [[a]] = await db().query(`SELECT a.patient_id, a.admission_id, b.bed_number, w.name AS ward_name, d.name AS doctor_name, u.username
    FROM admissions a JOIN beds b ON b.bed_id = a.bed_id JOIN wards w ON w.ward_id = b.ward_id JOIN doctors d ON d.doctor_id = a.doctor_id JOIN users u ON u.user_id = d.user_id
    WHERE a.status = 'ACTIVE' ORDER BY a.admission_id LIMIT 1`);
  const expected = { bed_number: a.bed_number, ward_name: a.ward_name, doctor_name: a.doctor_name };
  const pick = (r) => ({ bed_number: r.bed_number, ward_name: r.ward_name, doctor_name: r.doctor_name });
  const reception = await login(USERS.RECEPTIONIST);
  const list = await api('GET', `/patients/${a.patient_id}/admissions`, { token: reception.token });
  assert.deepEqual(pick(list.body.data.find(r => r.admission_id === a.admission_id)), expected);
  const doctor = await login(a.username);
  const history = await api('GET', `/patients/${a.patient_id}/history`, { token: doctor.token });
  assert.deepEqual(pick(history.body.data.admissions.find(r => r.admission_id === a.admission_id)), expected);
});
