// A tab running an older build notices a new deployment: it shows "A new version is available"
// with a Reload button, and on the sign-in page it reloads by itself before anyone signs in.
// A deployment is simulated by answering /version.json with another build id.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, closeDb, open, APP, PASSWORD } = require('./lib/harness');

let browser, page, deployed = null, loads = 0, loginPosts = 0;
diagnoseFailures(() => page);
before(async () => {
  browser = await launch();
  page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', r => {
    const url = new URL(r.url());
    if (url.pathname === '/version.json' && deployed) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ build: deployed }) });
    if (url.pathname === '/api/auth/login' && r.method() === 'POST') loginPosts++;
    return r.continue();
  });
  page.on('load', () => loads++);
});
after(async () => { await browser?.close(); await closeDb(); });

const build = () => page.evaluate(() => document.documentElement.dataset.build);
const banner = () => page.$('[data-testid="update-banner"]');

test('the same build deployed: no banner', async () => {
  await login(page, 'dr.smith');
  deployed = await build();
  assert.ok(deployed, 'the page carries its build id');
  await open(page, '/');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await new Promise(r => setTimeout(r, 500));
  assert.equal(await banner(), null);
});

test('a newer build deployed: the open tab shows "A new version is available" with Reload', async () => {
  deployed = `newer-${Date.now()}`;
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); // e.g. coming back to the tab
  const b = await page.waitForSelector('[data-testid="update-banner"]', { timeout: 5000 });
  const text = await b.evaluate(el => el.innerText);
  assert.match(text, /A new version is available/);
  const before = loads;
  await Promise.all([page.waitForNavigation(), page.click('[data-testid="update-banner"] button')]);
  assert.equal(loads, before + 1, 'Reload reloads the page');
});

test('before the next sign-in the tab reloads by itself, keeping the username, and only once', async () => {
  // Sign out in the page (no reload), as a user would, still on the older build.
  deployed = await build();
  await open(page, '/');
  await page.evaluate(() => { try { sessionStorage.clear(); } catch {} });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Logout'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Logout').click());
  await page.waitForFunction(() => location.pathname === '/login');
  const afterSignOut = loads;

  deployed = `newer-${Date.now()}`; // deployed while the sign-in page is open
  await page.type('input[placeholder="Username"]', 'dr.smith');
  await page.type('input[placeholder="Password"]', PASSWORD);
  const posts = loginPosts;
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  assert.equal(loads, afterSignOut + 1, 'reloaded before signing in');
  assert.equal(loginPosts, posts, 'no sign-in was sent from the older build');
  await page.waitForSelector('[data-testid="updated-note"]');
  assert.equal(await page.$eval('input[placeholder="Username"]', el => el.value), 'dr.smith', 'username kept');

  // Here the reload could not bring the new build (the test serves the same files): no loop, and
  // signing in now goes ahead.
  await new Promise(r => setTimeout(r, 800));
  assert.equal(loads, afterSignOut + 1, 'reloaded only once');
  await page.type('input[placeholder="Password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  assert.equal(loginPosts, posts + 1);
  assert.equal(new URL(page.url()).pathname, '/');
});

test('a sign-in page opened on an older build reloads at once', async () => {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  let n = 0; let first = null;
  await p.setRequestInterception(true);
  p.on('request', r => (new URL(r.url()).pathname === '/version.json'
    ? r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ build: 'newer-at-open' }) }) : r.continue()));
  p.on('load', () => n++);
  await p.goto(`${APP}/login`);
  first = n;
  await p.waitForFunction(() => sessionStorage.getItem('hms-reloaded-from-build'), { timeout: 5000 });
  await new Promise(r => setTimeout(r, 1000));
  assert.equal(n, first + 1, 'one automatic reload');
  await ctx.close();
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
