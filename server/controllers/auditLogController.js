const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');

// Admin audit viewer (report Section F.4, NIST AU-6): read-only, paginated, filtered.
// Every search is itself written to the trail (VIEW_AUDIT_LOG) before the rows are read, in the same
// transaction, so the viewer fails closed: if that row cannot be written, nothing is shown.

const isId = (v) => /^[1-9]\d{0,9}$/.test(String(v));
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
const MAX_PAGE_SIZE = 100;

// Query string -> { filters, error }. Patients may be given as 16 or MRN-000016.
function parseFilters(q) {
  const f = {};
  if (q.from) { if (!isDate(q.from)) return { error: 'from must be a date (YYYY-MM-DD)' }; f.from = q.from; }
  if (q.to) { if (!isDate(q.to)) return { error: 'to must be a date (YYYY-MM-DD)' }; f.to = q.to; }
  if (f.from && f.to && f.from > f.to) return { error: 'from must not be after to' };
  if (q.user_id) { if (!isId(q.user_id)) return { error: 'user_id must be a positive integer' }; f.user_id = Number(q.user_id); }
  if (q.patient_id) {
    const m = String(q.patient_id).trim().match(/^(?:MRN-?)?0*(\d{1,10})$/i);
    if (!m || !isId(m[1])) return { error: 'patient_id must be a patient number or MRN' };
    f.patient_id = Number(m[1]);
  }
  if (q.action) { if (!/^[A-Z_]{1,64}$/.test(q.action)) return { error: 'action must be an action code' }; f.action = q.action; }
  if (q.status_code) { if (!/^[1-5]\d{2}$/.test(q.status_code)) return { error: 'status_code must be an HTTP status code' }; f.status_code = Number(q.status_code); }
  if (q.until_id) { if (!isId(q.until_id)) return { error: 'until_id must be a positive integer' }; f.until_id = Number(q.until_id); }
  if (q.outcome) { if (!['SUCCESS', 'DENIED'].includes(q.outcome)) return { error: 'outcome must be SUCCESS or DENIED' }; f.outcome = q.outcome; }
  const page = q.page === undefined ? 1 : Number(q.page);
  const pageSize = q.page_size === undefined ? 25 : Number(q.page_size);
  if (!Number.isInteger(page) || page < 1) return { error: 'page must be a positive integer' };
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) return { error: `page_size must be 1-${MAX_PAGE_SIZE}` };
  return { filters: f, page, pageSize };
}

function whereClause(f) {
  const clauses = []; const params = [];
  if (f.from) { clauses.push('a.created_at >= ?'); params.push(`${f.from} 00:00:00`); }
  if (f.to) { clauses.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(f.to); }
  if (f.until_id) { clauses.push('a.audit_id <= ?'); params.push(f.until_id); }
  for (const col of ['user_id', 'patient_id', 'action', 'status_code', 'outcome']) {
    if (f[col] !== undefined) { clauses.push(`a.${col} = ?`); params.push(f[col]); }
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// GET /api/audit-logs?from&to&user_id&action&patient_id&status_code&outcome&page&page_size
exports.list = async (req, res) => {
  const parsed = parseFilters(req.query);
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  const { filters, page, pageSize } = parsed;
  try {
    const result = await withTransaction(req, async (connection, audit) => {
      await audit({ action: 'VIEW_AUDIT_LOG', entityType: 'audit_logs', statusCode: 200, patientId: filters.patient_id ?? null, details: { ...filters, page, page_size: pageSize } });
      // Pages are read against a fixed snapshot (until_id): new rows, including this search's own,
      // would otherwise shift every page. The first page returns until_id; later pages send it back.
      const untilId = filters.until_id ?? Number((await connection.query('SELECT MAX(audit_id) AS m FROM audit_logs'))[0][0].m);
      const where = whereClause({ ...filters, until_id: untilId });
      const [[{ total }]] = await connection.query(`SELECT COUNT(*) AS total FROM audit_logs a ${where.sql}`, where.params);
      const [rows] = await connection.query(`
        SELECT a.audit_id, a.created_at, a.user_id, u.username, a.role, a.action, a.entity_type, a.entity_id, a.patient_id,
               a.outcome, a.status_code, a.method, a.path, a.ip_address, a.details
        FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
        ${where.sql} ORDER BY a.audit_id DESC LIMIT ? OFFSET ?`, [...where.params, pageSize, (page - 1) * pageSize]);
      return { rows, total: Number(total), untilId };
    });
    res.json({
      success: true,
      data: result.rows.map(r => ({ ...r, details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details })),
      pagination: { page, page_size: pageSize, total: result.total, pages: Math.max(1, Math.ceil(result.total / pageSize)), until_id: result.untilId },
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /api/audit-logs/actions — action codes present in the trail, for the filter list.
exports.actions = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
    res.json({ success: true, data: rows.map(r => r.action) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
