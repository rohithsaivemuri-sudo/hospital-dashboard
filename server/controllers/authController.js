const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { withTransaction, logAccess } = require('../utils/audit');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const [users] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    // Login outcomes go to the audit trail without blocking; the password is never logged.
    const loginFailed = (userId) => {
      logAccess(req, { action: 'LOGIN_FAILED', outcome: 'DENIED', statusCode: 401, userId, details: { username: typeof username === 'string' ? username : null } });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    };
    if (users.length === 0) return loginFailed(null);
    
    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return loginFailed(user.user_id);
    if (!user.is_active) {
      logAccess(req, { action: 'LOGIN_FAILED', outcome: 'DENIED', statusCode: 401, userId: user.user_id, details: { username, reason: 'DEACTIVATED' } });
      return res.status(401).json({ success: false, message: 'Account is deactivated' });
    }
    
    let doctor_id = null;
    if (user.role === 'DOCTOR') {
      const [doctors] = await pool.execute('SELECT doctor_id FROM doctors WHERE user_id = ?', [user.user_id]);
      if (doctors.length > 0) {
        doctor_id = doctors[0].doctor_id;
      }
    }
    
    const token = jwt.sign({ user_id: user.user_id, username: user.username, role: user.role, doctor_id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    logAccess(req, { action: 'LOGIN_SUCCESS', statusCode: 200, userId: user.user_id, role: user.role });
    res.json({ success: true, token, user: { user_id: user.user_id, username: user.username, role: user.role, doctor_id } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const { validateAccount, insertAccount } = require('../services/accountService');

// POST /api/auth/register (ADMIN): create a staff account. For role DOCTOR the doctor profile is
// created in the same transaction, so a doctor account can never exist without its profile.
exports.register = async (req, res) => {
  try {
    const invalid = validateAccount(req.body);
    if (invalid) return res.status(400).json({ success: false, message: invalid });
    const { role } = req.body;
    const created = await withTransaction(req, async (connection, audit) => {
      const ids = await insertAccount(connection, req.body);
      await audit({ action: 'CREATE_USER', entityType: 'user', entityId: ids.user_id, details: { role, doctor_id: ids.doctor_id } });
      return ids;
    });
    res.status(201).json({ success: true, message: 'User registered', data: created });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const field = /email/.test(error.message) ? 'email' : 'username';
      return res.status(409).json({ success: false, message: `That ${field} is already in use` });
    }
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Server error', error: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = req.user;
    if (user.role === 'DOCTOR') {
      const [doctors] = await pool.execute('SELECT doctor_id FROM doctors WHERE user_id = ?', [user.user_id]);
      if (doctors.length > 0) {
        user.doctor_id = doctors[0].doctor_id;
      }
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
