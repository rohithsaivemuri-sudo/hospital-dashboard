const pool = require('../config/db');
const { withTransaction } = require('../utils/audit');
const { resolveEncounterForRecord } = require('../utils/encounters');

const { canAccessPatient } = require('../utils/patientAccess');
const checkDoctorAuth = (req, patientId) => canAccessPatient(req.user, patientId, 'clinical');

exports.create = async (req, res) => {
  try {
    const { patient_id, doctor_id, procedure_name, diagnosis, priority, requested_date, notes, encounter_id } = req.body;
    
    if (req.user.role === 'DOCTOR') {
      if (parseInt(doctor_id) !== parseInt(req.user.doctor_id)) return res.status(403).json({ success: false, message: 'Forbidden' });
      const auth = await checkDoctorAuth(req, patient_id);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden: Patient not associated' });
    }

    const result = await withTransaction(req, async (connection, audit) => {
      const encounterId = await resolveEncounterForRecord(connection, { encounterId: encounter_id, patientId: patient_id, doctorId: doctor_id });
      const [inserted] = await connection.execute(
        'INSERT INTO surgery_requests (patient_id, doctor_id, procedure_name, diagnosis, priority, requested_date, status, notes, encounter_id) VALUES (?, ?, ?, ?, ?, ?, "REQUESTED", ?, ?)',
        [patient_id, doctor_id, procedure_name, diagnosis, priority || 'ROUTINE', requested_date, notes || '', encounterId]
      );
      await audit({ action: 'CREATE_SURGERY_REQUEST', entityType: 'surgery_request', entityId: inserted.insertId, patientId: patient_id, details: { priority: priority || 'ROUTINE', encounter_id: encounterId } });
      return inserted;
    });
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
};

exports.getByPatient = async (req, res) => {
  try {
    if (req.user.role === 'DOCTOR') {
      const auth = await checkDoctorAuth(req, req.params.patientId);
      if (!auth) return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const [rows] = await pool.execute('SELECT * FROM surgery_requests WHERE patient_id = ? ORDER BY requested_date DESC', [req.params.patientId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (req.user.role === 'DOCTOR') {
      const [existing] = await pool.execute('SELECT doctor_id FROM surgery_requests WHERE request_id = ?', [req.params.id]);
      if (existing.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
      if (parseInt(existing[0].doctor_id) !== parseInt(req.user.doctor_id)) return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await withTransaction(req, async (connection, audit) => {
      const [[before]] = await connection.execute('SELECT request_id, patient_id, status FROM surgery_requests WHERE request_id = ? FOR UPDATE', [req.params.id]);
      await connection.execute('UPDATE surgery_requests SET status = ? WHERE request_id = ?', [status, req.params.id]);
      if (before && before.status !== status) await audit({ action: 'UPDATE_SURGERY_STATUS', entityType: 'surgery_request', entityId: before.request_id, patientId: before.patient_id, details: { from: before.status, to: status } });
    });
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
