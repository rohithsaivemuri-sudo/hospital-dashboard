// Shared helpers for the API test suite. Everything here talks to hospital_db_test only.
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TEST_PORT = Number(process.env.TEST_PORT || 5099);
const BASE = `http://localhost:${TEST_PORT}/api`;
const TEST_DB = process.env.TEST_DB_NAME || 'hospital_db_test';
// Lab report uploads made by the test server land here, never in server/uploads.
const LAB_REPORT_DIR = path.join(require('os').tmpdir(), 'hms-test-lab-reports');
const PASSWORD = 'password123';
// The test server's stderr is copied here so tests can assert on logged failures.
const SERVER_STDERR = path.join(require('os').tmpdir(), 'hms-test-server-stderr.log');

// Seeded users, one per role.
const USERS = {
  ADMIN: 'admin',
  DOCTOR: 'dr.smith',
  DOCTOR_2: 'dr.patel',
  RECEPTIONIST: 'reception1',
  NURSE: 'nurse1',
  LABORATORY: 'lab_staff',
  PHARMACY: 'pharmacy_staff',
};

async function api(method, urlPath, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + urlPath, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, body: data };
}

// Raw fetch for multipart uploads and binary downloads.
async function rawRequest(method, urlPath, { token, body } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(BASE + urlPath, { method, headers, body });
}

const tokenCache = {};
async function login(username) {
  if (tokenCache[username]) return tokenCache[username];
  const res = await api('POST', '/auth/login', { body: { username, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
  tokenCache[username] = { token: res.body.token, user: res.body.user };
  return tokenCache[username];
}

let pool;
function db() {
  if (!TEST_DB.endsWith('_test')) throw new Error('helpers.db() only connects to a *_test database');
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: TEST_DB,
      connectionLimit: 5,
    });
  }
  return pool;
}

async function closeDb() {
  if (pool) { await pool.end(); pool = undefined; }
}

module.exports = { TEST_PORT, BASE, TEST_DB, LAB_REPORT_DIR, SERVER_STDERR, PASSWORD, USERS, api, rawRequest, login, db, closeDb };
