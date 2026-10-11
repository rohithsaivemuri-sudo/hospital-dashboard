// Patients list (item 1): newest first, paged with a total, one search for name, phone, MRN or ABHA,
// for every role that can see the list.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, closeDb, open, call, tokenOf, clickButton } = require('./lib/harness');

let browser, page, newest;
diagnoseFailures(() => page);
const stamp = Date.now().toString(36);
before(async () => {
  const rec = await tokenOf('reception1');
  const res = await call('POST', '/patients', rec, { name: `List Newest ${stamp}`, date_of_birth: '1990-05-05', gender: 'MALE', blood_group: null, phone: '9123400099', address: null, emergency_contact: null });
  newest = { id: res.body.data.id, mrn: `MRN-${String(res.body.data.id).padStart(6, '0')}` };
  browser = await launch();
});
after(async () => { await browser.close(); await closeDb(); });

const rows = () => page.$$eval('[data-testid="patient-row"]', rs => rs.map(r => Number(r.dataset.patient)));
const countText = () => page.$eval('[data-testid="patient-count"]', el => el.innerText);
async function search(text) {
  await page.$eval('input[name="patient-search"]', el => { el.focus(); el.select(); });
  await page.keyboard.press('Backspace');
  if (text) await page.type('input[name="patient-search"]', text);
  await page.waitForFunction(() => !document.querySelector('table[style*="opacity: 0.6"]'), { polling: 100 });
  await new Promise(r => setTimeout(r, 450)); // debounce + response
}

for (const username of ['admin', 'reception1']) {
  test(`${username}: the newest patient is first; total shown; search by MRN, phone and name; paging`, async () => {
    const ctx = await browser.createBrowserContext();
    page = await ctx.newPage();
    await login(page, username);
    await open(page, '/patients');
    await page.waitForSelector('[data-testid="patient-row"]');
    assert.equal((await rows())[0], newest.id, 'newest first');
    assert.match(await countText(), /^Showing 1–20 of \d+ patients · newest first$/);
    for (const q of [newest.mrn, '9123400099', `list newest ${stamp}`]) {
      await search(q);
      assert.deepEqual(await rows(), [newest.id], q);
    }
    await search('');
    const firstPage = await rows();
    await clickButton(page, 'Next');
    await page.waitForFunction((first) => Number(document.querySelector('[data-testid="patient-row"]')?.dataset.patient) !== first, { polling: 100 }, firstPage[0]);
    const secondPage = await rows();
    assert.ok(secondPage.every(id => !firstPage.includes(id)) && secondPage[0] < firstPage.at(-1), 'page 2 continues the list');
    assert.match(await countText(), /^Showing 21–\d+ of \d+/);
    await ctx.close();
  });
}

for (const username of ['dr.smith', 'nurse1']) {
  test(`${username}: sees only their own patients, with a count; an unrelated patient cannot be found`, async () => {
    const ctx = await browser.createBrowserContext();
    page = await ctx.newPage();
    await login(page, username);
    await open(page, '/patients');
    await page.waitForSelector('[data-testid="patient-count"]');
    assert.match(await countText(), /patients · newest first$|^No patients$/);
    assert.ok(!(await rows()).includes(newest.id));
    await search(newest.mrn);
    assert.deepEqual(await rows(), []);
    await ctx.close();
  });
}

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
