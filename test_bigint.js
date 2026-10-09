const mysql = require('mysql2/promise');
require('dotenv').config({ path: './server/.env' });

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  
  const [[{ totalPatients }]] = await pool.execute('SELECT COUNT(*) as totalPatients FROM patients');
  console.log("Type of COUNT(*):", typeof totalPatients);
  
  try {
    JSON.stringify({ totalPatients });
    console.log("JSON.stringify successful!");
  } catch (e) {
    console.error("JSON.stringify FAILED:", e.message);
  }
  process.exit(0);
})();
