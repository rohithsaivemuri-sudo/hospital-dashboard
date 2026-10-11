// Socket.IO: every connection must present a valid JWT for an active account (handshake
// auth.token). Sockets join rooms by role, user and (for doctors) doctor id; utils/realtime.js
// decides which rooms each event goes to. Clients send no events of their own.
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { setIo } = require('../utils/realtime');

module.exports = function(io) {
  setIo(io);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Unauthorized'));
    let user;
    try { user = jwt.verify(token, process.env.JWT_SECRET); } catch (e) { return next(new Error('Unauthorized')); }
    try {
      const [[account]] = await pool.execute('SELECT is_active FROM users WHERE user_id = ?', [user.user_id ?? null]);
      if (!account || !account.is_active) return next(new Error('Unauthorized'));
    } catch (e) {
      console.error('[socket] could not verify account:', e.message);
      return next(new Error('Unauthorized'));
    }
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const { user_id, role, doctor_id } = socket.data.user;
    socket.join([`role:${role}`, `user:${user_id}`, ...(role === 'DOCTOR' && doctor_id ? [`doctor:${doctor_id}`] : [])]);
  });
};
