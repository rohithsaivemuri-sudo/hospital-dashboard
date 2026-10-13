// Chapter 8.6 queries, run read-only on hospital_db_test. Writes q86.json (rows capped at 8).
const ROOT = require('path').join(__dirname, '../../../server');
const mysql = require(ROOT + '/node_modules/mysql2/promise');
require(ROOT + '/node_modules/dotenv').config({ path: ROOT + '/.env' });
const Q = [
 { id: 'q1', cat: 'Simple SELECT with conditions', purpose: 'Medicines whose stock has fallen to or below their reorder level (the low-stock alert).',
   sql: `SELECT medicine_id, name, stock_quantity, reorder_level
FROM medicines
WHERE stock_quantity <= reorder_level AND requires_prescription = 1;` },
 { id: 'q2', cat: 'ORDER BY', purpose: 'Available ICU and ventilator beds, ordered by ward and bed number (what the emergency desk looks at first).',
   sql: `SELECT b.bed_number, b.bed_type, w.name AS ward, w.floor
FROM beds b JOIN wards w ON w.ward_id = b.ward_id
WHERE b.status = 'AVAILABLE' AND b.bed_type IN ('ICU', 'VENTILATOR_ICU')
ORDER BY w.name, b.bed_number;` },
 { id: 'q3', cat: 'Aggregates: COUNT, SUM, AVG, MIN, MAX', purpose: 'Billing summary: how many bills, how much billed and paid, and the smallest, average and largest bill.',
   sql: `SELECT COUNT(*) AS bills, SUM(total_amount) AS billed, SUM(paid_amount) AS paid,
       MIN(total_amount) AS smallest, ROUND(AVG(total_amount), 2) AS average,
       MAX(total_amount) AS largest
FROM bills;` },
 { id: 'q4', cat: 'GROUP BY with HAVING', purpose: 'Departments that have more than one doctor, with their doctor count and combined capacity.',
   sql: `SELECT dep.name AS department, COUNT(*) AS doctors,
       SUM(doc.max_workload) AS capacity
FROM doctors doc JOIN departments dep ON dep.department_id = doc.department_id
GROUP BY dep.department_id, dep.name
HAVING COUNT(*) > 1
ORDER BY doctors DESC, department;` },
 { id: 'q5', cat: 'INNER JOIN', purpose: "Today's appointments with patient and doctor names; the department comes from the doctor through the view v_appointments. Today is the date in India: UTC plus 5 h 30 min, whatever the server's time zone (the application passes the same date as a parameter).",
   sql: `SELECT a.appointment_time, p.name AS patient, d.name AS doctor,
       dep.name AS department, a.status
FROM v_appointments a
INNER JOIN patients p     ON p.patient_id = a.patient_id
INNER JOIN doctors d      ON d.doctor_id = a.doctor_id
INNER JOIN departments dep ON dep.department_id = a.department_id
WHERE a.appointment_date = DATE(UTC_TIMESTAMP() + INTERVAL 330 MINUTE)
ORDER BY a.appointment_time;` },
 { id: 'q6', cat: 'LEFT JOIN', purpose: 'Every doctor with the number of ACTIVE admissions they hold, including doctors with none (LEFT JOIN keeps them, COUNT gives 0).',
   sql: `SELECT d.name, d.current_workload, d.max_workload,
       COUNT(a.admission_id) AS active_admissions
FROM doctors d
LEFT JOIN admissions a ON a.doctor_id = d.doctor_id AND a.status = 'ACTIVE'
GROUP BY d.doctor_id, d.name, d.current_workload, d.max_workload
ORDER BY active_admissions DESC, d.name
LIMIT 6;` },
 { id: 'q7', cat: 'Self join (another join type)', purpose: 'Pairs of doctors who share a specialization: the doctors table joined to itself.',
   sql: `SELECT d1.specialization, d1.name AS doctor, d2.name AS colleague
FROM doctors d1
JOIN doctors d2 ON d2.specialization = d1.specialization
               AND d2.doctor_id > d1.doctor_id
ORDER BY d1.specialization;` },
 { id: 'q8', cat: 'Nested query (subquery in WHERE)', purpose: 'Medicines priced above the average price of all medicines.',
   sql: `SELECT name, category, unit_price
FROM medicines
WHERE unit_price > (SELECT AVG(unit_price) FROM medicines)
ORDER BY unit_price DESC
LIMIT 6;` },
 { id: 'q9', cat: 'Correlated subquery', purpose: 'Each admitted patient with the time of their latest vital-signs reading (NULL: not taken yet). The subquery runs once per admission.',
   sql: `SELECT p.name, a.admission_date,
       (SELECT MAX(v.recorded_at_utc) FROM vital_signs v
         WHERE v.admission_id = a.admission_id) AS last_vitals_utc
FROM admissions a JOIN patients p ON p.patient_id = a.patient_id
WHERE a.status = 'ACTIVE'
ORDER BY a.admission_date DESC
LIMIT 6;` },
 { id: 'q10', cat: 'IN and EXISTS', purpose: 'Patients with an ACTIVE admission (EXISTS) who also have a lab order that is not yet completed (IN).',
   sql: `SELECT p.patient_id, p.name
FROM patients p
WHERE EXISTS (SELECT 1 FROM admissions a
              WHERE a.patient_id = p.patient_id AND a.status = 'ACTIVE')
  AND p.patient_id IN (SELECT o.patient_id FROM lab_orders o
                       WHERE o.status <> 'COMPLETED');` },
 { id: 'q11', cat: 'ALL and ANY', purpose: 'Medicines dearer than every antibiotic (> ALL), and antacids dearer than at least one antiplatelet (> ANY).',
   sql: `SELECT name, category, unit_price FROM medicines
WHERE unit_price > ALL (SELECT unit_price FROM medicines WHERE category = 'Antibiotic')
ORDER BY unit_price DESC;
SELECT name, unit_price FROM medicines
WHERE category = 'Antacid'
  AND unit_price > ANY (SELECT unit_price FROM medicines WHERE category = 'Antiplatelet');` },
 { id: 'q12', cat: 'Multiple tables (five-table join)', purpose: 'Current inpatients with ward, bed, admitting doctor and department.',
   sql: `SELECT p.name AS patient, w.name AS ward, b.bed_number,
       d.name AS doctor, dep.name AS department
FROM admissions a
JOIN patients p      ON p.patient_id = a.patient_id
JOIN beds b          ON b.bed_id = a.bed_id
JOIN wards w         ON w.ward_id = b.ward_id
JOIN doctors d       ON d.doctor_id = a.doctor_id
JOIN departments dep ON dep.department_id = a.department_id
WHERE a.status = 'ACTIVE'
ORDER BY w.name, b.bed_number
LIMIT 6;` },
 { id: 'q13', cat: 'Business question: bed occupancy', purpose: 'Occupancy by bed type: how full is the hospital? (CASE inside SUM.)',
   sql: `SELECT bed_type, COUNT(*) AS beds,
       SUM(status = 'OCCUPIED') AS occupied,
       ROUND(100 * SUM(status = 'OCCUPIED') / COUNT(*), 1) AS occupancy_pct
FROM beds
GROUP BY bed_type
ORDER BY occupancy_pct DESC;` },
 { id: 'q14', cat: 'Business question: stock that expires soonest', purpose: 'For each medicine with stock, its usable quantity and next expiry, from the batches (view v_current_stock).',
   sql: `SELECT name, stock_quantity, usable_quantity, next_expiry
FROM v_current_stock
WHERE usable_quantity > 0
ORDER BY next_expiry, name
LIMIT 6;` },
 { id: 'q15', cat: 'View', purpose: 'The view current_admissions_view joins admissions with patients, doctors, beds, wards and departments; callers select from it like a table.',
   sql: `SELECT patient_name, ward_name, bed_number, doctor_name, department_name
FROM current_admissions_view
ORDER BY ward_name, bed_number
LIMIT 6;` },
];
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD, database: 'hospital_db_test', dateStrings: true, multipleStatements: true });
  const [[db]] = await c.query('SELECT DATABASE() d'); if (db.d !== 'hospital_db_test') throw new Error('not the test db');
  await c.query('START TRANSACTION READ ONLY');
  for (const q of Q) {
    const stmts = q.sql.split(/;\s*\n?/).map(s => s.replace(/^--.*$/gm, '').trim()).filter(Boolean);
    q.results = [];
    for (const s of stmts) { const [rows] = await c.query(s); q.results.push({ count: rows.length, cols: rows[0] ? Object.keys(rows[0]) : [], rows: rows.slice(0, 8) }); }
    console.log(q.id, q.results.map(r => r.count).join('/'));
  }
  await c.query('ROLLBACK'); await c.end();
  require('fs').writeFileSync(__dirname + '/../data/q86.json', JSON.stringify(Q, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
