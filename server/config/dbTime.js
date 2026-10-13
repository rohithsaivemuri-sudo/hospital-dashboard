// DATETIME and TIMESTAMP values are UTC on every connection, whatever time zone the MySQL server or
// this process runs in: mysql2 converts JS Dates with timezone 'Z', and each session runs with
// time_zone '+00:00', so NOW() and CURRENT_TIMESTAMP defaults are UTC too. (The Azure host already
// ran both in UTC; a development machine in IST did not.) Calendar "today" comes from utils/clock.js.
const UTC_OPTIONS = { timezone: 'Z' };
const UTC_SESSION_SQL = "SET time_zone = '+00:00'";

// For mysql.createPool(...): every new pooled connection sets the session time zone before its first query.
function utcSessions(pool) {
  pool.on('connection', (connection) => connection.query(UTC_SESSION_SQL, (err) => {
    if (err) console.error(`[db] could not set the session time zone: ${err.message}`);
  }));
  return pool;
}

// For a single mysql.createConnection(...) (promise API).
async function utcSession(connection) {
  await connection.query(UTC_SESSION_SQL);
  return connection;
}

module.exports = { UTC_OPTIONS, UTC_SESSION_SQL, utcSessions, utcSession };
