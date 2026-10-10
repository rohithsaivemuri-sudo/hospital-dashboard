// Item 8: an admitted patient's chart header shows the bed code, the ward and the admitting doctor,
// not "Bed #<id>".
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf } = require('./lib/harness');

let browser, page, patient, admission, bed;
diagnoseFailures(() => page);
before(async () => {
  const rec = await tokenOf('reception1');
  patient = (await call('POST', '/patients', rec, { name: `Header Bed ${Date.now().toString(36)}`, date_of_birth: '1966-06-06', gender: 'FEMALE', blood_group: null, phone: null, address: null, emergency_contact: null })).body.data.id;
  [[bed]] = await (await db()).query("SELECT b.bed_id, b.bed_number, w.name AS ward FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = 'ICU Ward' AND b.status = 'AVAILABLE' ORDER BY b.bed_id LIMIT 1");
  admission = (await call('POST', '/admissions', rec, { patient_id: patient, doctor_id: 1, bed_id: bed.bed_id, department_id: 1, diagnosis: 'Header test' })).body.data.id;
  browser = await launch();
});
after(async () => {
  await call('POST', `/admissions/${admission}/discharge`, await tokenOf('dr.smith'), {});
  await browser?.close(); await closeDb();
});

for (const username of ['dr.smith', 'nurse1', 'reception1']) {
  test(`${username}: the header names the ward, bed code and admitting doctor`, async () => {
    const ctx = await browser.createBrowserContext();
    page = await ctx.newPage();
    await login(page, username);
    await open(page, `/patients/${patient}`);
    const text = await page.$eval('[data-testid="header-admission"]', el => el.innerText);
    assert.match(text, new RegExp(`${bed.ward} · Bed ${bed.bed_number}`));
    assert.match(text, /under Dr\. John Smith/);
    const header = await page.$eval('[data-testid="patient-context"]', el => el.innerText);
    assert.ok(!/Bed #\d/.test(header), header);
    await ctx.close();
  });
}

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
