const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');
const { canAccessPatient, isNurseAssignedPatient, NURSE_WARDS_SQL } = require('../utils/patientAccess');
const { EncounterError, transitionEncounter } = require('../utils/encounters');
const { VITALS, KEYS, parseVitals, abnormalKeys } = require('../utils/vitals');
const { toSqlUtc, fromSqlUtc, formatIst } = require('../utils/marTime');

// Vitals flowsheet (report Section G/K-10). Nurses record; nurses and doctors read (their own
// patients only). Every reading is tied to a visit (encounter) or an admission.

const isId = (v) => /^[1-9]\d{0,9}$/.test(String(v));
const OPEN_ENCOUNTER = ['ARRIVED', 'TRIAGED', 'IN_PROGRESS'];
const fail = (res, error) => res.status(error.status || 500).json({ success: false, message: error.message });
const httpError = (status, message) => Object.assign(new Error(message), { status });

const READING_SQL = `
  SELECT v.vital_id, v.patient_id, v.encounter_id, v.admission_id, DATE_FORMAT(v.recorded_at_utc, '%Y-%m-%d %H:%i:%s') AS recorded_at_utc,
         v.recorded_by, u.full_name AS recorded_by_name, ${KEYS.map(k => `v.${k}`).join(', ')}, v.notes
  FROM vital_signs v JOIN users u ON u.user_id = v.recorded_by`;

const present = (row) => {
  const at = fromSqlUtc(row.recorded_at_utc);
  const out = { ...row, recorded_at: at.toISOString(), recorded_at_ist: formatIst(at) };
  delete out.recorded_at_utc;
  for (const k of KEYS) if (out[k] != null) out[k] = Number(out[k]);
  return { ...out, abnormal: abnormalKeys(out) };
};

// Where a new reading for this patient belongs: the visit or admission the nurse named, or else the
// patient's active admission in one of the nurse's wards, or else their open visit.
async function openContexts(connection, user, patientId) {
  const [[admission]] = await connection.execute(`
    SELECT a.admission_id, a.admission_date, b.bed_number, w.name AS ward_name,
           (b.ward_id IN (${NURSE_WARDS_SQL})) AS in_my_ward
    FROM admissions a JOIN beds b ON b.bed_id = a.bed_id JOIN wards w ON w.ward_id = b.ward_id
    WHERE a.patient_id = ? AND a.status = 'ACTIVE' ORDER BY a.admission_id DESC LIMIT 1`, [user.user_id, patientId]);
  const [[encounter]] = await connection.execute(`
    SELECT e.encounter_id, e.encounter_type, e.status, e.doctor_id, d.name AS doctor_name
    FROM encounters e JOIN doctors d ON d.doctor_id = e.doctor_id
    WHERE e.patient_id = ? AND e.status IN ('ARRIVED', 'TRIAGED', 'IN_PROGRESS') ORDER BY e.encounter_id DESC LIMIT 1`, [patientId]);
  return {
    admission: admission ? { ...admission, in_my_ward: Boolean(Number(admission.in_my_ward)) } : null,
    encounter: encounter || null,
  };
}

async function resolveContext(connection, user, patientId, { encounter_id, admission_id }) {
  let encounter = null; let admission = null;
  if (encounter_id != null) {
    [[encounter]] = await connection.execute('SELECT encounter_id, patient_id, status FROM encounters WHERE encounter_id = ?', [encounter_id]);
    if (!encounter || encounter.patient_id !== patientId) throw httpError(400, 'That visit does not belong to this patient');
    if (!OPEN_ENCOUNTER.includes(encounter.status)) throw httpError(409, `Cannot record vitals on a visit that is ${encounter.status}`);
  }
  if (admission_id != null) {
    [[admission]] = await connection.execute(`
      SELECT a.admission_id, a.patient_id, a.status, (b.ward_id IN (${NURSE_WARDS_SQL})) AS in_my_ward
      FROM admissions a JOIN beds b ON b.bed_id = a.bed_id WHERE a.admission_id = ?`, [user.user_id, admission_id]);
    if (!admission || admission.patient_id !== patientId) throw httpError(400, 'That admission does not belong to this patient');
    if (admission.status !== 'ACTIVE') throw httpError(409, 'Cannot record vitals on a discharged admission');
    if (!Number(admission.in_my_ward)) throw httpError(403, 'Forbidden: this patient is not in one of your wards');
  }
  if (!encounter && !admission) {
    const open = await openContexts(connection, user, patientId);
    if (open.admission && open.admission.in_my_ward) admission = open.admission;
    else if (open.encounter) encounter = open.encounter;
    else throw httpError(409, 'This patient has no open visit or admission to record vitals against');
  }
  return { encounter, admission };
}

