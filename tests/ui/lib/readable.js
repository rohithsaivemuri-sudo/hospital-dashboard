// Browser-check guard: a click on a button or link that a person could not read fails the run.
//
// "Readable" means: rendered (non-zero size, not hidden, effective opacity >= 0.5), has a visible
// label, and its text contrasts with what is actually behind it by at least 3:1 (the WCAG minimum
// for large text and UI components). The background is found by compositing the element's and its
// ancestors' background colours, so a transparent button on a white card counts as white.
//
// Every page created through launch() gets a capture-phase click listener, so it applies equally to
// page.click() and to element.click() called from page.evaluate().
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', '..', '..', 'node_modules', 'puppeteer'));

const MIN_CONTRAST = 3;
const CLICKABLE = 'button, a, [role="button"], input[type="submit"], input[type="button"]';

// Runs in the page. Returns { ok, ratio, text, fg, bg, reason }.
function pageHelpers(MIN, SELECTOR) {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, bottom) => { const a = top[3] + bottom[3] * (1 - top[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map(i => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a); };
  const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  function backgroundOf(el) {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    return layers.reverse().reduce((acc, layer) => over(layer, acc), [255, 255, 255, 1]);
  }
  function readability(el) {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim();
    let opacity = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    const base = { text: text.slice(0, 60), tag: el.tagName.toLowerCase() };
    if (rect.width < 4 || rect.height < 4 || style.visibility === 'hidden' || style.display === 'none') return { ...base, ok: false, reason: 'not rendered' };
    if (opacity < 0.5) return { ...base, ok: false, reason: `opacity ${opacity.toFixed(2)}` };
    if (!text && !el.querySelector('svg, img')) return { ...base, ok: false, reason: 'no visible label' };
    const bg = backgroundOf(el);
    const fg = over(parse(style.color), bg);
    const ratio = contrast(fg, bg);
    return { ...base, ok: ratio >= MIN, ratio: Math.round(ratio * 100) / 100, fg: style.color, bg: `rgb(${bg.slice(0, 3).map(Math.round).join(', ')})`, reason: ratio >= MIN ? null : `contrast ${ratio.toFixed(2)}:1 < ${MIN}:1` };
  }
  window.__readability = readability;
  // Every visible clickable element on the page (for audits).
  window.__unreadableOnPage = () => [...document.querySelectorAll(SELECTOR)]
    // Disabled controls are exempt from contrast requirements (WCAG 1.4.3), as in the click guard.
    .filter(el => { const r = el.getBoundingClientRect(); return !el.disabled && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })
    .map(el => readability(el)).filter(r => !r.ok && r.reason !== 'not rendered');
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
    if (!target || target.disabled) return;
    const r = readability(target);
    if (!r.ok && window.__reportUnreadable) window.__reportUnreadable({ ...r, page: location.pathname });
  }, true);
}

const violations = [];

async function guard(page) {
  await page.exposeFunction('__reportUnreadable', (info) => {
    violations.push(info);
    console.log(`FAIL clicked an unreadable ${info.tag} "${info.text}" on ${info.page}: ${info.reason}${info.fg ? ` (text ${info.fg} on ${info.bg})` : ''}`);
  });
  await page.evaluateOnNewDocument(pageHelpers, MIN_CONTRAST, CLICKABLE);
  return page;
}

let patched = false;
// Launches Chromium with every new page (default or isolated contexts) guarded.
// headless: 'shell' because the default headless Chrome on macOS intermittently stops delivering
// mouse and keyboard input to a tab (no pointer or key events reach the page), which made real
// clicks time out at random.
async function launch(options = { headless: 'shell', args: ['--no-sandbox'] }) {
  const browser = await puppeteer.launch(options);
  if (!patched) {
    let proto = Object.getPrototypeOf(browser.defaultBrowserContext());
    while (proto && !Object.prototype.hasOwnProperty.call(proto, 'newPage')) proto = Object.getPrototypeOf(proto);
    const original = proto.newPage;
    proto.newPage = async function (...args) { return guard(await original.apply(this, args)); };
    patched = true;
  }
  return browser;
}

// Standalone check scripts end with process.exit(code); an unreadable click turns success into failure.
function failExitOnViolations() {
  const exit = process.exit.bind(process);
  process.exit = (code) => exit(violations.length && !code ? 1 : code);
}

module.exports = { launch, violations, failExitOnViolations, MIN_CONTRAST };
