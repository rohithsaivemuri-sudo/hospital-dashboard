const pool = require('../config/db');
exports.list = async (req, res) => {
  try {
    const { specialization, status, department_id } = req.query;
    let query = 'SELECT * FROM doctors WHERE 1=1';
    let params = [];
    if (specialization) { query += ' AND specialization = ?'; params.push(specialization); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (department_id) { query += ' AND department_id = ?'; params.push(department_id); }
    const [rows] = await pool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM doctors WHERE doctor_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.create = async (req, res) => {
  try {
    const { user_id, name, specialization, department_id, phone, shift, max_workload } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO doctors (user_id, name, specialization, department_id, phone, shift, max_workload, current_workload, status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, "AVAILABLE")', 
      [user_id, name, specialization, department_id, phone, shift, max_workload]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.update = async (req, res) => {
  try {
    const { name, specialization, max_workload } = req.body;
    await pool.execute('UPDATE doctors SET name = ?, specialization = ?, max_workload = ? WHERE doctor_id = ?', [name, specialization, max_workload, req.params.id]);
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getAvailable = async (req, res) => {
  try {
    const { specialization } = req.query;
    let query = 'SELECT * FROM doctors WHERE status = "AVAILABLE" AND current_workload < max_workload';
    let params = [];
    if (specialization) { query += ' AND specialization = ?'; params.push(specialization); }
    const [rows] = await pool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.getSchedule = async (req, res) => {
  res.json({ success: true, data: [] });
};
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    await pool.execute('UPDATE doctors SET status = ? WHERE doctor_id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getTodayAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'DOCTOR') return res.status(403).json({ success: false, message: 'Forbidden' });
    const doctor_id = req.user.doctor_id;

    // Calculate Analytics deterministically from authoritative tables
    
    // 1. Appointment patients today
    const [[{ appt_patients }]] = await pool.execute(
      'SELECT COUNT(DISTINCT patient_id) as appt_patients FROM appointments WHERE doctor_id = ? AND appointment_date = CURDATE()',
      [doctor_id]
    );

    // 2. Emergency cases today
    const [[{ emergency_cases }]] = await pool.execute(
      'SELECT COUNT(DISTINCT emergency_id) as emergency_cases FROM emergency_cases WHERE assigned_doctor_id = ? AND arrival_time >= CURDATE() AND arrival_time < CURDATE() + INTERVAL 1 DAY',
      [doctor_id]
    );

    // 3. Patients seen (Unique patients from appointments, emergencies, and active/discharged admissions today)
    const [[{ patients_seen }]] = await pool.execute(`
      SELECT COUNT(DISTINCT patient_id) as patients_seen FROM (
        SELECT patient_id FROM appointments WHERE doctor_id = ? AND appointment_date = CURDATE()
        UNION
        SELECT patient_id FROM emergency_cases WHERE assigned_doctor_id = ? AND arrival_time >= CURDATE() AND arrival_time < CURDATE() + INTERVAL 1 DAY
        UNION
        SELECT patient_id FROM admissions WHERE doctor_id = ? AND admission_date >= CURDATE() AND admission_date < CURDATE() + INTERVAL 1 DAY
      ) as t
    `, [doctor_id, doctor_id, doctor_id]);

    // 4. Patients treated (Unique patients with COMPLETED appointments, DISCHARGED/ADMITTED emergencies today)
    const [[{ patients_treated }]] = await pool.execute(`
      SELECT COUNT(DISTINCT patient_id) as patients_treated FROM (
        SELECT patient_id FROM appointments WHERE doctor_id = ? AND appointment_date = CURDATE() AND status = 'COMPLETED'
        UNION
        SELECT patient_id FROM emergency_cases WHERE assigned_doctor_id = ? AND arrival_time >= CURDATE() AND arrival_time < CURDATE() + INTERVAL 1 DAY AND status IN ('ADMITTED', 'DISCHARGED')
        UNION
        SELECT patient_id FROM admissions WHERE doctor_id = ? AND discharge_date >= CURDATE() AND discharge_date < CURDATE() + INTERVAL 1 DAY AND status = 'DISCHARGED'
      ) as t
    `, [doctor_id, doctor_id, doctor_id]);

    // 5. Cases Solved (Completed appointments + Admitted/Discharged emergencies)
    const [[{ cases_solved }]] = await pool.execute(`
      SELECT 
        (SELECT COUNT(*) FROM appointments WHERE doctor_id = ? AND appointment_date = CURDATE() AND status = 'COMPLETED') +
        (SELECT COUNT(*) FROM emergency_cases WHERE assigned_doctor_id = ? AND arrival_time >= CURDATE() AND arrival_time < CURDATE() + INTERVAL 1 DAY AND status IN ('ADMITTED', 'DISCHARGED'))
      AS cases_solved
    `, [doctor_id, doctor_id]);

    // 6. Cases Postponed (No-show or specifically flagged)
    const [[{ cases_postponed }]] = await pool.execute(`
      SELECT COUNT(*) as cases_postponed FROM appointments WHERE doctor_id = ? AND appointment_date = CURDATE() AND status = 'NO_SHOW'
    `, [doctor_id]);

    // 7. Cases Cancelled
    const [[{ cases_cancelled }]] = await pool.execute(`
      SELECT 
        (SELECT COUNT(*) FROM appointments WHERE doctor_id = ? AND appointment_date = CURDATE() AND status = 'CANCELLED') +
        (SELECT COUNT(*) FROM emergency_cases WHERE assigned_doctor_id = ? AND arrival_time >= CURDATE() AND arrival_time < CURDATE() + INTERVAL 1 DAY AND status = 'CANCELLED')
      AS cases_cancelled
    `, [doctor_id, doctor_id]);

    // 8. Cases Pending
    const [[{ cases_pending }]] = await pool.execute(`
      SELECT 
        (SELECT COUNT(*) FROM appointments WHERE doctor_id = ? AND appointment_date = CURDATE() AND status IN ('BOOKED', 'CHECKED_IN', 'IN_PROGRESS')) +
        (SELECT COUNT(*) FROM emergency_cases WHERE assigned_doctor_id = ? AND arrival_time >= CURDATE() AND arrival_time < CURDATE() + INTERVAL 1 DAY AND status IN ('WAITING', 'ALLOCATED'))
      AS cases_pending
    `, [doctor_id, doctor_id]);

    // Upsert into doctor_daily_analytics
    await pool.execute(`
      INSERT INTO doctor_daily_analytics 
      (doctor_id, analytics_date, patients_seen, emergency_cases, appointment_patients, patients_treated, cases_solved, cases_postponed, cases_cancelled, cases_pending)
      VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      patients_seen = VALUES(patients_seen),
      emergency_cases = VALUES(emergency_cases),
      appointment_patients = VALUES(appointment_patients),
      patients_treated = VALUES(patients_treated),
      cases_solved = VALUES(cases_solved),
      cases_postponed = VALUES(cases_postponed),
      cases_cancelled = VALUES(cases_cancelled),
      cases_pending = VALUES(cases_pending)
    `, [
      doctor_id, patients_seen, emergency_cases, appt_patients, patients_treated, 
      cases_solved, cases_postponed, cases_cancelled, cases_pending
    ]);

    // Fetch the updated row to return
    const [analytics] = await pool.execute('SELECT * FROM doctor_daily_analytics WHERE doctor_id = ? AND analytics_date = CURDATE()', [doctor_id]);
    
    // Optionally fetch history (last 5 days excluding today)
    const [history] = await pool.execute('SELECT * FROM doctor_daily_analytics WHERE doctor_id = ? AND analytics_date < CURDATE() ORDER BY analytics_date DESC LIMIT 5', [doctor_id]);

    res.json({ success: true, data: { today: analytics[0] || {}, history } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