// POST /api/vitals { patient_id, encounter_id?, admission_id?, <vitals>, notes?, mark_triaged? } (NURSE)
exports.record = async (req, res) => {
  try {
    const { patient_id, encounter_id, admission_id, notes, mark_triaged } = req.body || {};
    if (!isId(patient_id)) return res.status(400).json({ success: false, message: 'Invalid patient id' });
    if (encounter_id != null && !isId(encounter_id)) return res.status(400).json({ success: false, message: 'Invalid encounter id' });
    if (admission_id != null && !isId(admission_id)) return res.status(400).json({ success: false, message: 'Invalid admission id' });
    if (notes != null && String(notes).length > 255) return res.status(400).json({ success: false, message: 'Notes must be 255 characters or fewer' });
    const parsed = parseVitals(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
    const patientId = Number(patient_id);
    if (!(await canAccessPatient(req.user, patientId, 'clinical'))) {
      return res.status(403).json({ success: false, message: 'Forbidden: this patient is not assigned to you' });
    }

    const result = await withTransaction(req, async (connection, audit) => {
      const { encounter, admission } = await resolveContext(connection, req.user, patientId, { encounter_id, admission_id });
      // Triage first (it locks appointment -> encounter), then the reading.
      let triaged = false;
      if (mark_triaged) {
        if (!encounter) throw httpError(400, 'Only a visit can be marked triaged; this reading is for an admission');
        if (encounter.status === 'ARRIVED') {
          await transitionEncounter(connection, req, encounter.encounter_id, 'triage', async (e) => {
            if (!(await isNurseAssignedPatient(req.user.user_id, e.patient_id, connection))) throw new EncounterError(403, 'Forbidden: patient is not assigned to you');
          });
          triaged = true;
        }
      }
      const values = parsed.values;
      const cols = Object.keys(values);
      const [ins] = await connection.execute(
        `INSERT INTO vital_signs (patient_id, encounter_id, admission_id, recorded_at_utc, recorded_by, notes${cols.map(c => `, ${c}`).join('')})
         VALUES (?, ?, ?, ?, ?, ?${cols.map(() => ', ?').join('')})`,
        [patientId, encounter?.encounter_id ?? null, admission?.admission_id ?? null, toSqlUtc(new Date()), req.user.user_id,
          notes ? String(notes).trim() || null : null, ...cols.map(c => values[c])]);
      // Field names and flags only: never the values or the note.
      await audit({
        action: 'RECORD_VITALS', entityType: 'vital_signs', entityId: ins.insertId, patientId,
        details: { encounter_id: encounter?.encounter_id ?? null, admission_id: admission?.admission_id ?? null, recorded: cols, abnormal: abnormalKeys(values), marked_triaged: triaged },
      });
      return { id: ins.insertId, triaged };
    });
    const [[row]] = await pool.execute(`${READING_SQL} WHERE v.vital_id = ?`, [result.id]);
    res.status(201).json({ success: true, data: { ...present(row), marked_triaged: result.triaged } });
  } catch (error) { fail(res, error); }
};

// GET /api/vitals/patients/:patientId (NURSE, DOCTOR) — readings oldest first (latest 200), the
// field definitions with reference ranges, and the open visit/admission new readings would attach to.
exports.listForPatient = async (req, res) => {
  try {
    if (!isId(req.params.patientId)) return res.status(400).json({ success: false, message: 'Invalid patient id' });
    const patientId = Number(req.params.patientId);
    if (!(await canAccessPatient(req.user, patientId, 'clinical'))) {
      return res.status(403).json({ success: false, message: 'Forbidden: this patient is not under your care' });
    }
    const [rows] = await pool.execute(`SELECT * FROM (${READING_SQL} WHERE v.patient_id = ? ORDER BY v.recorded_at_utc DESC, v.vital_id DESC LIMIT 200) r ORDER BY r.recorded_at_utc, r.vital_id`, [patientId]);
    const open = await openContexts(pool, req.user, patientId);
    res.json({
      success: true,
      data: {
        definitions: VITALS,
        readings: rows.map(present),
        can_record: req.user.role === 'NURSE',
        open_admission: open.admission && req.user.role === 'NURSE' && !open.admission.in_my_ward ? null : open.admission,
        open_encounter: open.encounter,
      },
    });
  } catch (error) { fail(res, error); }
};
