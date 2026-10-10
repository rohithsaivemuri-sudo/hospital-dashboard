// One patient through the whole journey, on screen, role by role: registration, booking, triage,
// the doctor's visit (note, lab order, prescription), dispensing, admission, a second booking while
// admitted, ward vitals, and the checks a second doctor and an administrator see. Each step checks
// the items from the manual-testing bug list (numbers in brackets).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf, clickButton, selectOption, waitForText } = require('./lib/harness');

let browser, page;
diagnoseFailures(() => page);
const stamp = Date.now().toString(36);
const NAME = `Journey Patient ${stamp}`;
const now = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(now);
const j = {}; // patient, encounters, admission, bed, patel

before(async () => {
  [[j.bed]] = await (await db()).query("SELECT b.bed_id, b.bed_number FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = 'ICU Ward' AND b.status = 'AVAILABLE' ORDER BY b.bed_id DESC LIMIT 1");
  [[j.patel]] = await (await db()).query("SELECT d.doctor_id, d.name FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = 'dr.patel'");
  browser = await launch();
});
after(async () => {
  const doc = await tokenOf('dr.smith');
  if (j.smithVisit) await call('POST', `/encounters/${j.smithVisit}/finish`, doc);
  if (j.patelVisit) await call('POST', `/encounters/${j.patelVisit}/cancel`, await tokenOf('reception1'));
  if (j.admission) await call('POST', `/admissions/${j.admission}/discharge`, doc, {});
  await browser?.close(); await closeDb();
});

