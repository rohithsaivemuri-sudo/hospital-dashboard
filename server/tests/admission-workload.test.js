// Admitting to a doctor at maximum workload is refused with 409 and a clear message.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

async function setup() {
  const reception = await login(USERS.RECEPTIONIST);
  const [[doctor]] = await db().query('SELECT doctor_id, name, current_workload, max_workload FROM doctors WHERE current_workload < max_workload ORDER BY doctor_id DESC LIMIT 1');
  const [[bed]] = await db().query("SELECT bed_id FROM beds WHERE status = 'AVAILABLE' AND bed_type = 'GENERAL' ORDER BY bed_id LIMIT 1");
  const [[patient]] = await db().query("SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE') ORDER BY patient_id LIMIT 1");
  return { reception, doctor, bed, patient };
}
const admit = (token, doctorId, bedId, patientId) => api('POST', '/admissions', { token, body: { patient_id: patientId, doctor_id: doctorId, bed_id: bedId, department_id: 1, diagnosis: 'Workload test' } });

test('a doctor at maximum workload: 409 with a clear message, and nothing changes', async () => {
  const { reception, doctor, bed, patient } = await setup();
  const originalMax = doctor.max_workload;
  await db().query('UPDATE doctors SET max_workload = current_workload WHERE doctor_id = ?', [doctor.doctor_id]);
  try {
    const [[{ admissionsBefore }]] = await db().query('SELECT COUNT(*) admissionsBefore FROM admissions');
    const [[{ auditsBefore }]] = await db().query("SELECT COUNT(*) auditsBefore FROM audit_logs WHERE action = 'ADMIT_PATIENT'");
    const res = await admit(reception.token, doctor.doctor_id, bed.bed_id, patient.patient_id);
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'DOCTOR_AT_MAX_WORKLOAD');
    assert.equal(res.body.message, `${doctor.name} is at maximum workload (${doctor.current_workload} of ${doctor.current_workload} patients). Choose another doctor or discharge a patient first.`);
    const [[{ admissionsAfter }]] = await db().query('SELECT COUNT(*) admissionsAfter FROM admissions');
    assert.equal(admissionsAfter, admissionsBefore, 'no admission was created');
    const [[b]] = await db().query('SELECT status FROM beds WHERE bed_id = ?', [bed.bed_id]);
    assert.equal(b.status, 'AVAILABLE', 'the bed is still free');
    const [[d]] = await db().query('SELECT current_workload FROM doctors WHERE doctor_id = ?', [doctor.doctor_id]);
    assert.equal(d.current_workload, doctor.current_workload, 'workload unchanged');
    const [[{ auditsAfter }]] = await db().query("SELECT COUNT(*) auditsAfter FROM audit_logs WHERE action = 'ADMIT_PATIENT'");
    assert.equal(auditsAfter, auditsBefore, 'no admission audit row');
  } finally {
    await db().query('UPDATE doctors SET max_workload = ? WHERE doctor_id = ?', [originalMax, doctor.doctor_id]);
  }
});

test('with room, the same admission succeeds and the workload goes up by one', async () => {
  const { reception, doctor, bed, patient } = await setup();
  const res = await admit(reception.token, doctor.doctor_id, bed.bed_id, patient.patient_id);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const [[d]] = await db().query('SELECT current_workload FROM doctors WHERE doctor_id = ?', [doctor.doctor_id]);
  assert.equal(d.current_workload, doctor.current_workload + 1);
});

test('an unknown doctor is a 400, not a 500', async () => {
  const { reception, bed, patient } = await setup();
  const res = await admit(reception.token, 999999, bed.bed_id, patient.patient_id);
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'Doctor not found');
});
