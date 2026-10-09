// Bug 1: Order Lab Tests dialog — "+ Add Test" must be readable, and a test chosen in the dropdown
// but not added is still ordered.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { APP, login, closeDb, clickButton } = require('./lib/harness');

let browser, page;
before(async () => {
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'dr.smith');
});
after(async () => { await browser.close(); await closeDb(); });

async function openDialog() {
  await page.goto(`${APP}/patients/1`);
  await clickButton(page, '+ Order Lab Tests');
  await page.waitForSelector('select[name="test_id"]');
}
const orderRequest = () => page.waitForRequest(r => r.url().endsWith('/api/lab/orders') && r.method() === 'POST');
const readability = (text) => page.evaluate((text) => window.__readability([...document.querySelectorAll('button')].find(b => b.innerText.trim() === text)), text);

test('"+ Add Test" is readable, and an added test plus a chosen-but-not-added test are both ordered', async () => {
  await openDialog();
  const add = await readability('+ Add Test');
  assert.ok(add.ok, `+ Add Test: ${add.reason}`);
  await page.select('select[name="test_id"]', '2');
  await clickButton(page, '+ Add Test');
  await page.waitForFunction(() => document.body.innerText.includes('Remove'));
  await page.select('select[name="test_id"]', '5');
  const [res] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/lab/orders') && r.request().method() === 'POST'),
    clickButton(page, 'Order Tests'),
  ]);
  assert.deepEqual(JSON.parse(res.request().postData()).tests, [{ test_id: '2' }, { test_id: '5' }]);
  assert.equal(res.status(), 201);
});

test('choosing a test without pressing "+ Add Test" still orders it', async () => {
  await openDialog();
  await page.select('select[name="test_id"]', '6');
  const [req] = await Promise.all([orderRequest(), clickButton(page, 'Order Tests')]);
  assert.deepEqual(JSON.parse(req.postData()).tests, [{ test_id: '6' }]);
  await page.waitForFunction(() => !document.querySelector('select[name="test_id"]'));
});

test('with nothing chosen, Order Tests explains instead of sending', async () => {
  await openDialog();
  let sent = false;
  const watch = (r) => { if (r.url().endsWith('/api/lab/orders') && r.method() === 'POST') sent = true; };
  page.on('request', watch);
  await clickButton(page, 'Order Tests');
  await page.waitForFunction(() => document.body.innerText.includes('Choose at least one test'));
  page.off('request', watch);
  assert.equal(sent, false);
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
