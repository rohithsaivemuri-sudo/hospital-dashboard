const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      console.log(`[NETWORK] ${response.request().method()} ${response.url()} -> ${response.status()}`);
    }
  });

  page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.text()}`));

  console.log('[Puppeteer] Navigating to login...');
  await page.goto('http://localhost:5173/login');
  
  console.log('[Puppeteer] Typing credentials...');
  await page.type('input[placeholder="Username"]', 'admin');
  await page.type('input[placeholder="Password"]', 'password123'); // my db pass
  
  console.log('[Puppeteer] Clicking login...');
  await Promise.all([
    page.waitForNavigation(),
    page.click('button[type="submit"]')
  ]);
  
  console.log('[PAGE] Logged in, current URL:', page.url());
  
  await new Promise(r => setTimeout(r, 2000));
  
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('[PAGE BODY]');
  console.log(bodyText.substring(0, 500));
  
  await browser.close();
})();
