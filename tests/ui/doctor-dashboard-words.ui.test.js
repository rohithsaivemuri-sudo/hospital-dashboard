// Item 15: the doctor dashboard uses plain words for statuses (no raw CHECKED_IN) and says
// "1 active admission" (singular) or "N active admissions".
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf } = require('./lib/harness');

let browser, page, admission, encounter;
diagnoseFailures(() => page);
const d = new Date(); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
before(async () => {
  const rec = await tokenOf('reception1');
  const [[joshi]] = await (await db()).query("SELECT d.doctor_id, d.department_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = 'dr.joshi'");
  const [[{ n }]] = await (await db()).query("SELECT COUNT(*) AS n FROM admissions WHERE doctor_id = ? AND status = 'ACTIVE'", [joshi.doctor_id]);
  assert.equal(n, 0, 'dr.joshi starts with no admissions');
  const register = async (name) => (await call('POST', '/patients', rec, { name: `${name} ${Date.now().toString(36)}`, date_of_birth: '1977-07-17', gender: 'MALE', blood_group: null, phone: null, address: null, emergency_contact: null })).body.data.id;
  const [inpatient, outpatient] = [await register('Words Ward'), await register('Words Clinic')];
  const [[bed]] = await (await db()).query("SELECT bed_id FROM beds WHERE status = 'AVAILABLE' ORDER BY bed_id LIMIT 1");
  admission = (await call('POST', '/admissions', rec, { patient_id: inpatient, doctor_id: joshi.doctor_id, bed_id: bed.bed_id, department_id: joshi.department_id, diagnosis: 'Words' })).body.data.id;
  const appt = (await call('POST', '/appointments', rec, { patient_id: outpatient, doctor_id: joshi.doctor_id, appointment_date: iso, appointment_time: '23:15:00' })).body.data.id;
  encounter = (await call('POST', '/encounters', rec, { appointment_id: appt })).body.data.encounter_id; // checked in
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'dr.joshi');
});
after(async () => {
  await call('POST', `/encounters/${encounter}/cancel`, await tokenOf('reception1'));
  await call('POST', `/admissions/${admission}/discharge`, await tokenOf('admin'), {});
  await browser?.close(); await closeDb();
});

test('statuses read in plain words, with no raw codes', async () => {
  await open(page, '/');
  await page.waitForFunction(() => document.body.innerText.includes('Words Clinic'));
  const text = await page.evaluate(() => document.body.innerText);
  const raw = text.match(/\b(BOOKED|CHECKED_IN|TRIAGED|IN_PROGRESS|COMPLETED|NO_SHOW|ARRIVED)\b/g);
  assert.equal(raw, null, `raw codes on the page: ${raw}`);
  assert.match(text, /Checked in/);
  assert.ok(!/\b\d{2}:\d{2}:\d{2}\b/.test(text), 'times without seconds');
});

test('one admission reads "1 active admission"', async () => {
  const text = await page.evaluate(() => document.body.innerText);
  assert.match(text, /You have 1 active admission to round on/);
  assert.ok(!/1 active admissions/.test(text));
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
