// Who is who (item 7): the header names the signed-in user (full name, username, role) on every
// page; Nurse Assignments and Staff Accounts name staff as "Full name (username)"; and an admin can
// create a nurse, assign a ward with no patients, and that nurse sees the ward's beds.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, clickButton, waitForText, APP } = require('./lib/harness');

let browser, page;
diagnoseFailures(() => page);
const stamp = Date.now().toString(36);
const nurse = { full_name: `Asha Test ${stamp}`, username: `asha.${stamp}`, password: `Quiet-Ward-${stamp}-9x` };
let emptyWard;
before(async () => {
  // A ward with beds and no patients (the seed has none): two isolation beds no other test uses.
  const conn = await db();
  const [w] = await conn.query("INSERT INTO wards (name, department_id, floor, capacity, ward_type) VALUES (?, 1, 9, 2, 'ISOLATION')", [`Quiet Ward ${stamp}`]);
  await conn.query("INSERT INTO beds (ward_id, bed_number, floor, bed_type, status) VALUES (?, ?, 9, 'ISOLATION', 'AVAILABLE'), (?, ?, 9, 'ISOLATION', 'AVAILABLE')", [w.insertId, `Q-${stamp}-1`, w.insertId, `Q-${stamp}-2`]);
  emptyWard = { ward_id: w.insertId, name: `Quiet Ward ${stamp}`, beds: 2 };
  browser = await launch();
  page = await browser.newPage();
});
after(async () => { await browser?.close(); await closeDb(); });

const header = () => page.$eval('[data-testid="signed-in-as"]', el => el.innerText);

test('the header shows full name, username and role on every page, for every role', async () => {
  const [users] = await (await db()).query("SELECT username, full_name, role FROM users WHERE username IN ('admin','dr.smith','nurse1','reception1','lab_staff','pharmacy_staff')");
  for (const u of users) {
    const ctx = await browser.createBrowserContext();
    page = await ctx.newPage();
    await login(page, u.username);
    for (const path of ['/', '/patients']) {
      await open(page, path);
      const text = await header();
      assert.ok(text.includes(u.full_name) && text.includes(`(${u.username})`), `${u.username} ${path}: ${text}`);
      assert.match(text, new RegExp(u.role.charAt(0) + u.role.slice(1).toLowerCase(), 'i'));
    }
    await ctx.close();
  }
  page = await browser.newPage();
});

test('admin creates a nurse; Staff Accounts and Nurse Assignments name her "Full name (username)"; she is assigned a ward with no patients', async () => {
  await login(page, 'admin');
  await open(page, '/staff');
  await page.type('input[name="full_name"]', nurse.full_name);
  await page.select('select[name="role"]', 'NURSE');
  await page.type('input[name="username"]', nurse.username);
  await page.type('input[name="password"]', nurse.password);
  await page.type('input[name="email"]', `${nurse.username}@example.test`);
  await page.type('input[name="phone"]', '9876543210');
  await clickButton(page, 'Create account');
  await waitForText(page, `Account created for ${nurse.full_name} (${nurse.username})`);

  await open(page, '/nurse-assignments');
  const option = await page.waitForFunction((label) => [...document.querySelectorAll('select[name="nurse_user_id"] option')].find(o => o.innerText === label), { timeout: 10000 }, `${nurse.full_name} (${nurse.username})`);
  await page.select('select[name="nurse_user_id"]', await option.evaluate(o => o.value));
  await page.select('select[name="ward_id"]', String(emptyWard.ward_id));
  await clickButton(page, 'Assign');
  await waitForText(page, 'Assignment created');
  await waitForText(page, `${nurse.full_name} (${nurse.username})`);
  const row = await page.$$eval('tbody tr', (trs, label) => trs.find(tr => tr.innerText.includes(label))?.innerText, `${nurse.full_name} (${nurse.username})`);
  assert.ok(row && row.includes(emptyWard.name), row);
});

test('the new nurse sees the ward and every one of its beds, even though it is empty', async () => {
  const ctx = await browser.createBrowserContext();
  page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.type('input[placeholder="Username"]', nurse.username);
  await page.type('input[placeholder="Password"]', nurse.password);
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await open(page, '/');
  await waitForText(page, emptyWard.name);
  const cards = await page.$$eval('[data-testid="bed-card"]', els => els.map(e => e.innerText));
  assert.equal(cards.length, Number(emptyWard.beds));
  assert.ok(cards.every(c => /Empty|MAINTENANCE|RESERVED|CLEANING/i.test(c)), cards.join(' | '));
  assert.ok((await header()).includes(`${nurse.full_name} (${nurse.username})`));
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
