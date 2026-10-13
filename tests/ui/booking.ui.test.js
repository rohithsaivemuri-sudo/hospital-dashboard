// Appointment booking (item 2): no numeric ids — the patient is found with the patients search and
// the doctor chosen from a list with name, specialization, availability and workload.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf } = require('./lib/harness');
const { daysFromToday } = require('./lib/dates');

let browser, page, patient, patel;
diagnoseFailures(() => page);
const stamp = Date.now().toString(36);
before(async () => {
  const rec = await tokenOf('reception1');
  patient = (await call('POST', '/patients', rec, { name: `Booking Person ${stamp}`, date_of_birth: '1985-02-02', gender: 'FEMALE', blood_group: null, phone: '9988776655', address: null, emergency_contact: null })).body.data.id;
  [[patel]] = await (await db()).query("SELECT d.doctor_id, d.name, d.specialization, d.current_workload, d.max_workload FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = 'dr.patel'");
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'reception1');
});
after(async () => { await browser.close(); await closeDb(); });

const setValue = (sel, v) => page.$eval(sel, (el, v) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);

test('the booking form asks for no numeric ids', async () => {
  await open(page, '/appointments/new');
  await page.waitForSelector('form');
  const text = await page.$eval('form', f => f.innerText);
  assert.ok(!/Patient ID|Doctor ID/i.test(text), text.slice(0, 200));
  assert.equal(await page.$('input[name="patientId"], input[name="doctorId"]'), null);
});

test('find the patient by name, pick the doctor from the list, and book', async () => {
  await open(page, '/appointments/new');
  await page.waitForSelector('input[name="patient-search"]');
  await page.type('input[name="patient-search"]', `Booking Person ${stamp}`);
  const pick = await page.waitForSelector(`[data-testid="patient-option"][data-patient="${patient}"]`, { timeout: 5000 });
  assert.match(await pick.evaluate(el => el.innerText), new RegExp(`MRN-${String(patient).padStart(6, '0')}`));
  await (await pick.$('button')).click();
  await page.waitForSelector('[data-testid="selected-patient"]');
  assert.match(await page.$eval('[data-testid="selected-patient"]', el => el.innerText), new RegExp(`Booking Person ${stamp}`));

  const doctorRow = await page.waitForSelector(`[data-testid="doctor-option"][data-doctor="${patel.doctor_id}"]`);
  const rowText = await doctorRow.evaluate(el => el.innerText);
  assert.ok(rowText.includes(patel.name) && rowText.includes(patel.specialization), rowText);
  assert.match(rowText, /Available|Busy|Off duty|On leave/);
  assert.match(rowText, new RegExp(`${patel.current_workload} of ${patel.max_workload} patients`));
  await (await doctorRow.$('input[type="radio"]')).click();

  const date = daysFromToday(3);
  await setValue('input[name="date"]', date);
  await setValue('input[name="time"]', '11:45');
  const [res] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/appointments') && r.request().method() === 'POST'),
    page.click('form button[type="submit"]'),
  ]);
  assert.equal(res.status(), 201, await res.text());
  const body = JSON.parse(res.request().postData());
  assert.deepEqual([Number(body.patient_id), Number(body.doctor_id), body.appointment_date], [patient, patel.doctor_id, date]);
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
