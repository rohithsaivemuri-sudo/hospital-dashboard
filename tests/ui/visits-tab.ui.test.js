// Visits tab (item 4): every visit, including the open one, with status, doctor, type and times, and
// under each visit its notes, vitals, lab orders and prescriptions.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf, clickButton } = require('./lib/harness');

let browser, page, patient, earlier, current;
diagnoseFailures(() => page);
const stamp = Date.now().toString(36);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
before(async () => {
  const [rec, doc, nurse] = [await tokenOf('reception1'), await tokenOf('dr.smith'), await tokenOf('nurse1')];
  patient = (await call('POST', '/patients', rec, { name: `Visits Tab ${stamp}`, date_of_birth: '1979-07-07', gender: 'MALE', blood_group: null, phone: null, address: null, emergency_contact: null })).body.data.id;
  const visit = async (date, time) => {
    const appt = (await call('POST', '/appointments', rec, { patient_id: patient, doctor_id: 1, appointment_date: date, appointment_time: time })).body.data.id;
    return (await call('POST', '/encounters', rec, { appointment_id: appt })).body.data.encounter_id;
  };
  earlier = await visit(iso(new Date(Date.now() - 5 * 864e5)), '09:10:00');
  await call('POST', `/encounters/${earlier}/start`, doc);
  await call('POST', '/consultations', doc, { patient_id: patient, doctor_id: 1, symptoms: `Earlier visit cough ${stamp}`, diagnosis: 'Viral URTI' });
  await call('POST', `/encounters/${earlier}/finish`, doc);

  current = await visit(iso(new Date()), '23:59:00');
  await call('POST', '/vitals', nurse, { patient_id: patient, encounter_id: current, pulse_bpm: 88, temperature_c: 37.9, mark_triaged: true });
  await call('POST', `/encounters/${current}/start`, doc);
  await call('POST', '/consultations', doc, { patient_id: patient, doctor_id: 1, symptoms: `Current visit headache ${stamp}`, diagnosis: 'Tension headache' });
  await call('POST', '/lab/orders', doc, { patient_id: patient, doctor_id: 1, tests: [{ test_id: 1 }], notes: '' });
  await call('POST', '/prescriptions', doc, { patient_id: patient, doctor_id: 1, items: [{ medicine_id: 18, dosage: '1 tablet', frequency: 'Once daily', duration: '3 days', quantity: 3 }] });
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'dr.smith');
});
after(async () => {
  const doc = await tokenOf('dr.smith');
  await call('POST', `/encounters/${current}/finish`, doc);
  await browser.close(); await closeDb();
});

const card = (id) => page.$eval(`[data-testid="visit-card"][data-encounter="${id}"]`, el => el.innerText);

test('every visit is listed, the open one first and marked current, with status, doctor, type and times', async () => {
  await open(page, `/patients/${patient}`);
  await clickButton(page, 'Visits');
  await page.waitForSelector(`[data-testid="visit-card"][data-encounter="${current}"]`);
  const ids = await page.$$eval('[data-testid="visit-card"]', els => els.map(e => Number(e.dataset.encounter)));
  assert.deepEqual(ids.slice(0, 2), [current, earlier]);
  const now = await card(current);
  assert.match(now, /Current visit/);
  assert.match(now, /In progress/);
  assert.match(now, /Dr\. John Smith/);
  assert.match(now, /Outpatient/);
  assert.match(now, /Arrived[^\n]*\d/);
  assert.match(now, /Started[^\n]*\d/);
  const before = await card(earlier);
  assert.match(before, /Finished/);
  assert.match(before, /Ended[^\n]*\d/);
  assert.ok(!/Current visit/.test(before));
});

test('under each visit: its notes, vitals, lab orders and prescriptions, and nothing from the other visit', async () => {
  const now = await card(current);
  assert.match(now, new RegExp(`Current visit headache ${stamp}`));
  assert.match(now, /Pulse 88/);
  assert.match(now, /Temperature 37\.9/);
  assert.match(now, /Complete Blood Count/);
  assert.match(now, /Paracetamol|Prescription/);
  assert.ok(!now.includes(`Earlier visit cough ${stamp}`));
  const before = await card(earlier);
  assert.match(before, new RegExp(`Earlier visit cough ${stamp}`));
  assert.ok(!before.includes(`Current visit headache ${stamp}`));
});

test('the note button says what it does', async () => {
  const labels = await page.$$eval('button', bs => bs.map(b => b.innerText.trim()));
  assert.ok(labels.includes('+ Write note for current visit'), labels.join(' | '));
  assert.ok(!labels.includes('+ New Clinical Encounter'));
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
