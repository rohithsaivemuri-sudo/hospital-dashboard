// Shared helpers for the browser tests. They drive the real client (Vite, UI_APP_PORT, default 5174)
// against the API server (UI_API_PORT, default 5100) running on hospital_db_test only — never the
// development database. Their own ports, so a development server or the demo can keep running.
//
// Live mode (UI_LIVE_URL=https://...): the same tests drive a deployed site instead. Logins come from
// UI_ACCOUNTS_FILE (ROLE USERNAME PASSWORD NAME lines, as written by a demo reset) and the database
// lookups use UI_DB_HOST/UI_DB_PORT/UI_DB_USER/UI_DB_PASSWORD/UI_DB_NAME (e.g. an SSH tunnel and the
// restricted app account). Only for a demo database: the tests create made-up records.
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const mysql = require(path.join(ROOT, 'server', 'node_modules', 'mysql2', 'promise'));
require(path.join(ROOT, 'server', 'node_modules', 'dotenv')).config({ path: path.join(ROOT, 'server', '.env') });
const { adminCredentials } = require(path.join(ROOT, 'server', 'scripts', 'lib', 'admin-credentials'));
const { UTC_OPTIONS, utcSession } = require(path.join(ROOT, 'server', 'config', 'dbTime'));

const APP_PORT = Number(process.env.UI_APP_PORT || 5174);
const API_PORT = Number(process.env.UI_API_PORT || 5100);
const LIVE = process.env.UI_LIVE_URL ? process.env.UI_LIVE_URL.replace(/\/+$/, '') : null;
const APP = LIVE || `http://localhost:${APP_PORT}`;
const API = LIVE ? `${LIVE}/api` : `http://localhost:${API_PORT}/api`;
const PASSWORD = 'password123';
const TEST_DB = LIVE ? process.env.UI_DB_NAME : 'hospital_db_test';
if (LIVE && !/_demo$/.test(TEST_DB || '')) throw new Error('Live mode is for a demo database only: set UI_DB_NAME to a name ending in _demo');

// Live mode: each account's own password, from UI_ACCOUNTS_FILE.
const livePasswords = LIVE ? Object.fromEntries(require('fs').readFileSync(process.env.UI_ACCOUNTS_FILE, 'utf8').split('\n')
  .map(l => l.trim().split(/\s+/)).filter(p => p.length >= 3 && /^(ADMIN|DOCTOR|NURSE|RECEPTIONIST|LABORATORY|PHARMACY)$/.test(p[0])).map(p => [p[1], p[2]])) : null;
const passwordOf = (username) => (LIVE ? livePasswords[username] : PASSWORD);

