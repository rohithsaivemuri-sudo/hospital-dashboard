// Phase 2 step 6: bedside Medication Administration Record.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb, setStock } = require('./helpers');
const { toSqlUtc, formatIst, istDate } = require('../utils/marTime');

after(closeDb);

const MEDS = { A: 5, B: 6, C: 7 };       // reserved for this file (Aspirin, Metformin, Amlodipine)
let reception, pharmacy, nurse, doctor, admin;
let patient;                              // admitted to the ICU (nurse1's ward) under dr.smith

const mrn = (id) => `MRN-${String(id).padStart(6, '0')}`;
const minutesFromNow = (m) => toSqlUtc(new Date(Date.now() + m * 60000));

async function admitToIcu(patientId) {
  const [[bed]] = await db().query("SELECT b.bed_id FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = 'ICU Ward' AND b.status = 'AVAILABLE' ORDER BY b.bed_id LIMIT 1");
  assert.ok(bed, 'an ICU bed is available');
  const res = await api('POST', '/admissions', { token: reception.token, body: { patient_id: patientId, doctor_id: doctor.user.doctor_id, bed_id: bed.bed_id, department_id: 1, diagnosis: 'MAR test' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

async function freePatient() {
  const [[p]] = await db().query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE')
    AND patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS')) ORDER BY patient_id DESC LIMIT 1`);
  return p.patient_id;
}

async function prescribeAndDispense(patientId, items) {
  const rx = await api('POST', '/prescriptions', { token: doctor.token, body: { patient_id: patientId, doctor_id: doctor.user.doctor_id, items } });
  assert.equal(rx.status, 201, JSON.stringify(rx.body));
  const dispensed = await api('POST', `/prescriptions/${rx.body.data.id}/dispense`, { token: pharmacy.token });
  assert.equal(dispensed.status, 200, JSON.stringify(dispensed.body));
  return { prescriptionId: rx.body.data.id, doses: dispensed.body.doses_scheduled };
}

const order = (med, extra) => ({ medicine_id: med, dosage: '1 tab', frequency: 'free text', duration: 'free text', quantity: 10, route: 'ORAL', ...extra });
const doseRows = async (prescriptionId) => (await db().query(`SELECT ma.administration_id, ma.status, ma.reason, pi.frequency_code,
  DATE_FORMAT(ma.scheduled_at_utc, '%Y-%m-%d %H:%i:%s') AS scheduled FROM medication_administrations ma
  JOIN prescription_items pi ON pi.item_id = ma.prescription_item_id WHERE pi.prescription_id = ? ORDER BY ma.scheduled_at_utc, ma.administration_id`, [prescriptionId]))[0];
const giveBody = (patientId, extra) => ({ patient_confirmation: mrn(patientId), dose_given: '1 tab', route_given: 'ORAL', ...extra });

before(async () => {
  [reception, pharmacy, nurse, doctor, admin] = await Promise.all([USERS.RECEPTIONIST, USERS.PHARMACY, USERS.NURSE, USERS.DOCTOR, USERS.ADMIN].map(login));
  for (const m of Object.values(MEDS)) await setStock(m, 10000);
  patient = await freePatient();
  await admitToIcu(patient);
});

test('the demo seed (migration 008) gives the nurse a non-empty medication grid', async () => {
  const [[seed]] = await db().query("SELECT patient_id FROM prescriptions WHERE notes = 'Demo MAR seed (migration 008)'");
  const mar = await api('GET', `/mar/patients/${seed.patient_id}`, { token: nurse.token });
  assert.equal(mar.status, 200);
  assert.ok(mar.body.data.items.length >= 4);
  assert.ok(mar.body.data.items.some(i => i.schedule_type === 'PRN'));
  assert.ok(mar.body.data.items.flatMap(i => i.doses).length >= 10);
});

test('prescribing validates the structured order fields and keeps the free text', async () => {
  const bad = async (extra, msg) => {
    const res = await api('POST', '/prescriptions', { token: doctor.token, body: { patient_id: patient, doctor_id: doctor.user.doctor_id, items: [order(MEDS.A, extra)] } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, msg);
  };
  await bad({ frequency_code: 'HOURLY' }, /frequency_code must be one of/);
  await bad({ frequency_code: 'TDS' }, /duration_days is required with frequency_code TDS/);
  await bad({ frequency_code: 'OD', duration_days: 0 }, /duration_days must be a whole number/);
  await bad({ route: 'NASAL' }, /route must be one of/);
  const ok = await api('POST', '/prescriptions', { token: doctor.token, body: { patient_id: patient, doctor_id: doctor.user.doctor_id, items: [order(MEDS.A, { frequency_code: 'PRN' })] } });
  assert.equal(ok.status, 201);
  const [[item]] = await db().query('SELECT frequency, frequency_code, duration_days FROM prescription_items WHERE prescription_id = ?', [ok.body.data.id]);
  assert.deepEqual({ ...item }, { frequency: 'free text', frequency_code: 'PRN', duration_days: null });
});

test('dispensing schedules ward doses for an admitted patient, capped by duration and quantity; outpatients get none', async () => {
  const { prescriptionId, doses } = await prescribeAndDispense(patient, [
    order(MEDS.A, { frequency_code: 'TDS', duration_days: 5, quantity: 4 }),   // quantity caps at 4
    order(MEDS.B, { frequency_code: 'BD', duration_days: 1, quantity: 30 }),   // duration caps at 2
    order(MEDS.C, { frequency_code: 'PRN', quantity: 6 }),                     // no schedule
  ]);
  assert.equal(doses, 6);
  const rows = await doseRows(prescriptionId);
  assert.deepEqual(rows.map(r => r.frequency_code).sort(), ['BD', 'BD', 'TDS', 'TDS', 'TDS', 'TDS']);
  const now = toSqlUtc(new Date());
  assert.ok(rows.every(r => r.status === 'PENDING' && r.scheduled > now), 'all doses are in future ward slots');

  // An outpatient under dr.smith's care (no active admission).
  const [[outpatient]] = await db().query(`SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = ?
    AND patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE') LIMIT 1`, [doctor.user.doctor_id]);
  const out = await prescribeAndDispense(outpatient.patient_id, [order(MEDS.A, { frequency_code: 'TDS', duration_days: 3, quantity: 9 })]);
  assert.equal(out.doses, 0, 'take-home medicines are not put on a ward MAR');
});

test('the MAR read shows IST times, and overdue is computed when it is read', async () => {
  const { prescriptionId } = await prescribeAndDispense(patient, [order(MEDS.A, { frequency_code: 'Q6H', duration_days: 1, quantity: 4 })]);
  const [d1, d2, d3] = await doseRows(prescriptionId);
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(-61), d1.administration_id]);
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(-59), d2.administration_id]);
  // A 00:00 IST dose: the IST date is one day after its UTC date.
  await db().query("UPDATE medication_administrations SET scheduled_at_utc = '2031-03-14 18:30:00' WHERE administration_id = ?", [d3.administration_id]);

  const mar = (await api('GET', `/mar/patients/${patient}`, { token: nurse.token })).body.data;
  const doses = mar.items.flatMap(i => i.doses);
  const find = (id) => doses.find(d => d.administration_id === id);
  assert.equal(find(d1.administration_id).state, 'OVERDUE');
  assert.equal(find(d2.administration_id).state, 'PENDING');
  assert.equal(find(d3.administration_id).scheduled_ist, '15 Mar 2031, 00:00 IST');
  assert.equal(find(d3.administration_id).scheduled_ist_date, '2031-03-15');
  assert.equal(find(d3.administration_id).scheduled_at, '2031-03-14T18:30:00.000Z');
  assert.equal(mar.today_ist, istDate(new Date()));
  assert.match(mar.now_ist, / IST$/);
});

test('administering enforces the five rights', async () => {
  const { prescriptionId } = await prescribeAndDispense(patient, [order(MEDS.B, { frequency_code: 'TDS', duration_days: 1, quantity: 3, dosage: '500mg', route: 'ORAL' })]);
  const [dose, later] = await doseRows(prescriptionId);
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(-5), dose.administration_id]);
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(180), later.administration_id]);
  const give = (id, body) => api('POST', `/mar/doses/${id}/administer`, { token: nurse.token, body: { patient_confirmation: mrn(patient), dose_given: '500mg', route_given: 'ORAL', ...body } });

  const cases = [
    [{ patient_confirmation: mrn(patient + 1) }, 400, /Right patient/],
    [{ dose_given: '1000mg' }, 400, /Right dose/],
    [{ dose_given: '' }, 400, /Right dose/],
    [{ route_given: 'IV' }, 400, /Right route: this medicine is prescribed ORAL/],
  ];
  for (const [body, status, msg] of cases) {
    const res = await give(dose.administration_id, body);
    assert.equal(res.status, status, JSON.stringify(res.body));
    assert.match(res.body.message, msg);
  }
  const early = await give(later.administration_id, {});
  assert.equal(early.status, 409);
  assert.match(early.body.message, /Right time: this dose is not due until .* IST/);
  assert.equal((await doseRows(prescriptionId)).filter(r => r.status === 'PENDING').length, 3, 'rejected attempts changed nothing');

  const ok = await give(dose.administration_id, { patient_confirmation: String(patient), dose_given: ' 500MG ' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.late, false);
  const again = await give(dose.administration_id, {});
  assert.equal(again.status, 409);
  assert.match(again.body.message, /already ADMINISTERED/);
});

