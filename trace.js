const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      console.log(`[REQ] ${req.method()} ${req.url()}`);
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      console.log(`[RES] ${res.status()} ${res.url()}`);
    }
  });

  await page.goto('http://localhost:5173/login');
  await page.type('input[placeholder="Username"]', 'admin');
  await page.type('input[placeholder="Password"]', 'password123'); // MUST BE password123 LOCALLY!
  
  await Promise.all([
    page.waitForNavigation(),
    page.click('button[type="submit"]')
  ]);
  
  await new Promise(r => setTimeout(r, 2000));
  
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('[BODY]');
  console.log(bodyText.substring(0, 300));
  
  await browser.close();
})();
