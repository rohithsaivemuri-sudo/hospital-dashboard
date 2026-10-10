// MAR time rules (pure functions): ward slots, caps, overdue, and the IST/UTC midnight boundary.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const t = require('../utils/marTime');

const ist = (s) => new Date(`${s}+05:30`);          // an IST wall-clock time
const show = (dates) => dates.map(d => t.formatIst(d));

test('BD dispensed at 23:50 IST starts at 08:00 the next IST day', () => {
  const doses = t.scheduleDoses({ frequencyCode: 'BD', durationDays: 2, quantity: 10 }, ist('2026-10-09T23:50:00'));
  assert.deepEqual(show(doses), ['10 Oct 2026, 08:00 IST', '10 Oct 2026, 20:00 IST', '11 Oct 2026, 08:00 IST', '11 Oct 2026, 20:00 IST']);
  assert.equal(t.toSqlUtc(doses[0]), '2026-10-10 02:30:00', 'stored as UTC');
});

test('Q6H dispensed at 23:30 IST: the 00:00 IST dose belongs to the next IST day but the previous UTC day', () => {
  const [first, second] = t.scheduleDoses({ frequencyCode: 'Q6H', durationDays: 1, quantity: 4 }, ist('2026-10-09T23:30:00'));
  assert.equal(t.formatIst(first), '10 Oct 2026, 00:00 IST');
  assert.equal(t.istDate(first), '2026-10-10');
  assert.equal(t.toSqlUtc(first), '2026-10-09 18:30:00');
  assert.equal(t.formatIst(second), '10 Oct 2026, 06:00 IST');
});

test('a slot exactly at dispense time is not used: the next slot after dispensing is', () => {
  const [first] = t.scheduleDoses({ frequencyCode: 'OD', durationDays: 1, quantity: 1 }, ist('2026-10-09T08:00:00'));
  assert.equal(t.formatIst(first), '10 Oct 2026, 08:00 IST');
});

test('month and year boundaries roll over in IST', () => {
  const doses = t.scheduleDoses({ frequencyCode: 'TDS', durationDays: 1, quantity: 3 }, ist('2026-12-31T21:00:00'));
  assert.deepEqual(show(doses), ['01 Jan 2027, 08:00 IST', '01 Jan 2027, 14:00 IST', '01 Jan 2027, 20:00 IST']);
});

test('dose count is capped by duration and by quantity, whichever is smaller', () => {
  const from = ist('2026-10-09T09:00:00');
  assert.equal(t.scheduleDoses({ frequencyCode: 'TDS', durationDays: 5, quantity: 4 }, from).length, 4, 'quantity caps');
  assert.equal(t.scheduleDoses({ frequencyCode: 'TDS', durationDays: 2, quantity: 30 }, from).length, 6, 'duration caps');
  assert.equal(t.scheduleDoses({ frequencyCode: 'OD', durationDays: 10, quantity: 5, unitsPerDose: 2 }, from).length, 2, 'units per dose');
  assert.equal(t.scheduleDoses({ frequencyCode: 'QID', durationDays: 1, quantity: 0 }, from).length, 0);
});

test('STAT is one dose due immediately; PRN and free-text orders get no schedule', () => {
  const now = ist('2026-10-09T23:59:00');
  assert.deepEqual(t.scheduleDoses({ frequencyCode: 'STAT', quantity: 1 }, now).map(d => d.getTime()), [now.getTime()]);
  assert.deepEqual(t.scheduleDoses({ frequencyCode: 'PRN', durationDays: 3, quantity: 6 }, now), []);
  assert.deepEqual(t.scheduleDoses({ frequencyCode: null, durationDays: 3, quantity: 6 }, now), []);
});

test('overdue is more than 60 minutes late, computed at read time — including across midnight', () => {
  const due = ist('2026-10-10T00:00:00');
  assert.equal(t.doseState('PENDING', due, ist('2026-10-10T01:00:00')), 'PENDING', 'exactly 60 minutes late is not yet overdue');
  assert.equal(t.doseState('PENDING', due, ist('2026-10-10T01:01:00')), 'OVERDUE');
  assert.equal(t.doseState('PENDING', ist('2026-10-09T23:30:00'), ist('2026-10-10T00:31:00')), 'OVERDUE', 'due before midnight, read after');
  assert.equal(t.doseState('ADMINISTERED', due, ist('2026-10-10T05:00:00')), 'ADMINISTERED');
});

test('UTC strings round-trip without drifting by the server timezone', () => {
  const d = ist('2026-10-10T00:15:00');
  assert.equal(t.fromSqlUtc(t.toSqlUtc(d)).getTime(), d.getTime());
  assert.equal(t.toSqlUtc(d), '2026-10-09 18:45:00');
});
