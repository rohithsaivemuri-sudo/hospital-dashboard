// The bed board's tinted tiles and badges render (they were invalid CSS like "var(--success)10",
// which browsers drop, leaving every tile transparent).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, violations } = require('./lib/readable');
const { diagnoseFailures, login, closeDb, open } = require('./lib/harness');

let browser, page;
diagnoseFailures(() => page);
before(async () => {
  browser = await launch();
  page = await browser.newPage();
  await login(page, 'nurse1');
});
after(async () => { await browser.close(); await closeDb(); });

test('bed tiles have a tinted background and border in their status colour', async () => {
  await open(page, '/beds');
  await page.waitForSelector('[data-testid="bed-tile"]');
  const tiles = await page.$$eval('[data-testid="bed-tile"]', els => els.map(el => {
    const s = getComputedStyle(el); const badge = getComputedStyle(el.lastElementChild);
    return { status: el.dataset.status, bg: s.backgroundColor, border: s.borderTopColor, badge: badge.backgroundColor };
  }));
  assert.ok(tiles.length > 0);
  const transparent = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
  for (const t of tiles) {
    assert.ok(!transparent(t.bg), `${t.status} tile background is transparent`);
    assert.ok(!transparent(t.badge), `${t.status} badge background is transparent`);
  }
  // Available tiles are tinted green (from --success #34a853), occupied ones red (--danger #ea4335).
  const channel = (c) => c.match(/[\d.]+/g).map(Number);
  const available = tiles.find(t => t.status === 'AVAILABLE');
  const occupied = tiles.find(t => t.status === 'OCCUPIED');
  const [ar, ag, ab] = channel(available.bg);
  assert.ok(ag > ar && ag > ab, `available tile is green-tinted: ${available.bg}`);
  if (occupied) { const [r, g, b] = channel(occupied.bg); assert.ok(r > g && r > b, `occupied tile is red-tinted: ${occupied.bg}`); }
});

test('no unreadable button was clicked', () => assert.deepEqual(violations, []));
