// CodeRabbit PR #1: the live flag on the lab result form must apply the test's critical bounds,
// as the server does, so a critical value is shown as CRITICAL while it is typed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { login, db, closeDb, open, call, tokenOf } = require('./lib/harness');

const GLUCOSE = 5; // 70–100 mg/dL
let browser, page, orderId;
before(async () => {
  await (await db()).query('UPDATE lab_tests SET critical_low = 40, critical_high = 400 WHERE test_id = ?', [GLUCOSE]);
  const [doc, lab] = [await tokenOf('dr.smith'), await tokenOf('lab_staff')];
  orderId = (await call('POST', '/lab/orders', doc, { patient_id: 1, doctor_id: 1, tests: [{ test_id: GLUCOSE }], notes: '' })).body.data.id;
  await call('PUT', `/lab/orders/${orderId}/status`, lab, { status: 'PROCESSING' });
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'lab_staff');
});
after(async () => {
  await (await db()).query('UPDATE lab_tests SET critical_low = NULL, critical_high = NULL WHERE test_id = ?', [GLUCOSE]);
  await browser.close(); await closeDb();
});

const flag = () => page.$eval('[data-testid="auto-flag"]', el => el.innerText).catch(() => null);
async function setValue(name, value) {
  await page.$eval(`[name="${name}"]`, (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}

test('a value beyond a critical bound shows CRITICAL (automatic) while typing, and saves as CRITICAL', async () => {
  await open(page, '/laboratory');
  const enter = await page.waitForSelector(`[data-order="${orderId}"] button`);
  await enter.click();
  await page.waitForSelector('input[name="result_value"]');
  await page.type('input[name="result_value"]', '450');
  assert.equal(await flag(), 'CRITICAL (automatic)');
  assert.equal(await page.$('input[name="escalate"]'), null, 'no "escalate" option when it is already critical');
  await setValue('result_value', '30');
  assert.equal(await flag(), 'CRITICAL (automatic)', 'below the critical low bound');
  await setValue('result_value', '150');
  assert.equal(await flag(), 'HIGH (automatic)', 'above the reference range but not critical');
  await setValue('result_value', '85');
  assert.equal(await flag(), 'NORMAL (automatic)');

  // Another unit: neither the test's reference nor its critical bounds apply (same rule as the server).
  await setValue('unit', 'mmol/L');
  await setValue('result_value', '450');
  assert.equal(await flag(), null);

  await setValue('unit', 'mg/dL');
  await setValue('result_value', '450');
  assert.equal(await flag(), 'CRITICAL (automatic)');
  const [res] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/lab/results') && r.request().method() === 'POST'),
    page.click('form button[type="submit"]'),
  ]);
  const body = await res.json();
  assert.deepEqual([body.data.interpretation, body.data.interpretation_source], ['CRITICAL', 'AUTO'], 'what was shown is what the server stored');
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
