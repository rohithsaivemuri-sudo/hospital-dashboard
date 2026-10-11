const pool = require('../config/db');
const { writeAudit } = require('../utils/audit');
const { NURSE_WARDS_SQL } = require('../utils/patientAccess');
const { cancelPendingDoses } = require('../services/marService');
const realtime = require('../utils/realtime');

const atMaxMessage = (d) => `${d.name} is at maximum workload (${d.current_workload} of ${d.max_workload} patients). Choose another doctor or discharge a patient first.`;
exports.list = async (req, res) => {
  try {
    let query = `
      SELECT a.*, p.name as patient_name, b.bed_number
      FROM admissions a
      LEFT JOIN patients p ON a.patient_id = p.patient_id
      LEFT JOIN beds b ON a.bed_id = b.bed_id
    `;
    let params = [];
    
    if (req.user.role === 'DOCTOR') {
      query += ` WHERE a.doctor_id = ?`;
      params.push(req.user.doctor_id);
    } else if (req.user.role === 'NURSE') {
      // Nurses see admissions in the wards they are currently assigned to.
      query += ` WHERE b.ward_id IN (${NURSE_WARDS_SQL})`;
      params.push(req.user.user_id);
    }
    
    query += ` ORDER BY a.admission_date DESC`;
    
    const [rows] = await pool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getCurrent = async (req, res) => {
  try {
    let query = `
      SELECT a.*, p.name as patient_name, b.bed_number as bed_name 
      FROM admissions a
      LEFT JOIN patients p ON a.patient_id = p.patient_id
      LEFT JOIN beds b ON a.bed_id = b.bed_id
      WHERE a.status = "ACTIVE"
    `;
    let params = [];
    if (req.user.role === 'DOCTOR') {
      query += ' AND a.doctor_id = ?';
      params.push(req.user.doctor_id);
    } else if (req.user.role === 'NURSE') {
      query += ` AND b.ward_id IN (${NURSE_WARDS_SQL})`;
      params.push(req.user.user_id);
    }
    const [rows] = await pool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    let query = 'SELECT a.* FROM admissions a JOIN beds b ON b.bed_id = a.bed_id WHERE a.admission_id = ?';
    let params = [req.params.id];
    if (req.user.role === 'DOCTOR') {
      query += ' AND a.doctor_id = ?';
      params.push(req.user.doctor_id);
    } else if (req.user.role === 'NURSE') {
      query += ` AND b.ward_id IN (${NURSE_WARDS_SQL})`;
      params.push(req.user.user_id);
    }
    const [rows] = await pool.execute(query, params);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.create = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { patient_id, doctor_id, bed_id, department_id, diagnosis, notes } = req.body;
    let assignedDoctorId = doctor_id;
    let assignedDepartmentId = department_id;
    
    // Doctors can only admit patients already in their authorized care set.
    if (req.user.role === 'DOCTOR') {
      const [[authorizedPatient]] = await connection.execute(`
        SELECT 1 FROM (
          SELECT patient_id FROM appointments WHERE doctor_id = ? AND patient_id = ?
          UNION SELECT patient_id FROM admissions WHERE doctor_id = ? AND patient_id = ?
          UNION SELECT patient_id FROM consultations WHERE doctor_id = ? AND patient_id = ?
          UNION SELECT patient_id FROM lab_orders WHERE doctor_id = ? AND patient_id = ?
          UNION SELECT patient_id FROM prescriptions WHERE doctor_id = ? AND patient_id = ?
        ) AS authorized_patients LIMIT 1
      `, [req.user.doctor_id, patient_id, req.user.doctor_id, patient_id, req.user.doctor_id, patient_id, req.user.doctor_id, patient_id, req.user.doctor_id, patient_id]);

      if (!authorizedPatient) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: 'Forbidden: patient is not under your care' });
      }

      const [[activeAdmission]] = await connection.execute(
        'SELECT admission_id FROM admissions WHERE patient_id = ? AND status = "ACTIVE" FOR UPDATE',
        [patient_id]
      );
      if (activeAdmission) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'Patient already has an active admission' });
      }

      assignedDoctorId = req.user.doctor_id;
    }
    
    // Lock the selected available bed. For doctors, derive the admission department
    // from that bed's ward instead of trusting a client-supplied department id.
    const [[bed]] = await connection.execute(`
      SELECT b.bed_id, b.ward_id, w.department_id
      FROM beds b
      JOIN wards w ON w.ward_id = b.ward_id
      WHERE b.bed_id = ? AND b.status = "AVAILABLE"
      FOR UPDATE
    `, [bed_id]);
    if (!bed) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Bed is not available' });
    }
    if (req.user.role === 'DOCTOR') assignedDepartmentId = bed.department_id;

    // Each admission counts against the doctor's workload (doctors CHECK current_workload <= max_workload).
    // Lock order bed -> doctor, as in emergency allocation.
    const [[doctor]] = await connection.execute(
      'SELECT doctor_id, name, current_workload, max_workload FROM doctors WHERE doctor_id = ? FOR UPDATE', [assignedDoctorId ?? null]
    );
    if (!doctor) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Doctor not found' });
    }
    if (doctor.current_workload >= doctor.max_workload) {
      await connection.rollback();
      return res.status(409).json({ success: false, code: 'DOCTOR_AT_MAX_WORKLOAD', message: atMaxMessage(doctor) });
    }

    // The after_admission_insert trigger handles bed status, doctor workload, and log insertion
    const [result] = await connection.execute('INSERT INTO admissions (patient_id, doctor_id, bed_id, department_id, admission_date, status, diagnosis, notes) VALUES (?, ?, ?, ?, NOW(), "ACTIVE", ?, ?)', [patient_id, assignedDoctorId, bed_id, assignedDepartmentId, diagnosis, notes ?? null]); // notes are optional
    await writeAudit(connection, req, { action: 'ADMIT_PATIENT', entityType: 'admission', entityId: result.insertId, patientId: patient_id,
      details: { bed_id: Number(bed_id), doctor_id: Number(assignedDoctorId), department_id: Number(assignedDepartmentId) } });

    await connection.commit();
    realtime.bedUpdated({ bedId: bed.bed_id, status: 'OCCUPIED' });
    realtime.doctorUpdated({ doctorId: assignedDoctorId });
    realtime.admissionEvent('admission:new', { admissionId: result.insertId, status: 'ACTIVE', doctorId: assignedDoctorId, wardId: bed.ward_id });
    realtime.dashboardRefresh();
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { 
    await connection.rollback();
    // Backstop: the workload CHECK fired anyway (e.g. a concurrent change outside this path).
    if (error.errno === 3819 && /doctors_chk/.test(error.message)) {
      return res.status(409).json({ success: false, code: 'DOCTOR_AT_MAX_WORKLOAD', message: 'The doctor is at maximum workload. Choose another doctor or discharge a patient first.' });
    }
    res.status(500).json({ success: false, message: error.message }); 
  } finally {
    connection.release();
  }
};
exports.discharge = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const [adms] = await connection.execute('SELECT * FROM admissions WHERE admission_id = ? AND status = "ACTIVE" FOR UPDATE', [req.params.id]);
    if (adms.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Admission not active or not found' });
    }
    const admission = adms[0];

    // Security check: ONLY assigned doctor (or ADMIN) can discharge
    if (req.user.role === 'DOCTOR' && parseInt(admission.doctor_id) !== parseInt(req.user.doctor_id)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Forbidden: Cannot discharge another doctor\'s patient' });
    }

    // The after_admission_discharge trigger handles bed status, doctor workload, and log updating.
    await connection.execute('UPDATE admissions SET status = "DISCHARGED", discharge_date = NOW() WHERE admission_id = ?', [req.params.id]);
    // Doses still pending on the ward are cancelled with the discharge, not left pending.
    const dosesCancelled = await cancelPendingDoses(connection, { admissionId: admission.admission_id, reason: 'Patient discharged', userId: req.user.user_id });
    await writeAudit(connection, req, { action: 'DISCHARGE_PATIENT', entityType: 'admission', entityId: admission.admission_id, patientId: admission.patient_id,
      details: { from: 'ACTIVE', to: 'DISCHARGED', bed_id: admission.bed_id, doses_cancelled: dosesCancelled } });

    await connection.commit();
    // The discharge trigger sets the bed's new status; report what it is now.
    const [[bedNow]] = await pool.execute('SELECT bed_id, ward_id, status FROM beds WHERE bed_id = ?', [admission.bed_id]);
    if (bedNow) realtime.bedUpdated({ bedId: bedNow.bed_id, status: bedNow.status });
    realtime.doctorUpdated({ doctorId: admission.doctor_id });
    realtime.admissionEvent('admission:discharged', { admissionId: admission.admission_id, status: 'DISCHARGED', doctorId: admission.doctor_id, wardId: bedNow?.ward_id });
    realtime.dashboardRefresh();
    res.json({ success: true, message: 'Discharged successfully' });
  } catch (error) { 
    await connection.rollback();
    res.status(500).json({ success: false, message: error.message }); 
  } finally {
    connection.release();
  }
};
