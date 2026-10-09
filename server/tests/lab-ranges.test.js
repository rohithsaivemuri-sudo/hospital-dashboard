// Phase 2 step 7: discrete reference ranges and automatic interpretation flags.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');
const { parseRange, parseNumeric, interpret } = require('../utils/labRanges');

after(closeDb);

const TEST = { CBC: 1, LIPID: 2, GLUCOSE: 5, ECG: 11, TROPONIN: 15 };
let doctor, lab, patientId;

before(async () => {
  doctor = await login(USERS.DOCTOR);
  lab = await login(USERS.LABORATORY);
  [[{ patient_id: patientId }]] = await db().query('SELECT patient_id FROM appointments WHERE doctor_id = ? LIMIT 1', [doctor.user.doctor_id]);
});

async function processingOrder(testId) {
  const order = await api('POST', '/lab/orders', { token: doctor.token, body: { patient_id: patientId, doctor_id: doctor.user.doctor_id, tests: [{ test_id: testId }] } });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.equal((await api('PUT', `/lab/orders/${order.body.data.id}/status`, { token: lab.token, body: { status: 'PROCESSING' } })).status, 200);
  return order.body.data.id;
}
async function record(testId, body) {
  const orderId = await processingOrder(testId);
  const res = await api('POST', '/lab/results', { token: lab.token, body: { order_id: orderId, ...body } });
  const [[row]] = await db().query('SELECT * FROM lab_results WHERE order_id = ?', [orderId]);
  return { res, row };
}
const n = (v) => (v == null ? null : Number(v));

test('parser accepts only unambiguous numeric ranges', () => {
  assert.deepEqual(parseRange('70-100'), { low: 70, high: 100 });
  assert.deepEqual(parseRange(' 4.0 - 5.6 '), { low: 4, high: 5.6 });
  assert.deepEqual(parseRange('<0.04'), { low: null, high: 0.04 });
  assert.deepEqual(parseRange('≥ 55'), { low: 55, high: null });
  for (const text of ['Varies', 'Normal', 'Normal Sinus Rhythm', 'EF > 55%', 'No growth', '100-70', '', null, '5-', '1-2-3']) {
    assert.equal(parseRange(text), null, String(text));
  }
  assert.equal(parseNumeric(' 14.5 '), 14.5);
  assert.equal(parseNumeric('Troponin I: 2.8 ng/mL'), null);
  assert.equal(interpret(5, { low: 10 }), 'LOW');
  assert.equal(interpret(5, {}), null);
  assert.equal(interpret(500, { high: 100, criticalHigh: 400 }), 'CRITICAL');
});

test('migration 009: parseable test ranges have numeric bounds that match the parser; the rest stay NULL', async () => {
  const [rows] = await db().query('SELECT test_id, normal_range, reference_low, reference_high FROM lab_tests');
  for (const r of rows) {
    const p = parseRange(r.normal_range);
    assert.deepEqual([n(r.reference_low), n(r.reference_high)], p ? [p.low, p.high] : [null, null], `test ${r.test_id} "${r.normal_range}"`);
  }
  const bounded = rows.filter(r => r.reference_low != null || r.reference_high != null).map(r => r.test_id).sort((a, b) => a - b);
  assert.deepEqual(bounded, [TEST.CBC, TEST.GLUCOSE, 6, TEST.TROPONIN]);
  const [[trop]] = await db().query('SELECT reference_high FROM lab_tests WHERE test_id = ?', [TEST.TROPONIN]);
  assert.equal(n(trop.reference_high), 0.04, 'not truncated to 0');
});

test('numeric results are flagged automatically against the test range', async () => {
  for (const [value, expected] of [['120', 'HIGH'], ['65', 'LOW'], ['85', 'NORMAL'], ['100', 'NORMAL']]) {
    const { res, row } = await record(TEST.GLUCOSE, { result_value: value });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual([row.interpretation, row.interpretation_source, n(row.numeric_value), n(row.reference_low), n(row.reference_high), row.unit],
      [expected, 'AUTO', Number(value), 70, 100, 'mg/dL'], `glucose ${value}`);
  }
  const trop = await record(TEST.TROPONIN, { result_value: '2.8', unit: 'ng/mL' });
  assert.deepEqual([trop.row.interpretation, trop.row.reference_range], ['HIGH', '<0.04']);
});

