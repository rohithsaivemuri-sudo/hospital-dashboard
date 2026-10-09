// Rebuilds the throwaway test database: baseline + migrations + seed data.
// Refuses to touch any database whose name does not end in "_test".
const path = require('path');
const mysql = require('mysql2/promise');
const { ROOT, runSqlFile } = require('./lib/sql');
const { migrate } = require('./migrate');

const TEST_DB = process.env.TEST_DB_NAME || 'hospital_db_test';

async function buildTestDb({ log = console.log } = {}) {
  if (!/^[a-z0-9_]+_test$/.test(TEST_DB) || TEST_DB === process.env.DB_NAME) {
    throw new Error(`Refusing to rebuild "${TEST_DB}": test database names must end in _test and differ from DB_NAME`);
  }
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await conn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } finally {
    await conn.end();
  }
  await migrate(TEST_DB, { log: () => {} });
  // seed.sql hard-codes `USE hospital_db;` — stripped so it can only load into the test DB.
  runSqlFile(TEST_DB, path.join(ROOT, 'database', 'seed.sql'), { stripUse: true });
  runSqlFile(TEST_DB, path.join(__dirname, '..', 'tests', 'fixtures', 'seed-fixups.sql'));
  log(`[test-db] ${TEST_DB} rebuilt`);
}

if (require.main === module) {
  buildTestDb().catch(e => { console.error('[test-db] failed:', e.message); process.exit(1); });
}

module.exports = { buildTestDb, TEST_DB };
