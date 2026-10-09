const pool = require('../config/db');
const { withTransaction, changedFields } = require('../utils/audit');
const { emergencyEvent, dashboardRefresh } = require('../utils/realtime');
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM ambulances');
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.create = async (req, res) => {
  try {
    const { vehicle_number, driver_name, contact_number } = req.body;
    // The column is driver_phone; contact_number is still accepted for existing callers.
    const driver_phone = req.body.driver_phone ?? contact_number;
    const id = await withTransaction(req, async (connection, audit) => {
      const [result] = await connection.execute('INSERT INTO ambulances (vehicle_number, driver_name, driver_phone, status) VALUES (?, ?, ?, "AVAILABLE")', [vehicle_number, driver_name, driver_phone]);
      await audit({ action: 'CREATE_AMBULANCE', entityType: 'ambulance', entityId: result.insertId });
      return result.insertId;
    });
    res.status(201).json({ success: true, data: { id } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.update = async (req, res) => {
  try {
    const { driver_name, contact_number } = req.body;
    const driver_phone = req.body.driver_phone ?? contact_number;
    await withTransaction(req, async (connection, audit) => {
      const [[before]] = await connection.execute('SELECT * FROM ambulances WHERE ambulance_id = ? FOR UPDATE', [req.params.id]);
      await connection.execute('UPDATE ambulances SET driver_name = ?, driver_phone = ? WHERE ambulance_id = ?', [driver_name, driver_phone, req.params.id]);
      const changed = before ? changedFields(before, { driver_name, driver_phone }, ['driver_name', 'driver_phone']) : [];
      if (changed.length) await audit({ action: 'UPDATE_AMBULANCE', entityType: 'ambulance', entityId: before.ambulance_id, details: { changed_fields: changed } });
    });
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    await withTransaction(req, async (connection, audit) => {
      const [[before]] = await connection.execute('SELECT ambulance_id, status FROM ambulances WHERE ambulance_id = ? FOR UPDATE', [req.params.id]);
      await connection.execute('UPDATE ambulances SET status = ? WHERE ambulance_id = ?', [status, req.params.id]);
      if (before && before.status !== status) await audit({ action: 'UPDATE_AMBULANCE_STATUS', entityType: 'ambulance', entityId: before.ambulance_id, details: { from: before.status, to: status } });
    });
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.reportEmergency = async (req, res) => {
  try {
    const { patient_id, severity, required_bed_type, required_specialization, symptoms, ventilator_required } = req.body;
    const result = await withTransaction(req, async (connection, audit) => {
      const [inserted] = await connection.execute(
        'INSERT INTO emergency_cases (patient_id, ambulance_id, severity, required_bed_type, required_specialization, symptoms, ventilator_required, status, arrival_time) VALUES (?, ?, ?, ?, ?, ?, ?, "WAITING", NOW())',
        [patient_id, req.params.id, severity, required_bed_type, required_specialization, symptoms, ventilator_required]
      );
      await audit({ action: 'CREATE_EMERGENCY', entityType: 'emergency_case', entityId: inserted.insertId, patientId: patient_id, details: { ambulance_id: Number(req.params.id), severity } });
      return inserted;
    });
    emergencyEvent('emergency:new', { emergencyId: result.insertId, status: 'WAITING' });
    dashboardRefresh();
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
