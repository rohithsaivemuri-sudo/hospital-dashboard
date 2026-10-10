// Applies database/migrations/NNN_*.sql in order and records them in schema_migrations.
// Usage: node scripts/migrate.js [--db <name>] [--dry-run]
// 000_baseline is only executed on an empty database; on an existing one it is marked as applied.
const path = require('path');
const mysql = require('mysql2/promise');
const { MIGRATIONS_DIR, runSqlFile, listMigrations } = require('./lib/sql');
const { backupDatabase } = require('./backup-db');
const { adminCredentials } = require('./lib/admin-credentials');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

// upTo: stop after this migration file (inclusive), e.g. '000_baseline.sql'.
async function migrate(database, { dryRun = false, log = console.log, upTo } = {}) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
    ...adminCredentials(), database,
  });
  try {
    const [[{ tableCount }]] = await conn.query(
      "SELECT COUNT(*) AS tableCount FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME <> 'schema_migrations'",
      [database]
    );
    const pending = [];
    const [[exists]] = await conn.query(
      "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'schema_migrations'",
      [database]
    );
    const applied = new Set();
    if (exists.n) {
      const [rows] = await conn.query('SELECT version FROM schema_migrations');
      rows.forEach(r => applied.add(r.version));
    }
    for (const file of listMigrations()) {
      if (upTo && file > upTo) break;
      if (!applied.has(file)) pending.push(file);
    }

    if (dryRun) {
      log(`[migrate] ${database}: pending = ${pending.length ? pending.join(', ') : 'none'}`);
      return pending;
    }

    // Back up any real (non-test) database before changing it; abort if the backup fails.
    const willApply = pending.filter(f => !(f.startsWith('000_') && Number(tableCount) > 0));
    if (willApply.length && !database.endsWith('_test')) backupDatabase(database, { log });

    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      note VARCHAR(100) NULL
    ) ENGINE=InnoDB`);

    for (const file of pending) {
      if (file.startsWith('000_') && Number(tableCount) > 0) {
        await conn.query('INSERT INTO schema_migrations (version, note) VALUES (?, ?)', [file, 'marked: existing schema']);
        log(`[migrate] ${database}: marked ${file} (schema already present)`);
        continue;
      }
      log(`[migrate] ${database}: applying ${file}`);
      if (file.endsWith('.js')) {
        // Data migrations that reuse application code; they get a connection to `database` only.
        const result = await require(path.join(MIGRATIONS_DIR, file)).up(conn, { database });
        if (result) log(`[migrate] ${database}: ${file} -> ${JSON.stringify(result)}`);
      } else {
        runSqlFile(database, path.join(MIGRATIONS_DIR, file));
      }
      await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
    }
    return pending;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  const database = arg('--db') || process.env.DB_NAME;
  migrate(database, { dryRun: process.argv.includes('--dry-run') })
    .catch(e => { console.error('[migrate] failed:', e.message); process.exit(1); });
}

module.exports = { migrate };
