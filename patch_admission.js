const fs = require('fs');
let code = fs.readFileSync('server/controllers/admissionController.js', 'utf8');

const replacement = `    const { patient_id, doctor_id, bed_id, department_id, diagnosis, notes } = req.body;
    
    // Auth check for doctors
    if (req.user.role === 'DOCTOR') {
      if (parseInt(doctor_id) !== parseInt(req.user.doctor_id)) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      // Note: Doctors can admit a patient even if they are not already associated (it establishes association)
    }`;

code = code.replace(
  "    const { patient_id, doctor_id, bed_id, department_id, diagnosis, notes } = req.body;",
  replacement
);

fs.writeFileSync('server/controllers/admissionController.js', code);
