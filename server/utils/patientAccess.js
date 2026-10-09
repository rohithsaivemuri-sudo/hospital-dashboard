const pool = require('../config/db');

// Patient-level access rules (report Section E, "Assigned Only"). Role gates live on the routes
// (middleware/auth.js authorize); these functions decide which patients a permitted role may see.
//
// DR*: a doctor's care set — patients they have an appointment, admission, consultation, lab order,
//      prescription or encounter with.
// NU*: a nurse's assigned patients — active admissions in wards the nurse is currently assigned to,
//      plus every open outpatient encounter (shared triage area).

const DOCTOR_CARE_SET_SQL = `
  SELECT patient_id FROM appointments WHERE doctor_id = ?
  UNION SELECT patient_id FROM admissions WHERE doctor_id = ?
  UNION SELECT patient_id FROM consultations WHERE doctor_id = ?
  UNION SELECT patient_id FROM lab_orders WHERE doctor_id = ?
  UNION SELECT patient_id FROM prescriptions WHERE doctor_id = ?
  UNION SELECT patient_id FROM encounters WHERE doctor_id = ?`;
const doctorCareSetParams = (doctorId) => Array(6).fill(doctorId);

// Wards with an assignment active today.
const NURSE_WARDS_SQL = `
  SELECT ward_id FROM nurse_ward_assignments
  WHERE nurse_user_id = ? AND start_date <= CURDATE() AND (end_date IS NULL OR end_date >= CURDATE())`;

const NURSE_PATIENTS_SQL = `
  SELECT a.patient_id FROM admissions a JOIN beds b ON b.bed_id = a.bed_id
  WHERE a.status = 'ACTIVE' AND b.ward_id IN (${NURSE_WARDS_SQL})
  UNION SELECT patient_id FROM encounters
  WHERE encounter_type = 'OUTPATIENT' AND status IN ('ARRIVED', 'TRIAGED', 'IN_PROGRESS')`;

async function isInDoctorCareSet(doctorId, patientId, connection = pool) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM (${DOCTOR_CARE_SET_SQL}) AS care_set WHERE patient_id = ? LIMIT 1`,
    [...doctorCareSetParams(doctorId), patientId]
  );
  return rows.length > 0;
}

async function isNurseAssignedPatient(nurseUserId, patientId, connection = pool) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM (${NURSE_PATIENTS_SQL}) AS assigned WHERE patient_id = ? LIMIT 1`, [nurseUserId, patientId]
  );
  return rows.length > 0;
}

// Which roles see which kind of patient data, and whether they see every patient ('all') or only
// their own ('assigned'). Roles not listed are denied.
const SCOPES = {
  demographics: { ADMIN: 'all', RECEPTIONIST: 'all', DOCTOR: 'assigned', NURSE: 'assigned' },
  clinical: { DOCTOR: 'assigned', NURSE: 'assigned' },
  prescriptions: { PHARMACY: 'all', DOCTOR: 'assigned', NURSE: 'assigned' },
  lab: { LABORATORY: 'all', DOCTOR: 'assigned', NURSE: 'assigned' },
};

async function canAccessPatient(user, patientId, scope) {
  const rule = SCOPES[scope] && SCOPES[scope][user.role];
  if (!rule) return false;
  if (rule === 'all') return true;
  if (user.role === 'DOCTOR') return isInDoctorCareSet(user.doctor_id, patientId);
  if (user.role === 'NURSE') return isNurseAssignedPatient(user.user_id, patientId);
  return false;
}

// SQL filter for list endpoints: returns { sql, params } restricting `column` to the patients the
// user may see for `scope`, or null when the user sees all of them. Throws for denied roles.
function patientFilter(user, scope, column = 'patient_id') {
  const rule = SCOPES[scope] && SCOPES[scope][user.role];
  if (!rule) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (rule === 'all') return null;
  if (user.role === 'DOCTOR') return { sql: `${column} IN (${DOCTOR_CARE_SET_SQL})`, params: doctorCareSetParams(user.doctor_id) };
  return { sql: `${column} IN (${NURSE_PATIENTS_SQL})`, params: [user.user_id] };
}

// Lab results and report files: Laboratory all, Doctor/Nurse assigned only.
const canAccessLabReports = (user, patientId) => canAccessPatient(user, patientId, 'lab');

module.exports = {
  isInDoctorCareSet, isNurseAssignedPatient, canAccessPatient, canAccessLabReports, patientFilter,
  NURSE_WARDS_SQL, NURSE_PATIENTS_SQL,
};
