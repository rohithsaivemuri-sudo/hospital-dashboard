// Audit trail helpers (report Section F.4 / NIST SP 800-53 AU-2).
//
// - writeAudit(connection, req, entry): for data changes. Call it on the transaction's connection
//   before COMMIT. It throws on failure, so the change rolls back and can never exist without its
//   audit row.
// - logAccess(entry): for reads and denied requests (used by middleware/audit.js). Best effort,
//   never blocks or fails the request; failures go to stderr.
// - withTransaction(req, fn): runs fn(connection, audit) in a transaction, where
//   audit(entry) = writeAudit(connection, req, entry).
//
// details must carry ids, enum/status values and changed field names only. sanitizeDetails()
// enforces that: secret-looking keys are dropped and long strings (free text) are removed.
const pool = require('../config/db');
const { flushAfterCommit, discardAfterCommit } = require('./realtime');

const SENSITIVE_KEY = /pass(word)?|token|secret|authori[sz]ation|jwt|cookie|session/i;
const MAX_STRING = 64; // enum values, statuses, short codes; anything longer is treated as free text
const MAX_DEPTH = 4;
const MAX_ARRAY = 100;

function sanitizeDetails(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length <= MAX_STRING ? value : undefined;
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map(v => sanitizeDetails(v, depth + 1)).filter(v => v !== undefined);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) continue;
      const clean = sanitizeDetails(v, depth + 1);
      if (clean !== undefined) out[k] = clean;
    }
    return out;
  }
  return undefined;
}

const toId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function buildRow(req, entry) {
  const user = (req && req.user) || {};
  const details = entry.details === undefined ? null : sanitizeDetails(entry.details);
  return [
    toId(entry.userId ?? user.user_id),
    entry.role ?? user.role ?? null,
    entry.action,
    entry.entityType ?? null,
    toId(entry.entityId),
    toId(entry.patientId),
    entry.outcome || 'SUCCESS',
    entry.statusCode ?? null,
    entry.method ?? (req ? req.method : null),
    (entry.path ?? (req ? routePattern(req) : null))?.slice(0, 255) ?? null,
    entry.ip ?? (req ? req.ip : null),
    details && Object.keys(details).length ? JSON.stringify(details) : null,
  ];
}

const INSERT_SQL = `INSERT INTO audit_logs
  (user_id, role, action, entity_type, entity_id, patient_id, outcome, status_code, method, path, ip_address, details)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// Route pattern (no ids or query values), e.g. /api/patients/:id/history.
function routePattern(req) {
  if (req.route && req.route.path) return `${req.baseUrl || ''}${req.route.path}`;
  return (req.originalUrl || req.url || '').split('?')[0];
}

async function writeAudit(connection, req, entry) {
  if (!entry || !entry.action) throw new Error('writeAudit: action is required');
  await connection.execute(INSERT_SQL, buildRow(req, entry));
}

function logAccess(req, entry) {
  let row;
  try { row = buildRow(req, entry); } catch (e) { console.error('[audit] could not build access log entry:', e.message); return; }
  pool.execute(INSERT_SQL, row).catch(e => {
    console.error(`[audit] failed to write ${entry.action} for ${row[9]}: ${e.message}`);
  });
}

async function withTransaction(req, fn) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection, (entry) => writeAudit(connection, req, entry));
    await connection.commit();
    flushAfterCommit(req); // real-time events for what was just committed
    return result;
  } catch (error) {
    discardAfterCommit(req);
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Names of fields whose value differs between the stored row and the new values.
function changedFields(before, after, fields) {
  const norm = (v) => {
    if (v === undefined || v === null || v === '') return null;
    // mysql2 returns DATE columns as local-midnight Dates; compare as local YYYY-MM-DD.
    if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    return String(v);
  };
  return fields.filter(f => norm(before[f]) !== norm(after[f]));
}

module.exports = { writeAudit, logAccess, withTransaction, sanitizeDetails, changedFields, routePattern };
