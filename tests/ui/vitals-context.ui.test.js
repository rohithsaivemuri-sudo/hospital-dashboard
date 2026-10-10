// Vitals context (item 6): the form says where the reading will be filed before saving; when the
// patient has both an admission and an open visit the nurse chooses, defaulting by where she came
// from (bed card: the admission; outpatient row: the visit); every reading shows where it was filed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf, clickButton, waitForText } = require('./lib/harness');

let browser, page, patient, encounter, admission, bedNumber;
diagnoseFailures(() => page);
const stamp = Date.now().toString(36);
const name = `Vitals Context ${stamp}`;
const d = new Date(); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
before(async () => {
  const rec = await tokenOf('reception1');
  patient = (await call('POST', '/patients', rec, { name, date_of_birth: '1970-03-03', gender: 'MALE', blood_group: null, phone: null, address: null, emergency_contact: null })).body.data.id;
  const [[bed]] = await (await db()).query("SELECT b.bed_id, b.bed_number FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = 'ICU Ward' AND b.status = 'AVAILABLE' ORDER BY b.bed_id LIMIT 1");
  bedNumber = bed.bed_number;
  admission = (await call('POST', '/admissions', rec, { patient_id: patient, doctor_id: 1, bed_id: bed.bed_id, department_id: 1, diagnosis: 'Vitals context' })).body.data.id;
  const appt = (await call('POST', '/appointments', rec, { patient_id: patient, doctor_id: 1, appointment_date: iso, appointment_time: '23:35:00' })).body.data.id;
  encounter = (await call('POST', '/encounters', rec, { appointment_id: appt })).body.data.encounter_id;
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'nurse1');
});
after(async () => {
  await call('POST', `/encounters/${encounter}/cancel`, await tokenOf('reception1'));
  await call('POST', `/admissions/${admission}/discharge`, await tokenOf('dr.smith'), {});
  await browser.close(); await closeDb();
});

const choice = () => page.$eval('input[name="vitals-context"]:checked', el => el.value);
const filedUnder = () => page.$eval('[data-testid="vitals-target"]', el => el.innerText);

test('from the bed card: both contexts offered, the admission chosen, and the form says so', async () => {
  await open(page, '/');
  const link = await page.waitForFunction((name) => [...document.querySelectorAll('[data-testid="bed-card"]')]
    .find(c => c.innerText.includes(name))?.querySelector('[data-testid="bed-vitals-link"]'), { timeout: 10000 }, name);
  await Promise.all([page.waitForNavigation(), link.asElement().click()]);
  await page.waitForSelector('[data-testid="vitals-form"]');
  const options = await page.$$eval('input[name="vitals-context"]', els => els.map(e => e.value));
  assert.deepEqual(options.sort(), ['admission', 'visit']);
  assert.equal(await choice(), 'admission');
  assert.match(await filedUnder(), new RegExp(`Admission · ICU Ward bed ${bedNumber}`));
});

test('the nurse can switch to the visit; the reading is saved there and its row says so', async () => {
  await page.click('input[name="vitals-context"][value="visit"]');
  assert.match(await filedUnder(), /Visit with Dr\. John Smith/);
  await page.type('input[name="pulse_bpm"]', '77');
  await clickButton(page, 'Save vitals');
  await waitForText(page, 'Vitals saved');
  const [[row]] = await (await db()).query('SELECT encounter_id, admission_id FROM vital_signs WHERE patient_id = ? ORDER BY vital_id DESC LIMIT 1', [patient]);
  assert.deepEqual({ ...row }, { encounter_id: encounter, admission_id: null });
  await page.waitForFunction(() => document.querySelector('[data-testid="vitals-row"] [data-testid="reading-context"]'), { timeout: 5000 });
  assert.match(await page.$eval('[data-testid="vitals-row"] [data-testid="reading-context"]', el => el.innerText), /Visit with Dr\. John Smith/);
});

test('from the outpatient row: the visit is chosen by default', async () => {
  await open(page, '/');
  await page.click(`[data-testid="visit-row"][data-encounter="${encounter}"] [data-testid="record-vitals"]`);
  await page.waitForSelector('[data-testid="vitals-form"]');
  assert.equal(await choice(), 'visit');
  assert.match(await filedUnder(), /Visit with Dr\. John Smith/);
});

test('a reading filed under the admission shows the ward and bed on its row', async () => {
  await call('POST', '/vitals', await tokenOf('nurse1'), { patient_id: patient, admission_id: admission, pulse_bpm: 81 });
  await open(page, `/patients/${patient}?tab=Vitals`);
  const contexts = await page.$$eval('[data-testid="vitals-row"] [data-testid="reading-context"]', els => els.map(e => e.innerText));
  assert.ok(contexts.some(c => new RegExp(`Admission · ICU Ward bed ${bedNumber}`).test(c)), contexts.join(' | '));
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
