// Full logical backup (schema + data + routines + triggers + events) of a database to
// ~/hospital_backups/<db>_<YYYYMMDD_HHMMSS>.sql. Run automatically by migrate.js before it applies
// anything to a non-test database; can also be run by hand: node scripts/backup-db.js [--db name]
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('./lib/sql'); // loads server/.env

const BACKUP_DIR = path.join(os.homedir(), 'hospital_backups');

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backupDatabase(database, { log = console.log } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(BACKUP_DIR, `${database}_${timestamp()}.sql`);
  execFileSync('mysqldump', [
    '-h', process.env.DB_HOST || '127.0.0.1', '-P', String(process.env.DB_PORT || 3306), '-u', process.env.DB_USER,
    '--single-transaction', '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    `--result-file=${file}`, database,
  ], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' }, stdio: ['ignore', 'ignore', 'inherit'] });
  fs.chmodSync(file, 0o600); // contains patient data

  // mysqldump writes this trailer only when the dump finished cleanly.
  const tail = fs.readFileSync(file, 'utf8').slice(-200);
  if (!/-- Dump completed/.test(tail)) throw new Error(`Backup ${file} looks incomplete`);
  log(`[backup] ${database} -> ${file} (${fs.statSync(file).size} bytes)`);
  return file;
}

if (require.main === module) {
  const i = process.argv.indexOf('--db');
  const database = i > -1 ? process.argv[i + 1] : process.env.DB_NAME;
  try { backupDatabase(database); } catch (e) { console.error('[backup] failed:', e.message); process.exit(1); }
}

module.exports = { backupDatabase, BACKUP_DIR };
