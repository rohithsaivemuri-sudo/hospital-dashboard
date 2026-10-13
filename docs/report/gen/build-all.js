// Regenerates everything the report reads, then the PDF. From docs/report:  node gen/build-all.js
//  1. build-schema.js: a fresh hospital_report_test -> data/schema.json and hospital_db_full.sql
//  2. a fresh hospital_db_test with the API (port 5100) and client (5174) running on it, exactly as the
//     browser tests start them (tests/ui/global-setup.js; refuses if either port is in use), then the
//     runs on it: run-queries (ch. 8.6), run-demos (8.3-8.5), run-tests (ch. 10), screenshots (ch. 9)
//  3. gen-er.js and gen-tables.js -> figures/er and generated/;  4. tectonic -> main.pdf
// hospital_db is never touched.
const path = require('path');
const { execFileSync } = require('child_process');
const R = path.join(__dirname, '..');
const { globalSetup, globalTeardown } = require(path.join(R, '../../tests/ui/global-setup'));
const run = (cmd, args) => { console.log(`[report] ${cmd} ${args.join(' ')}`); execFileSync(cmd, args, { cwd: R, stdio: 'inherit' }); };

(async () => {
  run(process.execPath, ['gen/build-schema.js']);
  await globalSetup();
  try {
    for (const g of ['run-queries', 'run-demos', 'run-tests', 'screenshots']) run(process.execPath, [`gen/${g}.js`]);
  } finally { await globalTeardown(); }
  run(process.execPath, ['gen/gen-er.js']);
  run(process.execPath, ['gen/gen-tables.js']);
  run('tectonic', ['-X', 'compile', 'main.tex']);
})().catch(e => { console.error(e); process.exit(1); });
