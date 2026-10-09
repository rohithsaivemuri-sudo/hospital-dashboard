// Encounter state machine (report Section F.1, FHIR Encounter.status).
//
//   (none) --arrive--> ARRIVED --triage--> TRIAGED
//   ARRIVED | TRIAGED --start--> IN_PROGRESS --finish--> FINISHED   (one IN_PROGRESS per doctor+patient)
//   PLANNED | ARRIVED | TRIAGED --cancel--> CANCELLED            (left without being seen)
//   anything but FINISHED --enteredInError--> ENTERED_IN_ERROR
//
// Triage is not a gate: a doctor can start from ARRIVED or TRIAGED. Every transition updates the
// encounter and its appointment (mirrored status) in the caller's transaction, with the
// appointment row locked first, so the two can never disagree. Lock order: appointment ->
// encounter. Any other transition is rejected with 409.
const { writeAudit } = require('./audit');

const TRANSITIONS = {
  triage: { from: ['ARRIVED'], to: 'TRIAGED', stamp: 'triaged_at' },
  start: { from: ['ARRIVED', 'TRIAGED'], to: 'IN_PROGRESS', stamp: 'start_timestamp' },
  finish: { from: ['IN_PROGRESS'], to: 'FINISHED', stamp: 'end_timestamp' },
  cancel: { from: ['PLANNED', 'ARRIVED', 'TRIAGED'], to: 'CANCELLED', stamp: 'end_timestamp' },
  enteredInError: { from: ['PLANNED', 'ARRIVED', 'TRIAGED', 'IN_PROGRESS', 'CANCELLED'], to: 'ENTERED_IN_ERROR', stamp: 'end_timestamp' },
};

// Encounter status -> appointment status.
const APPOINTMENT_MIRROR = {
  ARRIVED: 'CHECKED_IN', TRIAGED: 'CHECKED_IN', IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'COMPLETED', CANCELLED: 'CANCELLED', ENTERED_IN_ERROR: 'CANCELLED',
};

const CLOSED = ['FINISHED', 'CANCELLED', 'ENTERED_IN_ERROR'];

class EncounterError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const AUDIT_ACTION = {
  ARRIVED: 'ENCOUNTER_ARRIVED', TRIAGED: 'ENCOUNTER_TRIAGED', IN_PROGRESS: 'ENCOUNTER_STARTED',
  FINISHED: 'ENCOUNTER_FINISHED', CANCELLED: 'ENCOUNTER_CANCELLED', ENTERED_IN_ERROR: 'ENCOUNTER_ENTERED_IN_ERROR',
};

async function lockAppointment(connection, appointmentId) {
  const [[appointment]] = await connection.execute(
    'SELECT appointment_id, patient_id, doctor_id, status FROM appointments WHERE appointment_id = ? FOR UPDATE', [appointmentId]
  );
  return appointment;
}

async function lockEncounter(connection, encounterId) {
  const [[encounter]] = await connection.execute('SELECT * FROM encounters WHERE encounter_id = ? FOR UPDATE', [encounterId]);
  return encounter;
}

async function auditTransition(connection, req, encounter, from, to, appointment) {
  await writeAudit(connection, req, {
    action: AUDIT_ACTION[to], entityType: 'encounter', entityId: encounter.encounter_id, patientId: encounter.patient_id,
    details: {
      from, to,
      ...(appointment ? { appointment_id: appointment.appointment_id, appointment: { from: appointment.status, to: APPOINTMENT_MIRROR[to] } } : {}),
    },
  });
}

