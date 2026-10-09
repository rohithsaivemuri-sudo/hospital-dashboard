const pool = require('../config/db');
const { lockMedicines } = require('../utils/medicineLocks');
const { dispensePrescription } = require('../services/dispenseService');
const { cancelPendingDoses } = require('../services/marService');
const { FREQUENCY_CODES, ROUTES } = require('../utils/marTime');

// Optional structured order fields per item (free-text dosage/frequency/duration stay required).
function structuredFields(item, index) {
  const bad = (msg) => Object.assign(new Error(`Item ${index + 1}: ${msg}`), { status: 400 });
  const code = item.frequency_code || null;
  if (code && !FREQUENCY_CODES.includes(code)) throw bad(`frequency_code must be one of ${FREQUENCY_CODES.join(', ')}`);
  const route = item.route || null;
  if (route && !ROUTES.includes(route)) throw bad(`route must be one of ${ROUTES.join(', ')}`);
  const int = (v, name, max) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > max) throw bad(`${name} must be a whole number from 1 to ${max}`);
    return n;
  };
  const durationDays = int(item.duration_days, 'duration_days', 365);
  const unitsPerDose = int(item.units_per_dose, 'units_per_dose', 100);
  if (code && !['STAT', 'PRN'].includes(code) && !durationDays) throw bad(`duration_days is required with frequency_code ${code}`);
  return { code, route, durationDays, unitsPerDose };
}
const { writeAudit } = require('../utils/audit');
const { resolveEncounterForRecord } = require('../utils/encounters');

const { canAccessPatient, patientFilter } = require('../utils/patientAccess');
const checkDoctorAuth = (req, patientId, scope = 'prescriptions') => canAccessPatient(req.user, patientId, scope);

exports.list = async (req, res) => {
  try {
    let query = `
      SELECT p.*, pat.name as patientName,
        TIMESTAMPDIFF(YEAR, pat.date_of_birth, CURDATE()) as patient_age, pat.allergies as patient_allergies,
        (SELECT GROUP_CONCAT(m.name SEPARATOR ', ')
         FROM prescription_items pi
         JOIN medicines m ON pi.medicine_id = m.medicine_id
         WHERE pi.prescription_id = p.prescription_id
        ) as medication
      FROM prescriptions p 
      JOIN patients pat ON p.patient_id = pat.patient_id
    `;
    let params = [];
    if (req.user.role === 'DOCTOR') {
      // Doctors keep seeing the prescriptions they wrote.
      query += ` WHERE p.doctor_id = ? `;
      params.push(req.user.doctor_id);
    } else if (req.user.role === 'NURSE') {
      const scope = patientFilter(req.user, 'prescriptions', 'p.patient_id');
      query += ` WHERE ${scope.sql} `;
      params.push(...scope.params);
    }
    
    query += ` ORDER BY p.prescription_date DESC`;
    
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
};

exports.create = async (req, res) => {
  if (req.user.role === 'PHARMACY' || req.user.role === 'LABORATORY') return res.status(403).json({ success: false, message: 'Forbidden' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { consultation_id, encounter_id, patient_id, doctor_id, items, notes } = req.body;
    
    if (req.user.role === 'DOCTOR') {
      if (parseInt(doctor_id) !== parseInt(req.user.doctor_id)) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: 'Forbidden: Cannot create prescription for another doctor' });
      }
      const auth = await checkDoctorAuth(req, patient_id, 'clinical');
      if (!auth) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: 'Forbidden: Patient not associated' });
      }
    }

    const encounterId = await resolveEncounterForRecord(connection, { encounterId: encounter_id, patientId: patient_id, doctorId: doctor_id, consultationId: consultation_id });
    const [result] = await connection.execute('INSERT INTO prescriptions (consultation_id, patient_id, doctor_id, prescription_date, status, notes, encounter_id) VALUES (?, ?, ?, NOW(), "CREATED", ?, ?)', [consultation_id || null, patient_id, doctor_id, notes || null, encounterId]);
    const prescription_id = result.insertId;
    // Each prescription_items insert takes a shared FK lock on its medicines row. Take those
    // locks up front in medicine_id order so prescribing cannot deadlock with dispensing.
    await lockMedicines(connection, items.map(item => item.medicine_id), 'share');
    for (const [index, item] of items.entries()) {
      const f = structuredFields(item, index);
      await connection.execute(
        'INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, duration, quantity, frequency_code, duration_days, route, units_per_dose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [prescription_id, item.medicine_id, item.dosage, item.frequency, item.duration, item.quantity, f.code, f.durationDays, f.route, f.unitsPerDose]
      );
    }
    await writeAudit(connection, req, { action: 'CREATE_PRESCRIPTION', entityType: 'prescription', entityId: prescription_id, patientId: patient_id,
      details: { consultation_id: consultation_id ? Number(consultation_id) : null, encounter_id: encounterId, medicine_ids: items.map(item => Number(item.medicine_id)), item_count: items.length } });
    await connection.commit();
    res.status(201).json({ success: true, data: { id: prescription_id } });
  } catch (error) { 
    await connection.rollback();
    res.status(error.status || 500).json({ success: false, message: error.message }); 
  } finally {
    connection.release();
  }
};

