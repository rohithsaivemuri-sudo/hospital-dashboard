const pool = require('../config/db');

// A doctor's care set: patients they have an appointment, admission, consultation, lab order
// or prescription with. Same definition the controllers' checkDoctorAuth helpers use.
async function isInDoctorCareSet(doctorId, patientId, connection = pool) {
  const [rows] = await connection.execute(`
    SELECT 1 FROM (
      SELECT patient_id FROM appointments WHERE doctor_id = ? AND patient_id = ?
      UNION SELECT patient_id FROM admissions WHERE doctor_id = ? AND patient_id = ?
      UNION SELECT patient_id FROM consultations WHERE doctor_id = ? AND patient_id = ?
      UNION SELECT patient_id FROM lab_orders WHERE doctor_id = ? AND patient_id = ?
      UNION SELECT patient_id FROM prescriptions WHERE doctor_id = ? AND patient_id = ?
    ) AS care_set LIMIT 1
  `, [doctorId, patientId, doctorId, patientId, doctorId, patientId, doctorId, patientId, doctorId, patientId]);
  return rows.length > 0;
}

// Lab results and report files (report Section E: Laboratory allowed, Doctor/Nurse assigned only,
// everyone else denied). Nurse assignment arrives with ward assignments in step 4b; until then
// nurses are denied.
async function canAccessLabReports(user, patientId) {
  if (user.role === 'LABORATORY') return true;
  if (user.role === 'DOCTOR') return isInDoctorCareSet(user.doctor_id, patientId);
  return false;
}

module.exports = { isInDoctorCareSet, canAccessLabReports };
