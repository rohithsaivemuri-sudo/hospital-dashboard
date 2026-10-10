// Item 11: no page shows a doubled title ("Dr. Dr."). Doctor names are stored with their title.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, closeDb, open, call, tokenOf, visitInProgress } = require('./lib/harness');

let browser, page;
diagnoseFailures(() => page);
before(async () => {
  // Work on the lab bench (an order by dr.smith), so the laboratory pages list a doctor.
  const visit = await visitInProgress(1);
  await call('POST', '/lab/orders', await tokenOf('dr.smith'), { patient_id: 1, doctor_id: 1, tests: [{ test_id: 1 }], notes: '' });
  await visit.close();
  browser = await launch();
});
after(async () => { await browser?.close(); await closeDb(); });

const sidebarPages = () => page.evaluate(() => [...new Set([...document.querySelectorAll('aside a, nav a')].map(a => a.getAttribute('href')).filter(h => h && h.startsWith('/')))]);

for (const username of ['admin', 'dr.smith', 'nurse1', 'reception1', 'lab_staff', 'pharmacy_staff']) {
  test(`${username}: no page shows "Dr. Dr."`, async () => {
    const ctx = await browser.createBrowserContext();
    page = await ctx.newPage();
    await login(page, username);
    const found = [];
    for (const path of ['/', ...(await sidebarPages()), '/patients/1']) {
      await open(page, path);
      const text = await page.evaluate(() => document.body.innerText);
      const hit = text.match(/.{0,30}Dr\.?\s+Dr\..{0,30}/);
      if (hit) found.push(`${path}: ${hit[0]}`);
    }
    await ctx.close();
    assert.deepEqual(found, []);
  });
}

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