// Check-in: a BOOKED appointment becomes CHECKED_IN and gets an ARRIVED encounter (or its
// PLANNED encounter moves to ARRIVED).
async function arriveAppointment(connection, req, appointmentId) {
  const appointment = await lockAppointment(connection, appointmentId);
  if (!appointment) throw new EncounterError(404, 'Appointment not found');
  if (appointment.status !== 'BOOKED') {
    throw new EncounterError(409, `Cannot check in an appointment that is ${appointment.status}`);
  }
  const [[existing]] = await connection.execute('SELECT encounter_id FROM encounters WHERE appointment_id = ?', [appointmentId]);
  let encounter;
  if (existing) {
    encounter = await lockEncounter(connection, existing.encounter_id);
    if (encounter.status !== 'PLANNED') throw new EncounterError(409, `Cannot check in: encounter is ${encounter.status}`);
    await connection.execute('UPDATE encounters SET status = "ARRIVED", arrived_at = NOW() WHERE encounter_id = ?', [encounter.encounter_id]);
  } else {
    const [result] = await connection.execute(
      'INSERT INTO encounters (patient_id, doctor_id, appointment_id, encounter_type, status, arrived_at, created_by) VALUES (?, ?, ?, "OUTPATIENT", "ARRIVED", NOW(), ?)',
      [appointment.patient_id, appointment.doctor_id, appointment.appointment_id, req.user.user_id]
    );
    encounter = { encounter_id: result.insertId, patient_id: appointment.patient_id, status: null };
  }
  await connection.execute('UPDATE appointments SET status = "CHECKED_IN" WHERE appointment_id = ?', [appointmentId]);
  await auditTransition(connection, req, encounter, encounter.status, 'ARRIVED', appointment);
  return encounter.encounter_id;
}

// Walk-in: an ARRIVED encounter with no appointment.
async function arriveWalkIn(connection, req, { patientId, doctorId }) {
  const [[patient]] = await connection.execute('SELECT patient_id FROM patients WHERE patient_id = ?', [patientId ?? null]);
  if (!patient) throw new EncounterError(400, 'Patient not found');
  const [[doctor]] = await connection.execute('SELECT doctor_id FROM doctors WHERE doctor_id = ?', [doctorId ?? null]);
  if (!doctor) throw new EncounterError(400, 'Doctor not found');
  const [result] = await connection.execute(
    'INSERT INTO encounters (patient_id, doctor_id, encounter_type, status, arrived_at, created_by) VALUES (?, ?, "OUTPATIENT", "ARRIVED", NOW(), ?)',
    [patient.patient_id, doctor.doctor_id, req.user.user_id]
  );
  await auditTransition(connection, req, { encounter_id: result.insertId, patient_id: patient.patient_id }, null, 'ARRIVED', null);
  return result.insertId;
}

// Applies a named transition to an encounter. `authorize(encounter)` may throw to deny.
async function transitionEncounter(connection, req, encounterId, action, authorize) {
  const rule = TRANSITIONS[action];
  if (!rule) throw new EncounterError(400, `Unknown encounter action: ${action}`);

  // Find the appointment without locking, then lock appointment -> encounter and re-read.
  const [[peek]] = await connection.execute('SELECT appointment_id FROM encounters WHERE encounter_id = ?', [encounterId]);
  if (!peek) throw new EncounterError(404, 'Encounter not found');
  const appointment = peek.appointment_id ? await lockAppointment(connection, peek.appointment_id) : null;
  const encounter = await lockEncounter(connection, encounterId);
  if (authorize) await authorize(encounter);

  if (!rule.from.includes(encounter.status)) {
    throw new EncounterError(409, `Cannot ${action === 'enteredInError' ? 'mark as entered in error' : action} an encounter that is ${encounter.status}`);
  }
  if (action === 'start') {
    // One open visit per doctor and patient, so new records attach to an unambiguous encounter.
    const [[open]] = await connection.execute(
      'SELECT encounter_id FROM encounters WHERE doctor_id = ? AND patient_id = ? AND status = "IN_PROGRESS" AND encounter_id <> ?',
      [encounter.doctor_id, encounter.patient_id, encounter.encounter_id]
    );
    if (open) throw new EncounterError(409, `This doctor already has encounter #${open.encounter_id} in progress with this patient; finish it first`);
  }
  await connection.execute(
    `UPDATE encounters SET status = ?, ${rule.stamp} = NOW() WHERE encounter_id = ?`, [rule.to, encounter.encounter_id]
  );
  if (appointment) {
    await connection.execute('UPDATE appointments SET status = ? WHERE appointment_id = ?', [APPOINTMENT_MIRROR[rule.to], appointment.appointment_id]);
  }
  await auditTransition(connection, req, encounter, encounter.status, rule.to, appointment);
  return { ...encounter, status: rule.to };
}

