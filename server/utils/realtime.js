// Real-time events (Socket.IO). Every event goes through this module so that:
//   - it reaches only the roles allowed to see that data under the Section E matrix
//     (sockets join role:<ROLE>, user:<id> and doctor:<doctor_id> rooms on connection);
//   - its payload carries ids and status only, never patient details: clients refetch through the
//     API, where the normal permission checks apply;
//   - events for data changed inside a transaction are sent only after it commits
//     (afterCommit + withTransaction in utils/audit.js).
const pool = require('../config/db');

let io = null;
const setIo = (server) => { io = server; };

const ALL_ROLES = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LABORATORY', 'PHARMACY'];
const CLINICAL_AND_FRONT_DESK = ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'];
const roleRooms = (roles) => roles.map(r => `role:${r}`);

function send(rooms, event, payload) {
  if (!io || !rooms.length) return;
  io.to(rooms).emit(event, payload); // a socket in several of the rooms receives it once
}
const logFailure = (event) => (e) => console.error(`[realtime] could not send ${event}: ${e.message}`);

// Emergency cases: clinical and front-desk staff (not laboratory or pharmacy).
const emergencyEvent = (event, { emergencyId, status, ...ids }) =>
  send(roleRooms(CLINICAL_AND_FRONT_DESK), event, { emergencyId: Number(emergencyId), status, ...ids });

// Beds and doctors: readable by every role.
const bedUpdated = ({ bedId, status }) => send(roleRooms(ALL_ROLES), 'bed:updated', { bedId: Number(bedId), status });
const doctorUpdated = ({ doctorId }) => send(roleRooms(ALL_ROLES), 'doctor:updated', { doctorId: Number(doctorId) });

// Hospital dashboard statistics: administrators.
const dashboardRefresh = () => send(roleRooms(['ADMIN']), 'dashboard:refresh', {});

// Nurses assigned today to a ward (their admissions list covers only those wards).
async function nurseRoomsForWard(wardId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT nurse_user_id FROM nurse_ward_assignments
     WHERE ward_id = ? AND start_date <= CURDATE() AND (end_date IS NULL OR end_date >= CURDATE())`, [wardId]);
  return rows.map(r => `user:${r.nurse_user_id}`);
}

// Admissions: admin and front desk, the admitting doctor, and the nurses on that ward.
async function admissionEvent(event, { admissionId, status, doctorId, wardId }) {
  try {
    const rooms = [...roleRooms(['ADMIN', 'RECEPTIONIST']), `doctor:${doctorId}`, ...(wardId ? await nurseRoomsForWard(wardId) : [])];
    send(rooms, event, { admissionId: Number(admissionId), status });
  } catch (e) { logFailure(event)(e); }
}

// Visits: the visit's doctor, front desk, admin and nurses (every open outpatient visit is in the
// nurses' triage scope). Other doctors are not told.
const encounterUpdated = ({ encounterId, status, doctorId }) =>
  send([...roleRooms(['ADMIN', 'RECEPTIONIST', 'NURSE']), `doctor:${doctorId}`], 'encounter:updated', { encounterId: Number(encounterId), status });

// A deactivated account loses its live connections at once.
function disconnectUser(userId) {
  if (io) io.in(`user:${userId}`).disconnectSockets(true);
}

// Queue an event for after the request's transaction commits (dropped if it rolls back).
function afterCommit(req, fn) {
  if (!req) return fn();
  (req.afterCommit ||= []).push(fn);
}
function flushAfterCommit(req) {
  const queued = (req && req.afterCommit) || [];
  if (req) req.afterCommit = [];
  for (const fn of queued) {
    try { const r = fn(); if (r && r.catch) r.catch(logFailure('event')); } catch (e) { logFailure('event')(e); }
  }
}
const discardAfterCommit = (req) => { if (req) req.afterCommit = []; };

module.exports = {
  setIo, emergencyEvent, bedUpdated, doctorUpdated, dashboardRefresh, admissionEvent, encounterUpdated,
  disconnectUser, afterCommit, flushAfterCommit, discardAfterCommit, ALL_ROLES, CLINICAL_AND_FRONT_DESK,
};
