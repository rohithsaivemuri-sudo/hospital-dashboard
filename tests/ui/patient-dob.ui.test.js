// Item 14: the registration and edit forms do not accept a future date of birth.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, closeDb, open, call, tokenOf, waitForText } = require('./lib/harness');

let browser, page, patient, sent = 0;
diagnoseFailures(() => page);
const d = new Date(Date.now() + 2 * 864e5);
const future = { y: String(d.getFullYear()), m: String(d.getMonth() + 1).padStart(2, '0'), d: String(d.getDate()).padStart(2, '0') };
before(async () => {
  patient = (await call('POST', '/patients', await tokenOf('reception1'), { name: `DOB Form ${Date.now().toString(36)}`, date_of_birth: '1992-02-02', gender: 'MALE', blood_group: null, phone: null, address: null, emergency_contact: null })).body.data.id;
  browser = await launch();
  page = await browser.newPage();
  page.on('request', r => { if (/\/api\/patients(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT'].includes(r.method())) sent++; });
  await login(page, 'reception1');
});
after(async () => { await browser?.close(); await closeDb(); });

// Types the date the way a person does, into the date input's day/month/year segments.
async function typeDob() {
  await page.click('input[name="date_of_birth"]', { clickCount: 3 });
  await page.focus('input[name="date_of_birth"]');
  const order = await page.evaluate(() => new Intl.DateTimeFormat().formatToParts(new Date(2000, 10, 22)).filter(p => p.type !== 'literal').map(p => p.type));
  for (const part of order) await page.keyboard.type(part === 'year' ? future.y : part === 'month' ? future.m : future.d);
}

async function submitAndCheck() {
  sent = 0;
  await page.click('form button[type="submit"]');
  await new Promise(r => setTimeout(r, 600));
  assert.equal(sent, 0, 'nothing is sent to the server');
  const msg = await page.$eval('input[name="date_of_birth"]', el => el.validationMessage);
  assert.ok(msg, 'the date field reports a problem');
  await waitForText(page, 'Date of birth cannot be in the future');
}

test('registration: a future date of birth is refused before anything is saved', async () => {
  await open(page, '/patients/new');
  await page.type('input[name="name"]', 'Future Born');
  await typeDob();
  await page.select('select[name="gender"]', 'FEMALE').catch(() => {});
  await submitAndCheck();
});

test('edit: a future date of birth is refused', async () => {
  await open(page, `/patients/${patient}/edit`);
  await page.waitForFunction(() => document.querySelector('input[name="date_of_birth"]')?.value === '1992-02-02');
  await typeDob();
  await submitAndCheck();
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
