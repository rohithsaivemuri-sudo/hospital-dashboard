// The container files keep their safety properties (the stack itself was verified with Colima:
// clean clone -> docker compose up -> healthy; see docs/deploy.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('compose: only the app publishes a port, and only on 127.0.0.1; secrets come from .env', () => {
  const compose = read('docker-compose.yml');
  const ports = [...compose.matchAll(/^\s+- "([^"]+:\d+)"\s*$/gm)].map(m => m[1]);
  assert.deepEqual(ports, ['127.0.0.1:${APP_PORT:-8080}:5000']);
  const db = compose.slice(compose.indexOf('  db:'), compose.indexOf('  app:'));
  assert.ok(!/ports:/.test(db), 'MySQL has no host port');
  for (const key of ['MYSQL_ROOT_PASSWORD', 'DB_PASSWORD', 'JWT_SECRET']) assert.match(compose, new RegExp(`\\$\\{${key}:\\?`), `${key} is required from .env`);
  assert.match(compose, /DB_USER: hospital_app/);
  assert.match(compose, /db-data:\/var\/lib\/mysql/);
  assert.match(compose, /uploads:\/data\/uploads/);
});

test('image: non-root, health-checked, Oracle MySQL client, nothing secret copied in', () => {
  const df = read('Dockerfile');
  assert.match(df, /^USER app$/m);
  assert.match(df, /^HEALTHCHECK /m);
  assert.match(df, /mysql-client-8\.0/, 'MySQL (not MariaDB) client tools for migrations and backups');
  assert.match(df, /ENV NODE_ENV=production/);
  const ignore = read('.dockerignore').split('\n');
  for (const entry of ['**/.env', '**/node_modules', 'server/uploads', 'server/tests', '.git']) assert.ok(ignore.includes(entry), `.dockerignore: ${entry}`);
});

test('entrypoint: app account, then migrations, then the server', () => {
  const ep = read('docker/entrypoint.sh');
  const order = ['ensure-app-user.js', 'migrate.js', 'exec node server.js'].map(s => ep.indexOf(s));
  assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], ep);
  assert.match(ep, /set -eu/);
  assert.ok(fs.statSync(path.join(ROOT, 'docker', 'entrypoint.sh')).mode & 0o111, 'executable');
});

test('npm run start:prod sets CLIENT_URL to its own address (sockets check the Origin)', () => {
  const script = JSON.parse(read('package.json')).scripts['start:prod'];
  assert.match(script, /NODE_ENV=production/);
  assert.match(script, /CLIENT_URL="\$\{CLIENT_URL_PROD:-http:\/\/localhost:5000\}"/);
});
