const axios = require('axios');
(async () => {
  const api = axios.create({ baseURL: 'http://localhost:5000/api' });
  const pharmRes = await api.post('/auth/login', { username: 'pharmacy_staff', password: 'password123' });
  const pharmToken = pharmRes.data.token;
  
  try {
    await api.post(`/medicines/1/stock`, {
      quantity: 5, type: 'ADJUSTMENT', reason: 'DAMAGED', notes: 'Water damage'
    }, { headers: { Authorization: `Bearer ${pharmToken}` } });
    console.log("Adjustment successful");
  } catch (e) {
    console.error("Adjustment failed", e.response.data);
  }
})();