async function call(method, p, token, body) {
  const res = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
// Live mode keeps one token per account (the deployed server limits logins per address).
const tokens = new Map();
async function tokenOf(username) {
  if (LIVE && tokens.has(username)) return tokens.get(username);
  const token = (await call('POST', '/auth/login', null, { username, password: passwordOf(username) })).body.token;
  if (LIVE) tokens.set(username, token);
  return token;
}

async function login(page, username) {
  await page.goto(`${APP}/login`);
  await page.type('input[placeholder="Username"]', username);
  await page.type('input[placeholder="Password"]', passwordOf(username));
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
}

let connection;
async function db() {
  // UTC like the app (server/config/dbTime.js), so NOW() here matches what the server writes.
  if (!connection) connection = await utcSession(await mysql.createConnection({ ...(LIVE
    ? { host: process.env.UI_DB_HOST || '127.0.0.1', port: Number(process.env.UI_DB_PORT || 3306), user: process.env.UI_DB_USER, password: process.env.UI_DB_PASSWORD, database: TEST_DB }
    : { host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, ...adminCredentials(), database: TEST_DB }), ...UTC_OPTIONS }));
  return connection;
}
// Orders need a visit in progress (or an admission). Starts one for the doctor with the patient
// unless it already exists; close() finishes only a visit started here.
async function visitInProgress(patientId, username = 'dr.smith') {
  const doc = await tokenOf(username);
  const [[{ doctor_id: doctorId }]] = await (await db()).query('SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = ?', [username]);
  const [[visit]] = await (await db()).query("SELECT encounter_id, status FROM encounters WHERE patient_id = ? AND doctor_id = ? AND status IN ('ARRIVED','TRIAGED','IN_PROGRESS') ORDER BY status = 'IN_PROGRESS' DESC, encounter_id DESC LIMIT 1", [patientId, doctorId]);
  if (visit?.status === 'IN_PROGRESS') return { encounterId: visit.encounter_id, close: async () => {} };
  const id = visit?.encounter_id ?? (await call('POST', '/encounters', await tokenOf('reception1'), { patient_id: patientId, doctor_id: doctorId })).body.data.encounter_id;
  const started = await call('POST', `/encounters/${id}/start`, doc);
  if (started.status !== 200) throw new Error(`start visit ${id}: ${started.status} ${started.body?.message}`);
  return { encounterId: id, close: () => call('POST', `/encounters/${id}/finish`, doc) };
}

async function closeDb() { if (connection) { await connection.end(); connection = null; } }

// Opens a page and waits until it has settled: the document has loaded and none of the app's own
// API requests (/api/...) has been in flight for 300 ms. Socket.IO traffic is ignored: its long-poll
// requests can stay open for ~25 s, which made a 'networkidle' wait hang until it timed out.
// One retry if Chrome replaces the frame mid-navigation ("frame was detached"), a browser artifact.
async function open(page, path) {
  for (let attempt = 1; ; attempt++) {
    try { await page.goto(APP + path, { waitUntil: 'load' }); break; } catch (e) {
      if (attempt > 1 || !/detached|LifecycleWatcher disposed/i.test(e.message)) throw e;
    }
  }
  await apiIdle(page);
}

// Resolves once no /api/ request of this page has been pending for quietMs.
async function apiIdle(page, { quietMs = 300, timeout = 10000 } = {}) {
  const pending = pendingApi(page);
  const start = Date.now(); let quietSince = pending.size ? null : Date.now();
  while (Date.now() - start < timeout) {
    if (pending.size === 0) { quietSince ??= Date.now(); if (Date.now() - quietSince >= quietMs) return; } else quietSince = null;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`API requests still pending after ${timeout} ms: ${[...pending].map(r => r.url()).join(', ')}`);
}
const tracked = new WeakMap();
function pendingApi(page) {
  if (tracked.has(page)) return tracked.get(page);
  const pending = new Set();
  const isApi = (r) => new URL(r.url()).pathname.startsWith('/api/');
  page.on('request', r => { if (isApi(r)) pending.add(r); });
  const done = (r) => pending.delete(r);
  page.on('requestfinished', done); page.on('requestfailed', done);
  page.on('framenavigated', f => { if (f === page.mainFrame()) pending.clear(); });
  tracked.set(page, pending);
  return pending;
}

// Clicks the first visible button whose text matches, with a real mouse click like a user.
async function clickButton(page, text, scope = 'body') {
  const handle = await page.waitForFunction((scope, text) => [...document.querySelectorAll(`${scope} button`)]
    .find(b => b.innerText.trim() === text && b.getBoundingClientRect().width > 0), { polling: 50, timeout: 10000 }, scope, text);
  await handle.asElement().click();
}

// Selects an option once it exists (lists such as medicines load after the dialog opens; selecting
// too early silently selects nothing) and checks that the selection took.
async function selectOption(page, selector, value) {
  await page.waitForFunction((sel, v) => [...(document.querySelector(sel)?.options || [])].some(o => o.value === v), { polling: 50, timeout: 10000 }, selector, String(value));
  const [chosen] = await page.select(selector, String(value));
  if (chosen !== String(value)) throw new Error(`Could not select ${value} in ${selector}`);
}

// Waits for text anywhere on the page. Interval polling: animation-frame polling can stall in a
// headless tab, missing short-lived messages such as toasts.
const waitForText = (page, text, timeout = 5000) =>
  page.waitForFunction((text) => document.body.innerText.includes(text), { polling: 100, timeout }, text);

// Call once per test file with a function returning the file's page(s): on a failing test, each
// page's screenshot, text and recent events are saved to <tmp>/hms-ui-failures.
function diagnoseFailures(getPages) {
  const { afterEach } = require('node:test');
  const { diagnose } = require('./readable');
  afterEach(async (t) => {
    if (t.passed !== false) return; // context.passed: false only for a failed test
    for (const p of [].concat(getPages() || []).filter(Boolean)) await diagnose(p, t.name);
  });
}

module.exports = { LIVE, passwordOf, visitInProgress, APP_PORT, API_PORT, selectOption, apiIdle, pendingApi, diagnoseFailures, ROOT, APP, API, PASSWORD, TEST_DB, call, tokenOf, login, db, closeDb, open, clickButton, waitForText };
