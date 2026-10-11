const pool = require('../config/db');
const { withTransaction, changedFields } = require('../utils/audit');
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
    const id = await withTransaction(req, async (connection, audit) => {
      const [result] = await connection.execute('INSERT INTO departments (name, description) VALUES (?, ?)', [name, description]);
      await audit({ action: 'CREATE_DEPARTMENT', entityType: 'department', entityId: result.insertId });
      return result.insertId;
    });
    res.status(201).json({ success: true, data: { id } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.update = async (req, res) => {
  try {
    const { name, description } = req.body;
    await withTransaction(req, async (connection, audit) => {
      const [[before]] = await connection.execute('SELECT * FROM departments WHERE department_id = ? FOR UPDATE', [req.params.id]);
      await connection.execute('UPDATE departments SET name = ?, description = ? WHERE department_id = ?', [name, description, req.params.id]);
      const changed = before ? changedFields(before, req.body, ['name', 'description']) : [];
      if (changed.length) await audit({ action: 'UPDATE_DEPARTMENT', entityType: 'department', entityId: before.department_id, details: { changed_fields: changed } });
    });
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
