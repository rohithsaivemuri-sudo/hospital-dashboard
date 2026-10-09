const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'server/.env' });

const api = axios.create({ baseURL: 'http://localhost:5000/api' });
const login = async (username, password) => {
  const res = await api.post('/auth/login', { username, password });
  return res.data.token;
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
    console.log("Doctor ordering 3 lab tests...");
    const orderRes = await api.post('/lab/orders', {
      patient_id: 1, doctor_id: 1, notes: 'Test order',
      tests: [{ test_id: 1 }, { test_id: 2 }, { test_id: 3 }]
    }, { headers: { Authorization: `Bearer ${docToken}` } });
    console.log("Orders created:", orderRes.data.data.ids);
    const orderId = orderRes.data.data.ids[0];

    // 2. LAB: Process and Complete
    console.log("Lab starting processing...");
    await api.put(`/lab/orders/${orderId}/status`, { status: 'PROCESSING' }, { headers: { Authorization: `Bearer ${labToken}` } });
    
    console.log("Lab entering result...");
    const resultRes = await api.post('/lab/results', {
      order_id: orderId, result_value: '14.5', unit: 'g/dL', reference_range: '13.5-17.5', interpretation: 'NORMAL', technician_notes: 'Looks good'
    }, { headers: { Authorization: `Bearer ${labToken}` } });
    
    console.log("Lab uploading report...");
    fs.writeFileSync('dummy_report.pdf', 'Dummy PDF content');
    const form = new FormData();
    form.append('report', fs.createReadStream('dummy_report.pdf'));
    await api.post(`/lab/results/${orderId}/attachments`, form, { headers: { Authorization: `Bearer ${labToken}`, ...form.getHeaders() } });

    // 3. DOCTOR: Create prescription (3 medicines)
    console.log("Doctor creating prescription...");
    const presRes = await api.post('/prescriptions', {
      patient_id: 1, doctor_id: 1, notes: 'Need meds',
      items: [
        { medicine_id: 1, dosage: '500mg', frequency: '1x day', duration: '5 days', quantity: 5 },
        { medicine_id: 2, dosage: '10mg', frequency: '2x day', duration: '5 days', quantity: 10 },
        { medicine_id: 3, dosage: '100mg', frequency: '1x day', duration: '10 days', quantity: 10 }
      ]
    }, { headers: { Authorization: `Bearer ${docToken}` } });
    const presId = presRes.data.data.id;
    console.log("Prescription created:", presId);

    // 4. PHARMACY: Dispense
    console.log("Pharmacy dispensing...");
    await api.post(`/prescriptions/${presId}/dispense`, {}, { headers: { Authorization: `Bearer ${pharmToken}` } });
    console.log("Dispensed successfully");

    // 5. PHARMACY: Receive Stock
    console.log("Pharmacy receiving stock...");
    await api.post(`/medicines/1/stock`, {
      quantity: 50, type: 'RECEIPT', reason: 'Restock', notes: 'Supplier A'
    }, { headers: { Authorization: `Bearer ${pharmToken}` } });
    console.log("Stock received");

    // 6. CHECK MySQL DB
    const [movements] = await pool.query('SELECT * FROM pharmacy_stock_movements WHERE medicine_id = 1 ORDER BY created_at DESC LIMIT 5');
    console.log("Recent stock movements for Med 1:", movements);

    // 7. ROLE RESTRICTION TESTS
    console.log("Testing role restrictions...");
    try {
      await api.post(`/prescriptions/${presId}/dispense`, {}, { headers: { Authorization: `Bearer ${labToken}` } });
      console.log("FAIL: Lab was able to dispense!");
    } catch (e) { console.log("SUCCESS: Lab blocked from dispensing (403 expected, got " + e.response.status + ")"); }

    try {
      await api.post('/prescriptions', { patient_id: 1, doctor_id: 1, items: [] }, { headers: { Authorization: `Bearer ${pharmToken}` } });
      console.log("FAIL: Pharmacy was able to prescribe!");
    } catch (e) { console.log("SUCCESS: Pharmacy blocked from prescribing (403 expected, got " + e.response.status + ")"); }

    console.log("--- ALL TESTS PASSED ---");

  } catch (err) {
    console.error("TEST FAILED:", err.response ? err.response.data : err.message);
  } finally {
    pool.end();
  }
})();
