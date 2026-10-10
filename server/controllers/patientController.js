const pool = require('../config/db');
const { withTransaction, changedFields, logAccess } = require('../utils/audit');

const PATIENT_FIELDS = ['name', 'date_of_birth', 'gender', 'blood_group', 'phone', 'address', 'emergency_contact'];
// Optional fields added later (ABHA, allergies): only written when the request includes them, so older
// callers that send the original seven fields never clear them.
const OPTIONAL_FIELDS = ['allergies', 'abha_number'];
const { normalizeAbha, formatAbha } = require('../utils/abha');

const textOrNull = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const isAbhaDuplicate = (e) => e.code === 'ER_DUP_ENTRY' && /uq_patients_abha/.test(e.message);
async function abhaConflict(res, abha, exceptId = null) {
  const [[other]] = await pool.execute('SELECT patient_id FROM patients WHERE abha_number = ? AND patient_id <> ?', [abha, exceptId ?? 0]);
  return res.status(409).json({ success: false, code: 'DUPLICATE_ABHA', message: `ABHA number ${formatAbha(abha)} is already registered to another patient`, existing_patient_id: other?.patient_id ?? null });
}
// Optional fields present in the body, validated: { values: {field: value}, error }.
function optionalValues(body) {
  const values = {};
  if ('allergies' in body) values.allergies = textOrNull(body.allergies);
  if ('abha_number' in body) {
    const abha = normalizeAbha(body.abha_number);
    if (abha.error) return { error: abha.error };
    values.abha_number = abha.value;
  }
  return { values };
}

const { canAccessPatient, patientFilter } = require('../utils/patientAccess');
const allowed = (req, patientId, scope) => canAccessPatient(req.user, patientId, scope);

