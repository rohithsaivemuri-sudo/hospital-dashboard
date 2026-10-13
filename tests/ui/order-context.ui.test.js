// Orders bound to a visit or admission (item 5): the order dialogs say where the order will be filed,
// refuse with "Start the visit first" when there is nowhere to file it, and each order row says
// which visit or admission it belongs to.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf, clickButton, selectOption, waitForText } = require('./lib/harness');
const { today } = require('./lib/dates');

let browser, page, visitPatient, admittedPatient, bystander, encounter, admission;
diagnoseFailures(() => page);
const stamp = Date.now().toString(36);
const iso = today();
before(async () => {
  const [rec, doc] = [await tokenOf('reception1'), await tokenOf('dr.smith')];
  const register = async (name) => (await call('POST', '/patients', rec, { name: `${name} ${stamp}`, date_of_birth: '1975-05-05', gender: 'FEMALE', blood_group: null, phone: null, address: null, emergency_contact: null })).body.data.id;
  [visitPatient, admittedPatient, bystander] = [await register('Order Visit'), await register('Order Admitted'), await register('Order Bystander')];
  const appt = (await call('POST', '/appointments', rec, { patient_id: visitPatient, doctor_id: 1, appointment_date: iso, appointment_time: '23:50:00' })).body.data.id;
  encounter = (await call('POST', '/encounters', rec, { appointment_id: appt })).body.data.encounter_id;
  await call('POST', `/encounters/${encounter}/start`, doc);
  const [[bed]] = await (await db()).query("SELECT bed_id FROM beds WHERE status = 'AVAILABLE' ORDER BY bed_id LIMIT 1");
  admission = (await call('POST', '/admissions', rec, { patient_id: admittedPatient, doctor_id: 1, bed_id: bed.bed_id, department_id: 1, diagnosis: 'Order context' })).body.data.id;
  await (await db()).query("UPDATE encounters SET status = 'FINISHED', end_timestamp = NOW() WHERE patient_id = ? AND status IN ('ARRIVED','TRIAGED','IN_PROGRESS')", [admittedPatient]);
  await call('POST', '/appointments', rec, { patient_id: bystander, doctor_id: 1, appointment_date: iso, appointment_time: '23:55:00' });
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'dr.smith');
});
after(async () => {
  const doc = await tokenOf('dr.smith');
  await call('POST', `/encounters/${encounter}/finish`, doc);
  await call('POST', `/admissions/${admission}/discharge`, doc, {});
  await browser.close(); await closeDb();
});

const target = () => page.$eval('[data-testid="order-target"]', el => el.innerText);
const submitDisabled = (label) => page.$$eval('button[type="submit"]', (bs, label) => bs.find(b => b.innerText.trim() === label)?.disabled, label);

test('during a visit in progress, both dialogs say the order is filed under that visit, and the rows say so', async () => {
  await open(page, `/patients/${visitPatient}`);
  await clickButton(page, '+ Order Lab Tests');
  assert.match(await target(), /Filed under the visit with Dr\. John Smith, started/);
  await selectOption(page, 'select[name="test_id"]', '1');
  await clickButton(page, '+ Add Test');
  await clickButton(page, 'Order Tests');
  await waitForText(page, 'Lab tests ordered');
  await open(page, `/patients/${visitPatient}`);
  await clickButton(page, '+ Create Prescription');
  assert.match(await target(), /Filed under the visit/);
  await clickButton(page, 'Cancel');
  await clickButton(page, 'Lab Tests');
  const rows = await page.$$eval('[data-testid="filed-under"]', els => els.map(e => e.innerText));
  assert.ok(rows.length && rows.every(r => /^Visit, /.test(r)), rows.join(' | '));
});

test('for the admitting doctor without a visit, orders are filed under the admission', async () => {
  await open(page, `/patients/${admittedPatient}`);
  await clickButton(page, '+ Order Lab Tests');
  assert.match(await target(), /Filed under the admission from/);
  assert.equal(await submitDisabled('Order Tests'), false);
});

test('with no visit in progress and no admission, the dialogs say "Start the visit first" and cannot submit', async () => {
  await open(page, `/patients/${bystander}`);
  await clickButton(page, '+ Order Lab Tests');
  assert.match(await target(), /Start the visit first/);
  assert.equal(await submitDisabled('Order Tests'), true);
  await clickButton(page, 'Cancel');
  await clickButton(page, '+ Create Prescription');
  assert.match(await target(), /Start the visit first/);
  assert.equal(await submitDisabled('Create Prescription'), true);
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
