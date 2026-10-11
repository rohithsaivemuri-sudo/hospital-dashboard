// Item 12: a dose is saved with its unit ("250 mg"); a new dose that is only a number is refused.
// Prescription lines on the chart are labelled: dose, frequency, duration and quantity.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb, visitInProgress } = require('./helpers');

after(closeDb);
let doctor, patientId, visit;
before(async () => {
  doctor = await login(USERS.DOCTOR);
  [[{ patient_id: patientId }]] = await db().query('SELECT patient_id FROM appointments WHERE doctor_id = ? ORDER BY patient_id LIMIT 1', [doctor.user.doctor_id]);
  visit = await visitInProgress(doctor, patientId);
});
after(() => visit?.close());

const prescribe = (dosage) => api('POST', '/prescriptions', { token: doctor.token, body: { patient_id: patientId, doctor_id: doctor.user.doctor_id,
  items: [{ medicine_id: 1, dosage, frequency: 'Twice daily', duration: '5 days', quantity: 10 }] } });

test('a dose that is only a number is refused; nothing is saved', async () => {
  const [[{ n: before }]] = await db().query('SELECT COUNT(*) AS n FROM prescriptions');
  for (const dosage of ['250', ' 2.5 ', '0']) {
    const res = await prescribe(dosage);
    assert.equal(res.status, 400, `${dosage}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.message, /Item 1: the dose needs a unit/);
  }
  const [[{ n: afterCount }]] = await db().query('SELECT COUNT(*) AS n FROM prescriptions');
  assert.equal(afterCount, before);
});

test('a dose with a unit is saved as written, and the chart line is labelled', async () => {
  const res = await prescribe('250 mg');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const history = await api('GET', `/patients/${patientId}/history`, { token: doctor.token });
  const p = history.body.data.prescriptions.find(x => x.prescription_id === res.body.data.id);
  assert.match(p.medication_details, /^.+ · Dose: 250 mg · Frequency: Twice daily · Duration: 5 days · Quantity: 10$/);
});
