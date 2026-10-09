const pool = require('../config/db');
const { withTransaction, changedFields } = require('../utils/audit');

const PATIENT_FIELDS = ['name', 'date_of_birth', 'gender', 'blood_group', 'phone', 'address', 'emergency_contact'];

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

exports.list = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `SELECT * FROM patients WHERE name LIKE ?`;
    let queryParams = [`%${search}%`];
    
    if (req.user.role === 'DOCTOR') {
      const doctorId = req.user.doctor_id;
      query += ` AND patient_id IN (
        SELECT patient_id FROM appointments WHERE doctor_id = ?
        UNION SELECT patient_id FROM admissions WHERE doctor_id = ?
        UNION SELECT patient_id FROM consultations WHERE doctor_id = ?
        UNION SELECT patient_id FROM lab_orders WHERE doctor_id = ?
        UNION SELECT patient_id FROM prescriptions WHERE doctor_id = ?
      )`;
      queryParams.push(doctorId, doctorId, doctorId, doctorId, doctorId);
    }
    
    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), parseInt(offset));
    
    const [rows] = await pool.execute(query, queryParams);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    const auth = await checkDoctorAuth(req, req.params.id);
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [rows] = await pool.execute('SELECT * FROM patients WHERE patient_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.create = async (req, res) => {
  try {
    const { name, date_of_birth, gender, blood_group, phone, address, emergency_contact } = req.body;
    const id = await withTransaction(req, async (connection, audit) => {
      const [result] = await connection.execute('INSERT INTO patients (name, date_of_birth, gender, blood_group, phone, address, emergency_contact) VALUES (?, ?, ?, ?, ?, ?, ?)', [name, date_of_birth, gender, blood_group, phone, address, emergency_contact]);
      await audit({ action: 'CREATE_PATIENT', entityType: 'patient', entityId: result.insertId, patientId: result.insertId });
      return result.insertId;
    });
    res.status(201).json({ success: true, data: { id } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.update = async (req, res) => {
  try {
    const { name, date_of_birth, gender, blood_group, phone, address, emergency_contact } = req.body;
    await withTransaction(req, async (connection, audit) => {
      const [[before]] = await connection.execute('SELECT * FROM patients WHERE patient_id = ? FOR UPDATE', [req.params.id]);
      await connection.execute('UPDATE patients SET name = ?, date_of_birth = ?, gender = ?, blood_group = ?, phone = ?, address = ?, emergency_contact = ? WHERE patient_id = ?', [name, date_of_birth, gender, blood_group, phone, address, emergency_contact, req.params.id]);
      const changed = before ? changedFields(before, req.body, PATIENT_FIELDS) : [];
      if (changed.length) await audit({ action: 'UPDATE_PATIENT', entityType: 'patient', entityId: before.patient_id, patientId: before.patient_id, details: { changed_fields: changed } });
    });
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getHistory = async (req, res) => {
  try {
    const patient_id = req.params.id;
    const auth = await checkDoctorAuth(req, patient_id);
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

    res.json({ success: true, data: { admissions, appointments, prescriptions, labs, consultations, surgeries } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getAdmissions = async (req, res) => {
  try {
    const auth = await checkDoctorAuth(req, req.params.id);
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [rows] = await pool.execute('SELECT * FROM admissions WHERE patient_id = ?', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getAppointments = async (req, res) => {
  try {
    const auth = await checkDoctorAuth(req, req.params.id);
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [rows] = await pool.execute('SELECT * FROM appointments WHERE patient_id = ?', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getPrescriptions = async (req, res) => {
  try {
    const auth = await checkDoctorAuth(req, req.params.id);
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [rows] = await pool.execute('SELECT * FROM prescriptions WHERE patient_id = ?', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getLabResults = async (req, res) => {
  try {
    const auth = await checkDoctorAuth(req, req.params.id);
    if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    
    const [rows] = await pool.execute('SELECT l.*, r.* FROM lab_orders l LEFT JOIN lab_results r ON l.order_id = r.order_id WHERE l.patient_id = ?', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
