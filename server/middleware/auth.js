const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
  try {
    // Tokens of deactivated (or removed) accounts stop working immediately, not when they expire.
    const [[account]] = await pool.execute('SELECT is_active FROM users WHERE user_id = ?', [decoded.user_id ?? null]);
    if (!account) return res.status(401).json({ success: false, message: 'Account not found' });
    if (!account.is_active) return res.status(401).json({ success: false, message: 'Account is deactivated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to verify account' });
  }
  req.user = decoded;
  next();
};

const ROLE_LABELS = {
  ADMIN: 'administrators', DOCTOR: 'doctors', NURSE: 'nurses', RECEPTIONIST: 'reception staff',
  LABORATORY: 'laboratory staff', PHARMACY: 'pharmacy staff',
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: `Forbidden: this is available to ${roles.map(r => ROLE_LABELS[r] || r).join(', ')} only` });
    }
    next();
  };
};

module.exports = { verifyToken, authorize };
