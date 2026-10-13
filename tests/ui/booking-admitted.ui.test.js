// Item 10: booking an outpatient appointment for a patient who is currently admitted shows a
// warning that must be confirmed before the booking is sent.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf } = require('./lib/harness');
const { daysFromToday } = require('./lib/dates');

let browser, page, patient, admission, bed, requests = 0;
diagnoseFailures(() => page);
const stamp = Date.now().toString(36);
before(async () => {
  const rec = await tokenOf('reception1');
  patient = (await call('POST', '/patients', rec, { name: `Booking Admitted ${stamp}`, date_of_birth: '1958-08-08', gender: 'FEMALE', blood_group: null, phone: null, address: null, emergency_contact: null })).body.data.id;
  [[bed]] = await (await db()).query("SELECT b.bed_id, b.bed_number, w.name AS ward FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = 'ICU Ward' AND b.status = 'AVAILABLE' ORDER BY b.bed_id LIMIT 1");
  admission = (await call('POST', '/admissions', rec, { patient_id: patient, doctor_id: 1, bed_id: bed.bed_id, department_id: 1, diagnosis: 'Booking warning' })).body.data.id;
  browser = await launch();
  page = await browser.newPage();
  page.on('request', r => { if (r.url().endsWith('/api/appointments') && r.method() === 'POST') requests++; });
  await login(page, 'reception1');
});
after(async () => {
  await call('POST', `/admissions/${admission}/discharge`, await tokenOf('dr.smith'), {});
  await browser?.close(); await closeDb();
});

const setValue = (sel, v) => page.$eval(sel, (el, v) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);

test('selecting an admitted patient shows where they are admitted, and the booking waits for confirmation', async () => {
  await open(page, '/appointments/new');
  await page.type('input[name="patient-search"]', `Booking Admitted ${stamp}`);
  const pick = await page.waitForSelector(`[data-testid="patient-option"][data-patient="${patient}"]`, { timeout: 5000 });
  await (await pick.$('button')).click();
  const warning = await page.waitForSelector('[data-testid="admitted-warning"]', { timeout: 5000 });
  const text = await warning.evaluate(el => el.innerText);
  assert.match(text, /currently admitted/i);
  assert.ok(text.includes(`${bed.ward} · Bed ${bed.bed_number}`) && text.includes('Dr. John Smith'), text);

  await (await page.waitForSelector('[data-testid="doctor-option"] input[type="radio"]')).click();
  await setValue('input[name="date"]', daysFromToday(2));
  await setValue('input[name="time"]', '10:35');
  await page.click('form button[type="submit"]');
  await new Promise(r => setTimeout(r, 500));
  assert.equal(requests, 0, 'nothing is booked before the warning is confirmed');
  assert.equal(await page.$eval('input[name="confirm-admitted"]', el => el.validity.valueMissing), true);

  await page.click('input[name="confirm-admitted"]');
  const [res] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/appointments') && r.request().method() === 'POST'),
    page.click('form button[type="submit"]'),
  ]);
  assert.equal(res.status(), 201);
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
