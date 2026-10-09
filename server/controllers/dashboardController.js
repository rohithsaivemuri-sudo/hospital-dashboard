const pool = require('../config/db');

exports.getStats = async (req, res) => {
  try {
    const [[{ totalPatients }]] = await pool.execute('SELECT COUNT(*) as totalPatients FROM patients');
    const [[{ occupiedBeds }]] = await pool.execute('SELECT COUNT(*) as occupiedBeds FROM beds WHERE status = "OCCUPIED"');
    const [availableBeds] = await pool.execute('SELECT bed_type, COUNT(*) as count FROM beds WHERE status = "AVAILABLE" GROUP BY bed_type');
    const [[{ availableDoctors }]] = await pool.execute('SELECT COUNT(*) as availableDoctors FROM doctors WHERE status = "AVAILABLE"');
    const [[{ emergencyQueueCount }]] = await pool.execute('SELECT COUNT(*) as emergencyQueueCount FROM emergency_cases WHERE status = "WAITING"');
    const [[{ currentAdmissions }]] = await pool.execute('SELECT COUNT(*) as currentAdmissions FROM admissions WHERE status = "ACTIVE"');
    const [[{ incomingAmbulances }]] = await pool.execute('SELECT COUNT(*) as incomingAmbulances FROM ambulances WHERE status != "AVAILABLE"');
    const [[{ todayAppointments }]] = await pool.execute('SELECT COUNT(*) as todayAppointments FROM appointments WHERE appointment_date = CURDATE()');
    
    // total beds for occupancy
    const [[{ totalBeds }]] = await pool.execute('SELECT COUNT(*) as totalBeds FROM beds');
    
    // Fix: Convert aggregate results to Numbers to prevent BigInt Math/JSON serialization errors 
    // and to ensure the frontend receives strict Numbers instead of strings for math operations.
    const numTotalBeds = Number(totalBeds);
    const numOccupiedBeds = Number(occupiedBeds);
    const hospitalOccupancy = numTotalBeds ? (numOccupiedBeds / numTotalBeds) * 100 : 0;
    
    const [recentEmergencies] = await pool.execute('SELECT * FROM emergency_cases ORDER BY arrival_time DESC LIMIT 10');

    res.json({
      success: true,
      data: {
        totalPatients: Number(totalPatients),
        availableBeds: availableBeds.map(row => ({
          bed_type: row.bed_type,
          count: Number(row.count)
        })),
        occupiedBeds: numOccupiedBeds,
        availableDoctors: Number(availableDoctors),
        emergencyQueueCount: Number(emergencyQueueCount),
        currentAdmissions: Number(currentAdmissions),
        incomingAmbulances: Number(incomingAmbulances),
        todayAppointments: Number(todayAppointments),
        hospitalOccupancy,
        recentEmergencies
      }
    });
  } catch (error) { 
    console.error("Dashboard error:", error);
    res.status(500).json({ success: false, message: error.message }); 
  }
};
