const pool = require('../config/db');
const { withTransaction, changedFields, writeAudit } = require('../utils/audit');
const { allocateEmergencyResources } = require('../services/emergencyAllocationService');

exports.create = async (req, res) => {
  try {
    const { patient_id, severity, required_bed_type, required_specialization, symptoms, ventilator_required } = req.body;
    const result = await withTransaction(req, async (connection, audit) => {
      const [inserted] = await connection.execute(
        'INSERT INTO emergency_cases (patient_id, severity, required_bed_type, required_specialization, symptoms, ventilator_required, status, arrival_time) VALUES (?, ?, ?, ?, ?, ?, "WAITING", NOW())',
        [patient_id, severity, required_bed_type, required_specialization, symptoms, ventilator_required]
      );
      await audit({ action: 'CREATE_EMERGENCY', entityType: 'emergency_case', entityId: inserted.insertId, patientId: patient_id, details: { severity } });
      return inserted;
    });
    const io = req.app.get('io');
    if (io) io.emit('emergency:new', { id: result.insertId, severity, patient_id });
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM emergency_cases');
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getQueue = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT ec.*, p.name as patient_name 
      FROM emergency_cases ec 
      LEFT JOIN patients p ON ec.patient_id = p.patient_id 
      WHERE ec.status IN ('WAITING', 'TRIAGED') 
      ORDER BY FIELD(ec.severity, 'CRITICAL', 'VERY_SERIOUS', 'SERIOUS', 'MODERATE', 'STABLE'), ec.arrival_time ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM emergency_cases WHERE emergency_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.update = async (req, res) => {
  try {
    const { status, notes } = req.body;
    await withTransaction(req, async (connection, audit) => {
      const [[before]] = await connection.execute('SELECT emergency_id, patient_id, status, notes FROM emergency_cases WHERE emergency_id = ? FOR UPDATE', [req.params.id]);
      await connection.execute('UPDATE emergency_cases SET status = ?, notes = ? WHERE emergency_id = ?', [status, notes, req.params.id]);
      const changed = before ? changedFields(before, { status, notes }, ['status', 'notes']) : [];
      if (changed.length) {
        await audit({ action: 'UPDATE_EMERGENCY', entityType: 'emergency_case', entityId: before.emergency_id, patientId: before.patient_id,
          details: { changed_fields: changed, ...(changed.includes('status') ? { from: before.status, to: status } : {}) } });
      }
    });
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.allocate = async (req, res) => {
  try {
    const io = req.app.get('io');
    const result = await allocateEmergencyResources(req.params.id, io, (connection, entry) => writeAudit(connection, req, entry));
    if (!result.success) {
      if (result.queued) return res.status(200).json(result);
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
