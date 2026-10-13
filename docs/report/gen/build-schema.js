// Builds a fresh database from database/seed.sql and every migration (hospital_report_test; any
// other database is never touched), then writes from it:
//   data/schema.json       the structure the generators read (tables, columns, keys, CHECKs, triggers,
//                          views, routines and their CREATE statements)
//   hospital_db_full.sql   the complete MySQL script (Appendix A): schema, views, triggers, procedures, data
// Usage (from docs/report): node gen/build-schema.js
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const SERVER = path.join(__dirname, '../../../server');
const mysql = require(SERVER + '/node_modules/mysql2/promise');
require(SERVER + '/node_modules/dotenv').config({ path: SERVER + '/.env' });
const { buildFromSeed } = require(SERVER + '/scripts/lib/build-db');
const { adminCredentials } = require(SERVER + '/scripts/lib/admin-credentials');
const { listMigrations } = require(SERVER + '/scripts/lib/sql');

const DB = 'hospital_report_test';
const R = path.join(__dirname, '..');

async function schema(c) {
  const q = async (sql) => (await c.query(sql, [DB]))[0];
  const [base] = await c.query("SELECT TABLE_NAME n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY n", [DB]);
  for (const { n } of base) await c.query(`ANALYZE TABLE \`${n}\``); // exact row counts in TABLE_ROWS
  const d = {};
  d.tables = await q(`SELECT TABLE_NAME name, TABLE_TYPE type, ENGINE engine, TABLE_ROWS approx_rows, TABLE_COMMENT comment
    FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY name`);
  d.columns = await q(`SELECT TABLE_NAME t, COLUMN_NAME name, ORDINAL_POSITION pos, COLUMN_TYPE type, IS_NULLABLE nullable,
      COLUMN_DEFAULT dflt, COLUMN_KEY k, EXTRA extra, COLUMN_COMMENT comment, GENERATION_EXPRESSION gen
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY t, pos`);
  d.indexes = await q(`SELECT TABLE_NAME t, INDEX_NAME name, NON_UNIQUE non_unique, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? GROUP BY t, name, non_unique ORDER BY t, name`);
  d.fks = await q(`SELECT k.TABLE_NAME t, k.CONSTRAINT_NAME name, GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION) cols,
      k.REFERENCED_TABLE_NAME rt, GROUP_CONCAT(k.REFERENCED_COLUMN_NAME ORDER BY k.ORDINAL_POSITION) rcols, r.DELETE_RULE on_delete, r.UPDATE_RULE on_update
    FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
    WHERE k.TABLE_SCHEMA = ? GROUP BY t, name, rt, on_delete, on_update ORDER BY t, name`);
  d.checks = await q(`SELECT tc.TABLE_NAME t, cc.CONSTRAINT_NAME name, cc.CHECK_CLAUSE clause FROM information_schema.CHECK_CONSTRAINTS cc
    JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
    WHERE cc.CONSTRAINT_SCHEMA = ? ORDER BY t, name`);
  d.uniques = await q(`SELECT TABLE_NAME t, CONSTRAINT_NAME name FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_TYPE = 'UNIQUE' ORDER BY t, name`);
  d.triggers = await q(`SELECT TRIGGER_NAME name, EVENT_MANIPULATION event, EVENT_OBJECT_TABLE t, ACTION_TIMING timing, ACTION_STATEMENT body
    FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY name`);
  d.views = await q('SELECT TABLE_NAME name, VIEW_DEFINITION def FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY name');
  d.views.forEach(v => { v.def = v.def.replaceAll(`\`${DB}\`.`, ''); }); // no database name in the definitions
  d.routines = await q(`SELECT ROUTINE_NAME name, ROUTINE_TYPE type, ROUTINE_DEFINITION def, DTD_IDENTIFIER returns, SQL_DATA_ACCESS access
    FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? ORDER BY name`);
  d.routines.forEach(r => { r.returns = r.returns || ''; });
  d.params = await q(`SELECT SPECIFIC_NAME r, ORDINAL_POSITION pos, PARAMETER_MODE mode, PARAMETER_NAME name, DTD_IDENTIFIER type
    FROM information_schema.PARAMETERS WHERE SPECIFIC_SCHEMA = ? AND ORDINAL_POSITION > 0 ORDER BY r, pos`);
  d.events = await q('SELECT EVENT_NAME name FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ? ORDER BY name');
  d.create = {};
  for (const { n } of base) d.create[n] = (await c.query(`SHOW CREATE TABLE \`${n}\``))[0][0]['Create Table'].replace(/ AUTO_INCREMENT=\d+/, '');
  d.procCreate = {};
  for (const r of d.routines) d.procCreate[r.name] = (await c.query(`SHOW CREATE ${r.type} \`${r.name}\``))[0][0][`Create ${r.type === 'PROCEDURE' ? 'Procedure' : 'Function'}`];
  for (const t of d.tables) t.approx_rows = t.approx_rows === null ? null : Number(t.approx_rows);
  return d;
}

function fullScript(lastMigration) {
  const env = { ...process.env, MYSQL_PWD: adminCredentials().password };
  const dump = execFileSync('mysqldump', ['-h', process.env.DB_HOST || '127.0.0.1', '-P', String(process.env.DB_PORT || 3306), '-u', adminCredentials().user,
    '--routines', '--triggers', '--single-transaction', '--skip-dump-date', '--no-tablespaces', '--set-gtid-purged=OFF', DB], { env, maxBuffer: 64 << 20 }).toString();
  const body = dump
    .replace(/ DEFINER=`[^`]+`@`[^`]+`/g, '').replaceAll('/*!50017*/', '/*!50017 */') // load as whoever runs the script
    .replace(/^-- Host: .*$/m, '-- Host: (local)')
    .replaceAll(`\`${DB}\``, '`hospital_db`').replaceAll(DB, 'hospital_db');
  return `-- Smart Hospital Management System: complete MySQL script (schema, constraints, views, triggers,
-- procedures and sample data). Exported from a database built from database/seed.sql and migrations
-- 000-${lastMigration}, the same schema as hospital_db. All people and records in it are made up; every demo
-- account password is the documented demo password.
-- Load with:  mysql -u root -p < hospital_db_full.sql

CREATE DATABASE IF NOT EXISTS hospital_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE hospital_db;

${body}`;
}

(async () => {
  await buildFromSeed(DB, { log: () => {} });
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, ...adminCredentials(), database: DB });
  try {
    const [[db]] = await c.query('SELECT DATABASE() d'); if (db.d !== DB) throw new Error('not the report database');
    fs.writeFileSync(path.join(R, 'data/schema.json'), JSON.stringify(await schema(c), null, 1));
  } finally { await c.end(); }
  const last = listMigrations().at(-1).slice(0, 3);
  fs.writeFileSync(path.join(R, 'hospital_db_full.sql'), fullScript(last));
  console.log(`schema.json and hospital_db_full.sql from ${DB} (migrations 000-${last})`);
})().catch(e => { console.error(e); process.exit(1); });
