// Opt-in concurrency stress test for the medicines lock order (npm run test:stress).
// Not part of `npm test`: it takes ~1 minute. Rebuilds hospital_db_test and runs its own server.
//   STRESS_ROUNDS (default 300) rounds of each scenario; exits 1 on any deadlock, error or stock drift.
const { globalSetup, globalTeardown } = require('../global-setup');
const { USERS, api, login, db, closeDb } = require('../helpers');

const ROUNDS = Number(process.env.STRESS_ROUNDS || 300);
const WIDTH = 4; // concurrent create/dispense pairs per round in scenario 1
const MED_A = 18;
const MED_B = 19;

const item = (medicine_id) => ({ medicine_id, dosage: '1 tab', frequency: 'Once daily', duration: '1 day', quantity: 1 });
const isDeadlock = (res) => /deadlock/i.test(res.body?.message || '');

async function stock() {
  const [rows] = await db().query('SELECT medicine_id, stock_quantity FROM medicines WHERE medicine_id IN (?, ?) ORDER BY medicine_id', [MED_A, MED_B]);
  return rows.map(r => r.stock_quantity);
}

async function main() {
  await globalSetup();
  const doctor = await login(USERS.DOCTOR);
  const pharmacy = await login(USERS.PHARMACY);
  const [[{ patient_id }]] = await db().query('SELECT patient_id FROM appointments WHERE doctor_id = ? LIMIT 1', [doctor.user.doctor_id]);
  const prescribe = (items) => api('POST', '/prescriptions', { token: doctor.token, body: { patient_id, doctor_id: doctor.user.doctor_id, items } });
  const dispense = (id) => api('POST', `/prescriptions/${id}/dispense`, { token: pharmacy.token });
  await db().query('UPDATE medicines SET stock_quantity = 1000000 WHERE medicine_id IN (?, ?)', [MED_A, MED_B]);

  let failed = false;
  const report = (name, { deadlocks, errors, consistent }) => {
    const ok = deadlocks === 0 && errors === 0 && consistent;
    if (!ok) failed = true;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: deadlocks=${deadlocks} other_errors=${errors} stock_consistent=${consistent}`);
  };

  // Scenario 1: prescription create [B, A] racing dispense [A, B].
  {
    const [a0, b0] = await stock();
    let deadlocks = 0, errors = 0, dispensed = 0;
    for (let round = 0; round < ROUNDS; round++) {
      const ids = [];
      for (let k = 0; k < WIDTH; k++) ids.push((await prescribe([item(MED_A), item(MED_B)])).body.data.id);
      const results = await Promise.all([...ids.map(dispense), ...ids.map(() => prescribe([item(MED_B), item(MED_A)]))]);
      results.forEach((r, i) => {
        if (isDeadlock(r)) deadlocks++;
        else if (r.status >= 300) errors++;
        else if (i < WIDTH) dispensed++;
      });
    }
    const [a1, b1] = await stock();
    report(`create vs dispense (${ROUNDS} rounds x ${WIDTH})`, { deadlocks, errors, consistent: a1 === a0 - dispensed && b1 === b0 - dispensed });
  }

  // Scenario 2: every medicines writer at once — opposite-order dispenses, a create, a receipt, an adjustment.
  {
    const [a0, b0] = await stock();
    let deadlocks = 0, errors = 0, dispensed = 0, receipts = 0, adjustments = 0;
    for (let round = 0; round < ROUNDS; round++) {
      const p1 = (await prescribe([item(MED_A), item(MED_B)])).body.data.id;
      const p2 = (await prescribe([item(MED_B), item(MED_A)])).body.data.id;
      const results = await Promise.all([
        dispense(p1),
        dispense(p2),
        prescribe([item(MED_B), item(MED_A)]),
        api('POST', `/medicines/${MED_B}/stock`, { token: pharmacy.token, body: { quantity: 2, type: 'RECEIPT', reason: 'Restock' } }),
        api('POST', `/medicines/${MED_A}/stock`, { token: pharmacy.token, body: { quantity: 1, type: 'ADJUSTMENT', reason: 'DAMAGED' } }),
      ]);
      results.forEach((r, i) => {
        if (isDeadlock(r)) deadlocks++;
        else if (r.status >= 300) errors++;
        else if (i < 2) dispensed++;
        else if (i === 3) receipts++;
        else if (i === 4) adjustments++;
      });
    }
    const [a1, b1] = await stock();
    report(`mixed writers (${ROUNDS} rounds)`, {
      deadlocks, errors, consistent: a1 === a0 - dispensed - adjustments && b1 === b0 - dispensed + 2 * receipts,
    });
  }

  await closeDb();
  await globalTeardown();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error('[stress] failed:', e);
  await globalTeardown();
  process.exit(1);
});
