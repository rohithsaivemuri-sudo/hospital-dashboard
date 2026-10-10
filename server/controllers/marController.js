const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');
const { canAccessPatient, isNurseAssignedPatient } = require('../utils/patientAccess');
const { loadMar } = require('../services/marService');
const { toSqlUtc, fromSqlUtc, formatIst, OVERDUE_AFTER_MIN, EARLY_LIMIT_MIN, ROUTES } = require('../utils/marTime');

const isId = (v) => /^[1-9]\d{0,9}$/.test(String(v));
const MINUTE = 60 * 1000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const respondError = (res, error) => res.status(error.status || 500).json({ success: false, message: error.message });
const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// "MRN-000016", "000016" or "16" -> 16
const patientFromConfirmation = (v) => {
  const m = String(v ?? '').trim().match(/^(?:MRN-?)?0*(\d{1,10})$/i);
  return m ? Number(m[1]) : null;
};

const cleanReason = (reason, required, what) => {
  const r = String(reason ?? '').trim();
  if (required && !r) throw fail(400, `A reason is required ${what}`);
  if (r.length > 255) throw fail(400, 'Reason must be 255 characters or fewer');
  return r || null;
};

// GET /api/mar/patients/:patientId — the patient's MAR (nurse: assigned patients; doctor: care set).
exports.patientMar = async (req, res) => {
  try {
    if (!isId(req.params.patientId)) return res.status(400).json({ success: false, message: 'Invalid patient id' });
    res.locals.auditPatientId = Number(req.params.patientId);
    if (!(await canAccessPatient(req.user, req.params.patientId, 'clinical'))) {
      return res.status(403).json({ success: false, message: 'Forbidden: this patient is not under your care' });
    }
    const [[patient]] = await pool.execute(
      'SELECT patient_id, name, gender, allergies, TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS age FROM patients WHERE patient_id = ?', [req.params.patientId]
    );
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
    const [[admission]] = await pool.execute(`
      SELECT a.admission_id, b.bed_number, w.name AS ward_name FROM admissions a JOIN beds b ON b.bed_id = a.bed_id JOIN wards w ON w.ward_id = b.ward_id
      WHERE a.patient_id = ? AND a.status = 'ACTIVE' ORDER BY a.admission_id DESC LIMIT 1`, [req.params.patientId]);
    const mar = await loadMar(pool, req.params.patientId);
    res.json({ success: true, data: { patient, admission: admission || null, ...mar } });
  } catch (error) { respondError(res, error); }
};

// Locks one scheduled dose with its order and checks the nurse may act on it.
async function lockDose(connection, req) {
  if (!isId(req.params.id)) throw fail(400, 'Invalid dose id');
  const [[dose]] = await connection.execute(`
    SELECT ma.administration_id, ma.status, ma.patient_id, ma.prescription_item_id,
           DATE_FORMAT(ma.scheduled_at_utc, '%Y-%m-%d %H:%i:%s') AS scheduled_at_utc,
           pi.medicine_id, pi.dosage, pi.route, pi.dispensed, p.status AS prescription_status, m.name AS medicine_name
    FROM medication_administrations ma
    JOIN prescription_items pi ON pi.item_id = ma.prescription_item_id
    JOIN prescriptions p ON p.prescription_id = pi.prescription_id
    JOIN medicines m ON m.medicine_id = pi.medicine_id
    WHERE ma.administration_id = ? FOR UPDATE`, [req.params.id]);
  if (!dose) throw fail(404, 'Dose not found');
  if (!(await isNurseAssignedPatient(req.user.user_id, dose.patient_id, connection))) throw fail(403, 'Forbidden: this patient is not assigned to you');
  if (dose.status !== 'PENDING') throw fail(409, `This dose is already ${dose.status}`);
  if (!dose.dispensed || dose.prescription_status === 'CANCELLED') throw fail(409, 'This medicine is not active for the patient');
  return { ...dose, scheduled: fromSqlUtc(dose.scheduled_at_utc) };
}

// The bedside checks every administration must pass (WHO "Five Rights").
function checkFiveRights(order, { patientId, patient_confirmation, dose_given, route_given }) {
  if (patientFromConfirmation(patient_confirmation) !== Number(patientId)) {
    throw fail(400, 'Right patient: the confirmed MRN does not match this patient\'s wristband');
  }
  if (!String(dose_given ?? '').trim()) throw fail(400, 'Right dose: record the dose given');
  if (norm(dose_given) !== norm(order.dosage)) throw fail(400, `Right dose: the dose given does not match the prescribed dose (${order.dosage})`);
  if (!ROUTES.includes(route_given)) throw fail(400, `Right route: route_given must be one of ${ROUTES.join(', ')}`);
  if (order.route && route_given !== order.route) throw fail(400, `Right route: this medicine is prescribed ${order.route}`);
}

const doseAudit = (action, dose, details) => ({
  action, entityType: 'medication_administration', entityId: dose.administration_id, patientId: dose.patient_id,
  details: { item_id: dose.prescription_item_id, medicine_id: dose.medicine_id, scheduled_at: dose.scheduled ? dose.scheduled.toISOString() : null, ...details },
});

