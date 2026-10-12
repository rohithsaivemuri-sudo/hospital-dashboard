// BCNF conversions (docs/bcnf-analysis.md): values that were stored twice are now read from the one
// table that owns them, with API responses unchanged.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

// A1: a bed's floor is its ward's floor.
test('A1: every bed endpoint reports the ward\'s floor, with the same fields as before', async () => {
  const admin = await login(USERS.ADMIN);
  const [wards] = await db().query('SELECT ward_id, floor FROM wards');
  const floorOf = new Map(wards.map(w => [w.ward_id, w.floor]));
  const res = await api('GET', '/beds', { token: admin.token });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length > 0);
  for (const bed of res.body.data) {
    assert.deepEqual(Object.keys(bed), ['bed_id', 'ward_id', 'bed_number', 'floor', 'bed_type', 'status', 'has_ventilator', 'ward_name']);
    assert.equal(bed.floor, floorOf.get(bed.ward_id), `bed ${bed.bed_number}`);
  }
});

test('A1: a bed stored without a floor of its own shows its ward\'s floor everywhere', async () => {
  const admin = await login(USERS.ADMIN);
  const stamp = Date.now() % 1e8;
  const [ward] = await db().query("INSERT INTO wards (name, department_id, floor, capacity, ward_type) VALUES (?, 1, 7, 1, 'GENERAL')", [`Floor Test Ward ${stamp}`]);
  const [bed] = await db().query("INSERT INTO beds (ward_id, bed_number, bed_type, status) VALUES (?, ?, 'GENERAL', 'AVAILABLE')", [ward.insertId, `FL-${stamp}`]);
  try {
    const one = await api('GET', `/beds/${bed.insertId}`, { token: admin.token });
    assert.equal(one.status, 200);
    assert.deepEqual(Object.keys(one.body.data), ['bed_id', 'ward_id', 'bed_number', 'floor', 'bed_type', 'status', 'has_ventilator']);
    assert.equal(one.body.data.floor, 7);
    const byWard = await api('GET', `/beds/ward/${ward.insertId}`, { token: admin.token });
    assert.deepEqual(byWard.body.data.map(b => b.floor), [7]);
    const available = await api('GET', '/beds/available?type=GENERAL', { token: admin.token });
    assert.equal(available.body.data.find(b => b.bed_id === bed.insertId)?.floor, 7);
    const wardRes = await api('GET', `/wards/${ward.insertId}`, { token: admin.token });
    assert.equal(wardRes.status, 200);
    assert.deepEqual(wardRes.body.data.beds.map(b => b.floor), [7]);
    const [[view]] = await db().query('SELECT floor FROM available_beds_view WHERE bed_id = ?', [bed.insertId]);
    assert.equal(view.floor, 7);
  } finally {
    // Keep the fixture bed out of every later allocation.
    await db().query("UPDATE beds SET status = 'MAINTENANCE' WHERE bed_id = ?", [bed.insertId]);
  }
});
