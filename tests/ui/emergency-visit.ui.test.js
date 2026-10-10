// Emergency visits end to end: a case without a patient cannot be allocated until one is linked;
// once allocated, the doctor sees an EMERGENCY visit appear live in My Open Visits and can start it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, db, closeDb, open, call, tokenOf, clickButton, waitForText } = require('./lib/harness');

let browser, desk, doctor, caseId, patientId, patientName, admissionId, encounterId, reddyMax;
diagnoseFailures(() => [desk, doctor]);
before(async () => {
  const conn = await db();
  // Pediatrics: dr.reddy is the only available doctor, so the allocation's doctor is known.
  const [[r]] = await conn.query("SELECT d.doctor_id, d.max_workload FROM doctors d JOIN users u ON u.user_id = d.user_id WHERE u.username = 'dr.reddy'");
  reddyMax = r.max_workload;
  await conn.query('UPDATE doctors SET max_workload = 50 WHERE doctor_id = ?', [r.doctor_id]);
  const rec = await tokenOf('reception1');
  patientName = `Emergency UI ${Date.now()}`;
  patientId = (await call('POST', '/patients', rec, { name: patientName, date_of_birth: '2016-02-02', gender: 'MALE', blood_group: null, phone: null, address: null, emergency_contact: null })).body.data.id;
  caseId = (await call('POST', '/emergency', rec, { patient_id: null, severity: 'SERIOUS', required_bed_type: 'GENERAL', required_specialization: 'Pediatrics', symptoms: 'Arrived by ambulance, unregistered', ventilator_required: false })).body.data.id;
  browser = await launch();
  desk = await (await browser.createBrowserContext()).newPage();
  doctor = await (await browser.createBrowserContext()).newPage();
  await login(desk, 'reception1');
  await login(doctor, 'dr.reddy');
});
after(async () => {
  const [doc, admin] = [await tokenOf('dr.reddy'), await tokenOf('admin')];
  if (encounterId) await call('POST', `/encounters/${encounterId}/entered-in-error`, doc);
  if (admissionId) await call('POST', `/admissions/${admissionId}/discharge`, admin);
  const conn = await db();
  if (admissionId) await conn.query("UPDATE beds SET status = 'AVAILABLE' WHERE bed_id = (SELECT bed_id FROM admissions WHERE admission_id = ?)", [admissionId]);
  await conn.query("UPDATE doctors d JOIN users u ON u.user_id = d.user_id SET d.max_workload = ? WHERE u.username = 'dr.reddy'", [reddyMax]);
  await browser.close(); await closeDb();
});


test('an unregistered case shows "Not registered" and cannot be allocated', async () => {
  await open(desk, '/emergency');
  await waitForText(desk, 'Arrived by ambulance, unregistered');
  const state = await desk.evaluate(() => {
    const r = [...document.querySelectorAll('tr')].find(x => x.innerText.includes('Arrived by ambulance, unregistered'));
    const allocate = [...r.querySelectorAll('button')].find(b => /Allocate/.test(b.innerText));
    return { patient: r.querySelector('[data-testid="emergency-patient"]').innerText, allocateDisabled: allocate.disabled };
  });
  assert.match(state.patient, /^Not registered/);
  assert.equal(state.allocateDisabled, true);
});

test('linking a registered patient, then allocating, gives the doctor a live EMERGENCY visit', async () => {
  await open(doctor, '/');
  await doctor.waitForSelector('[data-testid="open-visits"]');
  await doctor.evaluate(() => { window.__sameDocument = true; });

  await clickButton(desk, 'Link patient');
  await desk.type('input[name="link-search"]', patientName);
  await clickButton(desk, 'Find');
  await waitForText(desk, patientName);
  await clickButton(desk, 'Link');
  await desk.waitForFunction((name) => [...document.querySelectorAll('[data-testid="emergency-patient"]')].some(td => td.innerText === name), { polling: 100, timeout: 5000 }, patientName);
  const [[ec]] = await (await db()).query('SELECT patient_id FROM emergency_cases WHERE emergency_id = ?', [caseId]);
  assert.equal(ec.patient_id, patientId);

  const [res] = await Promise.all([
    desk.waitForResponse(r => r.url().endsWith(`/api/emergency/${caseId}/allocate`)),
    (async () => {
      const handle = await desk.waitForFunction((name) => { const r = [...document.querySelectorAll('tr')].find(x => x.innerText.includes(name)); const b = r && [...r.querySelectorAll('button')].find(x => /Allocate/.test(x.innerText)); return b && !b.disabled ? b : null; }, { polling: 100, timeout: 5000 }, patientName);
      await handle.asElement().click();
    })(),
  ]);
  const body = await res.json();
  assert.equal(res.status(), 200, JSON.stringify(body));
  ({ admissionId, encounterId } = body.allocation);

  const visit = await doctor.waitForSelector(`[data-testid="open-visit"][data-encounter="${encounterId}"]`, { timeout: 5000 });
  const cells = await visit.evaluate(r => [r.querySelector('[data-testid="visit-source"]').innerText, r.querySelector('[data-testid="visit-status"]').innerText, r.innerText]);
  assert.equal(cells[0], 'Emergency');
  assert.equal(cells[1], 'Waiting, not yet triaged');
  assert.ok(cells[2].includes(patientName));
  assert.equal(await doctor.evaluate(() => window.__sameDocument), true, 'appeared without a reload');

  const start = await doctor.$(`[data-testid="open-visit"][data-encounter="${encounterId}"] button`);
  await start.click();
  await doctor.waitForFunction((id) => document.querySelector(`[data-testid="open-visit"][data-encounter="${id}"] [data-testid="visit-status"]`)?.innerText === 'With you now', { polling: 100, timeout: 5000 }, encounterId);
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
