const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT b.*, w.name as ward_name FROM beds b LEFT JOIN wards w ON b.ward_id = w.ward_id');
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getAvailable = async (req, res) => {
  try {
    const { type, bed_type } = req.query;
    const filterType = type || bed_type;
    let query = 'SELECT * FROM beds WHERE status = "AVAILABLE"';
    let params = [];
    if (filterType) { query += ' AND bed_type = ?'; params.push(filterType); }
    const [rows] = await pool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getSummary = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT bed_type, status, COUNT(*) as count FROM beds GROUP BY bed_type, status');
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM beds WHERE bed_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    await withTransaction(req, async (connection, audit) => {
      const [[before]] = await connection.execute('SELECT bed_id, status FROM beds WHERE bed_id = ? FOR UPDATE', [req.params.id]);
      await connection.execute('UPDATE beds SET status = ? WHERE bed_id = ?', [status, req.params.id]);
      if (before && before.status !== status) await audit({ action: 'UPDATE_BED_STATUS', entityType: 'bed', entityId: before.bed_id, details: { from: before.status, to: status } });
    });
    const io = req.app.get('io');
    if (io) io.emit('bed:updated', { bedId: req.params.id, status });
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getByWard = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM beds WHERE ward_id = ?', [req.params.wardId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
