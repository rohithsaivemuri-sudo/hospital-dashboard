// Item 12: the prescription form asks for the dose amount and its unit, and prescription lines are
// labelled (dose with unit, frequency, duration, quantity) on the chart and in the pharmacy.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, closeDb, open, call, tokenOf, clickButton, selectOption, waitForText } = require('./lib/harness');

let browser, page, patient, visit, written;
diagnoseFailures(() => page);
const stamp = Date.now().toString(36);
const d = new Date(); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
before(async () => {
  const [rec, doc] = [await tokenOf('reception1'), await tokenOf('dr.smith')];
  patient = (await call('POST', '/patients', rec, { name: `Rx Lines ${stamp}`, date_of_birth: '1981-01-11', gender: 'MALE', blood_group: null, phone: null, address: null, emergency_contact: null })).body.data.id;
  const appt = (await call('POST', '/appointments', rec, { patient_id: patient, doctor_id: 1, appointment_date: iso, appointment_time: '23:25:00' })).body.data.id;
  visit = (await call('POST', '/encounters', rec, { appointment_id: appt })).body.data.encounter_id;
  await call('POST', `/encounters/${visit}/start`, doc);
  // A line written before the amount/unit form, kept as written.
  written = (await call('POST', '/prescriptions', doc, { patient_id: patient, doctor_id: 1, items: [{ medicine_id: 18, dosage: '1 tab', frequency: 'Once daily', duration: '3 days', quantity: 3 }] })).body.data.id;
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'dr.smith');
});
after(async () => {
  await call('POST', `/encounters/${visit}/finish`, await tokenOf('dr.smith'));
  await browser?.close(); await closeDb();
});

test('the form asks for the dose amount and a unit, and saves "250 mg"', async () => {
  await open(page, `/patients/${patient}`);
  await clickButton(page, '+ Create Prescription');
  await page.waitForSelector('input[name="dose_amount"]');
  const units = await page.$$eval('select[name="dose_unit"] option', os => os.map(o => o.value).filter(Boolean));
  assert.deepEqual(units, ['mg', 'g', 'mcg', 'ml', 'tablet', 'capsule', 'drop', 'puff', 'application', 'unit']);
  assert.equal(await page.$('input[name="dosage"]'), null, 'no free-text dose box');
  await selectOption(page, 'select[name="medicine_id"]', '19');
  await page.type('input[name="dose_amount"]', '250');
  await page.select('select[name="dose_unit"]', 'mg');
  await page.type('input[name="frequency"]', 'Twice daily');
  await page.type('input[name="duration"]', '5 days');
  await page.type('input[name="quantity"]', '10');
  const [req] = await Promise.all([
    page.waitForRequest(r => r.url().endsWith('/api/prescriptions') && r.method() === 'POST'),
    clickButton(page, 'Create Prescription'),
  ]);
  assert.equal(JSON.parse(req.postData()).items[0].dosage, '250 mg');
  await waitForText(page, 'Prescription created');
});

test('chart lines are labelled; the older line shows its dose as written', async () => {
  await open(page, `/patients/${patient}`);
  await clickButton(page, 'Prescriptions');
  await waitForText(page, 'Dose: 250 mg');
  const text = await page.evaluate(() => document.body.innerText);
  assert.match(text, /Dose: 250 mg · Frequency: Twice daily · Duration: 5 days · Quantity: 10/);
  assert.match(text, /Dose: 1 tab · Frequency: Once daily · Duration: 3 days · Quantity: 3/);
});

test('the pharmacy shows each line with labelled dose, frequency, duration and quantity', async () => {
  const ctx = await browser.createBrowserContext();
  page = await ctx.newPage();
  await login(page, 'pharmacy_staff');
  await open(page, '/pharmacy');
  const row = await page.waitForFunction((name) => [...document.querySelectorAll('tr')].find(tr => tr.innerText.includes(name)), { timeout: 10000 }, `Rx Lines ${stamp}`);
  await (await row.asElement().$('button')).click();
  await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.innerText.trim() === 'Items'), { timeout: 5000 });
  const headers = await page.$$eval('th', ths => ths.map(t => t.innerText.trim()));
  for (const h of ['Dose', 'Frequency', 'Duration', 'Quantity']) assert.ok(headers.includes(h), headers.join(' | '));
  await ctx.close();
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
