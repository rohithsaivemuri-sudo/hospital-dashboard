// Builds a disposable database from scratch: baseline schema, the bundled seed data, optional
// fixups, then every later migration (so backfills run over real-looking data). Used for the test
// database (_test) and the demo database (_demo); refuses any other name.
const path = require('path');
const mysql = require('mysql2/promise');
const { ROOT, runSqlFile } = require('./sql');
const { adminCredentials } = require('./admin-credentials');

const ALLOWED = /^[a-z0-9_]+_(test|demo)$/;

async function buildFromSeed(database, { fixups = [], log = () => {} } = {}) {
  if (!ALLOWED.test(database) || database === 'hospital_db') {
    throw new Error(`Refusing to rebuild "${database}": only databases whose names end in _test or _demo can be rebuilt`);
  }
  const { migrate } = require('../migrate');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, ...adminCredentials() });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await conn.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } finally {
    await conn.end();
  }
  await migrate(database, { log, upTo: '000_baseline.sql' });
  // seed.sql hard-codes `USE hospital_db;` — stripped so it only loads into this database.
  runSqlFile(database, path.join(ROOT, 'database', 'seed.sql'), { stripUse: true });
  for (const file of fixups) runSqlFile(database, file);
  await migrate(database, { log });
}

module.exports = { buildFromSeed, ALLOWED };
