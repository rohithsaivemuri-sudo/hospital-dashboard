// node:test global setup for the browser tests: rebuild hospital_db_test, run the API server on it
// (:5000) and the Vite client (:5173, which proxies to :5000). Refuses to start if either port is
// already in use, so these tests can never drive a development server attached to hospital_db.
const { spawn } = require('child_process');
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const { buildTestDb, TEST_DB } = require(path.join(ROOT, 'server', 'scripts', 'test-db'));

const children = [];
const portInUse = (port) => new Promise(resolve => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); resolve(true); });
  s.on('error', () => resolve(false));
});
async function waitFor(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.status) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`${url} did not start`);
}

async function globalSetup() {
  for (const port of [5000, 5173]) {
    if (await portInUse(port)) throw new Error(`Port ${port} is in use. Stop the development servers before running the browser tests (they must run against ${TEST_DB}).`);
  }
  await buildTestDb({ log: () => {} });
  const reports = path.join(os.tmpdir(), 'hms-ui-test-lab-reports');
  fs.rmSync(reports, { recursive: true, force: true });
  fs.mkdirSync(reports, { recursive: true });
  children.push(spawn(process.execPath, ['server.js'], {
    cwd: path.join(ROOT, 'server'), env: { ...process.env, DB_NAME: TEST_DB, PORT: '5000', LAB_REPORT_DIR: reports, LOGIN_MAX_PER_IP: '1000000', LOGIN_MAX_FAILURES: '1000000' }, stdio: 'ignore',
  }));
  children.push(spawn(path.join(ROOT, 'client', 'node_modules', '.bin', 'vite'), ['--port', '5173', '--strictPort'], {
    cwd: path.join(ROOT, 'client'), stdio: 'ignore',
  }));
  await waitFor('http://localhost:5000/api/auth/me');
  await waitFor('http://localhost:5173/login');
}

async function globalTeardown() {
  for (const c of children) c.kill();
}

module.exports = { globalSetup, globalTeardown };
