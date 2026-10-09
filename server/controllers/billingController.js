const pool = require('../config/db');
exports.create = async (req, res) => {
  try {
    const { patient_id, admission_id, total_amount } = req.body;
    const [result] = await pool.execute('INSERT INTO bills (patient_id, admission_id, total_amount, paid_amount, status, generated_at) VALUES (?, ?, ?, 0, "UNPAID", NOW())', [patient_id, admission_id || null, total_amount]);
    res.status(201).json({ success: true, data: { id: result.insertId } });
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
    await pool.execute('INSERT INTO bill_items (bill_id, description, amount) VALUES (?, ?, ?)', [req.params.id, description, amount]);
    await pool.execute('UPDATE bills SET total_amount = total_amount + ? WHERE bill_id = ?', [amount, req.params.id]);
    res.json({ success: true, message: 'Item added' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.pay = async (req, res) => {
  try {
    const { amount } = req.body;
    await pool.execute('UPDATE bills SET paid_amount = paid_amount + ?, status = CASE WHEN paid_amount + ? >= total_amount THEN "PAID" ELSE "PARTIAL" END WHERE bill_id = ?', [amount, amount, req.params.id]);
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
