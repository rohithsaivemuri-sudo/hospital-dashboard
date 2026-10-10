// Vitals context (item 6): each reading says where it was filed, in words.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

test('each reading carries filed_under: "Visit with <doctor>" or "Admission · <ward> bed <code>"', async () => {
  const [nurse, reception] = await Promise.all([login(USERS.NURSE), login(USERS.RECEPTIONIST)]);
  const [[p]] = await db().query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE')
    AND patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS')) ORDER BY patient_id DESC LIMIT 1`);
  const [[bed]] = await db().query("SELECT b.bed_id, b.bed_number FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = 'ICU Ward' AND b.status = 'AVAILABLE' ORDER BY b.bed_id LIMIT 1");
  const doctor = await login(USERS.DOCTOR);
  const adm = await api('POST', '/admissions', { token: reception.token, body: { patient_id: p.patient_id, doctor_id: doctor.user.doctor_id, bed_id: bed.bed_id, department_id: 1, diagnosis: 'Vitals context' } });
  const walkIn = await api('POST', '/encounters', { token: reception.token, body: { patient_id: p.patient_id, doctor_id: doctor.user.doctor_id } });
  assert.equal(walkIn.status, 201, JSON.stringify(walkIn.body));
  const [[{ name: doctorName }]] = await db().query('SELECT name FROM doctors WHERE doctor_id = ?', [doctor.user.doctor_id]);
  assert.equal((await api('POST', '/vitals', { token: nurse.token, body: { patient_id: p.patient_id, admission_id: adm.body.data.id, pulse_bpm: 70 } })).status, 201);
  assert.equal((await api('POST', '/vitals', { token: nurse.token, body: { patient_id: p.patient_id, encounter_id: walkIn.body.data.encounter_id, pulse_bpm: 72 } })).status, 201);
  const res = await api('GET', `/vitals/patients/${p.patient_id}`, { token: nurse.token });
  assert.deepEqual(res.body.data.readings.slice(-2).map(r => r.filed_under), [`Admission · ICU Ward bed ${bed.bed_number}`, `Visit with ${doctorName}`]);
  await api('POST', `/encounters/${walkIn.body.data.encounter_id}/cancel`, { token: reception.token });
  await api('POST', `/admissions/${adm.body.data.id}/discharge`, { token: doctor.token, body: {} });
});
