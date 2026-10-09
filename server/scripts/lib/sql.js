// Shared helpers for the migration / test-DB scripts.
// SQL files are executed with the mysql CLI so DELIMITER blocks (triggers, procedures) work as-is.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const ROOT = path.join(__dirname, '..', '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'database', 'migrations');

const connectionArgs = () => [
  '-h', process.env.DB_HOST || '127.0.0.1',
  '-P', String(process.env.DB_PORT || 3306),
  '-u', process.env.DB_USER,
];

// Password goes through the environment, never argv.
const mysqlEnv = () => ({ ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' });

// Runs SQL text against `database`. Any `USE <db>;` statement is rejected so a file can never
// switch away from the database it was pointed at.
function runSql(database, sql, label) {
  if (/^\s*USE\s+[`\w]+\s*;/im.test(sql)) {
    throw new Error(`${label}: contains a USE statement; strip it before running`);
  }
  execFileSync('mysql', [...connectionArgs(), '--database', database, '--default-character-set=utf8mb4'], {
    input: sql,
    env: mysqlEnv(),
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

function runSqlFile(database, file, { stripUse = false } = {}) {
  let sql = fs.readFileSync(file, 'utf8');
  if (stripUse) sql = sql.replace(/^\s*USE\s+[`\w]+\s*;\s*$/gim, '');
  runSql(database, sql, path.basename(file));
}

function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}_.+\.(sql|js)$/.test(f))  // .js migrations export up(connection)
    .sort();
}

module.exports = { ROOT, MIGRATIONS_DIR, runSql, runSqlFile, listMigrations };
