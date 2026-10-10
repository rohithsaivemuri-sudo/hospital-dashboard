// The running app and the admin tools use separate MySQL credentials: the app (DB_USER/DB_PASSWORD)
// is the restricted account and may not be root; migrations, backups, schema diffs and the test
// database build use DB_ADMIN_USER/DB_ADMIN_PASSWORD.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..');
const run = (args, env) => spawnSync(process.execPath, args, { cwd: SERVER, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 20000 });

test('the app refuses to start when DB_USER is root', () => {
  for (const user of ['root', ' Root ']) {
    const r = run(['server.js'], { DB_USER: user, PORT: '0' });
    assert.equal(r.status, 1, `DB_USER=${JSON.stringify(user)}: exit ${r.status}`);
    assert.match(r.stderr, /Refusing to start: DB_USER is root/);
  }
});

test('admin tools need DB_ADMIN_USER / DB_ADMIN_PASSWORD and say so', () => {
  for (const env of [{ DB_ADMIN_USER: '' }, { DB_ADMIN_PASSWORD: '' }]) {
    const r = run(['scripts/schema-diff.js'], env);
    assert.notEqual(r.status, 0, JSON.stringify(env));
    assert.match(r.stderr + r.stdout, /Set DB_ADMIN_USER and DB_ADMIN_PASSWORD/, JSON.stringify(env));
  }
});

test('no admin tool reads the app credentials, and the app pool reads only them', () => {
  const tools = ['scripts/migrate.js', 'scripts/backup-db.js', 'scripts/schema-diff.js', 'scripts/test-db.js', 'scripts/lib/sql.js', 'tests/helpers.js'];
  for (const f of tools) {
    const src = fs.readFileSync(path.join(SERVER, f), 'utf8');
    assert.ok(!/process\.env\.DB_(USER|PASSWORD)\b/.test(src), `${f} reads DB_USER/DB_PASSWORD`);
  }
  const pool = fs.readFileSync(path.join(SERVER, 'config', 'db.js'), 'utf8');
  assert.match(pool, /user:\s*process\.env\.DB_USER/);
  assert.ok(!/DB_ADMIN/.test(pool), 'the app pool never uses the admin account');
});
