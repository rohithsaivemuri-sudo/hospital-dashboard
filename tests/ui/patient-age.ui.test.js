// Patient registration and age: the date of birth starts empty and is required; the age shows as
// soon as a date is entered; an age in years can be given instead (stored as an estimated date of
// birth, shown "approx."); babies under one show months or days; the Edit page follows the same rules.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf, visitInProgress } = require('./lib/harness');

let browser, page, estimated, baby, admission;
diagnoseFailures(() => page);
const stamp = Date.now().toString(36);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => ymd(new Date(Date.now() - n * 864e5));
before(async () => { browser = await launch(); page = await browser.newPage(); await login(page, 'reception1'); });
after(async () => {
  if (admission) await call('POST', `/admissions/${admission}/discharge`, await tokenOf('dr.smith'), {});
  await browser?.close(); await closeDb();
});

const setValue = (sel, v) => page.$eval(sel, (el, v) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const preview = () => page.$eval('[data-testid="age-preview"]', el => el.innerText).catch(() => null);
const fill = async (name) => { await page.type('input[name="name"]', name); await page.select('select[name="gender"]', 'FEMALE'); };
const register = async () => { await Promise.all([page.waitForNavigation(), page.click('form button[type="submit"]')]); return Number(page.url().match(/\/patients\/(\d+)/)[1]); };
const headerAge = () => page.$eval('[data-testid="header-age"]', el => el.innerText);

test('the date of birth starts empty and is required; nothing defaults to today', async () => {
  await open(page, '/patients/new');
  const dob = await page.$eval('input[name="date_of_birth"]', el => ({ value: el.value, required: el.required }));
  assert.deepEqual(dob, { value: '', required: true });
  assert.equal(await page.$eval('input[name="dob-mode"]:checked', el => el.value), 'date');
  assert.equal(await preview(), null, 'no age before a date is entered');
});

test('the age shows as soon as a date is entered, in months or days under one year', async () => {
  const years = new Date().getFullYear() - 1990 - (ymd(new Date()).slice(5) < '06-15' ? 1 : 0);
  await setValue('input[name="date_of_birth"]', '1990-06-15');
  assert.equal(await preview(), `Age: ${years} yrs`);
  await setValue('input[name="date_of_birth"]', daysAgo(100));
  assert.equal(await preview(), 'Age: 3 months');
  await setValue('input[name="date_of_birth"]', daysAgo(12));
  assert.equal(await preview(), 'Age: 12 days');
  await setValue('input[name="date_of_birth"]', ymd(new Date()));
  assert.equal(await preview(), 'Age: 0 days', 'a date of today is obvious before saving');
});

test('a baby registered with a date shows months, not "0 yrs"', async () => {
  await open(page, '/patients/new');
  await fill(`Baby Age ${stamp}`);
  await setValue('input[name="date_of_birth"]', daysAgo(100));
  baby = await register();
  await page.waitForSelector('[data-testid="header-age"]');
  assert.match(await headerAge(), /^3 months · /);
});

test('an age in years can be given instead; it is stored as an estimated date and shown "approx."', async () => {
  await open(page, '/patients/new');
  await fill(`Age Estimate ${stamp}`);
  await page.click('input[name="dob-mode"][value="age"]');
  assert.equal(await page.$('input[name="date_of_birth"]'), null);
  assert.equal(await page.$eval('input[name="age_years"]', el => el.required), true);
  await page.type('input[name="age_years"]', '0');
  await page.waitForSelector('[data-testid="age-error"]');
  await page.click('input[name="age_years"]', { clickCount: 3 });
  await page.type('input[name="age_years"]', '40');
  assert.match(await preview(), /^Age: approx\. 40 yrs \(estimated date of birth .+\)$/);
  estimated = await register();
  const [[row]] = await (await db()).query('SELECT dob_estimated, TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS age FROM patients WHERE patient_id = ?', [estimated]);
  assert.deepEqual({ ...row }, { dob_estimated: 1, age: 40 });
  await page.waitForSelector('[data-testid="header-age"]');
  assert.match(await headerAge(), /^approx\. 40 yrs · /);
  assert.match(await page.$eval('[data-testid="patient-context"]', el => el.innerText), /DOB [^\n]*\(estimated\)/);
});

test('Edit details: an estimated patient opens on the age, and saving other changes keeps the estimate', async () => {
  const [[before]] = await (await db()).query("SELECT DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dob FROM patients WHERE patient_id = ?", [estimated]);
  await open(page, `/patients/${estimated}/edit`);
  await page.waitForFunction(() => document.querySelector('input[name="age_years"]')?.value === '40');
  assert.equal(await page.$eval('input[name="dob-mode"]:checked', el => el.value), 'age');
  await page.type('input[name="phone"]', '9123456780');
  await Promise.all([page.waitForNavigation(), page.click('form button[type="submit"]')]);
  const [[after]] = await (await db()).query("SELECT DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dob, dob_estimated FROM patients WHERE patient_id = ?", [estimated]);
  assert.deepEqual({ ...after }, { dob: before.dob, dob_estimated: 1 });
});

test('Edit details: the same rules, a real date replaces the estimate and the age shows at once', async () => {
  await open(page, `/patients/${estimated}/edit`);
  await page.waitForSelector('input[name="age_years"]');
  await page.click('input[name="dob-mode"][value="date"]');
  const dob = await page.$eval('input[name="date_of_birth"]', el => ({ value: el.value, required: el.required }));
  assert.deepEqual(dob, { value: '', required: true }, 'starts empty, not today or the estimate');
  await setValue('input[name="date_of_birth"]', ymd(new Date(Date.now() + 5 * 864e5)));
  await page.waitForSelector('[data-testid="dob-error"]');
  await setValue('input[name="date_of_birth"]', daysAgo(45));
  assert.equal(await preview(), 'Age: 1 month');
  await setValue('input[name="date_of_birth"]', '1985-01-20');
  await Promise.all([page.waitForNavigation(), page.click('form button[type="submit"]')]);
  await page.waitForSelector('[data-testid="header-age"]');
  assert.match(await headerAge(), /^\d+ yrs · /);
  assert.ok(!/approx/.test(await headerAge()));
  // Back to an estimate for the next checks.
  await call('PUT', `/patients/${estimated}`, await tokenOf('reception1'), { name: `Age Estimate ${stamp}`, age_years: 40, gender: 'FEMALE', blood_group: null, phone: null, address: null, emergency_contact: null });
});

test('"approx." wherever the age is shown: nurse bed card, medication record, pharmacy', async () => {
  const rec = await tokenOf('reception1');
  const [[bed]] = await (await db()).query("SELECT b.bed_id FROM beds b JOIN wards w ON w.ward_id = b.ward_id WHERE w.name = 'ICU Ward' AND b.status = 'AVAILABLE' ORDER BY b.bed_id LIMIT 1");
  admission = (await call('POST', '/admissions', rec, { patient_id: estimated, doctor_id: 1, bed_id: bed.bed_id, department_id: 1, diagnosis: 'Age display' })).body.data.id;
  await call('POST', '/prescriptions', await tokenOf('dr.smith'), { patient_id: estimated, doctor_id: 1, items: [{ medicine_id: 18, dosage: '1 tablet', frequency: 'Once daily', duration: '1 day', quantity: 1 }] });

  const as = async (username) => { if (page.browserContext() !== browser.defaultBrowserContext()) await page.browserContext().close(); page = await (await browser.createBrowserContext()).newPage(); await login(page, username); };
  await as('nurse1');
  await open(page, '/');
  const card = await page.waitForFunction((n) => [...document.querySelectorAll('[data-testid="bed-card"]')].find(c => c.innerText.includes(n))?.innerText, { timeout: 10000 }, `Age Estimate ${stamp}`);
  assert.match(await card.jsonValue(), /approx\. 40 yrs/);
  await open(page, `/mar/${estimated}`);
  await page.waitForFunction(() => /approx\. 40 yrs/.test(document.body.innerText), { timeout: 5000 });

  await as('pharmacy_staff');
  await open(page, '/pharmacy');
  const row = await page.waitForFunction((n) => [...document.querySelectorAll('[data-testid="rx-row"]')].find(tr => tr.innerText.includes(n))?.innerText, { timeout: 10000 }, `Age Estimate ${stamp}`);
  assert.match(await row.jsonValue(), /approx\. 40 yrs/);
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
