// Bug 2: Create Prescription dialog — "+ Add Medicine" must be readable, and a fully filled-in
// medicine row that was not added is still prescribed (a half-filled one is pointed out).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, selectOption, login, closeDb, open, clickButton, waitForText } = require('./lib/harness');

let browser, page;
diagnoseFailures(() => page);
before(async () => {
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'dr.smith');
});
after(async () => { await browser.close(); await closeDb(); });

async function openDialog() {
  await open(page, '/patients/1');
  await clickButton(page, '+ Create Prescription');
  await page.waitForSelector('select[name="medicine_id"]');
}
async function fillRow({ medicine, dosage, frequency, duration, quantity }) {
  await selectOption(page, 'select[name="medicine_id"]', String(medicine));
  if (dosage) await page.type('input[name="dosage"]', dosage);
  if (frequency) await page.type('input[name="frequency"]', frequency);
  if (duration) await page.type('input[name="duration"]', duration);
  if (quantity) await page.type('input[name="quantity"]', String(quantity));
}
const submit = () => Promise.all([
  page.waitForResponse(r => r.url().endsWith('/api/prescriptions') && r.request().method() === 'POST'),
  clickButton(page, 'Create Prescription'),
]);

test('"+ Add Medicine" is readable; an added row and a filled-in but not added row are both prescribed', async () => {
  await openDialog();
  const add = await page.evaluate(() => window.__readability([...document.querySelectorAll('button')].find(b => b.innerText.trim() === '+ Add Medicine')));
  assert.ok(add.ok, `+ Add Medicine: ${add.reason}`);
  await fillRow({ medicine: 18, dosage: '1 tab', frequency: 'Once daily', duration: '3 days', quantity: 3 });
  await clickButton(page, '+ Add Medicine');
  await page.waitForFunction(() => [...document.querySelectorAll('td')].some(td => td.innerText === 'Once daily'));
  await fillRow({ medicine: 19, dosage: '500 mg', frequency: 'Twice daily', duration: '5 days', quantity: 10 });
  const [res] = await submit();
  assert.equal(res.status(), 201);
  const items = JSON.parse(res.request().postData()).items;
  assert.deepEqual(items.map(i => [Number(i.medicine_id), i.dosage, i.quantity]), [[18, '1 tab', 3], [19, '500 mg', 10]]);
});

test('a single filled-in row is prescribed without pressing "+ Add Medicine"', async () => {
  await openDialog();
  await fillRow({ medicine: 18, dosage: '2 tab', frequency: 'At night', duration: '2 days', quantity: 4 });
  const [res] = await submit();
  assert.equal(res.status(), 201);
  assert.equal(JSON.parse(res.request().postData()).items.length, 1);
  await page.waitForFunction(() => !document.querySelector('select[name="medicine_id"]'));
});

test('a half-filled row is pointed out and nothing is sent', async () => {
  await openDialog();
  await fillRow({ medicine: 18, dosage: '1 tab' });
  let sent = false;
  const watch = (r) => { if (r.url().endsWith('/api/prescriptions') && r.method() === 'POST') sent = true; };
  page.on('request', watch);
  await clickButton(page, 'Create Prescription');
  await waitForText(page, 'Fill all medicine fields, or clear the medicine row');
  page.off('request', watch);
  assert.equal(sent, false);
});


// Bug 3: every field in the dialog has a visible label that is also its accessible name.
test('every Create Prescription field is labelled', async () => {
  await openDialog();
  const fields = await page.evaluate(() => {
    const dialog = document.querySelector('select[name="medicine_id"]').closest('div[style*="max-height"]');
    return [...dialog.querySelectorAll('input, select, textarea')].map(el => {
      const label = el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
      const text = label ? label.innerText.replace(el.innerText || '', '').trim().split('\n')[0] : '';
      const r = label?.getBoundingClientRect();
      return { name: el.name, label: text, visible: !!r && r.width > 0 && r.height > 0 };
    });
  });
  assert.deepEqual(fields.map(f => f.name), ['medicine_id', 'dosage', 'frequency', 'duration', 'quantity', 'frequency_code', 'duration_days', 'route', 'units_per_dose', 'prescription_notes']);
  for (const f of fields) assert.ok(f.label && f.visible, `${f.name} has no visible label`);
  assert.deepEqual(fields.map(f => f.label), ['Medicine', 'Dose', 'Frequency (as written)', 'Duration (as written)', 'Total quantity',
    'Frequency code (ward schedule, optional)', 'Days (ward schedule)', 'Route', 'Units per dose', 'Notes']);
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
