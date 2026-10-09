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

exports.register = async (req, res) => {
  try {
    const { username, password, role, doctor_id } = req.body;
    const password_hash = await bcrypt.hash(password, 10);
    await withTransaction(req, async (connection, audit) => {
      const [result] = await connection.execute('INSERT INTO users (username, password_hash, role, doctor_id) VALUES (?, ?, ?, ?)', [username, password_hash, role, doctor_id || null]);
      await audit({ action: 'CREATE_USER', entityType: 'user', entityId: result.insertId, details: { role } });
    });
    res.status(201).json({ success: true, message: 'User registered' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
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
