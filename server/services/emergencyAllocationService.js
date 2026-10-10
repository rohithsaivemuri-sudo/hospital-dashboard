const pool = require('../config/db');
const realtime = require('../utils/realtime');

// audit(connection, entry), when given, is called before each COMMIT so the allocation and its
// audit row are written in the same transaction. options.userId is recorded as the visit's creator.
//
// An allocated case also gets an EMERGENCY visit (encounter) for the doctor to document against, in
// the same transaction: if that doctor already has an open visit with the patient it is linked to
// the admission instead. Lock order: emergency case -> bed -> doctor -> the doctor's open visits with
// the patient -> (admission insert). Visits are locked before the admission insert because that
// insert takes a shared lock on the patient row, and starting a visit locks encounter -> patient.
// Concurrent allocations for the same doctor are already serialised on the doctor row.
async function allocateEmergencyResources(emergencyId, io, audit, options = {}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Get emergency case details
    const [emergencies] = await connection.execute(
      'SELECT * FROM emergency_cases WHERE emergency_id = ? AND status IN ("WAITING", "TRIAGED") FOR UPDATE',
      [emergencyId]
    );
    
    if (emergencies.length === 0) {
      await connection.rollback();
      return { success: false, message: 'Emergency case not found or already allocated' };
    }

    const emergency = emergencies[0];

    // The admission and the visit need a registered patient: an unregistered case can wait in the
    // queue, but is allocated only once a patient is linked (PUT /api/emergency/:id/patient).
    if (!emergency.patient_id) {
      await connection.rollback();
      return { success: false, code: 'PATIENT_REQUIRED', message: 'Register the patient and link them to this case before allocating' };
    }

    // 2. Find available bed matching requirements WITH ROW LOCK
    let bedQuery = `
      SELECT b.* FROM beds b
      WHERE b.status = 'AVAILABLE'
      AND b.bed_type = ?
    `;
    const bedParams = [emergency.required_bed_type];
    
    if (emergency.ventilator_required) {
      bedQuery += ' AND b.has_ventilator = TRUE';
    }
    
    bedQuery += ' ORDER BY b.bed_id ASC LIMIT 1 FOR UPDATE';
    
    const [beds] = await connection.execute(bedQuery, bedParams);
    
    if (beds.length === 0) {
      // No bed available - put in queue
      await connection.execute(
        'UPDATE emergency_cases SET status = "WAITING", notes = CONCAT(COALESCE(notes, ""), "\nNo available bed found at ", NOW()) WHERE emergency_id = ?',
        [emergencyId]
      );
      if (audit) await audit(connection, { action: 'EMERGENCY_QUEUED', entityType: 'emergency_case', entityId: emergency.emergency_id, patientId: emergency.patient_id, details: { reason: 'NO_BED' } });
      await connection.commit();
      
      if (io) {
        realtime.emergencyEvent('emergency:no-bed', { emergencyId, status: 'WAITING' });
      }
      
      return { success: false, message: 'No available bed matching requirements. Patient remains in queue.', queued: true };
    }

    const bed = beds[0];

    // 3. Find available doctor matching specialization WITH ROW LOCK
    let doctorQuery = `
      SELECT d.* FROM doctors d
      WHERE d.status = 'AVAILABLE'
      AND d.current_workload < d.max_workload
    `;
    const doctorParams = [];
    
    if (emergency.required_specialization) {
      doctorQuery += ' AND d.specialization = ?';
      doctorParams.push(emergency.required_specialization);
    }
    
    doctorQuery += ' ORDER BY d.current_workload ASC, d.doctor_id ASC LIMIT 1 FOR UPDATE';
    
    const [doctors] = await connection.execute(doctorQuery, doctorParams);
    
    if (doctors.length === 0) {
      // Try any available doctor if specialization not found
      const [anyDoctors] = await connection.execute(
        'SELECT * FROM doctors WHERE status = "AVAILABLE" AND current_workload < max_workload ORDER BY current_workload ASC LIMIT 1 FOR UPDATE',
        []
      );
      
      if (anyDoctors.length === 0) {
        await connection.execute(
          'UPDATE emergency_cases SET status = "WAITING", notes = CONCAT(COALESCE(notes, ""), "\nNo available doctor found at ", NOW()) WHERE emergency_id = ?',
          [emergencyId]
        );
        if (audit) await audit(connection, { action: 'EMERGENCY_QUEUED', entityType: 'emergency_case', entityId: emergency.emergency_id, patientId: emergency.patient_id, details: { reason: 'NO_DOCTOR' } });
        await connection.commit();
        
        if (io) {
          realtime.emergencyEvent('emergency:no-doctor', { emergencyId, status: 'WAITING' });
        }
        
        return { success: false, message: 'No available doctor. Patient remains in queue.', queued: true };
      }
      
      doctors.push(anyDoctors[0]);
    }

    const doctor = doctors[0];

    // 3b. This doctor's open visits with the patient, locked. Found with a plain read, then locked by
    // primary key and re-checked: a locking read through the (patient, status) index would lock the
    // index entry before the row, while a concurrent status change (e.g. starting the visit) holds
    // the row and then updates that index entry — a deadlock. The plain read is this transaction's
    // first non-locking read and happens after the doctor-row lock, so it sees any visit committed by
    // a concurrent allocation for the same doctor.
    const [candidates] = await connection.execute(
      `SELECT encounter_id FROM encounters WHERE patient_id = ? AND doctor_id = ? AND status IN ('ARRIVED', 'TRIAGED', 'IN_PROGRESS')`,
      [emergency.patient_id, doctor.doctor_id]
    );
    let openVisits = [];
    if (candidates.length) {
      [openVisits] = await connection.query(
        `SELECT encounter_id, status, admission_id FROM encounters WHERE encounter_id IN (?) ORDER BY encounter_id FOR UPDATE`,
        [candidates.map(c => c.encounter_id)]
      );
      const rank = { IN_PROGRESS: 0, TRIAGED: 1, ARRIVED: 2 };
      openVisits = openVisits.filter(v => v.status in rank)
        .sort((x, y) => rank[x.status] - rank[y.status] || y.encounter_id - x.encounter_id);
    }

    // The database triggers (`after_admission_insert`) automatically handle:
    // 1. Updating bed status to OCCUPIED
    // 2. Incrementing doctor workload
    // 3. Creating the bed_assignment_log record

    // 4. Create admission (this fires the triggers)
    const [admissionResult] = await connection.execute(
      `INSERT INTO admissions (patient_id, doctor_id, bed_id, department_id, emergency_id, admission_date, status, diagnosis, notes)
       VALUES (?, ?, ?, ?, ?, NOW(), 'ACTIVE', ?, ?)`,
      [emergency.patient_id, doctor.doctor_id, bed.bed_id, doctor.department_id, emergencyId, emergency.symptoms, `Emergency admission - Severity: ${emergency.severity}`]
    );

    // 5. The visit: link the doctor's open one, or create an EMERGENCY visit in ARRIVED.
    let visit;
    if (openVisits.length) {
      visit = openVisits[0];
      if (!visit.admission_id) {
        await connection.execute('UPDATE encounters SET admission_id = ? WHERE encounter_id = ?', [admissionResult.insertId, visit.encounter_id]);
      }
      if (audit) {
        await audit(connection, { action: 'ENCOUNTER_LINKED_ADMISSION', entityType: 'encounter', entityId: visit.encounter_id, patientId: emergency.patient_id,
          details: { admission_id: admissionResult.insertId, emergency_id: emergency.emergency_id, linked: !visit.admission_id } });
      }
    } else {
      const [created] = await connection.execute(
        `INSERT INTO encounters (patient_id, doctor_id, admission_id, encounter_type, status, arrived_at, created_by)
         VALUES (?, ?, ?, 'EMERGENCY', 'ARRIVED', NOW(), ?)`,
        [emergency.patient_id, doctor.doctor_id, admissionResult.insertId, options.userId ?? null]
      );
      visit = { encounter_id: created.insertId, status: 'ARRIVED' };
      if (audit) {
        await audit(connection, { action: 'ENCOUNTER_ARRIVED', entityType: 'encounter', entityId: visit.encounter_id, patientId: emergency.patient_id,
          details: { from: null, to: 'ARRIVED', source: 'EMERGENCY', emergency_id: emergency.emergency_id, admission_id: admissionResult.insertId } });
      }
    }

    // 8. Update emergency case
    await connection.execute(
      `UPDATE emergency_cases SET status = 'ALLOCATED', assigned_doctor_id = ?, assigned_bed_id = ?, updated_at = NOW() WHERE emergency_id = ?`,
      [doctor.doctor_id, bed.bed_id, emergencyId]
    );

    if (audit) {
      await audit(connection, { action: 'ALLOCATE_EMERGENCY', entityType: 'emergency_case', entityId: emergency.emergency_id, patientId: emergency.patient_id,
        details: { admission_id: admissionResult.insertId, bed_id: bed.bed_id, doctor_id: doctor.doctor_id, encounter_id: visit.encounter_id } });
    }
    await connection.commit();

    const result = {
      success: true,
      message: 'Emergency resources allocated successfully',
      allocation: {
        emergencyId,
        patientId: emergency.patient_id,
        doctor: { id: doctor.doctor_id, name: doctor.name, specialization: doctor.specialization },
        bed: { id: bed.bed_id, number: bed.bed_number, type: bed.bed_type, floor: bed.floor },
        admissionId: admissionResult.insertId,
        encounterId: visit.encounter_id
      }
    };

    // 9. Emit Socket.IO events
    if (io) {
      // Ids and status only; the full allocation is in the API response.
      realtime.emergencyEvent('emergency:allocated', { emergencyId, status: 'ALLOCATED', admissionId: admissionResult.insertId, bedId: bed.bed_id, doctorId: doctor.doctor_id });
      realtime.bedUpdated({ bedId: bed.bed_id, status: 'OCCUPIED' });
      realtime.doctorUpdated({ doctorId: doctor.doctor_id });
      realtime.admissionEvent('admission:new', { admissionId: admissionResult.insertId, status: 'ACTIVE', doctorId: doctor.doctor_id, wardId: bed.ward_id });
      realtime.dashboardRefresh();
      // The doctor's "My Open Visits" (and front desk, nurses) refetch.
      realtime.encounterUpdated({ encounterId: visit.encounter_id, status: visit.status, doctorId: doctor.doctor_id });
    }

    return result;

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { allocateEmergencyResources };