exports.list = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `SELECT * FROM patients WHERE name LIKE ?`;
    let queryParams = [`%${search}%`];
    // Optional exact lookups (additive): ?phone= (digits compared) and ?abha_number= (any separators).
    if (req.query.phone) { query += ` AND REGEXP_REPLACE(phone, '[^0-9]', '') = ?`; queryParams.push(String(req.query.phone).replace(/\D/g, '')); }
    if (req.query.abha_number) {
      const abha = normalizeAbha(req.query.abha_number);
      if (abha.error) return res.status(400).json({ success: false, code: 'INVALID_ABHA', message: abha.error });
      query += ` AND abha_number = ?`; queryParams.push(abha.value);
    }
    
    // Doctors see their care set, nurses their assigned patients; front desk and admin see everyone.
    const scope = patientFilter(req.user, 'demographics');
    if (scope) { query += ` AND ${scope.sql}`; queryParams.push(...scope.params); }
    
    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), parseInt(offset));
    
    const [rows] = await pool.query(query, queryParams);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    const auth = await allowed(req, req.params.id, 'demographics');
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [rows] = await pool.execute('SELECT * FROM patients WHERE patient_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.create = async (req, res) => {
  const { name, date_of_birth, gender, blood_group, phone, address, emergency_contact } = req.body;
  const optional = optionalValues(req.body);
  if (optional.error) return res.status(400).json({ success: false, code: 'INVALID_ABHA', message: optional.error });
  const { allergies = null, abha_number = null } = optional.values;
  try {
    const id = await withTransaction(req, async (connection, audit) => {
      const [result] = await connection.execute('INSERT INTO patients (name, date_of_birth, gender, blood_group, phone, address, emergency_contact, allergies, abha_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [name, date_of_birth, gender, blood_group, phone, address, emergency_contact, allergies, abha_number]);
      // Flags only: never the allergy text or the ABHA number itself.
      await audit({ action: 'CREATE_PATIENT', entityType: 'patient', entityId: result.insertId, patientId: result.insertId, details: { abha_recorded: !!abha_number, allergies_recorded: !!allergies } });
      return result.insertId;
    });
    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    if (isAbhaDuplicate(error)) return abhaConflict(res, abha_number);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Registration duplicate check (POST so names and phone numbers stay out of URLs and proxy logs).
// Matches on the same ABHA, the same phone (digits compared), or the same name and date of birth.
exports.findDuplicates = async (req, res) => {
  try {
    const { name, date_of_birth, phone } = req.body || {};
    const abha = normalizeAbha(req.body?.abha_number);
    if (abha.error) return res.status(400).json({ success: false, code: 'INVALID_ABHA', message: abha.error });
    const phoneDigits = String(phone ?? '').replace(/\D/g, '');
    const clauses = []; const params = [];
    if (abha.value) { clauses.push('abha_number = ?'); params.push(abha.value); }
    if (phoneDigits) { clauses.push(`REGEXP_REPLACE(phone, '[^0-9]', '') = ?`); params.push(phoneDigits); }
    if (textOrNull(name) && date_of_birth) { clauses.push('(name = ? AND date_of_birth = ?)'); params.push(textOrNull(name), date_of_birth); }
    if (!clauses.length) return res.json({ success: true, data: [] });
    const [rows] = await pool.execute(
      `SELECT patient_id, name, date_of_birth, gender, phone, abha_number FROM patients WHERE ${clauses.join(' OR ')} ORDER BY patient_id LIMIT 20`, params);
    const data = rows.map(r => {
      const matched_on = [
        abha.value && r.abha_number === abha.value && 'abha_number',
        phoneDigits && String(r.phone ?? '').replace(/\D/g, '') === phoneDigits && 'phone',
      ].filter(Boolean);
      // Anything else matched the name clause (SQL compares case- and accent-insensitively).
      const dob = r.date_of_birth instanceof Date ? `${r.date_of_birth.getFullYear()}-${String(r.date_of_birth.getMonth() + 1).padStart(2, '0')}-${String(r.date_of_birth.getDate()).padStart(2, '0')}` : String(r.date_of_birth);
      if (!matched_on.length || (textOrNull(name) && dob === String(date_of_birth).slice(0, 10) && r.name.toLowerCase() === textOrNull(name).toLowerCase())) matched_on.push('name_and_date_of_birth');
      return { ...r, matched_on: [...new Set(matched_on)] };
    });
    logAccess(req, { action: 'CHECK_DUPLICATE_PATIENT', statusCode: 200, entityType: 'patients', details: { matches: data.length } });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.update = async (req, res) => {
  const optional = optionalValues(req.body);
  if (optional.error) return res.status(400).json({ success: false, code: 'INVALID_ABHA', message: optional.error });
  const extra = Object.keys(optional.values).filter(f => OPTIONAL_FIELDS.includes(f));
  try {
    const { name, date_of_birth, gender, blood_group, phone, address, emergency_contact } = req.body;
    await withTransaction(req, async (connection, audit) => {
      const [[before]] = await connection.execute('SELECT * FROM patients WHERE patient_id = ? FOR UPDATE', [req.params.id]);
      await connection.execute(`UPDATE patients SET name = ?, date_of_birth = ?, gender = ?, blood_group = ?, phone = ?, address = ?, emergency_contact = ?${extra.map(f => `, ${f} = ?`).join('')} WHERE patient_id = ?`,
        [name, date_of_birth, gender, blood_group, phone, address, emergency_contact, ...extra.map(f => optional.values[f]), req.params.id]);
      const changed = before ? changedFields(before, { ...req.body, ...optional.values }, [...PATIENT_FIELDS, ...extra]) : [];
      if (changed.length) await audit({ action: 'UPDATE_PATIENT', entityType: 'patient', entityId: before.patient_id, patientId: before.patient_id, details: { changed_fields: changed } });
    });
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) {
    if (isAbhaDuplicate(error)) return abhaConflict(res, optional.values.abha_number, Number(req.params.id));
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getHistory = async (req, res) => {
  try {
    const patient_id = req.params.id;
    const auth = await allowed(req, patient_id, 'clinical');
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [admissions] = await pool.execute('SELECT * FROM admissions WHERE patient_id = ? ORDER BY admission_date DESC', [patient_id]);
    const [appointments] = await pool.execute('SELECT * FROM appointments WHERE patient_id = ? ORDER BY appointment_date DESC', [patient_id]);
    const [prescriptions] = await pool.execute(`
      SELECT p.*, 
        (SELECT GROUP_CONCAT(CONCAT(m.name, ' — ', pi.dosage, ' — ', pi.frequency, ' — ', pi.duration, ' — Qty ', pi.quantity) SEPARATOR '\n')
         FROM prescription_items pi
         JOIN medicines m ON pi.medicine_id = m.medicine_id
         WHERE pi.prescription_id = p.prescription_id
        ) as medication_details
      FROM prescriptions p 
      WHERE p.patient_id = ? 
      ORDER BY p.prescription_date DESC
    `, [patient_id]);
    const [labs] = await pool.execute('SELECT lo.*, lt.name as test_name FROM lab_orders lo JOIN lab_tests lt ON lo.test_id = lt.test_id WHERE lo.patient_id = ? ORDER BY lo.order_date DESC', [patient_id]);
    const [consultations] = await pool.execute('SELECT * FROM consultations WHERE patient_id = ? ORDER BY consultation_time DESC', [patient_id]);
    const [surgeries] = await pool.execute('SELECT * FROM surgery_requests WHERE patient_id = ? ORDER BY requested_date DESC', [patient_id]);
    const [encounters] = await pool.execute(`
      SELECT e.encounter_id, e.doctor_id, d.name AS doctor_name, e.appointment_id, e.admission_id, e.encounter_type, e.status,
             e.arrived_at, e.triaged_at, e.start_timestamp, e.end_timestamp
      FROM encounters e JOIN doctors d ON d.doctor_id = e.doctor_id
      WHERE e.patient_id = ? ORDER BY COALESCE(e.arrived_at, e.created_at) DESC`, [patient_id]);

    // Nurses get the same shape without consultation notes or surgery requests.
    const isNurse = req.user.role === 'NURSE';
    res.json({ success: true, data: { admissions, appointments, prescriptions, labs, consultations: isNurse ? [] : consultations, surgeries: isNurse ? [] : surgeries, encounters } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getAdmissions = async (req, res) => {
  try {
    const auth = await allowed(req, req.params.id, 'demographics');
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [rows] = await pool.execute('SELECT * FROM admissions WHERE patient_id = ?', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getAppointments = async (req, res) => {
  try {
    const auth = await allowed(req, req.params.id, 'demographics');
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [rows] = await pool.execute('SELECT * FROM appointments WHERE patient_id = ?', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getPrescriptions = async (req, res) => {
  try {
    const auth = await allowed(req, req.params.id, 'prescriptions');
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [rows] = await pool.execute('SELECT * FROM prescriptions WHERE patient_id = ?', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getLabResults = async (req, res) => {
  try {
    const auth = await allowed(req, req.params.id, 'lab');
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [rows] = await pool.execute('SELECT l.*, r.* FROM lab_orders l LEFT JOIN lab_results r ON l.order_id = r.order_id WHERE l.patient_id = ?', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
