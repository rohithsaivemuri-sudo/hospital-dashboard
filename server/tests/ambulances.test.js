// Fix 0b: ambulance create/update write the real driver_phone column.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

// vehicle_number is VARCHAR(20).
const uniqueVehicle = () => `T${Date.now() % 1e9}${Math.floor(Math.random() * 1000)}`;

test('create with contact_number (existing request shape) stores it in driver_phone', async () => {
  const { token } = await login(USERS.ADMIN);
  const vehicle_number = uniqueVehicle();
  const res = await api('POST', '/ambulances', { token, body: { vehicle_number, driver_name: 'Ravi', contact_number: '9000011111' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));

  const [[row]] = await db().query('SELECT * FROM ambulances WHERE ambulance_id = ?', [res.body.data.id]);
  assert.equal(row.vehicle_number, vehicle_number);
  assert.equal(row.driver_name, 'Ravi');
  assert.equal(row.driver_phone, '9000011111');
  assert.equal(row.status, 'AVAILABLE');
});

test('create also accepts driver_phone (the column name)', async () => {
  const { token } = await login(USERS.ADMIN);
  const res = await api('POST', '/ambulances', { token, body: { vehicle_number: uniqueVehicle(), driver_name: 'Meena', driver_phone: '9000022222' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const [[row]] = await db().query('SELECT driver_phone FROM ambulances WHERE ambulance_id = ?', [res.body.data.id]);
  assert.equal(row.driver_phone, '9000022222');
});

test('update changes driver name and phone', async () => {
  const { token } = await login(USERS.ADMIN);
  const created = await api('POST', '/ambulances', { token, body: { vehicle_number: uniqueVehicle(), driver_name: 'Old', contact_number: '9000033333' } });
  const id = created.body.data.id;

  const res = await api('PUT', `/ambulances/${id}`, { token, body: { driver_name: 'New', contact_number: '9000044444' } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [[row]] = await db().query('SELECT driver_name, driver_phone FROM ambulances WHERE ambulance_id = ?', [id]);
  assert.deepEqual({ ...row }, { driver_name: 'New', driver_phone: '9000044444' });
});

test('created ambulance appears in the list with driver_phone', async () => {
  const { token } = await login(USERS.ADMIN);
  const vehicle_number = uniqueVehicle();
  await api('POST', '/ambulances', { token, body: { vehicle_number, driver_name: 'Listed', contact_number: '9000055555' } });
  const list = await api('GET', '/ambulances', { token });
  assert.equal(list.status, 200);
  const found = list.body.data.find(a => a.vehicle_number === vehicle_number);
  assert.equal(found.driver_phone, '9000055555');
});
