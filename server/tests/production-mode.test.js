// Production mode: one port serves the built client, /api and /socket.io (npm run start:prod).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io: connectSocket } = require(require.resolve('socket.io-client', { paths: [path.join(__dirname, '..', '..', 'client')] }));
const bcrypt = require('bcryptjs');
const { TEST_DB, USERS, db, closeDb } = require('./helpers');

const PORT = 5097;
const BASE = `http://localhost:${PORT}`;
const DIST = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-client-dist-'));
let server;

async function waitFor(url, ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) { try { if ((await fetch(url)).status) return; } catch { /* starting */ } await new Promise(r => setTimeout(r, 150)); }
  throw new Error(`${url} did not come up`);
}
// Extra environment for the production server (later checks add requirements here).
const prodEnv = () => ({ ...process.env, NODE_ENV: 'production', PORT: String(PORT), DB_NAME: TEST_DB, CLIENT_DIST: DIST, CLIENT_URL: BASE });

// The test database's seed accounts use the old default password, which production refuses; give
// them random passwords for this file and put the originals back afterwards.
let savedHashes = [];
before(async () => {
  savedHashes = (await db().query('SELECT user_id, password_hash FROM users'))[0];
  await db().query('UPDATE users SET password_hash = ?', [await bcrypt.hash(require('crypto').randomBytes(16).toString('hex'), 10)]);
  const build = spawnSync(path.join(__dirname, '..', '..', 'client', 'node_modules', '.bin', 'vite'), ['build', '--outDir', DIST, '--emptyOutDir'], { cwd: path.join(__dirname, '..', '..', 'client'), encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: prodEnv(), stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', d => process.stderr.write(d));
  await waitFor(`${BASE}/api/auth/me`);
});
after(async () => {
  if (server) server.kill();
  fs.rmSync(DIST, { recursive: true, force: true });
  for (const u of savedHashes) await db().query('UPDATE users SET password_hash = ? WHERE user_id = ?', [u.password_hash, u.user_id]);
  await closeDb();
});

test('pages: / and client-side routes return the app shell, never cached', async () => {
  for (const p of ['/', '/patients/16', '/laboratory', '/login']) {
    const res = await fetch(BASE + p);
    assert.equal(res.status, 200, p);
    assert.match(res.headers.get('content-type'), /text\/html/, p);
    assert.match(await res.text(), /<div id="root">/, p);
    assert.match(res.headers.get('cache-control') || '', /no-cache/, p);
  }
});

test('production adds a Content-Security-Policy and HSTS', async () => {
  const res = await fetch(BASE + '/');
  const csp = res.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/, 'no inline or remote scripts');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /connect-src 'self' ws:\/\/localhost:5097/);
  assert.match(res.headers.get('strict-transport-security') || '', /max-age=\d+/);
});

test('assets are served with long-lived caching; a missing asset is a 404, not the page', async () => {
  const html = await (await fetch(BASE + '/')).text();
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)[1];
  const res = await fetch(BASE + asset);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.match(res.headers.get('cache-control') || '', /immutable/);
  assert.equal((await fetch(BASE + '/assets/missing-file.js')).status, 404);
});

test('/api still answers in JSON on the same port; unknown API paths are JSON 404s', async () => {
  const me = await fetch(BASE + '/api/auth/me');
  assert.equal(me.status, 401);
  assert.match(me.headers.get('content-type'), /json/);
  const missing = await fetch(BASE + '/api/no-such-route');
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { success: false, message: 'Not found' });
});

test('/socket.io connects on the same port', async () => {
  const [[nurse]] = await db().query('SELECT user_id, username, role FROM users WHERE username = ?', [USERS.NURSE]);
  const token = require('jsonwebtoken').sign({ user_id: nurse.user_id, username: nurse.username, role: nurse.role, doctor_id: null }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const s = connectSocket(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  await new Promise((resolve, reject) => { s.on('connect', resolve); s.on('connect_error', reject); });
  assert.ok(s.connected);
  s.close();
});

test('production mode refuses to start without a client build', () => {
  const r = spawnSync(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...prodEnv(), PORT: '0', CLIENT_DIST: path.join(os.tmpdir(), 'no-such-dist') }, encoding: 'utf8', timeout: 15000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no client build/);
});
