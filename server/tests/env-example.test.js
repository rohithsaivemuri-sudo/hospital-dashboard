// server/.env.example lists every environment variable the server, its scripts and tests read,
// with placeholder values only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..');
const example = fs.readFileSync(path.join(SERVER, '.env.example'), 'utf8');
const listed = new Map(example.split('\n').filter(l => /^[A-Z_][A-Z0-9_]*=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1)]));

test('every process.env variable used by the server is in .env.example', () => {
  const files = execFileSync('git', ['ls-files', '--', '.'], { cwd: SERVER, encoding: 'utf8' }).split('\n')
    .filter(f => /\.js$/.test(f) && !/node_modules/.test(f));
  const used = new Set(files.flatMap(f => [...fs.readFileSync(path.join(SERVER, f), 'utf8').matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)].map(m => m[1])));
  const missing = [...used].filter(v => !listed.has(v)).sort();
  assert.deepEqual(missing, []);
});

test('.env.example holds placeholders only for secrets', () => {
  for (const key of ['DB_PASSWORD', 'DB_ADMIN_PASSWORD', 'JWT_SECRET']) assert.equal(listed.get(key), 'change-me', key);
  assert.notEqual(listed.get('DB_USER'), 'root', 'the example app account is the restricted one');
});
