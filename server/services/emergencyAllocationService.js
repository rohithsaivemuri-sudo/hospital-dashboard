const pool = require('../config/db');

async function allocateEmergencyResources(emergencyId, io) {
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
      await connection.commit();
      
      if (io) {
        io.emit('emergency:no-bed', { emergencyId, message: 'No available bed. Patient in queue.' });
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
        await connection.commit();
        
        if (io) {
          io.emit('emergency:no-doctor', { emergencyId, message: 'No available doctor.' });
        }
        
        return { success: false, message: 'No available doctor. Patient remains in queue.', queued: true };
      }
      
      doctors.push(anyDoctors[0]);
    }

    const doctor = doctors[0];

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

    // 8. Update emergency case
    await connection.execute(
      `UPDATE emergency_cases SET status = 'ALLOCATED', assigned_doctor_id = ?, assigned_bed_id = ?, updated_at = NOW() WHERE emergency_id = ?`,
      [doctor.doctor_id, bed.bed_id, emergencyId]
    );

    await connection.commit();

    const result = {
      success: true,
      message: 'Emergency resources allocated successfully',
      allocation: {
        emergencyId,
        patientId: emergency.patient_id,
        doctor: { id: doctor.doctor_id, name: doctor.name, specialization: doctor.specialization },
        bed: { id: bed.bed_id, number: bed.bed_number, type: bed.bed_type, floor: bed.floor },
        admissionId: admissionResult.insertId
      }
    };

    // 9. Emit Socket.IO events
    if (io) {
      io.emit('emergency:allocated', result.allocation);
      io.emit('bed:updated', { bedId: bed.bed_id, status: 'OCCUPIED' });
      io.emit('doctor:updated', { doctorId: doctor.doctor_id });
      io.emit('admission:new', { admissionId: admissionResult.insertId });
      io.emit('dashboard:refresh');
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
