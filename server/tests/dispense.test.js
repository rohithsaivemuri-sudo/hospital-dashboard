// Phase 1 step 1 (report Section L, Spec 1): transaction-safe, deadlock-free dispensing.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

// Medicines reserved for this file so other suites' stock assertions are unaffected.
const MED_A = 18;
const MED_B = 19;
const MED_C = 20;
const ROUNDS = 30;

let doctor;
let pharmacy;
let patientId;

before(async () => {
  doctor = await login(USERS.DOCTOR);
  pharmacy = await login(USERS.PHARMACY);
  [[{ patient_id: patientId }]] = await db().query(
    'SELECT patient_id FROM appointments WHERE doctor_id = ? ORDER BY patient_id LIMIT 1', [doctor.user.doctor_id]
  );
});

const setStock = (medicineId, qty) => db().query('UPDATE medicines SET stock_quantity = ? WHERE medicine_id = ?', [qty, medicineId]);
const stockOf = async (medicineId) => (await db().query('SELECT stock_quantity FROM medicines WHERE medicine_id = ?', [medicineId]))[0][0].stock_quantity;
const item = (medicine_id, quantity) => ({ medicine_id, dosage: '1 tab', frequency: 'Once daily', duration: '1 day', quantity });

const prescriptionBody = (items) => ({ patient_id: patientId, doctor_id: doctor.user.doctor_id, notes: 'dispense test', items });

async function prescribe(items) {
  const res = await api('POST', '/prescriptions', { token: doctor.token, body: prescriptionBody(items) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

const dispense = (id, token = pharmacy.token) => api('POST', `/prescriptions/${id}/dispense`, { token });
const isDeadlock = (res) => res.status === 500 && /deadlock/i.test(res.body?.message || '');

test('concurrent dispenses with opposite item order never deadlock (Spec 1 concurrency test)', async () => {
  await setStock(MED_A, 100000);
  await setStock(MED_B, 100000);
  const pairs = [];
  for (let i = 0; i < ROUNDS; i++) {
    pairs.push([await prescribe([item(MED_A, 1), item(MED_B, 1)]), await prescribe([item(MED_B, 1), item(MED_A, 1)])]);
  }

  let deadlocks = 0;
  for (const [a, b] of pairs) {
    const [ra, rb] = await Promise.all([dispense(a), dispense(b)]);
    for (const r of [ra, rb]) {
      if (isDeadlock(r)) deadlocks++;
      else assert.equal(r.status, 200, JSON.stringify(r.body));
    }
  }
  assert.equal(deadlocks, 0, `${deadlocks} MySQL deadlock(s) (ER 1213) across ${ROUNDS} concurrent pairs`);
  assert.equal(await stockOf(MED_A), 100000 - 2 * ROUNDS);
  assert.equal(await stockOf(MED_B), 100000 - 2 * ROUNDS);
});

test('prescribing concurrently with dispensing never deadlocks (shared FK locks follow the same order)', async () => {
  await setStock(MED_A, 100000);
  await setStock(MED_B, 100000);
  const WIDTH = 4; // concurrent create/dispense pairs per round
  let deadlocks = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const ids = [];
    for (let k = 0; k < WIDTH; k++) ids.push(await prescribe([item(MED_A, 1), item(MED_B, 1)]));
    const results = await Promise.all([
      ...ids.map(id => dispense(id)),
      ...ids.map(() => api('POST', '/prescriptions', { token: doctor.token, body: prescriptionBody([item(MED_B, 1), item(MED_A, 1)]) })),
    ]);
    results.forEach((r, i) => {
      if (isDeadlock(r)) deadlocks++;
      else assert.equal(r.status, i < WIDTH ? 200 : 201, JSON.stringify(r.body));
    });
  }
  assert.equal(deadlocks, 0, `${deadlocks} deadlock(s) between prescription create and dispense`);
});

test('stock receipts concurrent with dispensing stay consistent and never deadlock', async () => {
  await setStock(MED_A, 1000);
  await setStock(MED_B, 1000);
  const ids = [];
  for (let i = 0; i < 10; i++) ids.push(await prescribe([item(MED_B, 3), item(MED_A, 2)]));

  const results = await Promise.all(ids.flatMap(id => [
    dispense(id),
    api('POST', `/medicines/${MED_B}/stock`, { token: pharmacy.token, body: { quantity: 5, type: 'RECEIPT', reason: 'Restock' } }),
    api('POST', `/medicines/${MED_A}/stock`, { token: pharmacy.token, body: { quantity: 1, type: 'ADJUSTMENT', reason: 'DAMAGED' } }),
  ]));
  for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await stockOf(MED_A), 1000 - 10 * 2 - 10 * 1);
  assert.equal(await stockOf(MED_B), 1000 - 10 * 3 + 10 * 5);
});

test('atomic rollback: one short item cancels the whole dispense (Spec 1 rollback test)', async () => {
  await setStock(MED_A, 100);
  await setStock(MED_C, 4);
  const id = await prescribe([item(MED_A, 10), item(MED_C, 5)]);
  const [[{ n: movementsBefore }]] = await db().query('SELECT COUNT(*) n FROM pharmacy_stock_movements WHERE reference_id = ?', [id]);

  const res = await dispense(id);
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, `Insufficient Stock for Medicine ID ${MED_C}`);

  assert.equal(await stockOf(MED_A), 100, 'stock of the item that was available must be untouched');
  assert.equal(await stockOf(MED_C), 4);
  const [[rx]] = await db().query('SELECT status FROM prescriptions WHERE prescription_id = ?', [id]);
  assert.equal(rx.status, 'CREATED');
  const [items] = await db().query('SELECT dispensed, dispensed_at FROM prescription_items WHERE prescription_id = ?', [id]);
  assert.ok(items.every(i => !i.dispensed && i.dispensed_at === null));
  const [[{ n: movementsAfter }]] = await db().query('SELECT COUNT(*) n FROM pharmacy_stock_movements WHERE reference_id = ?', [id]);
  assert.equal(movementsAfter, movementsBefore);
});

