const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');
const BILL_ITEM_CATEGORIES = ['CONSULTATION', 'BED', 'ICU', 'LABORATORY', 'MEDICINE', 'PROCEDURE', 'AMBULANCE', 'OTHER'];
exports.create = async (req, res) => {
  try {
    const { patient_id, admission_id, total_amount } = req.body;
    const id = await withTransaction(req, async (connection, audit) => {
      const [result] = await connection.execute('INSERT INTO bills (patient_id, admission_id, total_amount, paid_amount, status, bill_date) VALUES (?, ?, ?, 0, "PENDING", NOW())', [patient_id, admission_id || null, total_amount]);
      await audit({ action: 'CREATE_BILL', entityType: 'bill', entityId: result.insertId, patientId: patient_id, details: { admission_id: admission_id ? Number(admission_id) : null, total_amount: Number(total_amount) } });
      return result.insertId;
    });
    res.status(201).json({ success: true, data: { id } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT b.*, p.name as patient_name
      FROM bills b
      LEFT JOIN patients p ON b.patient_id = p.patient_id
      ORDER BY b.bill_date DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM bills WHERE bill_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    const [items] = await pool.execute('SELECT * FROM bill_items WHERE bill_id = ?', [req.params.id]);
    res.json({ success: true, data: { ...rows[0], items } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.addItem = async (req, res) => {
  try {
    const { description, amount } = req.body;
    // bill_items has no amount column: a single line item of `amount`, categorised OTHER unless a valid category is sent.
    const category = BILL_ITEM_CATEGORIES.includes(req.body.category) ? req.body.category : 'OTHER';
    await withTransaction(req, async (connection, audit) => {
      const [item] = await connection.execute('INSERT INTO bill_items (bill_id, description, category, quantity, unit_price, total_price) VALUES (?, ?, ?, 1, ?, ?)', [req.params.id, description, category, amount, amount]);
      await connection.execute('UPDATE bills SET total_amount = total_amount + ? WHERE bill_id = ?', [amount, req.params.id]);
      const [[bill]] = await connection.execute('SELECT patient_id FROM bills WHERE bill_id = ?', [req.params.id]);
      await audit({ action: 'ADD_BILL_ITEM', entityType: 'bill', entityId: Number(req.params.id), patientId: bill?.patient_id, details: { item_id: item.insertId, category, amount: Number(amount) } });
    });
    res.json({ success: true, message: 'Item added' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.pay = async (req, res) => {
  try {
    const { amount } = req.body;
    await withTransaction(req, async (connection, audit) => {
      const [[before]] = await connection.execute('SELECT bill_id, patient_id, status FROM bills WHERE bill_id = ? FOR UPDATE', [req.params.id]);
      await connection.execute('UPDATE bills SET paid_amount = paid_amount + ?, status = CASE WHEN paid_amount + ? >= total_amount THEN "PAID" ELSE "PARTIAL" END WHERE bill_id = ?', [amount, amount, req.params.id]);
      if (before) {
        const [[after]] = await connection.execute('SELECT status FROM bills WHERE bill_id = ?', [req.params.id]);
        await audit({ action: 'RECORD_PAYMENT', entityType: 'bill', entityId: before.bill_id, patientId: before.patient_id, details: { amount: Number(amount), from: before.status, to: after.status } });
      }
    });
    res.json({ success: true, message: 'Payment recorded' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getByPatient = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM bills WHERE patient_id = ?', [req.params.patientId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.generate = async (req, res) => {
  // Mock auto-generate for admission
  res.json({ success: true, message: 'Bill generated' });
};
