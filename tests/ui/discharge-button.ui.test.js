// Item 9: "Discharge Patient" is only usable by the admitting doctor; another doctor sees it
// disabled with the reason.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf } = require('./lib/harness');

let browser, page, patient, admission;
diagnoseFailures(() => page);
before(async () => {
  const rec = await tokenOf('reception1');
  patient = (await call('POST', '/patients', rec, { name: `Discharge Button ${Date.now().toString(36)}`, date_of_birth: '1961-01-01', gender: 'MALE', blood_group: null, phone: null, address: null, emergency_contact: null })).body.data.id;
  const [[bed]] = await (await db()).query("SELECT b.bed_id FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = 'ICU Ward' AND b.status = 'AVAILABLE' ORDER BY b.bed_id LIMIT 1");
  admission = (await call('POST', '/admissions', rec, { patient_id: patient, doctor_id: 1, bed_id: bed.bed_id, department_id: 1, diagnosis: 'Discharge button' })).body.data.id;
  const [[patel]] = await (await db()).query("SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = 'dr.patel'");
  const d = new Date(Date.now() + 864e5); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await call('POST', '/appointments', rec, { patient_id: patient, doctor_id: patel.doctor_id, appointment_date: iso, appointment_time: '09:05:00' }); // dr.patel's patient too
  browser = await launch();
});
after(async () => {
  await call('POST', `/admissions/${admission}/discharge`, await tokenOf('dr.smith'), {});
  await browser?.close(); await closeDb();
});

const dischargeButton = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Discharge Patient');
  return b ? { disabled: b.disabled, title: b.title } : null;
});

async function asDoctor(username) {
  const ctx = await browser.createBrowserContext();
  page = await ctx.newPage();
  await login(page, username);
  await open(page, `/patients/${patient}`);
  return ctx;
}

test('another doctor sees "Discharge Patient" disabled, with the reason', async () => {
  const ctx = await asDoctor('dr.patel');
  const b = await dischargeButton();
  assert.ok(b, 'the button is shown');
  assert.equal(b.disabled, true);
  const reason = await page.$eval('[data-testid="discharge-reason"]', el => el.innerText);
  assert.match(reason, /Only Dr\. John Smith, the admitting doctor, can discharge this patient/);
  await ctx.close();
});

test('the admitting doctor can use it', async () => {
  const ctx = await asDoctor('dr.smith');
  const b = await dischargeButton();
  assert.equal(b?.disabled, false);
  assert.equal(await page.$('[data-testid="discharge-reason"]'), null);
  await ctx.close();
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
