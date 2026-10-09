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

const ROLES = ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE', 'LABORATORY', 'PHARMACY'];
const SHIFTS = ['MORNING', 'AFTERNOON', 'NIGHT'];

// POST /api/auth/register (ADMIN): create a staff account. For role DOCTOR the doctor profile is
// created in the same transaction, so a doctor account can never exist without its profile.
exports.register = async (req, res) => {
  try {
    const { username, password, role, full_name, email, phone, department_id, specialization, shift, max_workload } = req.body;
    const missing = ['username', 'password', 'role', 'full_name', 'email', 'phone'].filter(f => !req.body[f] || !String(req.body[f]).trim());
    if (role === 'DOCTOR') missing.push(...['department_id', 'specialization', 'shift'].filter(f => !req.body[f]));
    if (missing.length) return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
    if (!ROLES.includes(role)) return res.status(400).json({ success: false, message: `Role must be one of: ${ROLES.join(', ')}` });
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) return res.status(400).json({ success: false, message: 'Username must be 3-50 letters, digits, dots, dashes or underscores' });
    if (String(password).length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ success: false, message: 'Email address is not valid' });
    if (role === 'DOCTOR' && !SHIFTS.includes(shift)) return res.status(400).json({ success: false, message: `Shift must be one of: ${SHIFTS.join(', ')}` });

    const password_hash = await bcrypt.hash(password, 10);
    const created = await withTransaction(req, async (connection, audit) => {
      const [result] = await connection.execute(
        'INSERT INTO users (username, password_hash, role, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
        [username.trim(), password_hash, role, full_name.trim(), email.trim(), phone.trim()]
      );
      let doctorId = null;
      if (role === 'DOCTOR') {
        const [[dept]] = await connection.execute('SELECT department_id FROM departments WHERE department_id = ?', [department_id]);
        if (!dept) throw Object.assign(new Error('Department not found'), { status: 400 });
        const [doc] = await connection.execute(
          'INSERT INTO doctors (user_id, department_id, name, specialization, phone, shift, max_workload, current_workload, status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, "AVAILABLE")',
          [result.insertId, department_id, full_name.trim(), specialization, phone.trim(), shift, Number(max_workload) || 5]
        );
        doctorId = doc.insertId;
      }
      await audit({ action: 'CREATE_USER', entityType: 'user', entityId: result.insertId, details: { role, doctor_id: doctorId } });
      return { user_id: result.insertId, doctor_id: doctorId };
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
