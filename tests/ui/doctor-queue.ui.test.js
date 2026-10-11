// The doctor's dashboard queue shows every open visit for that doctor — walk-ins and emergency
// visits without an appointment as well as checked-in appointments — and updates live.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf } = require('./lib/harness');

let browser, page, rec, walkIn, emergency;
diagnoseFailures(() => page);
const freePatient = async () => (await (await db()).query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS'))
  AND patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE') ORDER BY patient_id DESC LIMIT 1`))[0][0].patient_id;
const row = (id) => page.evaluate((id) => {
  const r = document.querySelector(`[data-testid="open-visit"][data-encounter="${id}"]`);
  return r && { source: r.querySelector('[data-testid="visit-source"]').innerText, status: r.querySelector('[data-testid="visit-status"]').innerText, buttons: [...r.querySelectorAll('button')].map(b => b.innerText) };
}, id);

before(async () => {
  rec = await tokenOf('reception1');
  walkIn = (await call('POST', '/encounters', rec, { patient_id: await freePatient(), doctor_id: 1 })).body.data.encounter_id;
  // Nothing in the app creates EMERGENCY encounters yet; insert one as the schema allows.
  const [em] = await (await db()).query("INSERT INTO encounters (patient_id, doctor_id, encounter_type, status, arrived_at) VALUES (?, 1, 'EMERGENCY', 'ARRIVED', NOW())", [await freePatient()]);
  emergency = em.insertId;
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'dr.smith');
});
after(async () => {
  const doc = await tokenOf('dr.smith');
  for (const id of [walkIn, emergency]) await call('POST', `/encounters/${id}/entered-in-error`, doc);
  await browser.close(); await closeDb();
});

test('walk-in and emergency visits appear in My Open Visits with their source and status', async () => {
  await open(page, '/');
  await page.waitForSelector(`[data-testid="open-visit"][data-encounter="${walkIn}"]`);
  assert.deepEqual(await row(walkIn), { source: 'Walk-in', status: 'Waiting, not yet triaged', buttons: ['Start Visit'] });
  assert.deepEqual(await row(emergency), { source: 'Emergency', status: 'Waiting, not yet triaged', buttons: ['Start Visit'] });
  const attention = await page.evaluate(() => document.body.innerText);
  assert.match(attention, /\(walk-in\) is waiting/);
});

test('a walk-in checked in while the dashboard is open appears without a reload', async () => {
  await page.evaluate(() => { window.__sameDocument = true; });
  const id = (await call('POST', '/encounters', rec, { patient_id: await freePatient(), doctor_id: 1 })).body.data.encounter_id;
  await page.waitForSelector(`[data-testid="open-visit"][data-encounter="${id}"]`, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__sameDocument), true);
  await call('POST', `/encounters/${id}/cancel`, rec);
  await page.waitForFunction((id) => !document.querySelector(`[data-testid="open-visit"][data-encounter="${id}"]`), { polling: 100, timeout: 5000 }, id);
});

test('Start Visit from the queue starts the walk-in', async () => {
  const start = await page.$(`[data-testid="open-visit"][data-encounter="${walkIn}"] button`);
  await start.click();
  await page.waitForFunction((id) => document.querySelector(`[data-testid="open-visit"][data-encounter="${id}"] [data-testid="visit-status"]`)?.innerText === 'With you now', { polling: 100, timeout: 5000 }, walkIn);
  assert.deepEqual((await row(walkIn)).buttons, ['Sign & Close']);
  const [[e]] = await (await db()).query('SELECT status FROM encounters WHERE encounter_id = ?', [walkIn]);
  assert.equal(e.status, 'IN_PROGRESS');
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
