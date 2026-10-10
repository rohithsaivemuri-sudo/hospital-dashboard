const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const conn = await mysql.createConnection({
    // Admin account from server/.env (never hard-coded): this script creates/drops databases.
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_ADMIN_USER,
    password: process.env.DB_ADMIN_PASSWORD,
    multipleStatements: true
  });
  try {
    const sql = fs.readFileSync('../database/seed.sql', 'utf8');
    console.log('Running seed...');
    await conn.query(sql);
    console.log('Done!');
  } catch(e) {
    console.error(e);
  } finally {
    await conn.end();
  }
}
main();
