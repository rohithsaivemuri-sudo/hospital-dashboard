const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');
const { NURSE_WARDS_SQL, nurseWardsParams } = require('../utils/patientAccess');
const { fromSqlUtc } = require('../utils/marTime');
const { todayIst, nowSqlUtc } = require('../utils/clock');

const isId = (v) => /^[1-9]\d{0,9}$/.test(String(v));
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// Start and end dates are inclusive IST calendar dates, returned as 'YYYY-MM-DD'; ended_at is the
// moment an admin ended it (ISO, UTC), after which it is over whatever its end_date.
// Parameters first: today (IST), now (UTC) — viewParams().
const ASSIGNMENT_VIEW = `
  SELECT a.assignment_id, a.nurse_user_id, u.full_name AS nurse_name, u.username AS nurse_username,
         a.ward_id, w.name AS ward_name,
         DATE_FORMAT(a.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(a.end_date, '%Y-%m-%d') AS end_date,
         DATE_FORMAT(a.ended_at, '%Y-%m-%dT%H:%i:%sZ') AS ended_at,
         (? BETWEEN a.start_date AND COALESCE(a.end_date, '9999-12-31') AND (a.ended_at IS NULL OR a.ended_at > ?)) AS is_current
  FROM nurse_ward_assignments a
  JOIN users u ON u.user_id = a.nurse_user_id
  JOIN wards w ON w.ward_id = a.ward_id`;
const viewParams = () => { const nowSql = nowSqlUtc(); return { today: todayIst(), nowSql, nowIso: `${nowSql.replace(' ', 'T')}Z` }; };

// status now: UPCOMING (not started yet; can be cancelled), CURRENT or ENDED (end date passed, or ended by an admin).
function present(row, { today, nowIso }) {
  const ended = (row.ended_at && row.ended_at <= nowIso) || (row.end_date && row.end_date < today);
  const status = today < row.start_date ? 'UPCOMING' : ended ? 'ENDED' : 'CURRENT';
  return { ...row, is_current: status === 'CURRENT', status };
}

