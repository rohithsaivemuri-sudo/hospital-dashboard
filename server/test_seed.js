const fs = require('fs');
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'MyNewPassword123!',
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
