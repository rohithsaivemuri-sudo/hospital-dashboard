/**
 * Concurrency Test Script
 * 
 * This script demonstrates the critical concurrency scenario:
 * Two ambulances arrive simultaneously with CRITICAL patients.
 * Only ONE ICU bed is available.
 * The system must guarantee that the bed is assigned to exactly ONE patient.
 * 
 * Usage:
 *   1. Ensure the database is seeded (only 1 ICU bed available)
 *   2. Ensure the backend server is running on port 5000
 *   3. Run: node tests/concurrency_test.js
 */

const http = require('http');

const API_BASE = 'http://localhost:5000/api';

// Helper to make HTTP requests
function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function login() {
  const res = await makeRequest('POST', `${API_BASE}/auth/login`, {
    username: 'admin',
    password: 'password123',
  });
  if (res.status !== 200 || !res.data.token) {
    throw new Error('Login failed: ' + JSON.stringify(res.data));
  }
  return res.data.token;
}

function makeAuthRequest(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runConcurrencyTest() {
  console.log('='.repeat(70));
  console.log('  HOSPITAL MANAGEMENT SYSTEM - CONCURRENCY TEST');
  console.log('  Testing: Two CRITICAL patients competing for ONE ICU bed');
  console.log('='.repeat(70));
  console.log();

  // Step 1: Login
  console.log('[1] Logging in as admin...');
  const token = await login();
  console.log('    ✓ Login successful\n');

  // Step 2: Check available ICU beds
  console.log('[2] Checking available ICU beds...');
  const bedsRes = await makeAuthRequest('GET', `${API_BASE}/beds/available?bed_type=ICU`, null, token);
  const icuBeds = bedsRes.data.data || [];
  console.log(`    Available ICU beds: ${icuBeds.length}`);
  icuBeds.forEach((b) => console.log(`      - Bed ${b.bed_number} (ID: ${b.bed_id}) on Floor ${b.floor}`));
  console.log();

  if (icuBeds.length === 0) {
    console.log('    ✗ No ICU beds available. Reset seed data to run this test.');
    console.log('    Run: mysql -u root -p hospital_management < database/seed.sql');
    return;
  }

  if (icuBeds.length > 1) {
    console.log(`    ⚠ WARNING: ${icuBeds.length} ICU beds available. For best demo, only 1 should be available.`);
  }

  // Step 3: Create two emergency patients
  console.log('[3] Creating two emergency patients...');

  const patientA = await makeAuthRequest('POST', `${API_BASE}/patients`, {
    name: 'Test Patient A (Concurrency)',
    date_of_birth: '1985-03-15',
    gender: 'MALE',
    blood_group: 'O+',
    phone: '9999900001',
    address: 'Test Address A',
    emergency_contact: '9999900002',
  }, token);

  const patientB = await makeAuthRequest('POST', `${API_BASE}/patients`, {
    name: 'Test Patient B (Concurrency)',
    date_of_birth: '1990-07-22',
    gender: 'FEMALE',
    blood_group: 'A+',
    phone: '9999900003',
    address: 'Test Address B',
    emergency_contact: '9999900004',
  }, token);

  const patientAId = patientA.data.data?.patient_id || patientA.data.data?.insertId || patientA.data.data?.id;
  const patientBId = patientB.data.data?.patient_id || patientB.data.data?.insertId || patientB.data.data?.id;
  console.log(`    Patient A ID: ${patientAId}`);
  console.log(`    Patient B ID: ${patientBId}`);
  console.log();

  // Step 4: Create two emergency cases
  console.log('[4] Creating two CRITICAL emergency cases...');

  const emergencyA = await makeAuthRequest('POST', `${API_BASE}/emergency`, {
    patient_id: patientAId,
    severity: 'CRITICAL',
    symptoms: 'Cardiac arrest - CONCURRENCY TEST PATIENT A',
    required_specialization: 'Cardiology',
    required_bed_type: 'ICU',
    ventilator_required: false,
  }, token);

  const emergencyB = await makeAuthRequest('POST', `${API_BASE}/emergency`, {
    patient_id: patientBId,
    severity: 'CRITICAL',
    symptoms: 'Severe trauma - CONCURRENCY TEST PATIENT B',
    required_specialization: 'Cardiology',
    required_bed_type: 'ICU',
    ventilator_required: false,
  }, token);

  const emergencyAId = emergencyA.data.data?.emergency_id || emergencyA.data.data?.insertId || emergencyA.data.data?.id;
  const emergencyBId = emergencyB.data.data?.emergency_id || emergencyB.data.data?.insertId || emergencyB.data.data?.id;
  console.log(`    Emergency A ID: ${emergencyAId}`);
  console.log(`    Emergency B ID: ${emergencyBId}`);
  console.log();

  // Step 5: Send BOTH allocation requests SIMULTANEOUSLY
  console.log('[5] Sending BOTH allocation requests SIMULTANEOUSLY...');
  console.log('    This is the critical test - both requests race for the same ICU bed.');
  console.log();

  const startTime = Date.now();

  const [resultA, resultB] = await Promise.all([
    makeAuthRequest('POST', `${API_BASE}/emergency/${emergencyAId}/allocate`, null, token),
    makeAuthRequest('POST', `${API_BASE}/emergency/${emergencyBId}/allocate`, null, token),
  ]);

  const elapsed = Date.now() - startTime;

  // Step 6: Analyze results
  console.log(`    Completed in ${elapsed}ms\n`);

  console.log('-'.repeat(70));
  console.log('  RESULTS');
  console.log('-'.repeat(70));
  console.log();

  console.log(`  Patient A (Emergency ${emergencyAId}):`);
  console.log(`    Status: ${resultA.status}`);
  console.log(`    Success: ${resultA.data.success}`);
  console.log(`    Message: ${resultA.data.message}`);
  if (resultA.data.allocation) {
    console.log(`    Assigned Bed: ${resultA.data.allocation.bed?.number} (ID: ${resultA.data.allocation.bed?.id})`);
    console.log(`    Assigned Doctor: ${resultA.data.allocation.doctor?.name}`);
  }
  console.log();

  console.log(`  Patient B (Emergency ${emergencyBId}):`);
  console.log(`    Status: ${resultB.status}`);
  console.log(`    Success: ${resultB.data.success}`);
  console.log(`    Message: ${resultB.data.message}`);
  if (resultB.data.allocation) {
    console.log(`    Assigned Bed: ${resultB.data.allocation.bed?.number} (ID: ${resultB.data.allocation.bed?.id})`);
    console.log(`    Assigned Doctor: ${resultB.data.allocation.doctor?.name}`);
  }
  console.log();

  // Step 7: Verify
  console.log('-'.repeat(70));
  console.log('  VERIFICATION');
  console.log('-'.repeat(70));
  console.log();

  const aSuccess = resultA.data.success === true;
  const bSuccess = resultB.data.success === true;

  if (aSuccess && !bSuccess) {
    console.log('  ✓ CORRECT: Patient A got the ICU bed, Patient B is waiting.');
    console.log('  ✓ The database correctly prevented double-assignment.');
  } else if (!aSuccess && bSuccess) {
    console.log('  ✓ CORRECT: Patient B got the ICU bed, Patient A is waiting.');
    console.log('  ✓ The database correctly prevented double-assignment.');
  } else if (aSuccess && bSuccess) {
    // Check if they got different beds
    const bedAId = resultA.data.allocation?.bed?.id;
    const bedBId = resultB.data.allocation?.bed?.id;
    if (bedAId === bedBId) {
      console.log('  ✗ FAILURE: Both patients were assigned the SAME bed!');
      console.log('  ✗ This indicates a concurrency bug in the allocation service.');
    } else {
      console.log('  ⚠ Both succeeded but with different beds (more than 1 bed was available).');
    }
  } else {
    console.log('  ⚠ Neither patient got assigned. Check available resources.');
  }

  // Step 8: Verify bed status in DB
  console.log();
  console.log('[6] Verifying ICU bed status after allocation...');
  const finalBeds = await makeAuthRequest('GET', `${API_BASE}/beds/available?bed_type=ICU`, null, token);
  const remainingICU = finalBeds.data.data || [];
  console.log(`    Available ICU beds after test: ${remainingICU.length}`);

  if (remainingICU.length === 0 && (aSuccess || bSuccess)) {
    console.log('    ✓ All ICU beds are now occupied. Exactly one was assigned.');
  }

  console.log();
  console.log('='.repeat(70));
  console.log('  TEST COMPLETE');
  console.log('='.repeat(70));
}

runConcurrencyTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
