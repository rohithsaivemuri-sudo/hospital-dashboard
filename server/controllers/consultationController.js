const pool = require('../config/db');
const { withTransaction, changedFields } = require('../utils/audit');

const { CLOSED, EncounterError, resolveEncounterForRecord } = require('../utils/encounters');

const NOTE_FIELDS = ['symptoms', 'diagnosis', 'assessment', 'plan', 'notes'];

const { canAccessPatient } = require('../utils/patientAccess');
const checkDoctorAuth = (req, patientId) => canAccessPatient(req.user, patientId, 'clinical');

exports.create = async (req, res) => {
  try {
    const { appointment_id, encounter_id, patient_id, doctor_id, symptoms, diagnosis, assessment, plan, notes } = req.body;
    
    if (req.user.role === 'DOCTOR') {
      if (parseInt(doctor_id) !== parseInt(req.user.doctor_id)) return res.status(403).json({ success: false, message: 'Forbidden' });
      const auth = await checkDoctorAuth(req, patient_id);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden: Patient not associated' });
    }

    const id = await withTransaction(req, async (connection, audit) => {
      // Anchor the note to its encounter: the explicit encounter_id, else the appointment's
      // encounter, else the doctor's open encounter with this patient. Closed encounters are signed.
      let encounterId = null;
      if (encounter_id || !appointment_id) {
        encounterId = await resolveEncounterForRecord(connection, { encounterId: encounter_id, patientId: patient_id, doctorId: doctor_id });
      } else {
        const [[enc]] = await connection.execute('SELECT encounter_id, status FROM encounters WHERE appointment_id = ? FOR UPDATE', [appointment_id]);
        if (enc && CLOSED.includes(enc.status)) throw new EncounterError(409, `This visit's encounter is ${enc.status}; its notes are signed and closed`);
        encounterId = enc ? enc.encounter_id : null;
      }
      const [result] = await connection.execute('INSERT INTO consultations (appointment_id, patient_id, doctor_id, symptoms, diagnosis, assessment, plan, notes, consultation_time, encounter_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)', [appointment_id || null, patient_id, doctor_id, symptoms || '', diagnosis || '', assessment || '', plan || '', notes || '', encounterId]);
      // Field names only: note text never goes into the audit trail.
      await audit({ action: 'CREATE_CONSULTATION', entityType: 'consultation', entityId: result.insertId, patientId: patient_id,
        details: { appointment_id: appointment_id ? Number(appointment_id) : null, encounter_id: encounterId, fields_recorded: NOTE_FIELDS.filter(f => req.body[f]) } });
      return result.insertId;
    });
    res.status(201).json({ success: true, data: { id } });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM consultations WHERE consultation_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    
    if (req.user.role === 'DOCTOR') {
      const auth = await checkDoctorAuth(req, rows[0].patient_id);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getByPatient = async (req, res) => {
  try {
    if (req.user.role === 'DOCTOR') {
      const auth = await checkDoctorAuth(req, req.params.patientId);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const [rows] = await pool.execute('SELECT * FROM consultations WHERE patient_id = ? ORDER BY consultation_time DESC', [req.params.patientId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.update = async (req, res) => {
  try {
    const { symptoms, diagnosis, assessment, plan, notes } = req.body;
    
    if (req.user.role === 'DOCTOR') {
      const [existing] = await pool.execute('SELECT patient_id, doctor_id FROM consultations WHERE consultation_id = ?', [req.params.id]);
      if (existing.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
      if (parseInt(existing[0].doctor_id) !== parseInt(req.user.doctor_id)) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await withTransaction(req, async (connection, audit) => {
      const [[before]] = await connection.execute('SELECT * FROM consultations WHERE consultation_id = ? FOR UPDATE', [req.params.id]);
      // Notes on a finished, cancelled or voided encounter are signed and immutable.
      if (before && before.encounter_id) {
        const [[enc]] = await connection.execute('SELECT status FROM encounters WHERE encounter_id = ?', [before.encounter_id]);
        if (CLOSED.includes(enc.status)) throw new EncounterError(409, `This note belongs to a ${enc.status} encounter and can no longer be edited`);
      }
      await connection.execute('UPDATE consultations SET symptoms = ?, diagnosis = ?, assessment = ?, plan = ?, notes = ? WHERE consultation_id = ?', [symptoms || '', diagnosis || '', assessment || '', plan || '', notes || '', req.params.id]);
      const changed = before ? changedFields(before, { symptoms, diagnosis, assessment, plan, notes }, NOTE_FIELDS) : [];
      if (changed.length) await audit({ action: 'UPDATE_CONSULTATION', entityType: 'consultation', entityId: before.consultation_id, patientId: before.patient_id, details: { changed_fields: changed } });
    });
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
};
