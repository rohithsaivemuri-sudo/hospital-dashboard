// Phase 2 step 5: medicine batches and FEFO. Core invariant, checked after every kind of stock
// change: medicines.stock_quantity = SUM(medicine_batches.quantity) for every medicine.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb, setStock, stockMismatches } = require('./helpers');

after(closeDb);

// Medicines reserved for this file.
const MED = 10;
const MED2 = 11;
let pharmacy, doctor, patientId;

before(async () => {
  pharmacy = await login(USERS.PHARMACY);
  doctor = await login(USERS.DOCTOR);
  [[{ patient_id: patientId }]] = await db().query('SELECT patient_id FROM appointments WHERE doctor_id = ? LIMIT 1', [doctor.user.doctor_id]);
});

const stock = (body, med = MED) => api('POST', `/medicines/${med}/stock`, { token: pharmacy.token, body });
const total = async (med = MED) => (await db().query('SELECT stock_quantity FROM medicines WHERE medicine_id = ?', [med]))[0][0].stock_quantity;
const batches = async (med = MED) => (await db().query(
  'SELECT batch_id, batch_number, quantity, DATE_FORMAT(expiry_date, "%Y-%m-%d") expiry FROM medicine_batches WHERE medicine_id = ? AND quantity > 0 ORDER BY expiry_date, batch_id', [med]))[0];
async function assertInvariant(label) {
  assert.deepEqual(await stockMismatches(), [], `after ${label}: every medicine's total equals the sum of its batches`);
}
const daysFromNow = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Three lots for MED: one already expired (only reachable via direct setup), one expiring soon, one later.
async function threeLots() {
  await setStock(MED, 0);
  await db().query(`INSERT INTO medicine_batches (medicine_id, batch_number, quantity, expiry_date) VALUES
    (?, 'EXPIRED-LOT', 5, CURDATE() - INTERVAL 10 DAY), (?, 'SOON-LOT', 10, CURDATE() + INTERVAL 30 DAY), (?, 'LATER-LOT', 20, CURDATE() + INTERVAL 400 DAY)
    ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), expiry_date = VALUES(expiry_date)`, [MED, MED, MED]);
  await db().query('UPDATE medicines SET stock_quantity = 35 WHERE medicine_id = ?', [MED]);
  await assertInvariant('setup');
}