// PUT /api/appointments/:id/status keeps working, but routes through the same state machine.
// Returns true if it handled the change.
async function applyAppointmentStatus(connection, req, appointmentId, status) {
  const appointment = await lockAppointment(connection, appointmentId);
  if (!appointment) throw new EncounterError(404, 'Appointment not found');
  if (appointment.status === status) throw new EncounterError(409, `Appointment is already ${status}`);
  const [[enc]] = await connection.execute('SELECT encounter_id, status FROM encounters WHERE appointment_id = ?', [appointmentId]);

  switch (status) {
    case 'CHECKED_IN':
      return arriveAppointment(connection, req, appointmentId);
    case 'IN_PROGRESS':
    case 'COMPLETED': {
      if (!enc) throw new EncounterError(409, `Cannot move a ${appointment.status} appointment to ${status}`);
      return transitionEncounter(connection, req, enc.encounter_id, status === 'IN_PROGRESS' ? 'start' : 'finish');
    }
    case 'CANCELLED':
      if (enc) return transitionEncounter(connection, req, enc.encounter_id, 'cancel');
      // falls through: a BOOKED appointment that never arrived
    case 'NO_SHOW': {
      if (appointment.status !== 'BOOKED' || enc) throw new EncounterError(409, `Cannot mark a ${appointment.status} appointment as ${status}`);
      await connection.execute('UPDATE appointments SET status = ? WHERE appointment_id = ?', [status, appointmentId]);
      await writeAudit(connection, req, {
        action: 'UPDATE_APPOINTMENT_STATUS', entityType: 'appointment', entityId: appointment.appointment_id, patientId: appointment.patient_id,
        details: { from: appointment.status, to: status },
      });
      return null;
    }
    case 'BOOKED':
      throw new EncounterError(409, 'An appointment cannot be moved back to BOOKED');
    default:
      throw new EncounterError(400, `Unknown appointment status: ${status}`);
  }
}

// Encounter to attach a new clinical record to. An explicit encounter_id must belong to this
// patient and doctor and be IN_PROGRESS. Otherwise the doctor's single IN_PROGRESS encounter with
// the patient is used, or NULL (e.g. inpatient rounds with no open visit).
async function resolveEncounterForRecord(connection, { encounterId, patientId, doctorId, consultationId }) {
  if (encounterId) {
    const [[e]] = await connection.execute('SELECT encounter_id, patient_id, doctor_id, status FROM encounters WHERE encounter_id = ?', [encounterId]);
    if (!e) throw new EncounterError(400, 'Encounter not found');
    if (Number(e.patient_id) !== Number(patientId) || Number(e.doctor_id) !== Number(doctorId)) {
      throw new EncounterError(400, 'Encounter belongs to a different patient or doctor');
    }
    if (e.status !== 'IN_PROGRESS') throw new EncounterError(409, `Encounter is ${e.status}; records can only be added while it is IN_PROGRESS`);
    return e.encounter_id;
  }
  if (consultationId) {
    const [[c]] = await connection.execute('SELECT encounter_id FROM consultations WHERE consultation_id = ?', [consultationId]);
    if (c && c.encounter_id) return c.encounter_id;
  }
  const [open] = await connection.execute(
    'SELECT encounter_id FROM encounters WHERE patient_id = ? AND doctor_id = ? AND status = "IN_PROGRESS"', [patientId ?? null, doctorId ?? null]
  );
  return open.length === 1 ? open[0].encounter_id : null;
}

module.exports = {
  TRANSITIONS, APPOINTMENT_MIRROR, CLOSED, EncounterError,
  arriveAppointment, arriveWalkIn, transitionEncounter, applyAppointmentStatus, resolveEncounterForRecord,
};
