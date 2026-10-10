// Compares the structure of two schemas (default: DB_NAME vs hospital_db_test).
// Usage: node scripts/schema-diff.js [dbA] [dbB]   — exits 1 if they differ.
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { adminCredentials } = require('./lib/admin-credentials');

const IGNORE_TABLES = ['schema_migrations'];

const QUERIES = {
  columns: `SELECT TABLE_NAME t, COLUMN_NAME c, ORDINAL_POSITION pos, COLUMN_TYPE type, IS_NULLABLE nullable,
              COLUMN_DEFAULT def, EXTRA extra, COLLATION_NAME coll
            FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?`,
  indexes: `SELECT TABLE_NAME t, INDEX_NAME i, NON_UNIQUE nu, SEQ_IN_INDEX seq, COLUMN_NAME c
            FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?`,
  foreignKeys: `SELECT k.TABLE_NAME t, k.CONSTRAINT_NAME n, k.COLUMN_NAME c, k.REFERENCED_TABLE_NAME rt,
                  k.REFERENCED_COLUMN_NAME rc, r.UPDATE_RULE ur, r.DELETE_RULE dr
                FROM information_schema.KEY_COLUMN_USAGE k
                JOIN information_schema.REFERENTIAL_CONSTRAINTS r
                  ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
                WHERE k.TABLE_SCHEMA = ?`,
  checks: `SELECT tc.TABLE_NAME t, cc.CONSTRAINT_NAME n, cc.CHECK_CLAUSE clause
           FROM information_schema.CHECK_CONSTRAINTS cc
           JOIN information_schema.TABLE_CONSTRAINTS tc
             ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
           WHERE cc.CONSTRAINT_SCHEMA = ?`,
  tables: `SELECT TABLE_NAME t, TABLE_TYPE type, ENGINE engine, TABLE_COLLATION coll
           FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
  triggers: `SELECT TRIGGER_NAME n, EVENT_OBJECT_TABLE t, ACTION_TIMING timing, EVENT_MANIPULATION ev,
               ACTION_ORDER ord, ACTION_STATEMENT stmt
             FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?`,
  routines: `SELECT ROUTINE_NAME n, ROUTINE_TYPE type, ROUTINE_DEFINITION def, DATA_TYPE dt
             FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?`,
  parameters: `SELECT SPECIFIC_NAME n, ORDINAL_POSITION pos, PARAMETER_MODE mode, PARAMETER_NAME p, DTD_IDENTIFIER type
               FROM information_schema.PARAMETERS WHERE SPECIFIC_SCHEMA = ?`,
  views: `SELECT TABLE_NAME n, VIEW_DEFINITION def, CHECK_OPTION co, IS_UPDATABLE upd
          FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?`,
  events: `SELECT EVENT_NAME n, EVENT_DEFINITION def, STATUS s FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?`,
};

async function snapshot(conn, schema) {
  const out = {};
  for (const [key, sql] of Object.entries(QUERIES)) {
    const [rows] = await conn.query(sql, [schema]);
    out[key] = new Set(rows
      .filter(r => !IGNORE_TABLES.includes(r.t))
      // View definitions embed the schema name; normalise it so the two schemas compare equal.
      .map(r => JSON.stringify(r).split(`\`${schema}\`.`).join('`<schema>`.')));
  }
  return out;
}

async function diffSchemas(a, b) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
    ...adminCredentials(),
  });
  try {
    const [sa, sb] = [await snapshot(conn, a), await snapshot(conn, b)];
    const diffs = [];
    for (const key of Object.keys(QUERIES)) {
      for (const row of sa[key]) if (!sb[key].has(row)) diffs.push(`${key}: only in ${a}: ${row}`);
      for (const row of sb[key]) if (!sa[key].has(row)) diffs.push(`${key}: only in ${b}: ${row}`);
    }
    return diffs;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  const a = process.argv[2] || process.env.DB_NAME;
  const b = process.argv[3] || 'hospital_db_test';
  diffSchemas(a, b).then(diffs => {
    if (diffs.length) {
      console.error(`[schema-diff] ${diffs.length} difference(s) between ${a} and ${b}:`);
      diffs.forEach(d => console.error('  ' + d));
      process.exit(1);
    }
    console.log(`[schema-diff] ${a} and ${b} match (tables, columns, indexes, FKs, checks, triggers, routines, views, events)`);
  }).catch(e => { console.error('[schema-diff] failed:', e.message); process.exit(1); });
}

module.exports = { diffSchemas };
