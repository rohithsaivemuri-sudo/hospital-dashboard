// node:test global setup: rebuild hospital_db_test, then run server.js against it on TEST_PORT.
const { spawn } = require('child_process');
const path = require('path');
const { buildTestDb, TEST_DB } = require('../scripts/test-db');
const fs = require('fs');
const { TEST_PORT, LAB_REPORT_DIR } = require('./helpers');

let server;

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Test server did not start on ${url}`);
}

async function globalSetup() {
  await buildTestDb({ log: () => {} });
  fs.rmSync(LAB_REPORT_DIR, { recursive: true, force: true });
  fs.mkdirSync(LAB_REPORT_DIR, { recursive: true });
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    // dotenv never overrides variables that are already set, so these win over server/.env.
    env: { ...process.env, DB_NAME: TEST_DB, PORT: String(TEST_PORT), LAB_REPORT_DIR },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await waitForServer(`http://localhost:${TEST_PORT}/api/auth/me`);
}

async function globalTeardown() {
  if (server) server.kill();
}

module.exports = { globalSetup, globalTeardown };
