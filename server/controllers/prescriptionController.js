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

exports.list = async (req, res) => {
  try {
    let query = `
      SELECT p.*, pat.name as patientName,
        (SELECT GROUP_CONCAT(m.name SEPARATOR ', ')
         FROM prescription_items pi
         JOIN medicines m ON pi.medicine_id = m.medicine_id
         WHERE pi.prescription_id = p.prescription_id
        ) as medication
      FROM prescriptions p 
      JOIN patients pat ON p.patient_id = pat.patient_id
    `;
    let params = [];
    if (req.user.role === 'DOCTOR') {
      query += ` WHERE p.doctor_id = ? `;
      params.push(req.user.doctor_id);
    }
    
    query += ` ORDER BY p.prescription_date DESC`;
    
    const [rows] = await pool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.create = async (req, res) => {
  if (req.user.role === 'PHARMACY' || req.user.role === 'LABORATORY') return res.status(403).json({ success: false, message: 'Forbidden' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { consultation_id, patient_id, doctor_id, items, notes } = req.body;
    
    if (req.user.role === 'DOCTOR') {
      if (parseInt(doctor_id) !== parseInt(req.user.doctor_id)) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: 'Forbidden: Cannot create prescription for another doctor' });
      }
      const auth = await checkDoctorAuth(req, patient_id);
      if (!auth) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: 'Forbidden: Patient not associated' });
      }
    }

    const [result] = await connection.execute('INSERT INTO prescriptions (consultation_id, patient_id, doctor_id, prescription_date, status, notes) VALUES (?, ?, ?, NOW(), "CREATED", ?)', [consultation_id || null, patient_id, doctor_id, notes || null]);
    const prescription_id = result.insertId;
    for (const item of items) {
      await connection.execute('INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, duration, quantity) VALUES (?, ?, ?, ?, ?, ?)', [prescription_id, item.medicine_id, item.dosage, item.frequency, item.duration, item.quantity]);
    }
    await connection.commit();
    res.status(201).json({ success: true, data: { id: prescription_id } });
  } catch (error) { 
    await connection.rollback();
    res.status(500).json({ success: false, message: error.message }); 
  } finally {
    connection.release();
  }
};

exports.getById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM prescriptions WHERE prescription_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    
    if (req.user.role === 'DOCTOR') {
      const auth = await checkDoctorAuth(req, rows[0].patient_id);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const [items] = await pool.execute(`
      SELECT pi.*, m.name as medicine_name, m.stock_quantity 
      FROM prescription_items pi
      JOIN medicines m ON pi.medicine_id = m.medicine_id
      WHERE pi.prescription_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: { ...rows[0], items } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getByPatient = async (req, res) => {
  try {
    if (req.user.role === 'DOCTOR') {
      const auth = await checkDoctorAuth(req, req.params.patientId);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    
    let query = `
      SELECT p.*, pat.name as patientName,
        (SELECT GROUP_CONCAT(m.name SEPARATOR ', ')
         FROM prescription_items pi
         JOIN medicines m ON pi.medicine_id = m.medicine_id
         WHERE pi.prescription_id = p.prescription_id
        ) as medication
      FROM prescriptions p 
      JOIN patients pat ON p.patient_id = pat.patient_id
      WHERE p.patient_id = ?
      ORDER BY p.prescription_date DESC
    `;
    const [rows] = await pool.execute(query, [req.params.patientId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.dispense = async (req, res) => {
  if (req.user.role === 'DOCTOR' || req.user.role === 'LABORATORY') return res.status(403).json({ success: false, message: 'Forbidden: Cannot dispense medicine' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[prescription]] = await connection.execute('SELECT status FROM prescriptions WHERE prescription_id = ? FOR UPDATE', [req.params.id]);
    if (!prescription || prescription.status === 'DISPENSED' || prescription.status === 'CANCELLED') {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Prescription is not available for dispensing' });
    }
    const [items] = await connection.execute(`
      SELECT pi.item_id, pi.medicine_id, pi.quantity, m.stock_quantity
      FROM prescription_items pi JOIN medicines m ON m.medicine_id = pi.medicine_id
      WHERE pi.prescription_id = ? AND pi.dispensed = FALSE FOR UPDATE
    `, [req.params.id]);
    if (!items.length) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'No remaining items to dispense' });
    }
    const unavailable = items.find(item => item.stock_quantity < item.quantity);
    if (unavailable) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient stock for prescription item' });
    }
    
    
    // Update items first to trigger stock reduction (actually wait, let's insert into pharmacy_stock_movements manually because the trigger only updates stock_quantity but doesn't log movement)
    await connection.execute('UPDATE prescription_items SET dispensed = TRUE, dispensed_at = NOW() WHERE prescription_id = ? AND dispensed = FALSE', [req.params.id]);
    
    // Log movements
    for (const item of items) {
      await connection.execute('INSERT INTO pharmacy_stock_movements (medicine_id, movement_type, quantity, reason, reference_id, performed_by) VALUES (?, "DISPENSE", ?, "Dispense Prescription", ?, ?)', [item.medicine_id, -item.quantity, req.params.id, req.user.user_id]);
    }
    
    // Then update prescription status

    await connection.execute('UPDATE prescriptions SET status = "DISPENSED" WHERE prescription_id = ?', [req.params.id]);
    
    await connection.commit();
    res.json({ success: true, message: 'Dispensed successfully' });
  } catch (error) { 
    await connection.rollback();
    res.status(500).json({ success: false, message: error.message }); 
  } finally {
    connection.release();
  }
};