// Signs in as `username` in a fresh browser context; every page opened with go() is checked for a
// doubled title [11] and for the signed-in user in the header [7].
let user;
async function as(username) {
  if (page) await page.browserContext().close();
  const ctx = await browser.createBrowserContext();
  page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await login(page, username);
  user = (await (await db()).query('SELECT username, full_name FROM users WHERE username = ?', [username]))[0][0];
}
async function go(path) {
  await open(page, path);
  const text = await page.evaluate(() => document.body.innerText);
  assert.ok(!/Dr\.?\s+Dr\./.test(text), `[11] "Dr. Dr." on ${path}`);
  const header = await page.$eval('[data-testid="signed-in-as"]', el => el.innerText);
  assert.ok(header.includes(`${user.full_name} (${user.username})`), `[7] header on ${path}: ${header}`);
  return text;
}
const setValue = (sel, v) => page.$eval(sel, (el, v) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const text = (sel) => page.$eval(sel, el => el.innerText);

test('reception registers the patient: a future date of birth is refused [14]; the list shows the newest first, with a total, and finds her by MRN [1]', async () => {
  await as('reception1');
  await go('/patients/new');
  await page.type('input[name="name"]', NAME);
  await setValue('input[name="date_of_birth"]', iso(new Date(Date.now() + 3 * 864e5)));
  await waitForText(page, 'Date of birth cannot be in the future');
  await setValue('input[name="date_of_birth"]', '1984-04-14');
  await page.select('select[name="gender"]', 'FEMALE');
  await Promise.all([page.waitForNavigation(), page.click('form button[type="submit"]')]);
  [[{ patient_id: j.patient }]] = await (await db()).query('SELECT patient_id FROM patients WHERE name = ?', [NAME]);

  await go('/patients');
  await page.waitForSelector('[data-testid="patient-row"]');
  assert.equal(await page.$eval('[data-testid="patient-row"]', el => Number(el.dataset.patient)), j.patient, 'newest first');
  assert.match(await text('[data-testid="patient-count"]'), /of \d+ patients/);
  await page.type('input[name="patient-search"]', `MRN-${String(j.patient).padStart(6, '0')}`);
  await page.waitForFunction((id) => { const rows = document.querySelectorAll('[data-testid="patient-row"]'); return rows.length === 1 && Number(rows[0].dataset.patient) === id; }, { timeout: 5000 }, j.patient);
});

test('reception books with the patient search and the doctor list, no ids [2]; today\'s list reads in plain words and HH:MM [3]', async () => {
  await go('/appointments/new');
  await page.type('input[name="patient-search"]', NAME);
  await (await (await page.waitForSelector(`[data-testid="patient-option"][data-patient="${j.patient}"]`)).$('button')).click();
  assert.equal(await page.$('[data-testid="admitted-warning"]'), null, '[10] not admitted yet: no warning');
  const smith = await page.waitForSelector('[data-testid="doctor-option"][data-doctor="1"]');
  assert.match(await smith.evaluate(el => el.innerText), /of \d+ patients/);
  await (await smith.$('input[type="radio"]')).click();
  await setValue('input[name="date"]', TODAY);
  await setValue('input[name="time"]', '23:20');
  await Promise.all([page.waitForNavigation(), page.click('form button[type="submit"]')]);
  [[{ appointment_id: j.smithAppt }]] = await (await db()).query('SELECT appointment_id FROM appointments WHERE patient_id = ? AND doctor_id = 1', [j.patient]);
  j.smithVisit = (await call('POST', '/encounters', await tokenOf('reception1'), { appointment_id: j.smithAppt })).body.data.encounter_id; // checked in

  const list = await go('/appointments');
  assert.equal(await page.$eval('input[name="appointment-date"]', el => el.value), TODAY);
  const row = await text(`[data-testid="appointments-day"] [data-appointment="${j.smithAppt}"]`);
  assert.match(row, /23:20/); assert.ok(!/23:20:00/.test(row));
  assert.match(row, /Checked in/);
  assert.ok(!/\bCHECKED_IN\b/.test(list));
});

test('the nurse takes triage vitals from the outpatient row: filed under the visit, said before saving [6]', async () => {
  await as('nurse1');
  await go('/');
  await page.click(`[data-testid="visit-row"][data-encounter="${j.smithVisit}"] [data-testid="record-vitals"]`);
  await page.waitForSelector('[data-testid="vitals-form"]');
  assert.match(await text('[data-testid="vitals-target"]'), /Visit with Dr\. John Smith/);
  await page.type('input[name="pulse_bpm"]', '92');
  await page.type('input[name="temperature_c"]', '37.4');
  await clickButton(page, 'Save vitals');
  await waitForText(page, 'Vitals saved');
});

test('the doctor\'s dashboard is in plain words [15]; the visit is started and the Visits tab lists it with its vitals [4]', async () => {
  await as('dr.smith');
  const dash = await go('/');
  assert.ok(!/\b(CHECKED_IN|TRIAGED|IN_PROGRESS|BOOKED)\b/.test(dash), '[15] no raw codes');
  assert.ok(!/\b1 active admissions\b/.test(dash), '[15] singular');
  await go(`/patients/${j.patient}`);
  await clickButton(page, 'Start Visit');
  await waitForText(page, 'Visit started');
  await clickButton(page, 'Visits');
  const sel = `[data-testid="visit-card"][data-encounter="${j.smithVisit}"]`;
  await page.waitForFunction((sel) => document.querySelector(sel)?.innerText.includes('Pulse 92'), { timeout: 5000 }, sel); // vitals load separately
  const c = await text(sel);
  assert.match(c, /Current visit/); assert.match(c, /In progress/); assert.match(c, /Outpatient/); assert.match(c, /Pulse 92/);
});

test('the doctor writes a note, orders a lab test and prescribes; each says where it is filed [4][5], the dose has a unit and lines are labelled [12]', async () => {
  await clickButton(page, '+ Write note for current visit');
  assert.match(await text('[data-testid="note-target"]'), /Filed under the visit with Dr\. John Smith/);
  const areas = await page.$$('form textarea');
  await areas[0].type('Fever and cough for three days');
  await page.type('form input[type="text"]', 'Viral fever');
  await areas[1].type('Mild dehydration'); await areas[2].type('Fluids, review in three days');
  await clickButton(page, 'Save Note');
  await waitForText(page, 'Note saved');

  await go(`/patients/${j.patient}`);
  await clickButton(page, '+ Order Lab Tests');
  assert.match(await text('[data-testid="order-target"]'), /Filed under the visit with Dr\. John Smith/);
  await selectOption(page, 'select[name="test_id"]', '1');
  await clickButton(page, '+ Add Test');
  await clickButton(page, 'Order Tests');
  await waitForText(page, 'Lab tests ordered');

  await go(`/patients/${j.patient}`);
  await clickButton(page, '+ Create Prescription');
  assert.match(await text('[data-testid="order-target"]'), /Filed under the visit/);
  await selectOption(page, 'select[name="medicine_id"]', '1');
  await page.type('input[name="dose_amount"]', '500');
  await page.select('select[name="dose_unit"]', 'mg');
  await page.type('input[name="frequency"]', 'Three times daily');
  await page.type('input[name="duration"]', '3 days');
  await page.type('input[name="quantity"]', '9');
  await clickButton(page, 'Create Prescription');
  await waitForText(page, 'Prescription created');

  await go(`/patients/${j.patient}`);
  await clickButton(page, 'Lab Tests');
  assert.match(await text('[data-testid="filed-under"]'), /^Visit, /);
  await clickButton(page, 'Prescriptions');
  await waitForText(page, 'Dose: 500 mg · Frequency: Three times daily · Duration: 3 days · Quantity: 9');
  assert.match(await text('[data-testid="filed-under"]'), /^Visit, /);
  await clickButton(page, 'Visits');
  const c = await text(`[data-testid="visit-card"][data-encounter="${j.smithVisit}"]`);
  assert.match(c, /Fever and cough for three days/); assert.match(c, /Complete Blood Count/); assert.match(c, /Dose: 500 mg/);
});

test('pharmacy lists pending first, shows labelled lines, dispenses, and then offers "View" [13][12]', async () => {
  await as('pharmacy_staff');
  await go('/pharmacy');
  await page.waitForSelector('[data-testid="rx-row"]');
  const statuses = await page.$$eval('[data-testid="rx-row"]', trs => trs.map(t => t.dataset.status));
  assert.deepEqual(statuses, [...statuses].sort((a, b) => (b === 'CREATED') - (a === 'CREATED')), '[13] pending first');
  const mine = async () => page.waitForFunction((name) => [...document.querySelectorAll('[data-testid="rx-row"]')].find(tr => tr.innerText.includes(name)), { timeout: 5000 }, NAME);
  assert.equal(await (await mine()).evaluate(tr => tr.querySelector('button').innerText.trim()), 'View / Dispense');
  await (await (await mine()).asElement().$('button')).click();
  await page.waitForFunction(() => [...document.querySelectorAll('th')].some(t => t.innerText.trim() === 'Dose'));
  await clickButton(page, 'Confirm Dispense All');
  await page.waitForFunction((name) => [...document.querySelectorAll('[data-testid="rx-row"]')].find(tr => tr.innerText.includes(name))?.querySelector('button')?.innerText.trim() === 'View', { timeout: 10000 }, NAME);
});

test('the doctor admits the patient; the header names ward, bed and admitting doctor [8]', async () => {
  await as('dr.smith');
  await go(`/patients/${j.patient}`);
  await clickButton(page, 'Admit Patient');
  const beds = await page.waitForFunction(() => [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.innerText === 'Select an available bed') && s.options.length > 1));
  await beds.asElement().select(String(j.bed.bed_id));
  await page.type('form textarea', 'Dehydration needing IV fluids');
  await clickButton(page, 'Confirm Admission');
  await waitForText(page, 'Patient admitted');
  [[{ admission_id: j.admission }]] = await (await db()).query("SELECT admission_id FROM admissions WHERE patient_id = ? AND status = 'ACTIVE'", [j.patient]);
  await page.waitForSelector('[data-testid="header-admission"]');
  const h = await text('[data-testid="header-admission"]');
  assert.match(h, new RegExp(`ICU Ward · Bed ${j.bed.bed_number} · under Dr\\. John Smith`));
  assert.ok(!/Bed #\d/.test(await text('[data-testid="patient-context"]')));
});

test('booking an outpatient appointment for the admitted patient needs confirmation [10]', async () => {
  await as('reception1');
  await go('/appointments/new');
  await page.type('input[name="patient-search"]', NAME);
  await (await (await page.waitForSelector(`[data-testid="patient-option"][data-patient="${j.patient}"]`)).$('button')).click();
  const w = await (await page.waitForSelector('[data-testid="admitted-warning"]')).evaluate(el => el.innerText);
  assert.match(w, new RegExp(`currently admitted[\\s\\S]*ICU Ward · Bed ${j.bed.bed_number}`));
  await (await page.waitForSelector(`[data-testid="doctor-option"][data-doctor="${j.patel.doctor_id}"] input[type="radio"]`)).click();
  await setValue('input[name="date"]', TODAY);
  await setValue('input[name="time"]', '23:30');
  await page.click('form button[type="submit"]');
  await new Promise(r => setTimeout(r, 400));
  assert.match(page.url(), /\/appointments\/new$/, 'not booked before confirming');
  await page.click('input[name="confirm-admitted"]');
  await Promise.all([page.waitForNavigation(), page.click('form button[type="submit"]')]);
  [[{ appointment_id: j.patelAppt }]] = await (await db()).query('SELECT appointment_id FROM appointments WHERE patient_id = ? AND doctor_id = ?', [j.patient, j.patel.doctor_id]);
  j.patelVisit = (await call('POST', '/encounters', await tokenOf('reception1'), { appointment_id: j.patelAppt })).body.data.encounter_id;
});

test('from the bed card the nurse is offered both, the admission chosen; the reading shows where it was filed [6][7]', async () => {
  await as('nurse1');
  await go('/');
  const link = await page.waitForFunction((name) => [...document.querySelectorAll('[data-testid="bed-card"]')].find(c => c.innerText.includes(name))?.querySelector('[data-testid="bed-vitals-link"]'), { timeout: 10000 }, NAME);
  await Promise.all([page.waitForNavigation(), link.asElement().click()]);
  await page.waitForSelector('[data-testid="vitals-form"]');
  assert.deepEqual((await page.$$eval('input[name="vitals-context"]', els => els.map(e => e.value))).sort(), ['admission', 'visit']);
  assert.equal(await page.$eval('input[name="vitals-context"]:checked', el => el.value), 'admission');
  const target = `Admission · ICU Ward bed ${j.bed.bed_number}`;
  assert.match(await text('[data-testid="vitals-target"]'), new RegExp(target));
  await page.type('input[name="pulse_bpm"]', '84');
  await clickButton(page, 'Save vitals');
  await waitForText(page, 'Vitals saved');
  await page.waitForFunction((t) => [...document.querySelectorAll('[data-testid="reading-context"]')].some(e => e.innerText === t), { timeout: 5000 }, target);
});

test('a second doctor sees "Discharge Patient" disabled with the reason [9]', async () => {
  await as('dr.patel');
  await go(`/patients/${j.patient}`);
  const disabled = await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Discharge Patient')?.disabled);
  assert.equal(disabled, true);
  assert.match(await text('[data-testid="discharge-reason"]'), /Only Dr\. John Smith, the admitting doctor, can discharge this patient/);
});

test('the administrator sees staff as "Full name (username)" [7]', async () => {
  await as('admin');
  await go('/nurse-assignments');
  const [[nurse]] = await (await db()).query("SELECT full_name FROM users WHERE username = 'nurse1'");
  await waitForText(page, `${nurse.full_name} (nurse1)`);
  await go('/staff');
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
