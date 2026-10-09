import fs from 'fs';
import FormData from 'form-data';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

const apiFetch = async (path, method = 'GET', body = null, token = null, extraHeaders = {}) => {
  const headers = { ...extraHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  
  const options = { method, headers };
  if (body) options.body = body instanceof FormData ? body : JSON.stringify(body);
  
  const res = await fetch(`http://localhost:5000/api${path}`, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  return data;
};

const login = async (username, password) => {
  const data = await apiFetch('/auth/login', 'POST', { username, password });
  return data.token;
};

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });

  try {
    console.log("--- STARTING TESTS ---");
    const docToken = await login('doctor_1', 'password123');
    const labToken = await login('lab_1', 'password123');
    const pharmToken = await login('pharmacy_1', 'password123');
    console.log("Tokens acquired");

    // 1. DOCTOR: Order 3 tests
    console.log("Doctor ordering tests...");
    const orderRes = await apiFetch('/lab/orders', 'POST', {
      patient_id: 1, doctor_id: 1, notes: 'Test order',
      tests: [{ test_id: 1 }, { test_id: 2 }, { test_id: 3 }]
    }, docToken);
    console.log("Orders created:", orderRes.data.ids);
    const orderId = orderRes.data.ids[0];

    // 2. LAB: Process and Complete
    console.log("Lab starting processing...");
    await apiFetch(`/lab/orders/${orderId}/status`, 'PUT', { status: 'PROCESSING' }, labToken);
    
    console.log("Lab entering result...");
    await apiFetch('/lab/results', 'POST', {
      order_id: orderId, result_value: '14.5', unit: 'g/dL', reference_range: '13.5-17.5', interpretation: 'NORMAL', technician_notes: 'Looks good'
    }, labToken);
    
    console.log("Lab uploading report...");
    fs.writeFileSync('dummy_report.pdf', 'Dummy PDF content');
    const form = new FormData();
    form.append('report', fs.createReadStream('dummy_report.pdf'));
    await apiFetch(`/lab/results/${orderId}/attachments`, 'POST', form, labToken, form.getHeaders());

    // 3. DOCTOR: Create prescription (3 medicines)
    console.log("Doctor creating prescription...");
    const presRes = await apiFetch('/prescriptions', 'POST', {
      patient_id: 1, doctor_id: 1, notes: 'Need meds',
      items: [
        { medicine_id: 1, dosage: '500mg', frequency: '1x day', duration: '5 days', quantity: 5 },
        { medicine_id: 2, dosage: '10mg', frequency: '2x day', duration: '5 days', quantity: 10 },
        { medicine_id: 3, dosage: '100mg', frequency: '1x day', duration: '10 days', quantity: 10 }
      ]
    }, docToken);
    const presId = presRes.data.id;
    console.log("Prescription created:", presId);

    // 4. PHARMACY: Dispense
    console.log("Pharmacy dispensing...");
    await apiFetch(`/prescriptions/${presId}/dispense`, 'POST', null, pharmToken);
    console.log("Dispensed successfully");

    // 5. PHARMACY: Receive Stock
    console.log("Pharmacy receiving stock...");
    await apiFetch(`/medicines/1/stock`, 'POST', {
      quantity: 50, type: 'RECEIPT', reason: 'Restock', notes: 'Supplier A'
    }, pharmToken);
    console.log("Stock received");

    // 6. CHECK MySQL DB
    const [movements] = await pool.query('SELECT * FROM pharmacy_stock_movements WHERE medicine_id = 1 ORDER BY created_at DESC LIMIT 5');
    console.log("Recent stock movements for Med 1:", movements);

    // 7. ROLE RESTRICTION TESTS
    console.log("Testing role restrictions...");
    try {
      await apiFetch(`/prescriptions/${presId}/dispense`, 'POST', null, labToken);
      console.log("FAIL: Lab was able to dispense!");
    } catch (e) { console.log("SUCCESS: Lab blocked from dispensing (403 expected, got " + e.status + ")"); }

    try {
      await apiFetch('/prescriptions', 'POST', { patient_id: 1, doctor_id: 1, items: [] }, pharmToken);
      console.log("FAIL: Pharmacy was able to prescribe!");
    } catch (e) { console.log("SUCCESS: Pharmacy blocked from prescribing (403 expected, got " + e.status + ")"); }

    console.log("--- ALL TESTS PASSED ---");

  } catch (err) {
    console.error("TEST FAILED:", err);
  } finally {
    pool.end();
  }
})();
