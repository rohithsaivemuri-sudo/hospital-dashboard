const pool = require('../config/db');
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM wards');
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.create = async (req, res) => {
  try {
    const { name, department_id, floor } = req.body;
    const [result] = await pool.execute('INSERT INTO wards (name, department_id, floor) VALUES (?, ?, ?)', [name, department_id, floor]);
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM wards WHERE ward_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    const [beds] = await pool.execute('SELECT * FROM beds WHERE ward_id = ?', [req.params.id]);
    res.json({ success: true, data: { ...rows[0], beds } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
