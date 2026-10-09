const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { writeAudit } = require('../utils/audit');
const { authorize } = require('../middleware/auth.js');

router.get('/', authorize('ADMIN', 'DOCTOR', 'NURSE', 'PHARMACY'), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM medicines');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/stock', authorize('PHARMACY'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { quantity, type, reason, notes } = req.body;
    if (!Number.isInteger(quantity) || quantity <= 0 || !['RECEIPT', 'ADJUSTMENT'].includes(type)) return res.status(400).json({ success: false, message: 'Invalid stock movement' });
    await connection.beginTransaction();
    const [[medicine]] = await connection.execute('SELECT stock_quantity FROM medicines WHERE medicine_id = ? FOR UPDATE', [req.params.id]);
    if (!medicine) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Medicine not found' }); }
    const delta = type === 'RECEIPT' ? quantity : -quantity;
    if (medicine.stock_quantity + delta < 0) { await connection.rollback(); return res.status(400).json({ success: false, message: 'Stock cannot become negative' }); }
    await connection.execute('UPDATE medicines SET stock_quantity = stock_quantity + ? WHERE medicine_id = ?', [delta, req.params.id]);
    const [movement] = await connection.execute('INSERT INTO pharmacy_stock_movements (medicine_id, movement_type, quantity, reason, notes, performed_by) VALUES (?,?,?,?,?,?)', [req.params.id, type, delta, reason || null, notes || null, req.user.user_id]);
    await writeAudit(connection, req, { action: type === 'RECEIPT' ? 'STOCK_RECEIPT' : 'STOCK_ADJUSTMENT', entityType: 'medicine', entityId: Number(req.params.id),
      details: { movement_id: movement.insertId, quantity: delta, from: medicine.stock_quantity, to: medicine.stock_quantity + delta, reason: reason || null } });
    await connection.commit(); res.json({ success: true });
  } catch (e) { await connection.rollback(); res.status(500).json({ success: false, message: e.message }); } finally { connection.release(); }
});

module.exports = router;
