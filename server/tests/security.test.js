// HTTP hardening: security headers, login rate limiting, CORS and socket origins, request size
// limits, and error responses without stack traces or SQL.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const { io: connectSocket } = require(require.resolve('socket.io-client', { paths: [path.join(__dirname, '..', '..', 'client')] }));
const { TEST_DB, USERS, PASSWORD, api, login, BASE: MAIN } = require('./helpers');

// A separate server with tight login limits (the main test server's are raised for the suite).
const PORT = 5096;
const BASE = `http://localhost:${PORT}`;
const ALLOWED = 'http://localhost:5173';
let server;
before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'), stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, PORT: String(PORT), DB_NAME: TEST_DB, CLIENT_URL: ALLOWED, LOGIN_MAX_PER_IP: '8', LOGIN_MAX_FAILURES: '3', LOGIN_WINDOW_MINUTES: '15', JSON_BODY_LIMIT: '2kb' },
  });
  const start = Date.now();
  while (Date.now() - start < 15000) { try { if ((await fetch(`${BASE}/api/auth/me`)).status) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 150)); }
});
after(() => server && server.kill());

const post = (p, body, headers = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('security headers on every response; no X-Powered-By; a request id', async () => {
  const res = await fetch(`${BASE}/api/auth/me`);
  const h = Object.fromEntries(res.headers);
  assert.equal(h['x-content-type-options'], 'nosniff');
  assert.equal(h['x-frame-options'], 'DENY');
  assert.equal(h['referrer-policy'], 'no-referrer');
  assert.match(h['permissions-policy'], /camera=\(\)/);
  assert.equal(h['cross-origin-opener-policy'], 'same-origin');
  assert.equal(h['x-powered-by'], undefined);
  assert.match(h['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('failed logins for one username are limited (429 + Retry-After); other usernames still work', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await post('/api/auth/login', { username: USERS.PHARMACY, password: 'wrong' })).status, 401);
  const blocked = await post('/api/auth/login', { username: USERS.PHARMACY, password: PASSWORD });
  assert.equal(blocked.status, 429, 'even the right password is refused while locked');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  const body = await blocked.json();
  assert.equal(body.code, 'RATE_LIMITED');
  assert.match(body.message, /Try again in \d+ minute/);
  assert.equal((await post('/api/auth/login', { username: USERS.LABORATORY, password: PASSWORD })).status, 200, 'another account is unaffected');
});

test('too many attempts from one address are limited', async () => {
  // 4 attempts so far from this address; the limit is 8.
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await post('/api/auth/login', { username: `nobody${i}`, password: 'x' })).status);
  assert.deepEqual(statuses, [401, 401, 401, 401, 429, 429]);
});

test('CORS allows only CLIENT_URL', async () => {
  const ok = await fetch(`${BASE}/api/auth/me`, { headers: { Origin: ALLOWED } });
  assert.equal(ok.headers.get('access-control-allow-origin'), ALLOWED);
  const evil = await fetch(`${BASE}/api/auth/me`, { headers: { Origin: 'https://evil.example' } });
  assert.notEqual(evil.headers.get('access-control-allow-origin'), 'https://evil.example');
  assert.notEqual(evil.headers.get('access-control-allow-origin'), '*');
});

test('sockets: a browser from another origin is refused; CLIENT_URL is accepted', async () => {
  const { token } = await login(USERS.NURSE); // from the main test server; same JWT secret
  const connect = (origin) => new Promise((resolve) => {
    const s = connectSocket(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { Origin: origin } });
    s.on('connect', () => { s.close(); resolve('connected'); });
    s.on('connect_error', (e) => { s.close(); resolve(`refused: ${e.message}`); });
  });
  assert.equal(await connect(ALLOWED), 'connected');
  assert.match(await connect('https://evil.example'), /^refused/);
});

test('request bodies over the limit get 413; malformed JSON gets 400; neither leaks a stack', async () => {
  const big = await post('/api/auth/login', { username: 'x', password: 'y'.repeat(4000) });
  assert.equal(big.status, 413);
  assert.deepEqual(await big.json(), { success: false, message: 'Request body is too large' });
  const bad = await post('/api/auth/login', '{"username": ');
  assert.equal(bad.status, 400);
  const text = await bad.text();
  assert.deepEqual(JSON.parse(text), { success: false, message: 'Request body is not valid JSON' });
  assert.ok(!/at \w+ \(|node_modules|SyntaxError/.test(text));
});

test('a server error returns a generic message and request id, never SQL or a stack', async () => {
  // An invalid enum value makes MySQL fail the insert (500): "Data truncated for column 'severity'".
  const { token } = await login(USERS.RECEPTIONIST);
  const res = await fetch(`${MAIN}/emergency`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ patient_id: 1, severity: 'NOT_A_LEVEL', symptoms: 'x', required_bed_type: 'GENERAL' }) });
  assert.equal(res.status, 500);
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.success, false);
  assert.match(body.message, /Something went wrong on the server/);
  assert.equal(body.request_id, res.headers.get('x-request-id'));
  assert.ok(!/truncated|column|severity|SQL|ER_|at \w+ \(/i.test(text), text);
});
