// CodeRabbit PR #1 item 6: status codes are shown with every underscore replaced
// ("ENTERED_IN_ERROR" -> "ENTERED IN ERROR"), not only the first.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { launch, violations } = require('./lib/readable');
const { login, db, closeDb, open, call, tokenOf } = require('./lib/harness');

const SRC = path.join(__dirname, '..', '..', 'client', 'src');
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? files(p) : /\.jsx?$/.test(d.name) ? [p] : [];
});

test('no status label replaces only the first underscore', () => {
  const bad = [];
  for (const f of files(SRC)) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/\.replace\(\s*(['"])_\1/.test(line) || /\.replace\(\s*\/_\/[^g]*[,)]/.test(line)) bad.push(`${path.relative(SRC, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

let browser, page, appointmentId;
before(async () => {
  const [rec, doc] = [await tokenOf('reception1'), await tokenOf('dr.smith')];
  const [[p]] = await (await db()).query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS')) ORDER BY patient_id LIMIT 1`);
  appointmentId = (await call('POST', '/appointments', rec, { patient_id: p.patient_id, doctor_id: 1, appointment_date: '2031-03-03', appointment_time: '09:15:00', reason: 'status label test' })).body.data.id;
  const enc = (await call('POST', '/encounters', rec, { appointment_id: appointmentId })).body.data;
  assert.equal((await call('POST', `/encounters/${enc.encounter_id}/entered-in-error`, doc)).status, 200);
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'reception1');
});
after(async () => { await browser.close(); await closeDb(); });

test('a voided visit reads "ENTERED IN ERROR" in the appointment list', async () => {
  await open(page, '/appointments');
  const cell = await page.waitForFunction((id) => {
    const row = document.querySelector(`tr[data-appointment="${id}"]`);
    return row && [...row.cells].map(c => c.innerText.trim()).find(t => /ENTERED/.test(t));
  }, { polling: 100, timeout: 10000 }, appointmentId);
  assert.equal(await cell.jsonValue(), 'ENTERED IN ERROR');
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
