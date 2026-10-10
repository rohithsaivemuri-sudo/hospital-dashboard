// "Report a problem" on every page: a new GitHub issue pre-filled with role, page (record numbers
// replaced by :id) and time. The link is never followed here (no traffic to GitHub).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, APP, login, db, closeDb, open } = require('./lib/harness');

let browser, page;
diagnoseFailures(() => page);
before(async () => { browser = await launch(); page = await browser.newPage(); });
after(async () => { await browser.close(); await closeDb(); });

const link = () => page.$eval('[data-testid="report-problem"]', a => ({ href: a.href, target: a.target, rel: a.rel, text: a.innerText }));
const params = (href) => Object.fromEntries(new URL(href).searchParams);

test('the issue form has a field for every value the link fills in, and warns about patient data', () => {
  const form = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'ISSUE_TEMPLATE', 'problem-report.yml'), 'utf8');
  const ids = [...form.matchAll(/^\s+id: ([\w-]+)$/gm)].map(m => m[1]);
  for (const id of ['role', 'page', 'time']) assert.ok(ids.includes(id), id);
  assert.match(form, /Do not include patient information/);
});

test('on the login page, before signing in', async () => {
  await page.goto(`${APP}/login`);
  await page.waitForSelector('[data-testid="report-problem"]');
  const l = await link();
  assert.equal(l.text, 'Report a problem');
  assert.match(l.href, /^https:\/\/github\.com\/[^/]+\/hospital-dashboard\/issues\/new\?/);
  assert.deepEqual([l.target, l.rel], ['_blank', 'noopener noreferrer']);
  const p = params(l.href);
  assert.deepEqual([p.template, p.role, p.page], ['problem-report.yml', 'Not signed in', '/login']);
  // Until the form is on the default branch GitHub opens a blank issue: the details are in title/body too.
  assert.equal(p.title, 'Problem: /login');
  assert.match(p.body, /\*\*Role:\*\* Not signed in\n\*\*Page:\*\* \/login\n\*\*When:\*\* \d{4}-/);
  assert.match(p.body, /Do not include patient information/);
});

test('on signed-in pages: role and page, with record numbers replaced and no patient details', async () => {
  await login(page, 'dr.smith');
  const [[patient]] = await (await db()).query('SELECT name FROM patients WHERE patient_id = 1');
  for (const [p, expected] of [['/', '/'], ['/patients/1', '/patients/:id'], ['/appointments', '/appointments']]) {
    await open(page, p);
    await page.waitForSelector('[data-testid="report-problem"]');
    const l = await link();
    const q = params(l.href);
    assert.deepEqual([q.role, q.page], ['DOCTOR', expected], p);
    assert.match(q.body, new RegExp(`\\*\\*Page:\\*\\* ${expected.replace(/[/:]/g, '\\$&')}\\n`));
    assert.match(q.time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)$/);
    assert.ok(!l.href.includes('/patients/1') && !decodeURIComponent(l.href).includes(patient.name), l.href);
  }
});

test('the time is taken when the link is clicked', async () => {
  await open(page, '/patients/1');
  await page.waitForSelector('[data-testid="report-problem"]');
  // A click whose default action is cancelled: the handler runs, nothing opens.
  const href = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="report-problem"]');
    a.href = a.href.replace(/time=[^&]*/, 'time=stale');
    document.addEventListener('click', e => e.preventDefault(), { capture: true, once: true });
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return a.href;
  });
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  assert.ok(params(href).time.startsWith(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`), href);
  assert.ok(!href.includes('stale'));
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
