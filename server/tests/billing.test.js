// Fix 0c: bill create and add-item use the real bills / bill_items columns.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');

after(closeDb);

async function createBill(token, total_amount = 0) {
  const res = await api('POST', '/bills', { token, body: { patient_id: 1, total_amount } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

test('create stores a PENDING bill with bill_date set', async () => {
  const { token } = await login(USERS.RECEPTIONIST);
  const id = await createBill(token, 500);
  const [[row]] = await db().query('SELECT * FROM bills WHERE bill_id = ?', [id]);
  assert.equal(row.status, 'PENDING');
  assert.ok(row.bill_date instanceof Date);
  assert.equal(Number(row.total_amount), 500);
  assert.equal(Number(row.paid_amount), 0);
  assert.equal(row.admission_id, null);

  const list = await api('GET', '/bills', { token });
  assert.ok(list.body.data.some(b => b.bill_id === id));
});

test('add item without a category stores an OTHER line and raises the bill total', async () => {
  const { token } = await login(USERS.RECEPTIONIST);
  const id = await createBill(token, 100);
  const res = await api('POST', `/bills/${id}/items`, { token, body: { description: 'Dressing', amount: 250 } });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const bill = await api('GET', `/bills/${id}`, { token });
  assert.equal(Number(bill.body.data.total_amount), 350);
  assert.equal(bill.body.data.items.length, 1);
  const [item] = bill.body.data.items;
  assert.equal(item.description, 'Dressing');
  assert.equal(item.category, 'OTHER');
  assert.equal(item.quantity, 1);
  assert.equal(Number(item.unit_price), 250);
  assert.equal(Number(item.total_price), 250);
});

test('add item keeps a valid category and falls back to OTHER for an invalid one', async () => {
  const { token } = await login(USERS.RECEPTIONIST);
  const id = await createBill(token);
  await api('POST', `/bills/${id}/items`, { token, body: { description: 'CBC', amount: 300, category: 'LABORATORY' } });
  await api('POST', `/bills/${id}/items`, { token, body: { description: 'Misc', amount: 50, category: 'NOT_A_CATEGORY' } });
  const [items] = await db().query('SELECT description, category FROM bill_items WHERE bill_id = ? ORDER BY item_id', [id]);
  assert.deepEqual(items.map(i => [i.description, i.category]), [['CBC', 'LABORATORY'], ['Misc', 'OTHER']]);
});

test('end-to-end: create, add items, pay partially then fully', async () => {
  const { token } = await login(USERS.RECEPTIONIST);
  const id = await createBill(token);
  await api('POST', `/bills/${id}/items`, { token, body: { description: 'Consultation', amount: 400, category: 'CONSULTATION' } });

  assert.equal((await api('PUT', `/bills/${id}/pay`, { token, body: { amount: 150 } })).status, 200);
  let [[row]] = await db().query('SELECT status, paid_amount FROM bills WHERE bill_id = ?', [id]);
  assert.equal(row.status, 'PARTIAL');

  assert.equal((await api('PUT', `/bills/${id}/pay`, { token, body: { amount: 250 } })).status, 200);
  [[row]] = await db().query('SELECT status, paid_amount FROM bills WHERE bill_id = ?', [id]);
  assert.equal(row.status, 'PAID');
  assert.equal(Number(row.paid_amount), 400);
});