// GET /api/nurse-assignments — admins see all; nurses see their own.
exports.listAssignments = async (req, res) => {
  try {
    const own = req.user.role === 'NURSE';
    const v = viewParams();
    const [rows] = await pool.execute(
      `${ASSIGNMENT_VIEW} ${own ? 'WHERE a.nurse_user_id = ?' : ''} ORDER BY is_current DESC, a.start_date > ? DESC, u.full_name, w.name`,
      own ? [v.today, v.nowSql, req.user.user_id, v.today] : [v.today, v.nowSql, v.today]
    );
    res.json({ success: true, data: rows.map(r => present(r, v)) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// POST /api/nurse-assignments { nurse_user_id, ward_id, start_date?, end_date? } (ADMIN)
exports.createAssignment = async (req, res) => {
  try {
    const { nurse_user_id, ward_id, start_date, end_date } = req.body;
    if (!isId(nurse_user_id) || !isId(ward_id)) return res.status(400).json({ success: false, message: 'nurse_user_id and ward_id are required' });
    if ((start_date && !isDate(start_date)) || (end_date && !isDate(end_date))) return res.status(400).json({ success: false, message: 'Dates must be YYYY-MM-DD' });

    const start = start_date || todayIst();
    if (end_date && end_date < start) return res.status(400).json({ success: false, message: 'end_date cannot be before start_date' });

    const result = await withTransaction(req, async (connection, audit) => {
      // Locking the nurse's account row serialises assignment changes for that nurse, so two
      // overlapping requests at the same moment cannot both pass the overlap check below.
      const [[nurse]] = await connection.execute('SELECT user_id, role, is_active FROM users WHERE user_id = ? FOR UPDATE', [nurse_user_id]);
      if (!nurse || nurse.role !== 'NURSE') return { status: 400, message: 'That user is not a nurse' };
      if (!nurse.is_active) return { status: 400, message: 'That nurse account is deactivated' };
      const [[ward]] = await connection.execute('SELECT ward_id FROM wards WHERE ward_id = ?', [ward_id]);
      if (!ward) return { status: 400, message: 'Ward not found' };
      // Overlap: any day in common with an existing assignment of this nurse to this ward (dates
      // inclusive; no end date = open-ended). The last day of one an admin ended (ended_at) is free:
      // it is already over, so the nurse can be given the ward again the same day.
      const [[overlap]] = await connection.execute(
        `SELECT assignment_id, DATE_FORMAT(start_date, '%d/%m/%Y') AS from_day, DATE_FORMAT(end_date, '%d/%m/%Y') AS until_day
         FROM nurse_ward_assignments WHERE nurse_user_id = ? AND ward_id = ?
         AND (end_date IS NULL OR end_date > ? OR (end_date = ? AND ended_at IS NULL)) AND (? IS NULL OR start_date <= ?)
         LIMIT 1 FOR UPDATE`, // locking read: sees rows committed while we waited
        [nurse_user_id, ward_id, start, start, end_date || null, end_date || null]
      );
      if (overlap) return { status: 409, message: `This nurse is already assigned to this ward for some of those days (from ${overlap.from_day}${overlap.until_day ? ` until ${overlap.until_day}` : ', ongoing'}, #${overlap.assignment_id})` };
      const [ins] = await connection.execute(
        'INSERT INTO nurse_ward_assignments (nurse_user_id, ward_id, start_date, end_date, assigned_by) VALUES (?, ?, ?, ?, ?)',
        [nurse_user_id, ward_id, start, end_date || null, req.user.user_id]
      );
      await audit({ action: 'CREATE_NURSE_ASSIGNMENT', entityType: 'nurse_ward_assignment', entityId: ins.insertId, details: { nurse_user_id: Number(nurse_user_id), ward_id: Number(ward_id) } });
      return { status: 201, id: ins.insertId };
    });
    if (result.status !== 201) return res.status(result.status).json({ success: false, message: result.message });
    const v = viewParams();
    const [[row]] = await pool.execute(`${ASSIGNMENT_VIEW} WHERE a.assignment_id = ?`, [v.today, v.nowSql, result.id]);
    res.status(201).json({ success: true, data: present(row, v) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// PUT /api/nurse-assignments/:id { end_date } (ADMIN) — ends an assignment. With no end_date, or
// today's (IST), it ends now: the nurse loses the ward at once (ended_at). A later end_date ends it
// after that day; an earlier one (shortening) is already over.
exports.endAssignment = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid assignment id' });
    const { end_date } = req.body;
    if (end_date && !isDate(end_date)) return res.status(400).json({ success: false, message: 'end_date must be YYYY-MM-DD' });
    const result = await withTransaction(req, async (connection, audit) => {
      const [[a]] = await connection.execute(
        `SELECT assignment_id, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, ended_at
         FROM nurse_ward_assignments WHERE assignment_id = ? FOR UPDATE`, [req.params.id]);
      if (!a) return { status: 404, message: 'Assignment not found' };
      const today = todayIst();
      const newEnd = end_date || today;
      if (newEnd < a.start_date) return { status: 400, message: 'end_date cannot be before the assignment start_date' };
      if (a.ended_at) return { status: 409, message: 'This assignment has already ended; create a new assignment to give the nurse this ward again' };
      // Ending never reopens or extends: an already-ended assignment can only be shortened (to give
      // the nurse the ward again, create a new assignment). Its own end date again is a no-op,
      // except that ending today means ending now.
      if (a.end_date) {
        if (newEnd > a.end_date) return { status: 409, message: 'This assignment has already ended; create a new assignment to give the nurse this ward again' };
        if (newEnd === a.end_date && newEnd !== today) return { status: 200 };
      }
      const endedAt = newEnd === today ? nowSqlUtc() : null;
      await connection.execute('UPDATE nurse_ward_assignments SET end_date = ?, ended_at = ? WHERE assignment_id = ?', [newEnd, endedAt, a.assignment_id]);
      await audit({ action: 'END_NURSE_ASSIGNMENT', entityType: 'nurse_ward_assignment', entityId: a.assignment_id, details: { changed_fields: endedAt ? ['end_date', 'ended_at'] : ['end_date'] } });
      return { status: 200 };
    });
    if (result.status !== 200) return res.status(result.status).json({ success: false, message: result.message });
    const v = viewParams();
    const [[row]] = await pool.execute(`${ASSIGNMENT_VIEW} WHERE a.assignment_id = ?`, [v.today, v.nowSql, req.params.id]);
    res.json({ success: true, data: present(row, v) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// DELETE /api/nurse-assignments/:id (ADMIN) — cancels an assignment that has not started yet
// (starts after today, IST). One that has started is ended instead (PUT), which keeps its history.
exports.cancelAssignment = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid assignment id' });
    const result = await withTransaction(req, async (connection, audit) => {
      const [[a]] = await connection.execute(
        `SELECT assignment_id, nurse_user_id, ward_id, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
         FROM nurse_ward_assignments WHERE assignment_id = ? FOR UPDATE`, [req.params.id]);
      if (!a) return { status: 404, message: 'Assignment not found' };
      if (a.start_date <= todayIst()) return { status: 409, message: 'This assignment has already started; end it instead of cancelling it' };
      await connection.execute('DELETE FROM nurse_ward_assignments WHERE assignment_id = ?', [a.assignment_id]);
      await audit({ action: 'CANCEL_NURSE_ASSIGNMENT', entityType: 'nurse_ward_assignment', entityId: a.assignment_id,
        details: { nurse_user_id: a.nurse_user_id, ward_id: a.ward_id, start_date: a.start_date, end_date: a.end_date } });
      return { status: 200 };
    });
    if (result.status !== 200) return res.status(result.status).json({ success: false, message: result.message });
    res.json({ success: true, data: { assignment_id: Number(req.params.id) } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /api/nurse/station — the nurse's landing page data: current wards, their beds and
// patients, and the open outpatient visits waiting for triage.
exports.station = async (req, res) => {
  try {
    const [wards] = await pool.execute(
      `SELECT w.ward_id, w.name AS ward_name, w.ward_type, w.floor FROM wards w WHERE w.ward_id IN (${NURSE_WARDS_SQL}) ORDER BY w.name`,
      nurseWardsParams(req.user.user_id)
    );
    const [beds] = await pool.execute(`
      SELECT b.bed_id, b.bed_number, b.bed_type, b.status AS bed_status, b.ward_id, w.name AS ward_name,
             a.admission_id, a.admission_date, p.patient_id, p.name AS patient_name, p.gender, p.allergies,
             TIMESTAMPDIFF(YEAR, p.date_of_birth, ?) AS age, p.date_of_birth, p.dob_estimated, d.name AS doctor_name
      FROM beds b
      JOIN wards w ON w.ward_id = b.ward_id
      LEFT JOIN admissions a ON a.bed_id = b.bed_id AND a.status = 'ACTIVE'
      LEFT JOIN patients p ON p.patient_id = a.patient_id
      LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
      WHERE b.ward_id IN (${NURSE_WARDS_SQL})
      ORDER BY w.name, b.bed_number`, [todayIst(), ...nurseWardsParams(req.user.user_id)]);
    const [openVisits] = await pool.execute(`
      SELECT e.encounter_id, e.status, e.arrived_at, e.appointment_id, p.patient_id, p.name AS patient_name, d.name AS doctor_name,
             (SELECT DATE_FORMAT(MAX(v.recorded_at_utc), '%Y-%m-%d %H:%i:%s') FROM vital_signs v WHERE v.encounter_id = e.encounter_id) AS last_vitals_utc
      FROM encounters e JOIN patients p ON p.patient_id = e.patient_id JOIN doctors d ON d.doctor_id = e.doctor_id
      WHERE e.encounter_type = 'OUTPATIENT' AND e.status IN ('ARRIVED', 'TRIAGED', 'IN_PROGRESS')
      ORDER BY FIELD(e.status, 'ARRIVED', 'TRIAGED', 'IN_PROGRESS'), e.arrived_at`);
    // last_vitals_at: when vitals were last recorded on this visit (ISO, UTC), or null.
    const visits = openVisits.map(({ last_vitals_utc, ...v }) => ({ ...v, last_vitals_at: last_vitals_utc ? fromSqlUtc(last_vitals_utc).toISOString() : null }));
    res.json({ success: true, data: { wards, beds, open_visits: visits } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