test('an overdue dose can still be given with a reason, and is recorded as late', async () => {
  const { prescriptionId } = await prescribeAndDispense(patient, [order(MEDS.C, { frequency_code: 'OD', duration_days: 1, quantity: 1 })]);
  const [dose] = await doseRows(prescriptionId);
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(-90), dose.administration_id]);
  const body = giveBody(patient);
  const noReason = await api('POST', `/mar/doses/${dose.administration_id}/administer`, { token: nurse.token, body });
  assert.equal(noReason.status, 400);
  assert.match(noReason.body.message, /reason is required for a dose given more than 60 minutes late/);
  const res = await api('POST', `/mar/doses/${dose.administration_id}/administer`, { token: nurse.token, body: { ...body, reason: 'Patient was in radiology' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.late, true);
  const [[row]] = await db().query('SELECT status, reason, recorded_by FROM medication_administrations WHERE administration_id = ?', [dose.administration_id]);
  assert.deepEqual({ ...row }, { status: 'ADMINISTERED', reason: 'Patient was in radiology', recorded_by: nurse.user.user_id });
});

test('refused and missed need a reason; a dose cannot be missed before it is due', async () => {
  const { prescriptionId } = await prescribeAndDispense(patient, [order(MEDS.A, { frequency_code: 'BD', duration_days: 1, quantity: 2 })]);
  const [d1, d2] = await doseRows(prescriptionId);
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(-120), d1.administration_id]);
  for (const action of ['refuse', 'missed']) {
    const res = await api('POST', `/mar/doses/${d1.administration_id}/${action}`, { token: nurse.token, body: { reason: '  ' } });
    assert.equal(res.status, 400);
  }
  const notYet = await api('POST', `/mar/doses/${d2.administration_id}/missed`, { token: nurse.token, body: { reason: 'n/a' } });
  assert.equal(notYet.status, 409);
  assert.equal((await api('POST', `/mar/doses/${d1.administration_id}/missed`, { token: nurse.token, body: { reason: 'Patient off the ward' } })).status, 200);
  assert.equal((await api('POST', `/mar/doses/${d1.administration_id}/refuse`, { token: nurse.token, body: { reason: 'x' } })).status, 409, 'a closed dose stays closed');
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(-10), d2.administration_id]);
  assert.equal((await api('POST', `/mar/doses/${d2.administration_id}/refuse`, { token: nurse.token, body: { reason: 'Nauseous' } })).status, 200);
  const rows = await doseRows(prescriptionId);
  assert.deepEqual(rows.map(r => [r.status, r.reason]).sort(), [['MISSED', 'Patient off the ward'], ['REFUSED', 'Nauseous']]);
});

