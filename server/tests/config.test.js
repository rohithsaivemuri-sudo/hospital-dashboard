// Startup configuration check (config/env.js): every setting from the environment, validated, with a
// clear message for anything missing or weak; values are never printed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const { checkConfig } = require('../config/env');

const STRONG = 'k3Jx9QvT2mWp7LzR4nYb8HcF6sDg1VaE0uXoIq5tKwZ';
const good = (over = {}) => ({ DB_HOST: '127.0.0.1', DB_NAME: 'hospital_db', DB_USER: 'hospital_app', DB_PASSWORD: 'x', JWT_SECRET: STRONG, LAB_REPORT_DIR: path.join(os.tmpdir(), 'hms-config-test'), ...over });
const problems = (env) => checkConfig(env).errors;

test('a complete development configuration passes, with sensible defaults', () => {
  const { errors, config } = checkConfig(good());
  assert.deepEqual(errors, []);
  assert.deepEqual([config.mode, config.port, config.clientUrl], ['development', 5000, 'http://localhost:5173']);
});

test('missing settings are each named', () => {
  const errs = problems({ LAB_REPORT_DIR: path.join(os.tmpdir(), 'hms-config-test') });
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET']) assert.ok(errs.some(e => e.startsWith(key)), key);
});

test('JWT_SECRET must be long and random, and never a default', () => {
  for (const secret of ['change-me', 'your_jwt_secret_key_here', 'secret', 'short-but-random-1A', 'a'.repeat(40), 'abababababababababababababababab12', 'please-change-me-to-something-long-and-random']) {
    assert.ok(problems(good({ JWT_SECRET: secret })).some(e => e.startsWith('JWT_SECRET')), secret);
  }
  assert.deepEqual(problems(good({ JWT_SECRET: STRONG })), []);
});

test('DB_USER root is refused; ports must be numbers; NODE_ENV must be known', () => {
  assert.ok(problems(good({ DB_USER: 'Root' })).some(e => /DB_USER is root/.test(e)));
  assert.ok(problems(good({ DB_PORT: 'abc' })).some(e => e.startsWith('DB_PORT')));
  assert.ok(problems(good({ PORT: '99999' })).some(e => e.startsWith('PORT')));
  assert.ok(problems(good({ NODE_ENV: 'prod' })).some(e => e.startsWith('NODE_ENV')));
});

test('production needs CLIENT_URL as a bare origin', () => {
  assert.ok(problems(good({ NODE_ENV: 'production' })).some(e => e.startsWith('CLIENT_URL is not set')));
  assert.ok(problems(good({ NODE_ENV: 'production', CLIENT_URL: 'https://hospital.example.org/app' })).some(e => e.startsWith('CLIENT_URL must be')));
  assert.ok(problems(good({ NODE_ENV: 'production', CLIENT_URL: 'ftp://x' })).some(e => e.startsWith('CLIENT_URL must be')));
  const { errors, config } = checkConfig(good({ NODE_ENV: 'production', CLIENT_URL: 'https://hospital.example.org' }));
  assert.deepEqual(errors, []);
  assert.equal(config.clientUrl, 'https://hospital.example.org');
});

test('the uploads folder must be writable', () => {
  assert.ok(problems(good({ LAB_REPORT_DIR: '/dev/null/reports' })).some(e => e.startsWith('LAB_REPORT_DIR')));
});

test('the server refuses to start on a bad configuration, lists every problem, and prints no values', () => {
  const pw = 'Do-Not-Print-This-Password-42';
  const r = spawnSync(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 15000,
    env: { ...process.env, PORT: '0', JWT_SECRET: 'change-me', DB_PASSWORD: pw, NODE_ENV: 'production', CLIENT_URL: '' },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to start: 2 configuration problems/);
  assert.match(r.stderr, /JWT_SECRET is a placeholder/);
  assert.match(r.stderr, /CLIENT_URL is not set/);
  assert.ok(!r.stderr.includes(pw) && !r.stdout.includes(pw), 'no secret values in the output');
});
