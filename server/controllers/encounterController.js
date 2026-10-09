const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');
const { isInDoctorCareSet } = require('../utils/patientAccess');
const { EncounterError, arriveAppointment, arriveWalkIn, transitionEncounter } = require('../utils/encounters');

const isId = (v) => /^[1-9]\d{0,9}$/.test(String(v));
const fail = (res, error) => res.status(error.status || 500).json({ success: false, message: error.message });

const ENCOUNTER_VIEW = `
  SELECT e.*, p.name AS patient_name, d.name AS doctor_name, a.appointment_date, a.appointment_time, a.status AS appointment_status
  FROM encounters e
  JOIN patients p ON p.patient_id = e.patient_id
  JOIN doctors d ON d.doctor_id = e.doctor_id
  LEFT JOIN appointments a ON a.appointment_id = e.appointment_id`;

const loadEncounter = async (id) => (await pool.execute(`${ENCOUNTER_VIEW} WHERE e.encounter_id = ?`, [id]))[0][0];

// Only the encounter's own doctor may start, finish or void it.
const ownDoctorOnly = (req) => async (encounter) => {
  if (req.user.role !== 'DOCTOR' || Number(encounter.doctor_id) !== Number(req.user.doctor_id)) {
    throw new EncounterError(403, 'Forbidden: only the encounter\'s doctor can do this');
  }
};

// GET /api/encounters/queue — open encounters (ARRIVED, TRIAGED, IN_PROGRESS); doctors see their own.
exports.queue = async (req, res) => {
  try {
    let sql = `${ENCOUNTER_VIEW} WHERE e.status IN ('ARRIVED', 'TRIAGED', 'IN_PROGRESS')`;
    const params = [];
    if (req.user.role === 'DOCTOR') { sql += ' AND e.doctor_id = ?'; params.push(req.user.doctor_id); }
    sql += " ORDER BY FIELD(e.status, 'IN_PROGRESS', 'TRIAGED', 'ARRIVED'), e.arrived_at";
    const [rows] = await pool.execute(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) { fail(res, error); }
};

// GET /api/encounters/:id — the encounter plus the ids of records written during it.
exports.getById = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid encounter id' });
    const encounter = await loadEncounter(req.params.id);
    if (!encounter) return res.status(404).json({ success: false, message: 'Encounter not found' });
    res.locals.auditPatientId = encounter.patient_id;
    if (req.user.role === 'DOCTOR' && Number(encounter.doctor_id) !== Number(req.user.doctor_id)
        && !(await isInDoctorCareSet(req.user.doctor_id, encounter.patient_id))) {
      return res.status(403).json({ success: false, message: 'Forbidden: patient is not under your care' });
    }
    const ids = async (table, key) => (await pool.execute(`SELECT ${key} FROM ${table} WHERE encounter_id = ? ORDER BY ${key}`, [encounter.encounter_id]))[0].map(r => r[key]);
    res.json({ success: true, data: {
      ...encounter,
      consultation_ids: await ids('consultations', 'consultation_id'),
      lab_order_ids: await ids('lab_orders', 'order_id'),
      prescription_ids: await ids('prescriptions', 'prescription_id'),
      surgery_request_ids: await ids('surgery_requests', 'request_id'),
    } });
  } catch (error) { fail(res, error); }
};

// POST /api/encounters — check in: { appointment_id } or a walk-in { patient_id, doctor_id }.
exports.arrive = async (req, res) => {
  try {
    const { appointment_id, patient_id, doctor_id } = req.body;
    if (appointment_id !== undefined && !isId(appointment_id)) return res.status(400).json({ success: false, message: 'Invalid appointment id' });
    const id = await withTransaction(req, (connection) => (appointment_id
      ? arriveAppointment(connection, req, appointment_id)
      : arriveWalkIn(connection, req, { patientId: patient_id, doctorId: doctor_id })));
    res.status(201).json({ success: true, data: await loadEncounter(id) });
  } catch (error) { fail(res, error); }
};

const transition = (action, authorizeFor) => async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid encounter id' });
    await withTransaction(req, (connection) => transitionEncounter(connection, req, req.params.id, action, authorizeFor && authorizeFor(req)));
    res.json({ success: true, data: await loadEncounter(req.params.id) });
  } catch (error) { fail(res, error); }
};

exports.triage = transition('triage');
exports.start = transition('start', ownDoctorOnly);
exports.finish = transition('finish', ownDoctorOnly);
exports.cancel = transition('cancel');
exports.enteredInError = transition('enteredInError', ownDoctorOnly);
