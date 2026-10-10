// Source checks for the colour mistakes behind the unreadable buttons (no browser needed):
// - every CSS custom property used in the client is defined in index.css (an undefined one made
//   nine buttons transparent: white text on a white card);
// - nothing puts white text on the yellow --warning background (1.7:1).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', '..', 'client', 'src');

const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? files(p) : /\.(jsx?|css)$/.test(d.name) ? [p] : [];
});
const rel = (p) => path.relative(SRC, p);

test('every var(--name) used in the client is defined in index.css', () => {
  const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));
  const missing = [];
  for (const f of files(SRC)) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/var\((--[a-z0-9-]+)\s*(,[^)]*)?\)/gi)) {
        if (!defined.has(m[1]) && !m[2]) missing.push(`${rel(f)}:${i + 1} ${m[1]}`);
      }
    });
  }
  assert.deepEqual(missing, []);
});

test('no white text on the --warning background', () => {
  const bad = [];
  for (const f of files(SRC)) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      // Same style object: a warning background (possibly conditional) with color white/#fff.
      for (const style of line.match(/style=\{\{[^}]*\}\}/g) || []) {
        const bg = /background(Color)?:\s*[^,]*var\(--warning\)/.test(style);
        const white = /color:\s*('white'|"white"|'#fff'|'#ffffff')/i.test(style.replace(/background(Color)?:[^,]*,/g, ''));
        if (bg && white) bad.push(`${rel(f)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});
