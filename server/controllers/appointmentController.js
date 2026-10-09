const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');
const { applyAppointmentStatus } = require('../utils/encounters');
exports.create = async (req, res) => {
  try {
    const { patient_id, doctor_id, appointment_date, appointment_time, reason } = req.body;
    
    // Check doctor authorization
    if (req.user.role === 'DOCTOR' && parseInt(doctor_id) !== parseInt(req.user.doctor_id)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Cannot create appointment for another doctor' });
    }

    // appointments.department_id is NOT NULL: take it from the doctor being booked.
    const [[doctor]] = await pool.execute('SELECT department_id FROM doctors WHERE doctor_id = ?', [doctor_id ?? null]);
    if (!doctor) return res.status(400).json({ success: false, message: 'Doctor not found' });

    try {
      const id = await withTransaction(req, async (connection, audit) => {
        const [result] = await connection.execute('INSERT INTO appointments (patient_id, doctor_id, department_id, appointment_date, appointment_time, reason, status) VALUES (?, ?, ?, ?, ?, ?, "BOOKED")', [patient_id, doctor_id, doctor.department_id, appointment_date, appointment_time, reason ?? null]);
        await audit({ action: 'CREATE_APPOINTMENT', entityType: 'appointment', entityId: result.insertId, patientId: patient_id, details: { doctor_id: Number(doctor_id) } });
        return result.insertId;
      });
      res.status(201).json({ success: true, data: { id } });
    } catch(err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Double booking detected' });
      throw err;
    }
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.list = async (req, res) => {
  try {
    const { date, doctor_id, status } = req.query;
    let query = `
      SELECT a.*, p.name as patient_name, d.name as doctor_name, e.encounter_id, e.status as encounter_status
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.patient_id
      LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
      LEFT JOIN encounters e ON e.appointment_id = a.appointment_id
      WHERE 1=1
    `;
    let params = [];
    
    if (req.user.role === 'DOCTOR') {
      query += ' AND a.doctor_id = ?';
      params.push(req.user.doctor_id);
    } else if (doctor_id) { 
      query += ' AND a.doctor_id = ?'; 
      params.push(doctor_id); 
    }
    
    if (date) { query += ' AND a.appointment_date = ?'; params.push(date); }
    if (status) { query += ' AND a.status = ?'; params.push(status); }
    const [rows] = await pool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    let query = 'SELECT * FROM appointments WHERE appointment_id = ?';
    let params = [req.params.id];
    
    if (req.user.role === 'DOCTOR') {
      query += ' AND doctor_id = ?';
      params.push(req.user.doctor_id);
    }

    const [rows] = await pool.execute(query, params);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (req.user.role === 'DOCTOR') {
      const [rows] = await pool.execute('SELECT 1 FROM appointments WHERE appointment_id = ? AND doctor_id = ?', [req.params.id, req.user.doctor_id]);
      if (rows.length === 0) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Starting and finishing a visit is the assigned doctor's action (POST /api/encounters/:id/start|finish).
    if (['IN_PROGRESS', 'COMPLETED'].includes(status)) {
      return res.status(403).json({ success: false, message: 'Forbidden: visits are started and finished by the doctor from the visit itself' });
    }

    // Status changes go through the encounter state machine, which keeps the appointment and its
    // encounter in step (same transaction) and rejects invalid transitions with 409.
    await withTransaction(req, (connection) => applyAppointmentStatus(connection, req, req.params.id, status));
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
};
exports.getByDoctor = async (req, res) => {
  try {
    const targetDoctorId = req.params.doctorId;
    
    if (req.user.role === 'DOCTOR' && parseInt(targetDoctorId) !== parseInt(req.user.doctor_id)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const [rows] = await pool.execute('SELECT * FROM appointments WHERE doctor_id = ?', [targetDoctorId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
