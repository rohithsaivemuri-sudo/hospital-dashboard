const http = require('http');

const API_BASE = 'http://localhost:5000/api';

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
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function login() {
  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 5000, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (r) => {
      let body = '';
      r.on('data', (chunk) => body += chunk);
      r.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(JSON.stringify({ username: 'admin', password: 'password123' }));
    req.end();
  });
  return res.token;
}

async function runTest(numRequests) {
  const token = await login();
  
  // Create multiple patients and emergencies
  console.log(`Creating ${numRequests} patients and emergencies...`);
  const emergencyIds = [];
  
  for(let i=0; i<numRequests; i++) {
    const p = await makeAuthRequest('POST', '/api/patients', {
      name: `Load Test Patient ${i}`, date_of_birth: '1990-01-01', gender: 'MALE', 
      blood_group: 'O+', phone: '11111', address: 'Test', emergency_contact: '2222'
    }, token);
    const pId = p.data.data.id || p.data.data.insertId;
    
    const e = await makeAuthRequest('POST', '/api/emergency', {
      patient_id: pId, severity: 'CRITICAL', symptoms: 'Test', 
      required_specialization: 'Cardiology', required_bed_type: 'ICU', ventilator_required: false
    }, token);
    emergencyIds.push(e.data.data.id || e.data.data.insertId || e.data.data.emergency_id);
  }
  
  console.log(`Sending ${numRequests} simultaneous allocation requests...`);
  const promises = emergencyIds.map(eId => 
    makeAuthRequest('POST', `/api/emergency/${eId}/allocate`, null, token)
  );
  
  const startTime = Date.now();
  const results = await Promise.all(promises);
  const elapsed = Date.now() - startTime;
  
  const successes = results.filter(r => r.data.success);
  const failures = results.filter(r => !r.data.success);
  
  console.log(`Time: ${elapsed}ms`);
  console.log(`Successes: ${successes.length}`);
  console.log(`Failures: ${failures.length}`);
  
  // Verify DB state
  const beds = await makeAuthRequest('GET', '/api/beds/available?bed_type=ICU', null, token);
  console.log(`Available ICU beds remaining: ${beds.data.data.length}`);
}

runTest(50).catch(console.error);
