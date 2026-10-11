// 008_seed_mar_demo.js — demo data so a nurse's medication grid is not empty (step 6 decision 7).
//
// One admitted patient in nurse1's wards gets a prescription from their admitting doctor with
// structured orders (TDS, OD, PRN and a STAT dose), dispensed through the application's own
// dispense service: stock comes off batches FEFO, movements and audit rows are written, and the
// ward doses are scheduled from the moment this migration runs.
// Safe to re-run: skipped when the demo prescription already exists. Rolls back on any failure.
const path = require('path');
const { dispensePrescription } = require(path.join(__dirname, '..', '..', 'server', 'services', 'dispenseService'));
const { lockMedicines } = require(path.join(__dirname, '..', '..', 'server', 'utils', 'medicineLocks'));
const { writeAudit } = require(path.join(__dirname, '..', '..', 'server', 'utils', 'audit'));

const MARKER = 'Demo MAR seed (migration 008)';
const ORDERS = [
  // [medicine name, dosage, frequency text, duration text, quantity, code, days, route]
  ['Paracetamol 500mg', '500mg', 'Three times daily', '3 days', 9, 'TDS', 3, 'ORAL'],
  ['Omeprazole 20mg', '20mg', 'Once daily before breakfast', '5 days', 5, 'OD', 5, 'ORAL'],
  ['Ibuprofen 400mg', '400mg', 'As needed for pain, max three a day', '5 days', 6, 'PRN', null, 'ORAL'],
  ['Heparin 5000IU', '5000IU', 'Once, now', '1 day', 1, 'STAT', null, 'SC'],
];

exports.up = async (connection) => {
  const [[existing]] = await connection.execute('SELECT prescription_id FROM prescriptions WHERE notes = ?', [MARKER]);
  if (existing) return { skipped: true, prescription_id: existing.prescription_id };

  const [[admission]] = await connection.execute(`
    SELECT a.admission_id, a.patient_id, a.doctor_id, w.name AS ward
    FROM admissions a JOIN beds b ON b.bed_id = a.bed_id JOIN wards w ON w.ward_id = b.ward_id
    JOIN nurse_ward_assignments n ON n.ward_id = w.ward_id JOIN users u ON u.user_id = n.nurse_user_id AND u.username = 'nurse1'
    WHERE a.status = 'ACTIVE' ORDER BY (w.name = 'ICU Ward') DESC, a.admission_id LIMIT 1`);
  if (!admission) return { skipped: true, reason: 'no active admission in nurse1\'s wards' };
  const [[pharmacist]] = await connection.execute("SELECT user_id FROM users WHERE role = 'PHARMACY' AND is_active = TRUE ORDER BY user_id LIMIT 1");
  if (!pharmacist) throw new Error('008: no active pharmacy user to record the dispense against');

  const [medicines] = await connection.query('SELECT medicine_id, name FROM medicines WHERE name IN (?)', [ORDERS.map(o => o[0])]);
  const idOf = Object.fromEntries(medicines.map(m => [m.name, m.medicine_id]));
  const missing = ORDERS.filter(o => !idOf[o[0]]).map(o => o[0]);
  if (missing.length) throw new Error(`008: medicines not found: ${missing.join(', ')}`);

  // Audit rows say who did it: the migration (role MIGRATION); stock movements need a real user,
  // so they are recorded against the first pharmacy account.
  const req = { user: { user_id: pharmacist.user_id, role: 'MIGRATION' }, method: 'MIGRATION', ip: null, originalUrl: '008_seed_mar_demo.js' };
  await connection.beginTransaction();
  try {
    const [rx] = await connection.execute(
      'INSERT INTO prescriptions (patient_id, doctor_id, prescription_date, status, notes) VALUES (?, ?, NOW(), "CREATED", ?)',
      [admission.patient_id, admission.doctor_id, MARKER]
    );
    await lockMedicines(connection, ORDERS.map(o => idOf[o[0]]), 'share');
    for (const [name, dosage, frequency, duration, quantity, code, days, route] of ORDERS) {
      await connection.execute(
        `INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, duration, quantity, frequency_code, duration_days, route)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [rx.insertId, idOf[name], dosage, frequency, duration, quantity, code, days, route]
      );
    }
    await writeAudit(connection, { ...req, user: { user_id: null } }, { action: 'CREATE_PRESCRIPTION', role: 'MIGRATION', entityType: 'prescription', entityId: rx.insertId,
      patientId: admission.patient_id, details: { seed: '008_seed_mar_demo', item_count: ORDERS.length } });
    const result = await dispensePrescription(connection, req, rx.insertId);
    if (result.status !== 200) throw new Error(`008: dispense failed: ${result.body.message}`);
    await connection.commit();
    return { prescription_id: rx.insertId, patient_id: admission.patient_id, ward: admission.ward, doses_scheduled: result.body.doses_scheduled };
  } catch (e) {
    await connection.rollback();
    throw e;
  }
};
