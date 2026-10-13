// Chapter 8.3-8.5 demonstrations on hospital_db_test, each inside a transaction that is rolled back.
const ROOT = require('path').join(__dirname, '../../../server');
const mysql = require(ROOT + '/node_modules/mysql2/promise');
require(ROOT + '/node_modules/dotenv').config({ path: ROOT + '/.env' });
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD, database: 'hospital_db_test', dateStrings: true });
  const [[db]] = await c.query('SELECT DATABASE() d'); if (db.d !== 'hospital_db_test') throw new Error('not the test db');
  const out = {};
  const q = async (sql, p) => (await c.query(sql, p))[0];
  await c.beginTransaction();
  const ins = await q(`INSERT INTO patients (name, date_of_birth, gender, blood_group, phone, abha_number)
VALUES ('Meera Iyer', '1992-07-14', 'FEMALE', 'B+', '9810012345', '12345678901234')`);
  out.insert = { affected: ins.affectedRows, id: ins.insertId, row: (await q('SELECT patient_id, name, date_of_birth, gender, blood_group, abha_number FROM patients WHERE patient_id = ?', [ins.insertId]))[0] };
  const [bill] = await q("SELECT bill_id FROM bills ORDER BY bill_id LIMIT 1");
  const ii = await q('INSERT INTO bill_items (bill_id, description, category, quantity, unit_price) VALUES (?, ?, ?, ?, ?)', [bill.bill_id, 'Dressing change', 'PROCEDURE', 3, 150.00]);
  out.insertItem = (await q('SELECT item_id, description, quantity, unit_price, total_price FROM bill_items WHERE item_id = ?', [ii.insertId]))[0];
  const up = await q("UPDATE bill_items SET quantity = 4 WHERE item_id = ?", [ii.insertId]);
  out.updateItem = { affected: up.affectedRows, row: (await q('SELECT quantity, unit_price, total_price FROM bill_items WHERE item_id = ?', [ii.insertId]))[0] };
  const bed = (await q("SELECT bed_id, bed_number, status FROM beds WHERE status = 'AVAILABLE' ORDER BY bed_id LIMIT 1"))[0];
  const ub = await q("UPDATE beds SET status = 'MAINTENANCE' WHERE bed_id = ? AND status = 'AVAILABLE'", [bed.bed_id]);
  out.updateBed = { bed: bed.bed_number, affected: ub.affectedRows, after: (await q('SELECT status FROM beds WHERE bed_id = ?', [bed.bed_id]))[0].status };
  const before = (await q('SELECT COUNT(*) n FROM bill_items WHERE bill_id = ?', [bill.bill_id]))[0].n;
  const del = await q('DELETE FROM bills WHERE bill_id = ?', [bill.bill_id]);
  out.deleteBill = { bill: bill.bill_id, itemsBefore: before, affected: del.affectedRows, itemsAfter: (await q('SELECT COUNT(*) n FROM bill_items WHERE bill_id = ?', [bill.bill_id]))[0].n };
  try { await q('DELETE FROM patients WHERE patient_id = 1'); out.deletePatient = 'accepted'; } catch (e) { out.deletePatient = `${e.code} (${e.errno}): ${e.sqlMessage.replace(/`hospital_db_test`\./g, '')}`; }
  await c.rollback();
  out.patients = await q('SELECT patient_id, name, date_of_birth, gender, blood_group FROM patients ORDER BY patient_id LIMIT 5');
  out.departments = await q('SELECT department_id, name, floor FROM departments ORDER BY department_id LIMIT 6');
  out.beds = await q("SELECT w.name AS ward, COUNT(*) AS beds, SUM(b.status = 'AVAILABLE') AS available FROM beds b JOIN wards w ON w.ward_id = b.ward_id GROUP BY w.ward_id, w.name ORDER BY w.ward_id");
  out.labTests = await q("SELECT test_id, name, cost, normal_range, unit FROM lab_tests WHERE test_id IN (1, 2, 5) ORDER BY test_id");
  out.medicines = await q("SELECT medicine_id, name, unit_price FROM medicines ORDER BY medicine_id LIMIT 8");
  await c.end();
  require('fs').writeFileSync(__dirname + '/../data/demo8.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 0).slice(0, 2500));
})().catch(e => { console.error(e.message); process.exit(1); });
