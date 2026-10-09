const pool = require('../config/db');

const checkDoctorAuth = async (req, patient_id) => {
  if (req.user.role !== 'DOCTOR') return true;
  const doctorId = req.user.doctor_id;
  const [rows] = await pool.execute(`
    SELECT 1 FROM (
      SELECT patient_id FROM appointments WHERE doctor_id = ? AND patient_id = ?
      UNION SELECT patient_id FROM admissions WHERE doctor_id = ? AND patient_id = ?
      UNION SELECT patient_id FROM consultations WHERE doctor_id = ? AND patient_id = ?
      UNION SELECT patient_id FROM lab_orders WHERE doctor_id = ? AND patient_id = ?
      UNION SELECT patient_id FROM prescriptions WHERE doctor_id = ? AND patient_id = ?
    ) as auth LIMIT 1
  `, [doctorId, patient_id, doctorId, patient_id, doctorId, patient_id, doctorId, patient_id, doctorId, patient_id]);
  return rows.length > 0;
};

exports.create = async (req, res) => {
  try {
    const { patient_id, doctor_id, procedure_name, diagnosis, priority, requested_date, notes } = req.body;
    
    if (req.user.role === 'DOCTOR') {
      if (parseInt(doctor_id) !== parseInt(req.user.doctor_id)) return res.status(403).json({ success: false, message: 'Forbidden' });
      const auth = await checkDoctorAuth(req, patient_id);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden: Patient not associated' });
    }

    const [result] = await pool.execute(
      'INSERT INTO surgery_requests (patient_id, doctor_id, procedure_name, diagnosis, priority, requested_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, "REQUESTED", ?)',
      [patient_id, doctor_id, procedure_name, diagnosis, priority || 'ROUTINE', requested_date, notes || '']
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getByPatient = async (req, res) => {
  try {
    if (req.user.role === 'DOCTOR') {
      const auth = await checkDoctorAuth(req, req.params.patientId);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const [rows] = await pool.execute('SELECT * FROM surgery_requests WHERE patient_id = ? ORDER BY requested_date DESC', [req.params.patientId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (req.user.role === 'DOCTOR') {
      const [existing] = await pool.execute('SELECT doctor_id FROM surgery_requests WHERE request_id = ?', [req.params.id]);
      if (existing.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
      if (parseInt(existing[0].doctor_id) !== parseInt(req.user.doctor_id)) return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await pool.execute('UPDATE surgery_requests SET status = ? WHERE request_id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