test('PRN: each dose is recorded as given with a reason, up to the quantity dispensed', async () => {
  const { prescriptionId } = await prescribeAndDispense(patient, [order(MEDS.B, { frequency_code: 'PRN', quantity: 2, dosage: '400mg' }), order(MEDS.C, { frequency_code: 'OD', duration_days: 1, quantity: 1 })]);
  const [[prn]] = await db().query("SELECT item_id FROM prescription_items WHERE prescription_id = ? AND frequency_code = 'PRN'", [prescriptionId]);
  const [[sched]] = await db().query("SELECT item_id FROM prescription_items WHERE prescription_id = ? AND frequency_code = 'OD'", [prescriptionId]);
  const body = { patient_confirmation: mrn(patient), dose_given: '400mg', route_given: 'ORAL', reason: 'Pain 6/10' };
  const prnGive = (b) => api('POST', `/mar/items/${prn.item_id}/given`, { token: nurse.token, body: b });
  assert.equal((await prnGive({ ...body, reason: '' })).status, 400);
  assert.equal((await prnGive(body)).status, 201);
  assert.equal((await prnGive(body)).status, 201);
  const third = await prnGive(body);
  assert.equal(third.status, 409);
  assert.match(third.body.message, /already been given/);
  const wrongPath = await api('POST', `/mar/items/${sched.item_id}/given`, { token: nurse.token, body: { ...body, dose_given: '1 tab' } });
  assert.equal(wrongPath.status, 409);
  assert.match(wrongPath.body.message, /scheduled medicine/);
});