test('the same medicine on two lines is checked against its combined quantity', async () => {
  await setStock(MED_A, 10);
  const id = await prescribe([item(MED_A, 6), item(MED_A, 6)]);
  const res = await dispense(id);
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body.message, `Insufficient Stock for Medicine ID ${MED_A}`);
  assert.equal(await stockOf(MED_A), 10);

  await setStock(MED_A, 12);
  assert.equal((await dispense(id)).status, 200);
  assert.equal(await stockOf(MED_A), 0);
});

test('double dispense: two concurrent requests for one prescription — exactly one succeeds', async () => {
  await setStock(MED_A, 50);
  await setStock(MED_B, 50);
  const id = await prescribe([item(MED_A, 5), item(MED_B, 7)]);

  const results = await Promise.all([dispense(id), dispense(id)]);
  const statuses = results.map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 409], JSON.stringify(results.map(r => r.body)));
  const loser = results.find(r => r.status === 409);
  assert.equal(loser.body.success, false);
  assert.equal(loser.body.message, 'Prescription is not available for dispensing');

  assert.equal(await stockOf(MED_A), 45, 'stock decremented exactly once');
  assert.equal(await stockOf(MED_B), 43);
  const [[{ n }]] = await db().query("SELECT COUNT(*) n FROM pharmacy_stock_movements WHERE reference_id = ? AND movement_type = 'DISPENSE'", [id]);
  assert.equal(n, 2, 'one movement per item, written once');

  // A later retry is also refused.
  assert.equal((await dispense(id)).status, 409);
});

test('only PHARMACY may dispense; every other role gets 403 and nothing changes', async () => {
  await setStock(MED_A, 50);
  const id = await prescribe([item(MED_A, 1)]);
  for (const username of [USERS.ADMIN, USERS.DOCTOR, USERS.NURSE, USERS.RECEPTIONIST, USERS.LABORATORY]) {
    const { token } = await login(username);
    const res = await dispense(id, token);
    assert.equal(res.status, 403, `${username} should be forbidden`);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /pharmacy/i);
  }
  assert.equal(await stockOf(MED_A), 50);
  const [[rx]] = await db().query('SELECT status FROM prescriptions WHERE prescription_id = ?', [id]);
  assert.equal(rx.status, 'CREATED');
});

test('dispensing without a JWT returns 401', async () => {
  const res = await api('POST', '/prescriptions/1/dispense');
  assert.equal(res.status, 401);
});
