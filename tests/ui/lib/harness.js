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

// Opens a page and waits until its data requests have finished (the screen has settled).
async function open(page, path) {
  await page.goto(APP + path, { waitUntil: 'networkidle0' });
}

// Clicks the first visible button whose text matches, with a real mouse click like a user.
async function clickButton(page, text, scope = 'body') {
  const handle = await page.waitForFunction((scope, text) => [...document.querySelectorAll(`${scope} button`)]
    .find(b => b.innerText.trim() === text && b.getBoundingClientRect().width > 0), { polling: 50, timeout: 10000 }, scope, text);
  await handle.asElement().click();
}

// Waits for text anywhere on the page. Interval polling: animation-frame polling can stall in a
// headless tab, missing short-lived messages such as toasts.
const waitForText = (page, text, timeout = 5000) =>
  page.waitForFunction((text) => document.body.innerText.includes(text), { polling: 100, timeout }, text);

module.exports = { ROOT, APP, API, PASSWORD, TEST_DB, call, tokenOf, login, db, closeDb, open, clickButton, waitForText };