// POST /api/mar/doses/:id/administer { patient_confirmation, dose_given, route_given, reason? }
exports.administer = async (req, res) => {
  try {
    const now = new Date();
    const result = await withTransaction(req, async (connection, audit) => {
      const dose = await lockDose(connection, req);
      checkFiveRights(dose, { patientId: dose.patient_id, ...req.body });
      // Right time: not more than 60 minutes early; more than 60 minutes late needs a reason.
      const minutesLate = (now - dose.scheduled) / MINUTE;
      if (minutesLate < -EARLY_LIMIT_MIN) throw fail(409, `Right time: this dose is not due until ${formatIst(dose.scheduled)}`);
      const late = minutesLate > OVERDUE_AFTER_MIN;
      const reason = cleanReason(req.body.reason, late, 'for a dose given more than 60 minutes late');
      await connection.execute(
        `UPDATE medication_administrations SET status = 'ADMINISTERED', administered_at_utc = ?, dose_given = ?, route_given = ?, reason = ?,
         recorded_by = ?, recorded_at_utc = ? WHERE administration_id = ?`,
        [toSqlUtc(now), String(req.body.dose_given).trim(), req.body.route_given, reason, req.user.user_id, toSqlUtc(now), dose.administration_id]
      );
      await audit(doseAudit('MAR_ADMINISTERED', dose, { from: 'PENDING', to: 'ADMINISTERED', administered_at: now.toISOString(), late, minutes_late: Math.max(0, Math.round(minutesLate)), reason_recorded: Boolean(reason) }));
      return { administration_id: dose.administration_id, administered_ist: formatIst(now), late };
    });
    res.json({ success: true, message: 'Dose recorded as given', data: result });
  } catch (error) { respondError(res, error); }
};

// POST /api/mar/doses/:id/refuse { reason } | /missed { reason }
const closeDose = (status) => async (req, res) => {
  try {
    const now = new Date();
    await withTransaction(req, async (connection, audit) => {
      const dose = await lockDose(connection, req);
      const reason = cleanReason(req.body.reason, true, `to record a ${status.toLowerCase()} dose`);
      if (status === 'MISSED' && now < dose.scheduled) throw fail(409, `This dose is not due until ${formatIst(dose.scheduled)}; it cannot be missed yet`);
      if (status === 'REFUSED' && (now - dose.scheduled) / MINUTE < -EARLY_LIMIT_MIN) throw fail(409, `This dose is not due until ${formatIst(dose.scheduled)}`);
      await connection.execute(
        'UPDATE medication_administrations SET status = ?, reason = ?, recorded_by = ?, recorded_at_utc = ? WHERE administration_id = ?',
        [status, reason, req.user.user_id, toSqlUtc(now), dose.administration_id]
      );
      await audit(doseAudit(`MAR_${status}`, dose, { from: 'PENDING', to: status, reason_recorded: true }));
    });
    res.json({ success: true, message: `Dose recorded as ${status.toLowerCase()}` });
  } catch (error) { respondError(res, error); }
};
exports.refuse = closeDose('REFUSED');
exports.missed = closeDose('MISSED');

// POST /api/mar/items/:itemId/given { patient_confirmation, dose_given, route_given, reason }
// PRN (and unscheduled free-text) orders: the nurse records each dose as given, with a reason.
exports.givenAsNeeded = async (req, res) => {
  try {
    if (!isId(req.params.itemId)) return res.status(400).json({ success: false, message: 'Invalid item id' });
    const now = new Date();
    const result = await withTransaction(req, async (connection, audit) => {
      const [[item]] = await connection.execute(`
        SELECT pi.item_id, pi.medicine_id, pi.dosage, pi.route, pi.frequency_code, pi.quantity, COALESCE(pi.units_per_dose, 1) AS units_per_dose,
               pi.dispensed, p.status AS prescription_status, p.patient_id
        FROM prescription_items pi JOIN prescriptions p ON p.prescription_id = pi.prescription_id
        WHERE pi.item_id = ? FOR UPDATE`, [req.params.itemId]);
      if (!item) throw fail(404, 'Medication order not found');
      if (!(await isNurseAssignedPatient(req.user.user_id, item.patient_id, connection))) throw fail(403, 'Forbidden: this patient is not assigned to you');
      if (!item.dispensed || item.prescription_status === 'CANCELLED') throw fail(409, 'This medicine is not active for the patient');
      if (item.frequency_code && item.frequency_code !== 'PRN') throw fail(409, 'This is a scheduled medicine: record it against its scheduled dose');
      const [[admission]] = await connection.execute('SELECT admission_id FROM admissions WHERE patient_id = ? AND status = "ACTIVE" ORDER BY admission_id DESC LIMIT 1', [item.patient_id]);
      if (!admission) throw fail(409, 'The patient is not admitted');
      checkFiveRights(item, { patientId: item.patient_id, ...req.body });
      const reason = cleanReason(req.body.reason, true, 'for an as-needed dose');
      const [[{ given }]] = await connection.execute(
        "SELECT COUNT(*) AS given FROM medication_administrations WHERE prescription_item_id = ? AND status = 'ADMINISTERED'", [item.item_id]
      );
      if ((Number(given) + 1) * item.units_per_dose > item.quantity) throw fail(409, 'All of the dispensed quantity has already been given');
      const [ins] = await connection.execute(
        `INSERT INTO medication_administrations (prescription_item_id, patient_id, admission_id, status, administered_at_utc, dose_given, route_given, reason, recorded_by, recorded_at_utc)
         VALUES (?, ?, ?, 'ADMINISTERED', ?, ?, ?, ?, ?, ?)`,
        [item.item_id, item.patient_id, admission.admission_id, toSqlUtc(now), String(req.body.dose_given).trim(), req.body.route_given, reason, req.user.user_id, toSqlUtc(now)]
      );
      await audit({ action: 'MAR_PRN_GIVEN', entityType: 'medication_administration', entityId: ins.insertId, patientId: item.patient_id,
        details: { item_id: item.item_id, medicine_id: item.medicine_id, administered_at: now.toISOString(), reason_recorded: true } });
      return { administration_id: ins.insertId, administered_ist: formatIst(now) };
    });
    res.status(201).json({ success: true, message: 'Dose recorded as given', data: result });
  } catch (error) { respondError(res, error); }
};