exports.getById = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT p.*, pat.name AS patient_name, TIMESTAMPDIFF(YEAR, pat.date_of_birth, CURDATE()) AS patient_age, pat.allergies AS patient_allergies
      FROM prescriptions p JOIN patients pat ON pat.patient_id = p.patient_id
      WHERE p.prescription_id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.locals.auditPatientId = rows[0].patient_id;
    
    if (!(await checkDoctorAuth(req, rows[0].patient_id))) return res.status(403).json({ success: false, message: 'Forbidden: this patient is not under your care' });

    const [items] = await pool.execute(`
      SELECT pi.*, m.name as medicine_name, m.stock_quantity 
      FROM prescription_items pi
      JOIN medicines m ON pi.medicine_id = m.medicine_id
      WHERE pi.prescription_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: { ...rows[0], items } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getByPatient = async (req, res) => {
  try {
    if (!(await checkDoctorAuth(req, req.params.patientId))) return res.status(403).json({ success: false, message: 'Forbidden: this patient is not under your care' });
    
    let query = `
      SELECT p.*, pat.name as patientName,
        (SELECT GROUP_CONCAT(m.name SEPARATOR ', ')
         FROM prescription_items pi
         JOIN medicines m ON pi.medicine_id = m.medicine_id
         WHERE pi.prescription_id = p.prescription_id
        ) as medication
      FROM prescriptions p 
      JOIN patients pat ON p.patient_id = pat.patient_id
      WHERE p.patient_id = ?
      ORDER BY p.prescription_date DESC
    `;
    const [rows] = await pool.execute(query, [req.params.patientId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.dispense = async (req, res) => {
  if (req.user.role !== 'PHARMACY') return res.status(403).json({ success: false, message: 'Forbidden: Only pharmacy staff can dispense medicine' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await dispensePrescription(connection, req, req.params.id);
    if (result.status === 200) await connection.commit();
    else await connection.rollback();
    res.status(result.status).json(result.body);
  } catch (error) { 
    await connection.rollback();
    res.status(500).json({ success: false, message: error.message }); 
  } finally {
    connection.release();
  }
};

// POST /api/prescriptions/:id/cancel { reason } — the prescribing team stops a prescription.
// Any doses still pending on the ward are cancelled in the same transaction (decision: not left pending).
exports.cancel = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[rx]] = await connection.execute('SELECT prescription_id, patient_id, status FROM prescriptions WHERE prescription_id = ? FOR UPDATE', [req.params.id]);
    if (!rx) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Prescription not found' }); }
    if (!(await checkDoctorAuth(req, rx.patient_id, 'clinical'))) { await connection.rollback(); return res.status(403).json({ success: false, message: 'Forbidden: this patient is not under your care' }); }
    if (rx.status === 'CANCELLED') { await connection.rollback(); return res.status(409).json({ success: false, message: 'Prescription is already cancelled' }); }
    await connection.execute('UPDATE prescriptions SET status = "CANCELLED" WHERE prescription_id = ?', [rx.prescription_id]);
    const dosesCancelled = await cancelPendingDoses(connection, { prescriptionId: rx.prescription_id, reason: 'Prescription cancelled', userId: req.user.user_id });
    await writeAudit(connection, req, { action: 'CANCEL_PRESCRIPTION', entityType: 'prescription', entityId: rx.prescription_id, patientId: rx.patient_id,
      details: { from: rx.status, to: 'CANCELLED', doses_cancelled: dosesCancelled } });
    await connection.commit();
    res.json({ success: true, message: 'Prescription cancelled', data: { doses_cancelled: dosesCancelled } });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};