test('the original payload shape is still accepted; its range text is used, and the flag is computed', async () => {
  const ok = await record(TEST.CBC, { result_value: '14.5', unit: 'g/dL', reference_range: '13.5-17.5', interpretation: 'NORMAL', technician_notes: 'Looks good' });
  assert.equal(ok.res.status, 201);
  assert.deepEqual([ok.row.interpretation, ok.row.interpretation_source, n(ok.row.reference_low), n(ok.row.reference_high), ok.row.reference_range, ok.row.technician_notes],
    ['NORMAL', 'AUTO', 13.5, 17.5, '13.5-17.5', 'Looks good']);
  const conflict = await record(TEST.CBC, { result_value: '19', unit: 'g/dL', reference_range: '13.5-17.5', interpretation: 'NORMAL' });
  assert.equal(conflict.row.interpretation, 'HIGH', 'the computed flag wins over a contradicting manual one');
  assert.equal(conflict.res.body.data.interpretation, 'HIGH');
});

test('a technician can escalate an in-range or out-of-range value to CRITICAL', async () => {
  const { row } = await record(TEST.GLUCOSE, { result_value: '150', interpretation: 'CRITICAL' });
  assert.deepEqual([row.interpretation, row.interpretation_source], ['CRITICAL', 'MANUAL']);
});

test('critical bounds on a test flag CRITICAL automatically', async () => {
  await db().query('UPDATE lab_tests SET critical_low = 40, critical_high = 400 WHERE test_id = ?', [TEST.GLUCOSE]);
  try {
    assert.equal((await record(TEST.GLUCOSE, { result_value: '450' })).row.interpretation, 'CRITICAL');
    assert.equal((await record(TEST.GLUCOSE, { result_value: '35' })).row.interpretation, 'CRITICAL');
    assert.equal((await record(TEST.GLUCOSE, { result_value: '140' })).row.interpretation, 'HIGH');
  } finally {
    await db().query('UPDATE lab_tests SET critical_low = NULL, critical_high = NULL WHERE test_id = ?', [TEST.GLUCOSE]);
  }
});

test('not guessed: unparsed test ranges, text results and unit mismatches are never auto-flagged', async () => {
  const lipid = await record(TEST.LIPID, { result_value: '245' });
  assert.deepEqual([lipid.row.interpretation, lipid.row.interpretation_source, n(lipid.row.numeric_value)], [null, null, 245]);
  const lipidManual = await record(TEST.LIPID, { result_value: '245', interpretation: 'HIGH' });
  assert.deepEqual([lipidManual.row.interpretation, lipidManual.row.interpretation_source], ['HIGH', 'MANUAL']);
  const ecg = await record(TEST.ECG, { result_value: 'Normal Sinus Rhythm' });
  assert.deepEqual([ecg.row.interpretation, ecg.row.numeric_value], [null, null]);
  // CBC's default range is in cells/mcL; a g/dL value without its own range must not be compared to it.
  const mismatch = await record(TEST.CBC, { result_value: '12.4', unit: 'g/dL' });
  assert.deepEqual([mismatch.row.interpretation, mismatch.row.reference_low, mismatch.row.reference_high], [null, null, null]);
});

test('explicit numeric bounds override the text range; bad input is a 400', async () => {
  const { row } = await record(TEST.LIPID, { result_value: '160', unit: 'mg/dL', reference_low: 0, reference_high: 130, reference_range: 'Varies' });
  assert.deepEqual([row.interpretation, n(row.reference_low), n(row.reference_high)], ['HIGH', 0, 130]);
  for (const [extra, msg] of [[{ reference_low: 10, reference_high: 5 }, /cannot be above/], [{ reference_low: 'abc' }, /must be a number/], [{ interpretation: 'SLIGHTLY_HIGH' }, /interpretation must be one of/]]) {
    const orderId = await processingOrder(TEST.LIPID);
    const res = await api('POST', '/lab/results', { token: lab.token, body: { order_id: orderId, result_value: '100', ...extra } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, msg);
    const [[o]] = await db().query('SELECT status FROM lab_orders WHERE order_id = ?', [orderId]);
    assert.equal(o.status, 'PROCESSING', 'a rejected result leaves the order processing');
  }
});

test('lab orders and results expose the bounds and flag for the screens', async () => {
  const { row } = await record(TEST.GLUCOSE, { result_value: '130' });
  const orders = (await api('GET', '/lab/orders', { token: lab.token })).body.data;
  const o = orders.find(x => x.order_id === row.order_id);
  assert.deepEqual([n(o.reference_low), n(o.reference_high), o.interpretation], [70, 100, 'HIGH']);
  const result = (await api('GET', `/lab/results/${row.order_id}`, { token: doctor.token })).body.data.result;
  assert.deepEqual([result.interpretation, result.interpretation_source, n(result.numeric_value)], ['HIGH', 'AUTO', 130]);
});
