// Appointments list (item 3): today by default with a date filter, sorted, times without seconds,
// statuses in plain words, and visits left open from an earlier day clearly marked.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf } = require('./lib/harness');

let browser, page, openId, futureDay;
diagnoseFailures(() => page);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
before(async () => {
  const rec = await tokenOf('reception1');
  const [[d]] = await (await db()).query("SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = 'dr.das'");
  const [ps] = await (await db()).query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS'))
    AND patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE') ORDER BY patient_id DESC LIMIT 3`);
  const book = async (p, date, time) => (await call('POST', '/appointments', rec, { patient_id: p, doctor_id: d.doctor_id, appointment_date: date, appointment_time: time })).body.data.id;
  openId = await book(ps[0].patient_id, iso(new Date(Date.now() - 3 * 864e5)), '09:35:00');
  await call('POST', '/encounters', rec, { appointment_id: openId });
  futureDay = iso(new Date(Date.now() + 11 * 864e5));
  await book(ps[1].patient_id, futureDay, '16:50:00');
  await book(ps[2].patient_id, futureDay, '08:25:00');
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'reception1');
});
after(async () => { await browser.close(); await closeDb(); });

const rows = (sel) => page.$$eval(sel, rs => rs.map(r => [...r.cells].map(c => c.innerText.trim())));

test('defaults to today, with times without seconds and statuses in plain words', async () => {
  await open(page, '/appointments');
  await page.waitForSelector('input[name="appointment-date"]');
  assert.equal(await page.$eval('input[name="appointment-date"]', el => el.value), iso(new Date()));
  const text = await page.$eval('[data-testid="appointments-day"]', el => el.innerText);
  assert.ok(!/\b\d{2}:\d{2}:\d{2}\b/.test(text), 'no seconds');
  assert.ok(!/\b(BOOKED|CHECKED_IN|IN_PROGRESS|COMPLETED|NO_SHOW|CANCELLED|ARRIVED|TRIAGED|FINISHED)\b/.test(text), 'no raw status codes');
});

test('the date filter shows that day only, sorted by time', async () => {
  await page.$eval('input[name="appointment-date"]', (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, futureDay);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="appointments-day"] tbody tr[data-appointment]').length >= 2, { polling: 100, timeout: 5000 });
  const times = (await rows('[data-testid="appointments-day"] tbody tr[data-appointment]')).map(c => c[0]);
  assert.deepEqual(times, [...times].sort());
  assert.ok(times.includes('08:25') && times.includes('16:50'), times.join(','));
});

test('a visit left open from an earlier day is listed and clearly marked', async () => {
  const section = await page.waitForSelector('[data-testid="open-earlier"]');
  const text = await section.evaluate(el => el.innerText);
  assert.match(text, /Still open from earlier days/);
  const row = await page.$(`[data-testid="open-earlier"] tr[data-appointment="${openId}"]`);
  assert.ok(row, 'the open visit is listed');
  assert.match(await row.evaluate(r => r.innerText), /Open since [^\n]*\d{4}/);
  assert.match(await row.evaluate(r => r.innerText), /Checked in/);
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
