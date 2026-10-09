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
    const { appointment_id, patient_id, doctor_id, symptoms, diagnosis, assessment, plan, notes } = req.body;
    
    if (req.user.role === 'DOCTOR') {
      if (parseInt(doctor_id) !== parseInt(req.user.doctor_id)) return res.status(403).json({ success: false, message: 'Forbidden' });
      const auth = await checkDoctorAuth(req, patient_id);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden: Patient not associated' });
    }

    const [result] = await pool.execute('INSERT INTO consultations (appointment_id, patient_id, doctor_id, symptoms, diagnosis, assessment, plan, notes, consultation_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())', [appointment_id || null, patient_id, doctor_id, symptoms || '', diagnosis || '', assessment || '', plan || '', notes || '']);
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM consultations WHERE consultation_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    
    if (req.user.role === 'DOCTOR') {
      const auth = await checkDoctorAuth(req, rows[0].patient_id);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getByPatient = async (req, res) => {
  try {
    if (req.user.role === 'DOCTOR') {
      const auth = await checkDoctorAuth(req, req.params.patientId);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const [rows] = await pool.execute('SELECT * FROM consultations WHERE patient_id = ? ORDER BY consultation_time DESC', [req.params.patientId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.update = async (req, res) => {
  try {
    const { symptoms, diagnosis, assessment, plan, notes } = req.body;
    
    if (req.user.role === 'DOCTOR') {
      const [existing] = await pool.execute('SELECT patient_id, doctor_id FROM consultations WHERE consultation_id = ?', [req.params.id]);
      if (existing.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
      if (parseInt(existing[0].doctor_id) !== parseInt(req.user.doctor_id)) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await pool.execute('UPDATE consultations SET symptoms = ?, diagnosis = ?, assessment = ?, plan = ?, notes = ? WHERE consultation_id = ?', [symptoms || '', diagnosis || '', assessment || '', plan || '', notes || '', req.params.id]);
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
