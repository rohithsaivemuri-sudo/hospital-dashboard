// Shared helpers for the browser tests. They drive the real client (Vite, :5173) against the API
// server (:5000) running on hospital_db_test only — never the development database.
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const mysql = require(path.join(ROOT, 'server', 'node_modules', 'mysql2', 'promise'));
require(path.join(ROOT, 'server', 'node_modules', 'dotenv')).config({ path: path.join(ROOT, 'server', '.env') });

const APP = 'http://localhost:5173';
const API = 'http://localhost:5000/api';
const PASSWORD = 'password123';
const TEST_DB = 'hospital_db_test';

async function call(method, p, token, body) {
  const res = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const tokenOf = async (username) => (await call('POST', '/auth/login', null, { username, password: PASSWORD })).body.token;

async function login(page, username) {
  await page.goto(`${APP}/login`);
  await page.type('input[placeholder="Username"]', username);
  await page.type('input[placeholder="Password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
}

let connection;
async function db() {
  if (!connection) connection = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: TEST_DB });
  return connection;
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

module.exports = { selectOption, apiIdle, pendingApi, diagnoseFailures, ROOT, APP, API, PASSWORD, TEST_DB, call, tokenOf, login, db, closeDb, open, clickButton, waitForText };
