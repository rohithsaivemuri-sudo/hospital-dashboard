// Screenshots of the app running on hospital_db_test (made-up data), one per major screen.
const ROOT = require('path').join(__dirname, '../../..');
const puppeteer = require(ROOT + '/node_modules/puppeteer');
const mysql = require(ROOT + '/server/node_modules/mysql2/promise');
require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env' });
const OUT = ROOT + '/docs/report/figures';
const APP = 'http://localhost:5174';
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD, database: 'hospital_db_test' });
  const [[db]] = await c.query('SELECT DATABASE() d'); if (db.d !== 'hospital_db_test') throw new Error('not the test db');
  const [[journey]] = await c.query('SELECT patient_id FROM patients ORDER BY patient_id DESC LIMIT 1');
  const [[mar]] = await c.query("SELECT patient_id FROM prescriptions WHERE notes = 'Demo MAR seed (migration 008)'");
  await c.end();
  const shots = [
    [null, '/login', 'login'],
    ['admin', '/', 'admin-dashboard'],
    ['admin', '/audit', 'admin-audit'],
    ['admin', '/beds', 'admin-beds'],
    ['reception1', '/patients', 'reception-patients'],
    ['reception1', '/appointments', 'reception-appointments'],
    ['reception1', '/billing', 'reception-billing'],
    ['nurse1', '/', 'nurse-station'],
    ['nurse1', `/mar/${mar.patient_id}`, 'nurse-mar'],
    ['dr.smith', '/', 'doctor-dashboard'],
    ['dr.smith', `/patients/${journey.patient_id}`, 'doctor-patient'],
    ['lab_staff', '/', 'lab-dashboard'],
    ['pharmacy_staff', '/', 'pharmacy-dashboard'],
  ];
  const browser = await puppeteer.launch({ headless: 'shell' });
  for (const [user, path, name] of shots) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1366, height: 820, deviceScaleFactor: 1.5 });
    if (user) {
      await page.goto(`${APP}/login`);
      await page.type('input[placeholder="Username"]', user);
      await page.type('input[placeholder="Password"]', 'password123');
      await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
    }
    await page.goto(APP + path, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('shot', name, user || '-', path.replace(/\d+$/, ':id'));
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