test('two nurses giving the same dose at once: exactly one succeeds', async () => {
  const { prescriptionId } = await prescribeAndDispense(patient, [order(MEDS.A, { frequency_code: 'OD', duration_days: 1, quantity: 1 })]);
  const [dose] = await doseRows(prescriptionId);
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(0), dose.administration_id]);
  const results = await Promise.all([1, 2].map(() => api('POST', `/mar/doses/${dose.administration_id}/administer`, { token: nurse.token, body: giveBody(patient) })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});

test('discharge cancels the pending doses and leaves recorded ones untouched', async () => {
  const p = await freePatient();
  const admissionId = await admitToIcu(p);
  const { prescriptionId } = await prescribeAndDispense(p, [order(MEDS.A, { frequency_code: 'TDS', duration_days: 2, quantity: 6 })]);
  const [first] = await doseRows(prescriptionId);
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(-1), first.administration_id]);
  assert.equal((await api('POST', `/mar/doses/${first.administration_id}/administer`, { token: nurse.token, body: giveBody(p) })).status, 200);

  const res = await api('POST', `/admissions/${admissionId}/discharge`, { token: doctor.token });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const rows = await doseRows(prescriptionId);
  assert.equal(rows.filter(r => r.status === 'ADMINISTERED').length, 1);
  assert.equal(rows.filter(r => r.status === 'CANCELLED' && r.reason === 'Patient discharged').length, 5);
  assert.equal(rows.filter(r => r.status === 'PENDING').length, 0);
  const [[audit]] = await db().query("SELECT details FROM audit_logs WHERE action = 'DISCHARGE_PATIENT' AND entity_id = ? ORDER BY audit_id DESC LIMIT 1", [admissionId]);
  assert.equal(audit.details.doses_cancelled, 5);
});