async function prescribe(items) {
  const res = await api('POST', '/prescriptions', { token: doctor.token, body: {
    patient_id: patientId, doctor_id: doctor.user.doctor_id,
    items: items.map(([medicine_id, quantity]) => ({ medicine_id, dosage: '1', frequency: 'x', duration: '1', quantity })),
  } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

test('migration 006: every medicine starts with total == sum of batches, and the FEFO index exists', async () => {
  await assertInvariant('migration');
  const [cols] = await db().query(`SELECT COLUMN_NAME c FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medicine_batches' AND INDEX_NAME = 'idx_medicine_batches_fefo' ORDER BY SEQ_IN_INDEX`);
  assert.deepEqual(cols.map(r => r.c), ['medicine_id', 'expiry_date', 'batch_id']);
});

test('the FEFO lock query uses idx_medicine_batches_fefo', async () => {
  const [plan] = await db().query(`EXPLAIN SELECT batch_id, batch_number, quantity, expiry_date FROM medicine_batches
    WHERE medicine_id = ? AND quantity > 0 AND expiry_date >= CURDATE() ORDER BY expiry_date, batch_id FOR UPDATE`, [MED]);
  // MySQL 9 returns the plan as a tree ({ EXPLAIN: '...' }); older formats return a key column.
  const text = plan[0].EXPLAIN || JSON.stringify(plan);
  assert.match(text, /using idx_medicine_batches_fefo|"key":"idx_medicine_batches_fefo"/, text);
  assert.doesNotMatch(text, /\bSort\b|filesort/i, 'ordering comes from the index, no sort step');
});

test('receipt: a new batch with its own number and expiry', async () => {
  await setStock(MED, 100);
  const res = await stock({ quantity: 40, type: 'RECEIPT', reason: 'Supplier', batch_number: 'LOT-A1', expiry_date: daysFromNow(200) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await total(), 140);
  assert.ok((await batches()).some(b => b.batch_number === 'LOT-A1' && b.quantity === 40 && b.expiry === daysFromNow(200)));
  const [[mv]] = await db().query("SELECT quantity, batch_id FROM pharmacy_stock_movements WHERE medicine_id = ? AND movement_type = 'RECEIPT' ORDER BY movement_id DESC LIMIT 1", [MED]);
  assert.equal(mv.quantity, 40);
  assert.equal(mv.batch_id, res.body.data.batches[0].batch_id);
  await assertInvariant('receipt into a new batch');
});

test('receipt into an existing batch adds to it; a different expiry for the same number is refused', async () => {
  const before = await total();
  assert.equal((await stock({ quantity: 5, type: 'RECEIPT', batch_number: 'LOT-A1', expiry_date: daysFromNow(200) })).status, 200);
  assert.equal(await total(), before + 5);
  assert.equal((await batches()).find(b => b.batch_number === 'LOT-A1').quantity, 45);
  const clash = await stock({ quantity: 5, type: 'RECEIPT', batch_number: 'LOT-A1', expiry_date: daysFromNow(300) });
  assert.equal(clash.status, 409);
  assert.match(clash.body.message, /already exists with expiry/);
  assert.equal(await total(), before + 5, 'refused receipt changed nothing');
  await assertInvariant('receipt into an existing batch and a refused receipt');
});

test('receipt with no batch details (the existing request shape) creates a batch with the medicine expiry', async () => {
  const before = await total();
  const res = await stock({ quantity: 7, type: 'RECEIPT', reason: 'Restock' });
  assert.equal(res.status, 200);
  const created = res.body.data.batches[0];
  assert.match(created.batch_number, /^RCV-\d{8}-/);
  const [[b]] = await db().query('SELECT DATE_FORMAT(b.expiry_date, "%Y-%m-%d") e, DATE_FORMAT(m.expiry_date, "%Y-%m-%d") me FROM medicine_batches b JOIN medicines m ON m.medicine_id = b.medicine_id WHERE b.batch_id = ?', [created.batch_id]);
  assert.equal(b.e, b.me);
  assert.equal(await total(), before + 7);
  await assertInvariant('receipt with defaults');
});

test('receipt validation: expired stock, bad dates and bad batch numbers are refused and change nothing', async () => {
  const before = await total();
  for (const [body, msg] of [
    [{ quantity: 1, type: 'RECEIPT', expiry_date: daysFromNow(-1) }, /already expired/],
    [{ quantity: 1, type: 'RECEIPT', expiry_date: '31/12/2030' }, /YYYY-MM-DD/],
    [{ quantity: 1, type: 'RECEIPT', batch_number: 'bad number!' }, /batch_number/],
  ]) {
    const res = await stock(body);
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, msg);
  }
  assert.equal(await total(), before);
  await assertInvariant('refused receipts');
});

test('adjustment without a batch writes off earliest-expiry stock first, expired lots included', async () => {
  await threeLots();
  const res = await stock({ quantity: 8, type: 'ADJUSTMENT', reason: 'EXPIRED' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.data.batches.map(b => [b.batch_number, b.quantity]), [['EXPIRED-LOT', -5], ['SOON-LOT', -3]]);
  assert.equal(await total(), 27);
  const [mvs] = await db().query("SELECT quantity FROM pharmacy_stock_movements WHERE medicine_id = ? AND movement_type = 'ADJUSTMENT' ORDER BY movement_id DESC LIMIT 2", [MED]);
  assert.deepEqual(mvs.map(m => m.quantity).sort((a, b) => a - b), [-5, -3]);
  await assertInvariant('FEFO adjustment');
});

test('adjustment from a named batch; more than it holds is refused and changes nothing', async () => {
  const later = (await batches()).find(b => b.batch_number === 'LATER-LOT');
  assert.equal((await stock({ quantity: 4, type: 'ADJUSTMENT', reason: 'DAMAGED', batch_id: later.batch_id })).status, 200);
  assert.equal((await batches()).find(b => b.batch_number === 'LATER-LOT').quantity, 16);
  const before = await total();
  const tooMuch = await stock({ quantity: 17, type: 'ADJUSTMENT', reason: 'DAMAGED', batch_id: later.batch_id });
  assert.equal(tooMuch.status, 400);
  assert.equal(tooMuch.body.message, 'Stock cannot become negative');
  const foreign = await stock({ quantity: 1, type: 'ADJUSTMENT', batch_id: later.batch_id }, MED2);
  assert.equal(foreign.status, 404, 'a batch of another medicine is refused');
  const overall = await stock({ quantity: 1000, type: 'ADJUSTMENT', reason: 'LOST' });
  assert.equal(overall.status, 400);
  assert.equal(await total(), before);
  await assertInvariant('named-batch adjustment and refused adjustments');
});

test('dispense takes unexpired stock earliest-expiry first, carrying over across batches, and records the batches used', async () => {
  await threeLots(); // expired 5, soon 10, later 20
  const rx = await prescribe([[MED, 14]]);
  const res = await api('POST', `/prescriptions/${rx}/dispense`, { token: pharmacy.token });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const lots = Object.fromEntries((await db().query('SELECT batch_number, quantity FROM medicine_batches WHERE medicine_id = ?', [MED]))[0].map(b => [b.batch_number, b.quantity]));
  assert.equal(lots['EXPIRED-LOT'], 5, 'expired stock is never dispensed');
  assert.equal(lots['SOON-LOT'], 0);
  assert.equal(lots['LATER-LOT'], 16);
  assert.equal(await total(), 21);

  const [used] = await db().query(`SELECT b.batch_number, pib.quantity FROM prescription_item_batches pib JOIN medicine_batches b ON b.batch_id = pib.batch_id
    JOIN prescription_items pi ON pi.item_id = pib.item_id WHERE pi.prescription_id = ? ORDER BY b.expiry_date`, [rx]);
  assert.deepEqual(used.map(u => [u.batch_number, u.quantity]), [['SOON-LOT', 10], ['LATER-LOT', 4]]);
  const [mvs] = await db().query("SELECT quantity, batch_id FROM pharmacy_stock_movements WHERE reference_id = ? AND movement_type = 'DISPENSE' ORDER BY movement_id", [rx]);
  assert.deepEqual(mvs.map(m => m.quantity), [-10, -4]);
  assert.ok(mvs.every(m => m.batch_id));
  await assertInvariant('multi-batch dispense');
});

test('two lines of the same medicine on one prescription draw from batches in sequence', async () => {
  await setStock(MED2, 0);
  await db().query(`INSERT INTO medicine_batches (medicine_id, batch_number, quantity, expiry_date) VALUES (?, 'M2-A', 3, CURDATE() + INTERVAL 10 DAY), (?, 'M2-B', 10, CURDATE() + INTERVAL 20 DAY)
    ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), expiry_date = VALUES(expiry_date)`, [MED2, MED2]);
  await db().query('UPDATE medicines SET stock_quantity = 13 WHERE medicine_id = ?', [MED2]);
  const rx = await prescribe([[MED2, 2], [MED2, 4]]);
  assert.equal((await api('POST', `/prescriptions/${rx}/dispense`, { token: pharmacy.token })).status, 200);
  const [used] = await db().query(`SELECT pi.item_id, b.batch_number, pib.quantity FROM prescription_item_batches pib JOIN medicine_batches b ON b.batch_id = pib.batch_id
    JOIN prescription_items pi ON pi.item_id = pib.item_id WHERE pi.prescription_id = ? ORDER BY pi.item_id, b.expiry_date`, [rx]);
  assert.deepEqual(used.map(u => [u.batch_number, u.quantity]), [['M2-A', 2], ['M2-A', 1], ['M2-B', 3]]);
  assert.equal(await total(MED2), 7);
  await assertInvariant('same medicine on two lines');
});

test('failed dispense: enough total stock but too little unexpired stock is refused and changes nothing', async () => {
  await threeLots(); // usable = 30, expired = 5, total = 35
  const rx = await prescribe([[MED, 33]]);
  const beforeLots = await batches();
  const res = await api('POST', `/prescriptions/${rx}/dispense`, { token: pharmacy.token });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, `Insufficient Stock for Medicine ID ${MED}`);
  assert.equal(res.body.available_unexpired, 30);
  assert.equal(await total(), 35);
  assert.deepEqual(await batches(), beforeLots);
  const [[{ n }]] = await db().query('SELECT COUNT(*) n FROM prescription_item_batches pib JOIN prescription_items pi ON pi.item_id = pib.item_id WHERE pi.prescription_id = ?', [rx]);
  assert.equal(n, 0);
  await assertInvariant('failed dispense (expired stock)');
});

test('failed dispense of a multi-item prescription rolls back every batch', async () => {
  await setStock(MED, 50);
  await setStock(MED2, 2);
  const rx = await prescribe([[MED, 10], [MED2, 5]]);
  const before = [await batches(), await batches(MED2)];
  const res = await api('POST', `/prescriptions/${rx}/dispense`, { token: pharmacy.token });
  assert.equal(res.status, 400);
  assert.deepEqual([await batches(), await batches(MED2)], before);
  assert.deepEqual([await total(), await total(MED2)], [50, 2]);
  await assertInvariant('failed multi-item dispense');
});

test('v_current_stock and GET /medicines report usable, expired and soon-to-expire stock', async () => {
  await threeLots();
  const [[v]] = await db().query('SELECT stock_quantity, batch_total, usable_quantity, expired_quantity, DATE_FORMAT(next_expiry, "%Y-%m-%d") next_expiry FROM v_current_stock WHERE medicine_id = ?', [MED]);
  assert.deepEqual({ ...v, batch_total: Number(v.batch_total), usable_quantity: Number(v.usable_quantity), expired_quantity: Number(v.expired_quantity) },
    { stock_quantity: 35, batch_total: 35, usable_quantity: 30, expired_quantity: 5, next_expiry: daysFromNow(30) });
  const med = (await api('GET', '/medicines', { token: pharmacy.token })).body.data.find(m => m.medicine_id === MED);
  assert.deepEqual([med.stock_quantity, med.usable_quantity, med.expired_quantity, med.expiring_soon_quantity], [35, 30, 5, 10]);
  const lots = (await api('GET', `/medicines/${MED}/batches`, { token: pharmacy.token })).body.data;
  assert.deepEqual(lots.filter(l => l.quantity > 0).map(l => [l.batch_number, l.is_expired]), [['EXPIRED-LOT', true], ['SOON-LOT', false], ['LATER-LOT', false]]);
});

test('the invariant holds for every medicine at the end of the run', async () => {
  await assertInvariant('the whole file');
});
