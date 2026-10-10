// The account the app (and the test server) runs as is the restricted one from
// docs/mysql-app-user.sql: not root, data access only, no schema changes.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { TEST_DB } = require('./helpers');

let conn;
after(async () => { if (conn) await conn.end(); });

test('DB_USER is a restricted account: data access only, DDL refused', async () => {
  conn = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: TEST_DB });
  const [[{ me }]] = await conn.query('SELECT CURRENT_USER() AS me');
  assert.ok(!/^root@/.test(me), `the app connects as ${me}`);

  const [grants] = await conn.query('SHOW GRANTS');
  const privileges = new Set(grants.map(g => Object.values(g)[0])
    .filter(g => !/^GRANT USAGE ON \*\.\*/.test(g))
    .flatMap(g => g.match(/^GRANT (.+?) ON /)[1].split(',').map(p => p.trim())));
  assert.deepEqual([...privileges].sort(), ['DELETE', 'EXECUTE', 'INSERT', 'SELECT', 'UPDATE']);
  assert.ok(!grants.some(g => / ON \*\.\* /.test(Object.values(g)[0]) && !/^GRANT USAGE/.test(Object.values(g)[0])), 'no global privileges');

  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM patients');
  assert.ok(n > 0);
  for (const [sql, code] of [
    ['CREATE TABLE zz_probe (id INT)', 'ER_TABLEACCESS_DENIED_ERROR'],
    ['ALTER TABLE patients ADD COLUMN zz INT', 'ER_TABLEACCESS_DENIED_ERROR'],
    ['DROP TABLE audit_logs', 'ER_TABLEACCESS_DENIED_ERROR'],
    ['CREATE TRIGGER zz BEFORE INSERT ON patients FOR EACH ROW SET @x = 1', 'ER_TABLEACCESS_DENIED_ERROR'],
  ]) await assert.rejects(conn.query(sql), (e) => e.code === code || /denied|SUPER privilege/i.test(e.message), sql); // CREATE TRIGGER may be refused for SUPER (binary logging) before the TRIGGER check
  await assert.rejects(conn.query('SELECT COUNT(*) FROM mysql.user'), /denied/i, 'cannot read the mysql schema');
});
