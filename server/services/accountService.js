// Staff accounts: one set of rules for POST /api/auth/register and scripts/accounts.js.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ROLES = ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE', 'LABORATORY', 'PHARMACY'];
const SHIFTS = ['MORNING', 'AFTERNOON', 'NIGHT'];
// Well-known passwords (including the old demo password) are refused for every account.
const KNOWN_WEAK = new Set(['password123', 'password', 'password1', '12345678', '123456789', 'qwerty123', 'admin123', 'letmein123', 'hospital123', 'welcome123']);
const DEFAULT_PASSWORD = 'password123';

// Strong and still typeable: 16 characters from a URL-safe alphabet (96 bits).
const randomPassword = () => crypto.randomBytes(12).toString('base64url');

// Returns an error message, or null if the account details are acceptable.
function validateAccount({ username, password, role, full_name, email, phone, department_id, specialization, shift }) {
  const given = { username, password, role, full_name, email, phone, department_id, specialization, shift };
  const missing = ['username', 'password', 'role', 'full_name', 'email', 'phone'].filter(f => !given[f] || !String(given[f]).trim());
  if (role === 'DOCTOR') missing.push(...['department_id', 'specialization', 'shift'].filter(f => !given[f]));
  if (missing.length) return `Missing required fields: ${missing.join(', ')}`;
  if (!ROLES.includes(role)) return `Role must be one of: ${ROLES.join(', ')}`;
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) return 'Username must be 3-50 letters, digits, dots, dashes or underscores';
  if (String(password).length < 8) return 'Password must be at least 8 characters';
  if (KNOWN_WEAK.has(String(password).toLowerCase())) return 'That password is too common; choose another';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Email address is not valid';
  if (role === 'DOCTOR' && !SHIFTS.includes(shift)) return `Shift must be one of: ${SHIFTS.join(', ')}`;
  return null;
}

// Inserts the user (and, for doctors, the doctor profile) on `connection`, inside the caller's
// transaction. Returns { user_id, doctor_id }.
async function insertAccount(connection, a) {
  const passwordHash = await bcrypt.hash(String(a.password), 10);
  const [result] = await connection.execute(
    'INSERT INTO users (username, password_hash, role, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
    [a.username.trim(), passwordHash, a.role, a.full_name.trim(), a.email.trim(), String(a.phone).trim()]
  );
  let doctorId = null;
  if (a.role === 'DOCTOR') {
    const [[dept]] = await connection.execute('SELECT department_id FROM departments WHERE department_id = ?', [a.department_id]);
    if (!dept) throw Object.assign(new Error('Department not found'), { status: 400 });
    const [doc] = await connection.execute(
      'INSERT INTO doctors (user_id, department_id, name, specialization, phone, shift, max_workload, current_workload, status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, "AVAILABLE")',
      [result.insertId, a.department_id, a.full_name.trim(), a.specialization, String(a.phone).trim(), a.shift, Number(a.max_workload) || 5]
    );
    doctorId = doc.insertId;
  }
  return { user_id: result.insertId, doctor_id: doctorId };
}

// Usernames of active accounts whose password is still the old shared default.
async function accountsWithDefaultPassword(connection) {
  const [users] = await connection.query('SELECT username, password_hash FROM users WHERE is_active = TRUE');
  const flagged = [];
  for (const u of users) if (await bcrypt.compare(DEFAULT_PASSWORD, u.password_hash)) flagged.push(u.username);
  return flagged;
}

module.exports = { ROLES, SHIFTS, KNOWN_WEAK, randomPassword, validateAccount, insertAccount, accountsWithDefaultPassword };
