const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');

const isId = (v) => /^[1-9]\d{0,9}$/.test(String(v));

// GET /api/users — staff accounts (never the password hash).
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT u.user_id, u.username, u.role, u.full_name, u.email, u.phone, u.is_active, u.created_at, d.doctor_id
      FROM users u LEFT JOIN doctors d ON d.user_id = u.user_id
      ORDER BY u.role, u.full_name`);
    res.json({ success: true, data: rows.map(r => ({ ...r, is_active: Boolean(r.is_active) })) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// PUT /api/users/:id/deactivate | /reactivate. Deactivated users cannot log in, and their existing
// tokens are rejected on the next request (middleware/auth.js).
const setActive = (active) => async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid user id' });
    if (!active && Number(req.params.id) === Number(req.user.user_id)) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }
    const result = await withTransaction(req, async (connection, audit) => {
      const [[user]] = await connection.execute('SELECT user_id, role, is_active FROM users WHERE user_id = ? FOR UPDATE', [req.params.id]);
      if (!user) return { status: 404, message: 'User not found' };
      if (Boolean(user.is_active) === active) return { status: 409, message: `Account is already ${active ? 'active' : 'deactivated'}` };
      await connection.execute('UPDATE users SET is_active = ? WHERE user_id = ?', [active, user.user_id]);
      await audit({ action: active ? 'REACTIVATE_USER' : 'DEACTIVATE_USER', entityType: 'user', entityId: user.user_id, details: { role: user.role, from: !active, to: active } });
      return { status: 200 };
    });
    if (result.status !== 200) return res.status(result.status).json({ success: false, message: result.message });
    res.json({ success: true, message: active ? 'Account reactivated' : 'Account deactivated' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.deactivate = setActive(false);
exports.reactivate = setActive(true);
