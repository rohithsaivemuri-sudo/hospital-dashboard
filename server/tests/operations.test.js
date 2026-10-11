// Operations: /health, structured request logs without patient data, graceful shutdown, and the
// configurable uploads folder.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TEST_DB, USERS, api, login, db, closeDb } = require('./helpers');

const servers = [];
after(async () => { for (const s of servers) if (s.exitCode === null) s.kill(); await closeDb(); });

// Starts server.js on `port`; resolves with { proc, out } where out() is the stdout so far.
async function start(port, env = {}) {
  const childEnv = { ...process.env, PORT: String(port), DB_NAME: TEST_DB, LOGIN_MAX_PER_IP: '1000000', LOGIN_MAX_FAILURES: '1000000', ...env };
  for (const [k, v] of Object.entries(childEnv)) if (v === undefined) delete childEnv[k];
  const proc = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  servers.push(proc);
  let out = '';
  proc.stdout.on('data', d => { out += d; });
  proc.stderr.on('data', d => { out += d; });
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && !/Server running/.test(out)) await new Promise(r => setTimeout(r, 100));
  return { proc, out: () => out, base: `http://localhost:${port}` };
}
const lines = (text) => text.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));

test('/health reports ok, and 503 when the database is unreachable; health checks are not logged', async () => {
  const s = await start(5095);
  const res = await fetch(`${s.base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual([body.status, body.database], ['ok', 'ok']);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  await new Promise(r => setTimeout(r, 100));
  assert.ok(!lines(s.out()).some(l => l.type === 'request' && /health/.test(l.route)), 'not in the request log');

  const down = await start(5094, { DB_PORT: '1' });
  const bad = await fetch(`${down.base}/health`);
  assert.equal(bad.status, 503);
  assert.deepEqual(await bad.json(), { status: 'error', database: 'unavailable' });
  down.proc.kill();
});

test('requests are logged as JSON with the route pattern, user and timing, never patient identifiers', async () => {
  const s = await start(5093);
  const [[p]] = await db().query('SELECT patient_id, name FROM patients WHERE patient_id = 16');
  const { token, user } = await login(USERS.DOCTOR);
  const res = await fetch(`${s.base}/api/patients/${p.patient_id}?search=${encodeURIComponent(p.name)}`, { headers: { Authorization: `Bearer ${token}` } });
  const id = res.headers.get('x-request-id');
  await new Promise(r => setTimeout(r, 100));
  const entry = lines(s.out()).find(l => l.request_id === id);
  assert.ok(entry, 'the request is logged');
  assert.equal(entry.type, 'request');
  assert.equal(entry.route, '/api/patients/:id');
  assert.deepEqual([entry.method, entry.status, entry.user_id, entry.role], ['GET', res.status, user.user_id, 'DOCTOR']);
  assert.equal(typeof entry.duration_ms, 'number');
  const raw = s.out().split('\n').find(l => l.includes(id));
  assert.ok(!raw.includes(`/${p.patient_id}`) && !raw.includes(p.name) && !raw.includes('search'), raw);
});

test('SIGTERM lets the request in flight finish, then exits 0; new connections are refused', async () => {
  const s = await start(5092);
  const { token } = await login(USERS.ADMIN);
  const inFlight = fetch(`${s.base}/api/audit-logs?page_size=100`, { headers: { Authorization: `Bearer ${token}` } });
  await new Promise(r => setTimeout(r, 5));
  s.proc.kill('SIGTERM');
  const res = await inFlight;
  assert.equal(res.status, 200);
  const code = await new Promise(r => s.proc.exitCode !== null ? r(s.proc.exitCode) : s.proc.on('exit', r));
  assert.equal(code, 0);
  assert.ok(lines(s.out()).some(l => l.type === 'shutdown' && l.message === 'stopped'));
  await assert.rejects(fetch(`${s.base}/health`));
});

test('UPLOAD_DIR sets where lab reports are stored', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-uploads-'));
  const s = await start(5091, { UPLOAD_DIR: dir, LAB_REPORT_DIR: undefined });
  const [doc, lab] = [await login(USERS.DOCTOR), await login(USERS.LABORATORY)];
  const order = (await api('POST', '/lab/orders', { token: doc.token, body: { patient_id: 1, doctor_id: doc.user.doctor_id, tests: [{ test_id: 1 }], notes: '' } })).body.data.id;
  await api('PUT', `/lab/orders/${order}/status`, { token: lab.token, body: { status: 'PROCESSING' } });
  await api('POST', '/lab/results', { token: lab.token, body: { order_id: order, result_value: '5000', unit: 'cells/mcL' } });
  const form = new FormData();
  form.append('report', new Blob([Buffer.from('%PDF-1.4\n%%EOF\n')], { type: 'application/pdf' }), 'r.pdf');
  const up = await fetch(`${s.base}/api/lab/results/${order}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${lab.token}` }, body: form });
  assert.equal(up.status, 201);
  const [[a]] = await db().query('SELECT a.stored_filename FROM lab_result_attachments a JOIN lab_results r ON r.result_id = a.result_id WHERE r.order_id = ?', [order]);
  assert.ok(fs.existsSync(path.join(dir, 'lab-reports', a.stored_filename)), 'stored under UPLOAD_DIR/lab-reports');
  fs.rmSync(dir, { recursive: true, force: true });
});
