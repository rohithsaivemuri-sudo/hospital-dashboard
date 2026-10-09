const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { writeAudit } = require('../utils/audit');
const { authorize } = require('../middleware/auth.js');
const { lockBatches, allocate, decrementBatches } = require('../utils/batches');

// Medicines with their stock picture: total (stock_quantity), usable (unexpired), expired, next expiry
// and how much expires within 90 days.
router.get('/', authorize('ADMIN', 'DOCTOR', 'NURSE', 'PHARMACY'), async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT m.*, v.usable_quantity, v.expired_quantity, v.next_expiry,
             (SELECT COALESCE(SUM(b.quantity), 0) FROM medicine_batches b
              WHERE b.medicine_id = m.medicine_id AND b.expiry_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 90 DAY) AS expiring_soon_quantity
      FROM medicines m JOIN v_current_stock v ON v.medicine_id = m.medicine_id
      ORDER BY m.medicine_id`);
    res.json({ success: true, data: rows.map(r => ({ ...r, usable_quantity: Number(r.usable_quantity), expired_quantity: Number(r.expired_quantity), expiring_soon_quantity: Number(r.expiring_soon_quantity) })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/medicines/:id/batches — lots for one medicine, earliest expiry first.
router.get('/:id/batches', authorize('ADMIN', 'PHARMACY'), async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT batch_id, batch_number, quantity, expiry_date, received_date, (expiry_date < CURDATE()) AS is_expired
      FROM medicine_batches WHERE medicine_id = ? ORDER BY expiry_date, batch_id`, [req.params.id]);
    res.json({ success: true, data: rows.map(r => ({ ...r, is_expired: Boolean(r.is_expired) })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v));
const fail = (status, message) => Object.assign(new Error(message), { status });

// POST /api/medicines/:id/stock { quantity, type: RECEIPT|ADJUSTMENT, reason?, notes?,
//   batch_number?, expiry_date?   (RECEIPT: into that batch, or a new one; defaults generated)
//   batch_id? }                   (ADJUSTMENT: from that batch, else FEFO across all batches)
// The medicine total and its batches change together in one transaction.
router.post('/:id/stock', authorize('PHARMACY'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { quantity, type, reason, notes, batch_number, expiry_date, batch_id } = req.body;
    if (!Number.isInteger(quantity) || quantity <= 0 || !['RECEIPT', 'ADJUSTMENT'].includes(type)) return res.status(400).json({ success: false, message: 'Invalid stock movement' });
    if (expiry_date !== undefined && !isDate(expiry_date)) return res.status(400).json({ success: false, message: 'expiry_date must be YYYY-MM-DD' });
    if (batch_number !== undefined && !/^[A-Za-z0-9._\/-]{1,50}$/.test(String(batch_number))) return res.status(400).json({ success: false, message: 'batch_number must be 1-50 letters, digits or . _ / -' });
    await connection.beginTransaction();
    const [[medicine]] = await connection.execute('SELECT stock_quantity, expiry_date FROM medicines WHERE medicine_id = ? FOR UPDATE', [req.params.id]);
    if (!medicine) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Medicine not found' }); }

    let touched; // [{ batch_id, batch_number, quantity (signed) }]
    if (type === 'RECEIPT') {
      const [[{ expiry, expired }]] = await connection.execute(
        'SELECT DATE_FORMAT(COALESCE(?, ?), "%Y-%m-%d") AS expiry, COALESCE(?, ?) < CURDATE() AS expired',
        [expiry_date ?? null, medicine.expiry_date, expiry_date ?? null, medicine.expiry_date]
      );
      if (expired) throw fail(400, 'Cannot receive stock that has already expired');
      const number = batch_number || `RCV-${expiry.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const [[existing]] = await connection.execute(
        'SELECT batch_id, DATE_FORMAT(expiry_date, "%Y-%m-%d") AS expiry FROM medicine_batches WHERE medicine_id = ? AND batch_number = ? FOR UPDATE', [req.params.id, number]
      );
      let batchId;
      if (existing) {
        if (existing.expiry !== expiry) throw fail(409, `Batch ${number} already exists with expiry ${existing.expiry}`);
        await connection.execute('UPDATE medicine_batches SET quantity = quantity + ? WHERE batch_id = ?', [quantity, existing.batch_id]);
        batchId = existing.batch_id;
      } else {
        const [ins] = await connection.execute(
          'INSERT INTO medicine_batches (medicine_id, batch_number, quantity, expiry_date, received_by) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, number, quantity, expiry, req.user.user_id]
        );
        batchId = ins.insertId;
      }
      touched = [{ batch_id: batchId, batch_number: number, quantity }];
    } else {
      let taken;
      if (batch_id !== undefined) {
        const [[b]] = await connection.execute('SELECT batch_id, batch_number, quantity FROM medicine_batches WHERE batch_id = ? AND medicine_id = ? FOR UPDATE', [batch_id, req.params.id]);
        if (!b) throw fail(404, 'Batch not found for this medicine');
        taken = b.quantity >= quantity ? [{ batch_id: b.batch_id, batch_number: b.batch_number, quantity }] : null;
      } else {
        // Write-offs come out earliest-expiry first, so expired stock goes before good stock.
        taken = allocate(await lockBatches(connection, req.params.id, { usableOnly: false }), quantity);
      }
      if (!taken || medicine.stock_quantity < quantity) throw fail(400, 'Stock cannot become negative');
      await decrementBatches(connection, taken);
      touched = taken.map(t => ({ ...t, quantity: -t.quantity }));
    }

    const delta = type === 'RECEIPT' ? quantity : -quantity;
    await connection.execute('UPDATE medicines SET stock_quantity = stock_quantity + ? WHERE medicine_id = ?', [delta, req.params.id]);
    const movementIds = [];
    for (const t of touched) {
      const [movement] = await connection.execute('INSERT INTO pharmacy_stock_movements (medicine_id, movement_type, quantity, reason, notes, performed_by, batch_id) VALUES (?,?,?,?,?,?,?)', [req.params.id, type, t.quantity, reason || null, notes || null, req.user.user_id, t.batch_id]);
      movementIds.push(movement.insertId);
    }
    await writeAudit(connection, req, { action: type === 'RECEIPT' ? 'STOCK_RECEIPT' : 'STOCK_ADJUSTMENT', entityType: 'medicine', entityId: Number(req.params.id),
      details: { movement_id: movementIds[0], movement_ids: movementIds, quantity: delta, from: medicine.stock_quantity, to: medicine.stock_quantity + delta, reason: reason || null,
        batches: touched.map(t => ({ batch_id: t.batch_id, quantity: t.quantity })) } });
    await connection.commit();
    res.json({ success: true, data: { batches: touched } });
  } catch (e) { await connection.rollback(); res.status(e.status || 500).json({ success: false, message: e.message }); } finally { connection.release(); }
});

module.exports = router;
