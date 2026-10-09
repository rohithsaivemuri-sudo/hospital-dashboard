const fs = require('fs');
let code = fs.readFileSync('server/controllers/admissionController.js', 'utf8');

const replacement = `exports.getCurrent = async (req, res) => {
  try {
    let query = \`
      SELECT a.*, p.name as patient_name, b.bed_number as bed_name 
      FROM admissions a
      LEFT JOIN patients p ON a.patient_id = p.patient_id
      LEFT JOIN beds b ON a.bed_id = b.bed_id
      WHERE a.status = "ACTIVE"
    \`;
    let params = [];
    if (req.user.role === 'DOCTOR') {
      query += ' AND a.doctor_id = ?';
      params.push(req.user.doctor_id);
    }
    const [rows] = await pool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};`;

code = code.replace(
  /exports\.getCurrent = async \([\s\S]*?catch \(error\) \{ res\.status\(500\)\.json\(\{ success: false, message: error\.message \}\); \}\n\};/,
  replacement
);

fs.writeFileSync('server/controllers/admissionController.js', code);
