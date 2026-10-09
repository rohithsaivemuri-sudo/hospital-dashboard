const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function runSQLFile(connection, filename) {
  console.log(`Running ${filename}...`);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', filename), 'utf8');
  // Simple split by DELIMITER if present, otherwise by semicolon
  if (sql.includes('DELIMITER //')) {
    const parts = sql.split('DELIMITER //');
    for (let part of parts) {
      if (part.includes('DELIMITER ;')) {
        const subparts = part.split('DELIMITER ;');
        await executeStatements(connection, subparts[0], '//');
        await executeStatements(connection, subparts[1], ';');
      } else {
        await executeStatements(connection, part, ';');
      }
    }
  } else {
    await executeStatements(connection, sql, ';');
  }
}

async function executeStatements(connection, sql, delimiter) {
  const statements = sql.split(delimiter).map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    if (stmt.startsWith('--') || stmt.startsWith('/*')) continue; // Skip basic comments at top
    try {
      await connection.query(stmt);
    } catch (e) {
      console.error(`Error executing statement:\n${stmt.substring(0, 50)}...`);
      console.error(e.message);
      throw e;
    }
  }
}

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'MyNewPassword123!',
    multipleStatements: true
  });
  try {
    await conn.query('DROP DATABASE IF EXISTS hospital_db;');
    await conn.query('CREATE DATABASE hospital_db;');
    await conn.query('USE hospital_db;');
    
    // Set up DB
    await runSQLFile(conn, 'schema.sql');
    await runSQLFile(conn, 'triggers.sql');
    await runSQLFile(conn, 'seed.sql');
    await runSQLFile(conn, 'views.sql');
    await runSQLFile(conn, 'procedures.sql');
    await runSQLFile(conn, 'indexes.sql');
    
    console.log('Database setup complete with ZERO errors.');
  } catch(e) {
    console.error('Setup failed:', e);
  } finally {
    await conn.end();
  }
}
main();
