// Every button and button-styled link on every page each role can reach, and in each dialog those
// pages open, must be readable (see lib/readable.js). Opening a dialog is itself a guarded click.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, selectOption, APP, call, tokenOf, login, db, closeDb, open, clickButton } = require('./lib/harness');

let browser;
let currentPage;
diagnoseFailures(() => currentPage);
const findings = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function scan(page, where) {
  await wait(300);
  for (const f of await page.evaluate(() => window.__unreadableOnPage())) findings.push({ where, ...f });
}
// Opens a dialog (or tab) with a real click on the named button, scans, then reloads the page.
async function scanAfter(page, path, buttonText, where) {
  await open(page, path);
  await clickButton(page, buttonText);
  await scan(page, `${where} › ${buttonText}`);
}
async function sidebarPages(page) {
  return page.evaluate(() => [...document.querySelectorAll('aside a, nav a')].map(a => a.getAttribute('href')).filter(h => h && h.startsWith('/')));
}

const fixtures = {};
before(async () => {
  browser = await launch();
  const [rec, doc, lab, pharm] = await Promise.all(['reception1', 'dr.smith', 'lab_staff', 'pharmacy_staff'].map(tokenOf));
  const conn = await db();
  const [[p]] = await conn.query(`SELECT patient_id FROM patients WHERE patient_id NOT IN (SELECT patient_id FROM admissions WHERE status = 'ACTIVE')
    AND patient_id NOT IN (SELECT patient_id FROM encounters WHERE status IN ('ARRIVED','TRIAGED','IN_PROGRESS')) ORDER BY patient_id DESC LIMIT 1`);
  await call('POST', '/encounters', rec, { patient_id: p.patient_id, doctor_id: 1 });
  const processing = (await call('POST', '/lab/orders', doc, { patient_id: 1, doctor_id: 1, tests: [{ test_id: 5 }], notes: '' })).body.data.id;
  await call('PUT', `/lab/orders/${processing}/status`, lab, { status: 'PROCESSING' });
  const done = (await call('POST', '/lab/orders', doc, { patient_id: 1, doctor_id: 1, tests: [{ test_id: 5 }], notes: '' })).body.data.id;
  await call('PUT', `/lab/orders/${done}/status`, lab, { status: 'PROCESSING' });
  await call('POST', '/lab/results', lab, { order_id: done, result_value: '150', unit: 'mg/dL' });
  await call('POST', '/prescriptions', doc, { patient_id: 1, doctor_id: 1, items: [{ medicine_id: 18, dosage: '1 tab', frequency: 'Once daily', duration: '1 day', quantity: 1 }] });
  const [[mar]] = await conn.query("SELECT patient_id FROM prescriptions WHERE notes = 'Demo MAR seed (migration 008)'");
  Object.assign(fixtures, { marPatient: mar.patient_id, pharm });
});
after(async () => { await browser.close(); await closeDb(); });

const ROLES = { ADMIN: 'admin', DOCTOR: 'dr.smith', NURSE: 'nurse1', RECEPTIONIST: 'reception1', LABORATORY: 'lab_staff', PHARMACY: 'pharmacy_staff' };

test('every page and dialog reachable by each role has readable buttons', async () => {
  for (const [role, username] of Object.entries(ROLES)) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    currentPage = page;
    await login(page, username);
    await scan(page, `${role} /`);
    for (const path of [...new Set(await sidebarPages(page))]) {
      await open(page, path);
      await scan(page, `${role} ${path}`);
    }
    if (role === 'DOCTOR') {
      for (const tab of ['Overview', 'Visits', 'Vitals', 'Admissions', 'Lab Tests', 'Prescriptions', 'Surgery']) await scanAfter(page, '/patients/1', tab, `${role} /patients/1`);
      for (const dialog of ['+ New Clinical Encounter', '+ Order Lab Tests', '+ Create Prescription', '+ Request Surgery', 'Admit Patient']) {
        await scanAfter(page, '/patients/1', dialog, `${role} /patients/1`).catch(e => findings.push({ where: `${role} ${dialog}`, reason: `could not open: ${e.message}` }));
      }
      await open(page, '/patients/1'); await clickButton(page, 'Lab Tests'); await clickButton(page, 'View Result');
      await scan(page, `${role} /patients/1 › View Result`);
    }
    if (role === 'NURSE') {
      await scanAfter(page, '/', 'Record vitals', `${role} /`);
      await open(page, `/mar/${fixtures.marPatient}`);
      await scan(page, `${role} MAR`);
      const actionable = await page.$('button[data-dose]:not([disabled])');
      if (actionable) { await actionable.click(); await scan(page, `${role} MAR › dose dialog`); }
      for (const tab of ['Admissions', 'Vitals', 'Lab Tests', 'Prescriptions', 'Appointments']) await scanAfter(page, `/patients/${fixtures.marPatient}`, tab, `${role} chart`);
    }
    if (role === 'RECEPTIONIST' || role === 'ADMIN') {
      for (const path of ['/patients/new', '/patients/1/edit', '/appointments/new']) { await open(page, path); await scan(page, `${role} ${path}`); }
    }
    if (role === 'RECEPTIONIST') {
      // Registration with a likely duplicate: the warning and the "Register Anyway" button.
      const [[existing]] = await (await db()).query("SELECT phone FROM patients WHERE phone IS NOT NULL AND phone <> '' LIMIT 1");
      await open(page, '/patients/new');
      await page.type('[name="name"]', 'Audit Duplicate Check');
      await page.$eval('[name="date_of_birth"]', el => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '1990-01-01'); el.dispatchEvent(new Event('input', { bubbles: true })); });
      await selectOption(page, '[name="gender"]', 'FEMALE');
      await page.type('[name="phone"]', existing.phone);
      await clickButton(page, 'Register Patient', 'form');
      await page.waitForSelector('[data-testid="duplicate-warning"]');
      await scan(page, `${role} /patients/new › duplicate warning`);
    }
    if (role === 'LABORATORY') {
      await scanAfter(page, '/laboratory', 'Table', `${role} /laboratory`);
      await scanAfter(page, '/laboratory', 'Enter Result', `${role} /laboratory`);
      await scanAfter(page, '/laboratory', 'View Result', `${role} /laboratory`);
    }
    if (role === 'PHARMACY') {
      for (const opener of ['View / Dispense', 'Receive', 'Adjust', 'Batches']) {
        await scanAfter(page, '/pharmacy', opener, `${role} /pharmacy`).catch(e => findings.push({ where: `${role} ${opener}`, reason: `could not open: ${e.message}` }));
      }
    }
    await ctx.close();
  }
  const unique = [...new Map(findings.map(f => [`${f.where}|${f.text}|${f.reason}`, f])).values()];
  for (const f of unique) console.log(`  unreadable: [${f.where}] ${f.tag || ''} "${f.text || ''}" — ${f.reason}${f.fg ? ` (${f.fg} on ${f.bg})` : ''}`);
  assert.deepEqual(unique, [], `${unique.length} unreadable buttons`);
  assert.deepEqual(violations, [], 'no unreadable button was clicked');
});
