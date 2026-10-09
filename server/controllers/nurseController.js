const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');
const { NURSE_WARDS_SQL } = require('../utils/patientAccess');
const { fromSqlUtc } = require('../utils/marTime');

const isId = (v) => /^[1-9]\d{0,9}$/.test(String(v));
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

const ASSIGNMENT_VIEW = `
  SELECT a.assignment_id, a.nurse_user_id, u.full_name AS nurse_name, u.username AS nurse_username,
         a.ward_id, w.name AS ward_name, a.start_date, a.end_date,
         (a.start_date <= CURDATE() AND (a.end_date IS NULL OR a.end_date >= CURDATE())) AS is_current
  FROM nurse_ward_assignments a
  JOIN users u ON u.user_id = a.nurse_user_id
  JOIN wards w ON w.ward_id = a.ward_id`;

// GET /api/nurse-assignments — admins see all; nurses see their own.
exports.listAssignments = async (req, res) => {
  try {
    const own = req.user.role === 'NURSE';
    const [rows] = await pool.execute(
      `${ASSIGNMENT_VIEW} ${own ? 'WHERE a.nurse_user_id = ?' : ''} ORDER BY is_current DESC, u.full_name, w.name`,
      own ? [req.user.user_id] : []
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, is_current: Boolean(r.is_current) })) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// POST /api/nurse-assignments { nurse_user_id, ward_id, start_date?, end_date? } (ADMIN)
exports.createAssignment = async (req, res) => {
  try {
    const { nurse_user_id, ward_id, start_date, end_date } = req.body;
    if (!isId(nurse_user_id) || !isId(ward_id)) return res.status(400).json({ success: false, message: 'nurse_user_id and ward_id are required' });
    if ((start_date && !isDate(start_date)) || (end_date && !isDate(end_date))) return res.status(400).json({ success: false, message: 'Dates must be YYYY-MM-DD' });
    if (start_date && end_date && end_date < start_date) return res.status(400).json({ success: false, message: 'end_date cannot be before start_date' });

    const result = await withTransaction(req, async (connection, audit) => {
      const [[nurse]] = await connection.execute('SELECT user_id, role, is_active FROM users WHERE user_id = ?', [nurse_user_id]);
      if (!nurse || nurse.role !== 'NURSE') return { status: 400, message: 'That user is not a nurse' };
      if (!nurse.is_active) return { status: 400, message: 'That nurse account is deactivated' };
      const [[ward]] = await connection.execute('SELECT ward_id FROM wards WHERE ward_id = ?', [ward_id]);
      if (!ward) return { status: 400, message: 'Ward not found' };
      const [[overlap]] = await connection.execute(
        `SELECT assignment_id FROM nurse_ward_assignments WHERE nurse_user_id = ? AND ward_id = ?
         AND (end_date IS NULL OR end_date >= COALESCE(?, CURDATE())) AND (? IS NULL OR start_date <= ?) FOR UPDATE`,
        [nurse_user_id, ward_id, start_date || null, end_date || null, end_date || null]
      );
      if (overlap) return { status: 409, message: `This nurse already has an overlapping assignment to this ward (#${overlap.assignment_id})` };
      const [ins] = await connection.execute(
        'INSERT INTO nurse_ward_assignments (nurse_user_id, ward_id, start_date, end_date, assigned_by) VALUES (?, ?, COALESCE(?, CURDATE()), ?, ?)',
        [nurse_user_id, ward_id, start_date || null, end_date || null, req.user.user_id]
      );
      await audit({ action: 'CREATE_NURSE_ASSIGNMENT', entityType: 'nurse_ward_assignment', entityId: ins.insertId, details: { nurse_user_id: Number(nurse_user_id), ward_id: Number(ward_id) } });
      return { status: 201, id: ins.insertId };
    });
    if (result.status !== 201) return res.status(result.status).json({ success: false, message: result.message });
    const [[row]] = await pool.execute(`${ASSIGNMENT_VIEW} WHERE a.assignment_id = ?`, [result.id]);
    res.status(201).json({ success: true, data: { ...row, is_current: Boolean(row.is_current) } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// PUT /api/nurse-assignments/:id { end_date } (ADMIN) — ends a standing assignment (default: today).
exports.endAssignment = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid assignment id' });
    const { end_date } = req.body;
    if (end_date && !isDate(end_date)) return res.status(400).json({ success: false, message: 'end_date must be YYYY-MM-DD' });
    const result = await withTransaction(req, async (connection, audit) => {
      const [[a]] = await connection.execute('SELECT assignment_id, start_date, end_date FROM nurse_ward_assignments WHERE assignment_id = ? FOR UPDATE', [req.params.id]);
      if (!a) return { status: 404, message: 'Assignment not found' };
      const [[{ newEnd }]] = await connection.execute('SELECT COALESCE(?, CURDATE()) AS newEnd', [end_date || null]);
      const [[{ beforeStart }]] = await connection.execute('SELECT ? < ? AS beforeStart', [newEnd, a.start_date]);
      if (beforeStart) return { status: 400, message: 'end_date cannot be before the assignment start_date' };
      await connection.execute('UPDATE nurse_ward_assignments SET end_date = ? WHERE assignment_id = ?', [newEnd, a.assignment_id]);
      await audit({ action: 'END_NURSE_ASSIGNMENT', entityType: 'nurse_ward_assignment', entityId: a.assignment_id, details: { changed_fields: ['end_date'] } });
      return { status: 200 };
    });
    if (result.status !== 200) return res.status(result.status).json({ success: false, message: result.message });
    const [[row]] = await pool.execute(`${ASSIGNMENT_VIEW} WHERE a.assignment_id = ?`, [req.params.id]);
    res.json({ success: true, data: { ...row, is_current: Boolean(row.is_current) } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /api/nurse/station — the nurse's landing page data: current wards, their beds and
// patients, and the open outpatient visits waiting for triage.
exports.station = async (req, res) => {
  try {
    const [wards] = await pool.execute(
      `SELECT w.ward_id, w.name AS ward_name, w.ward_type, w.floor FROM wards w WHERE w.ward_id IN (${NURSE_WARDS_SQL}) ORDER BY w.name`,
      [req.user.user_id]
    );
    const [beds] = await pool.execute(`
      SELECT b.bed_id, b.bed_number, b.bed_type, b.status AS bed_status, b.ward_id, w.name AS ward_name,
             a.admission_id, a.admission_date, p.patient_id, p.name AS patient_name, p.gender, p.allergies,
             TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) AS age, d.name AS doctor_name
      FROM beds b
      JOIN wards w ON w.ward_id = b.ward_id
      LEFT JOIN admissions a ON a.bed_id = b.bed_id AND a.status = 'ACTIVE'
      LEFT JOIN patients p ON p.patient_id = a.patient_id
      LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
      WHERE b.ward_id IN (${NURSE_WARDS_SQL})
      ORDER BY w.name, b.bed_number`, [req.user.user_id]);
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
