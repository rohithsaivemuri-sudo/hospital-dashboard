// Bug 5: after recording vitals the visit row changes: last reading time, "Retake vitals", and the
// status in plain words.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { login, db, closeDb, open, call, tokenOf, clickButton } = require('./lib/harness');

let browser, page, encounterId;
before(async () => {
  const [[p]] = await (await db()).query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE')
    AND patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS')) ORDER BY patient_id LIMIT 1`);
  encounterId = (await call('POST', '/encounters', await tokenOf('reception1'), { patient_id: p.patient_id, doctor_id: 1 })).body.data.encounter_id;
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'nurse1');
});
after(async () => { await browser.close(); await closeDb(); });

const row = () => page.evaluate((id) => {
  const r = document.querySelector(`[data-testid="visit-row"][data-encounter="${id}"]`);
  return r && { status: r.querySelector('[data-testid="visit-status"]').innerText, last: r.querySelector('[data-testid="visit-last-vitals"]').innerText, button: r.querySelector('[data-testid="record-vitals"]').innerText };
}, encounterId);

test('a new arrival reads "Arrived, waiting for triage", vitals "Not taken", button "Record vitals"', async () => {
  await open(page, '/');
  await page.waitForSelector(`[data-testid="visit-row"][data-encounter="${encounterId}"]`);
  assert.deepEqual(await row(), { status: 'Arrived, waiting for triage', last: 'Not taken', button: 'Record vitals' });
});

test('after recording vitals (with triage) the row shows the time, "Retake vitals" and "Triaged, waiting for doctor"', async () => {
  const button = await page.$(`[data-testid="visit-row"][data-encounter="${encounterId}"] [data-testid="record-vitals"]`);
  await button.click();
  await page.waitForSelector('[data-testid="vitals-form"]');
  await page.type('[name="pulse_bpm"]', '84');
  await page.type('[name="temperature_c"]', '37.1');
  assert.equal(await page.$eval('[name="mark_triaged"]', el => el.checked), true);
  await clickButton(page, 'Save vitals');
  await page.waitForFunction((id) => document.querySelector(`[data-testid="visit-row"][data-encounter="${id}"] [data-testid="record-vitals"]`)?.innerText === 'Retake vitals', { polling: 100, timeout: 5000 }, encounterId);
  const r = await row();
  assert.equal(r.status, 'Triaged, waiting for doctor');
  assert.equal(r.button, 'Retake vitals');
  assert.match(r.last, /^\d{2}:\d{2} IST$/);
  const [[v]] = await (await db()).query("SELECT DATE_FORMAT(CONVERT_TZ(MAX(recorded_at_utc), '+00:00', '+05:30'), '%H:%i') t FROM vital_signs WHERE encounter_id = ?", [encounterId]);
  assert.equal(r.last, `${v.t} IST`);
});

test('the row stays current after a reload', async () => {
  await open(page, '/');
  await page.waitForSelector(`[data-testid="visit-row"][data-encounter="${encounterId}"]`);
  const r = await row();
  assert.equal(r.button, 'Retake vitals');
  assert.equal(r.status, 'Triaged, waiting for doctor');
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