test('cancelling a prescription cancels its pending doses; it cannot then be dispensed or given', async () => {
  const { prescriptionId } = await prescribeAndDispense(patient, [order(MEDS.B, { frequency_code: 'BD', duration_days: 2, quantity: 4 })]);
  const other = await login(USERS.DOCTOR_2);
  assert.equal((await api('POST', `/prescriptions/${prescriptionId}/cancel`, { token: other.token })).status, 403, 'not under dr.patel\'s care');
  const res = await api('POST', `/prescriptions/${prescriptionId}/cancel`, { token: doctor.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.doses_cancelled, 4);
  assert.ok((await doseRows(prescriptionId)).every(r => r.status === 'CANCELLED' && r.reason === 'Prescription cancelled'));
  assert.equal((await api('POST', `/prescriptions/${prescriptionId}/cancel`, { token: doctor.token })).status, 409);
  assert.equal((await api('POST', `/prescriptions/${prescriptionId}/dispense`, { token: pharmacy.token })).status, 409);
});

test('who may read and record: assigned nurse writes; doctors read; others are refused', async () => {
  const { prescriptionId } = await prescribeAndDispense(patient, [order(MEDS.C, { frequency_code: 'OD', duration_days: 1, quantity: 1 })]);
  const [dose] = await doseRows(prescriptionId);
  assert.equal((await api('GET', `/mar/patients/${patient}`, { token: doctor.token })).status, 200);
  for (const user of [pharmacy, reception, admin]) assert.equal((await api('GET', `/mar/patients/${patient}`, { token: user.token })).status, 403);
  assert.equal((await api('POST', `/mar/doses/${dose.administration_id}/administer`, { token: doctor.token, body: giveBody(patient) })).status, 403);

  // A nurse without a ward assignment covering this patient.
  const u = `mar.n${Date.now() % 100000}`;
  await api('POST', '/auth/register', { token: admin.token, body: { username: u, password: 'Secret123!', role: 'NURSE', full_name: 'Unassigned Nurse', email: `${u}@hospital.test`, phone: '1' } });
  const other = (await api('POST', '/auth/login', { body: { username: u, password: 'Secret123!' } })).body.token;
  assert.equal((await api('GET', `/mar/patients/${patient}`, { token: other })).status, 403);
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(0), dose.administration_id]);
  const denied = await api('POST', `/mar/doses/${dose.administration_id}/administer`, { token: other, body: giveBody(patient) });
  assert.equal(denied.status, 403);
  assert.equal((await doseRows(prescriptionId))[0].status, 'PENDING');
});

test('administer, refuse and missed are audited in the same transaction, without the reason text', async () => {
  const { prescriptionId } = await prescribeAndDispense(patient, [order(MEDS.A, { frequency_code: 'TDS', duration_days: 1, quantity: 3 })]);
  const [a, b, c] = await doseRows(prescriptionId);
  // Distinct times: one item cannot have two doses in the same slot (uq_mar_item_slot).
  for (const [i, d] of [a, b, c].entries()) await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(-70 - i), d.administration_id]);
  await api('POST', `/mar/doses/${a.administration_id}/administer`, { token: nurse.token, body: giveBody(patient, { reason: 'SECRET-LATE-REASON' }) });
  await api('POST', `/mar/doses/${b.administration_id}/refuse`, { token: nurse.token, body: { reason: 'SECRET-REFUSE-REASON' } });
  await api('POST', `/mar/doses/${c.administration_id}/missed`, { token: nurse.token, body: { reason: 'SECRET-MISSED-REASON' } });
  const [rows] = await db().query("SELECT action, entity_id, details FROM audit_logs WHERE entity_type = 'medication_administration' AND entity_id IN (?) ORDER BY audit_id", [[a, b, c].map(d => d.administration_id)]);
  assert.deepEqual(rows.map(r => r.action), ['MAR_ADMINISTERED', 'MAR_REFUSED', 'MAR_MISSED']);
  assert.equal(rows[0].details.late, true);
  assert.ok(rows.every(r => r.details.reason_recorded === true));
  assert.doesNotMatch(JSON.stringify(rows), /SECRET-/);

  // If the audit row cannot be written, the administration does not happen.
  const { prescriptionId: rx2 } = await prescribeAndDispense(patient, [order(MEDS.B, { frequency_code: 'OD', duration_days: 1, quantity: 1 })]);
  const [d] = await doseRows(rx2);
  await db().query('UPDATE medication_administrations SET scheduled_at_utc = ? WHERE administration_id = ?', [minutesFromNow(0), d.administration_id]);
  await db().query('DROP TRIGGER IF EXISTS test_fail_mar_audit');
  await db().query(`CREATE TRIGGER test_fail_mar_audit BEFORE INSERT ON audit_logs FOR EACH ROW
    BEGIN IF NEW.action = 'MAR_ADMINISTERED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'simulated audit failure'; END IF; END`);
  try {
    const res = await api('POST', `/mar/doses/${d.administration_id}/administer`, { token: nurse.token, body: giveBody(patient) });
    assert.equal(res.status, 500);
  } finally {
    await db().query('DROP TRIGGER IF EXISTS test_fail_mar_audit');
  }
  assert.equal((await doseRows(rx2))[0].status, 'PENDING');
});

test('formatIst shows the hospital time', () => {
  assert.equal(formatIst(new Date('2026-10-09T18:30:00Z')), '10 Oct 2026, 00:00 IST');
});
