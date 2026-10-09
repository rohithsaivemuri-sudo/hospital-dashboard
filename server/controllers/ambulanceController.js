const pool = require('../config/db');
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM ambulances');
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.create = async (req, res) => {
  try {
    const { vehicle_number, driver_name, contact_number } = req.body;
    const [result] = await pool.execute('INSERT INTO ambulances (vehicle_number, driver_name, contact_number, status) VALUES (?, ?, ?, "AVAILABLE")', [vehicle_number, driver_name, contact_number]);
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.update = async (req, res) => {
  try {
    const { driver_name, contact_number } = req.body;
    await pool.execute('UPDATE ambulances SET driver_name = ?, contact_number = ? WHERE ambulance_id = ?', [driver_name, contact_number, req.params.id]);
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    await pool.execute('UPDATE ambulances SET status = ? WHERE ambulance_id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.reportEmergency = async (req, res) => {
  try {
    const { patient_id, severity, required_bed_type, required_specialization, symptoms, ventilator_required } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO emergency_cases (patient_id, ambulance_id, severity, required_bed_type, required_specialization, symptoms, ventilator_required, status, arrival_time) VALUES (?, ?, ?, ?, ?, ?, ?, "WAITING", NOW())',
      [patient_id, req.params.id, severity, required_bed_type, required_specialization, symptoms, ventilator_required]
    );
    const io = req.app.get('io');
    if (io) io.emit('emergency:new', { id: result.insertId, severity, patient_id });
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
