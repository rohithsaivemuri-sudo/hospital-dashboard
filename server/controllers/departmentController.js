const pool = require('../config/db');
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM departments');
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM departments WHERE department_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    const [doctors] = await pool.execute('SELECT * FROM doctors WHERE department_id = ?', [req.params.id]);
    res.json({ success: true, data: { ...rows[0], doctors } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.create = async (req, res) => {
  try {
    const { name, description } = req.body;
    const [result] = await pool.execute('INSERT INTO departments (name, description) VALUES (?, ?)', [name, description]);
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.update = async (req, res) => {
  try {
    const { name, description } = req.body;
    await pool.execute('UPDATE departments SET name = ?, description = ? WHERE department_id = ?', [name, description, req.params.id]);
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
