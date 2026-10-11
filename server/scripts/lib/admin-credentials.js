// Credentials for administrative work: migrations, backups, schema diffs and building the test
// database. These need DDL, TRIGGER, LOCK TABLES and so on, which the running app's restricted
// account (DB_USER, see docs/mysql-app-user.sql) deliberately does not have.
function adminCredentials() {
  const user = process.env.DB_ADMIN_USER;
  const password = process.env.DB_ADMIN_PASSWORD;
  if (!user || password === undefined || password === '') {
    throw new Error('Set DB_ADMIN_USER and DB_ADMIN_PASSWORD (an administrative MySQL account) in server/.env or the environment; '
      + 'DB_USER/DB_PASSWORD are the restricted account the app runs as.');
  }
  return { user, password };
}

module.exports = { adminCredentials };
