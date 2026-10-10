// Item 13: the pharmacy list shows "View" (not "View / Dispense") for dispensed prescriptions, and
// lists pending prescriptions first, then the newest.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, closeDb, open, call, tokenOf, visitInProgress } = require('./lib/harness');

let browser, page, dispensed;
diagnoseFailures(() => page);
before(async () => {
  // The newest prescription is a dispensed one: it must still come after every pending one.
  const visit = await visitInProgress(1);
  dispensed = (await call('POST', '/prescriptions', await tokenOf('dr.smith'), { patient_id: 1, doctor_id: 1, items: [{ medicine_id: 18, dosage: '1 tablet', frequency: 'Once daily', duration: '1 day', quantity: 1 }] })).body.data.id;
  const res = await call('POST', `/prescriptions/${dispensed}/dispense`, await tokenOf('pharmacy_staff'));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  await visit.close();
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'pharmacy_staff');
});
after(async () => { await browser?.close(); await closeDb(); });

const rows = () => page.$$eval('[data-testid="rx-row"]', trs => trs.map(tr => ({ id: Number(tr.dataset.prescription), status: tr.dataset.status, date: tr.dataset.date, button: tr.querySelector('button')?.innerText.trim() })));

test('pending prescriptions come first, then the newest', async () => {
  await open(page, '/pharmacy');
  await page.waitForSelector('[data-testid="rx-row"]');
  const list = await rows();
  const firstOther = list.findIndex(r => r.status !== 'CREATED');
  assert.ok(firstOther > 0, 'the test data has pending prescriptions');
  assert.ok(list.slice(firstOther).every(r => r.status !== 'CREATED'), list.map(r => r.status).join(','));
  for (const group of [list.slice(0, firstOther), list.slice(firstOther)]) {
    const dates = group.map(r => r.date);
    assert.deepEqual(dates, [...dates].sort().reverse(), 'newest first within each group');
  }
  assert.equal(list[firstOther].id, dispensed, 'the newest dispensed prescription leads the rest');
});

test('dispensed prescriptions offer "View"; pending ones "View / Dispense"', async () => {
  const list = await rows();
  assert.ok(list.filter(r => r.status === 'CREATED').every(r => r.button === 'View / Dispense'));
  assert.ok(list.filter(r => r.status !== 'CREATED').every(r => r.button === 'View'), JSON.stringify(list.filter(r => r.status !== 'CREATED').slice(0, 3)));
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
