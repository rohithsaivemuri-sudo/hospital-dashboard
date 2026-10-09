const pool = require('./server/config/db');
async function test() {
  try {
    console.log("Testing dashboard queries...");
    const [[{ totalPatients }]] = await pool.execute('SELECT COUNT(*) as totalPatients FROM patients');
    console.log("totalPatients", totalPatients);
    
    const [[{ occupiedBeds }]] = await pool.execute('SELECT COUNT(*) as occupiedBeds FROM beds WHERE status = "OCCUPIED"');
    console.log("occupiedBeds", occupiedBeds);
    
    const [availableBeds] = await pool.execute('SELECT bed_type, COUNT(*) as count FROM beds WHERE status = "AVAILABLE" GROUP BY bed_type');
    console.log("availableBeds", availableBeds);
    
    const [[{ availableDoctors }]] = await pool.execute('SELECT COUNT(*) as availableDoctors FROM doctors WHERE status = "AVAILABLE"');
    console.log("availableDoctors", availableDoctors);
    
    const [[{ emergencyQueueCount }]] = await pool.execute('SELECT COUNT(*) as emergencyQueueCount FROM emergency_cases WHERE status = "WAITING"');
    console.log("emergencyQueueCount", emergencyQueueCount);
    
    const [[{ currentAdmissions }]] = await pool.execute('SELECT COUNT(*) as currentAdmissions FROM admissions WHERE status = "ACTIVE"');
    console.log("currentAdmissions", currentAdmissions);
    
    const [[{ incomingAmbulances }]] = await pool.execute('SELECT COUNT(*) as incomingAmbulances FROM ambulances WHERE status != "AVAILABLE"');
    console.log("incomingAmbulances", incomingAmbulances);
    
    const [[{ todayAppointments }]] = await pool.execute('SELECT COUNT(*) as todayAppointments FROM appointments WHERE appointment_date = CURDATE()');
    console.log("todayAppointments", todayAppointments);
    
    const [[{ totalBeds }]] = await pool.execute('SELECT COUNT(*) as totalBeds FROM beds');
    console.log("totalBeds", totalBeds);
    
    const [recentEmergencies] = await pool.execute('SELECT * FROM emergency_cases ORDER BY arrival_time DESC LIMIT 10');
    console.log("recentEmergencies", recentEmergencies.length);
    
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error.message);
    process.exit(1);
  }
}
test();
