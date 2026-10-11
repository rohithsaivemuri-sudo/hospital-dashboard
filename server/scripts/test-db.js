// Rebuilds the throwaway test database: baseline + migrations + seed data.
// Refuses to touch any database whose name does not end in "_test".
const path = require('path');
const { buildFromSeed } = require('./lib/build-db');

const TEST_DB = process.env.TEST_DB_NAME || 'hospital_db_test';

async function buildTestDb({ log = console.log } = {}) {
  if (!/^[a-z0-9_]+_test$/.test(TEST_DB) || TEST_DB === process.env.DB_NAME) {
    throw new Error(`Refusing to rebuild "${TEST_DB}": test database names must end in _test and differ from DB_NAME`);
  }
  // Same order as production: the baseline schema with its data, then every later migration runs
  // over existing rows (so backfills are exercised against real-looking data).
  await buildFromSeed(TEST_DB, { fixups: [path.join(__dirname, '..', 'tests', 'fixtures', 'seed-fixups.sql')] });
  log(`[test-db] ${TEST_DB} rebuilt`);
}

if (require.main === module) {
  buildTestDb().catch(e => { console.error('[test-db] failed:', e.message); process.exit(1); });
}

module.exports = { buildTestDb, TEST_DB };
