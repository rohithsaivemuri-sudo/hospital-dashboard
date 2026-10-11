// Container start (docker/entrypoint.sh): waits for MySQL, then creates or updates the restricted
// account the app runs as — the same five privileges as docs/mysql-app-user.sql, on DB_NAME only —
// with the password given in DB_PASSWORD. Uses the admin account (DB_ADMIN_USER). Idempotent.
// APP_DB_HOST is the host part of the account ('%' = any container on the compose network).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const { adminCredentials } = require('./lib/admin-credentials');

async function connectWithRetry({ attempts = 60, delayMs = 2000 } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, ...adminCredentials() });
    } catch (e) {
      if (i >= attempts) throw e;
      console.log(`[ensure-app-user] waiting for MySQL (${e.code || e.message})`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  const { DB_NAME: database, DB_USER: user, DB_PASSWORD: password } = process.env;
  const host = process.env.APP_DB_HOST || '%';
  if (!database || !user || !password) throw new Error('DB_NAME, DB_USER and DB_PASSWORD must be set');
  if (user.toLowerCase() === 'root') throw new Error('DB_USER must not be root');
  const conn = await connectWithRetry();
  try {
    await conn.query('CREATE DATABASE IF NOT EXISTS ??', [database]);
    const [[exists]] = await conn.query('SELECT 1 AS yes FROM mysql.user WHERE user = ? AND host = ?', [user, host]);
    // Values are escaped client-side by mysql2 (CREATE/ALTER USER cannot be server-side prepared).
    await conn.query(exists ? 'ALTER USER ?@? IDENTIFIED BY ?' : 'CREATE USER ?@? IDENTIFIED BY ?', [user, host, password]);
    await conn.query('GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON ??.* TO ?@?', [database, user, host]);
    console.log(`[ensure-app-user] ${exists ? 'updated' : 'created'} ${user}@${host} with data access to ${database}`);
  } finally { await conn.end(); }
}

main().catch(e => { console.error('[ensure-app-user] failed:', e.message); process.exit(1); });
