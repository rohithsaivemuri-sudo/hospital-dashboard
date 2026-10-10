// Who is who (item 7): login and /auth/me name the signed-in user in full.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, PASSWORD, api, login, db, closeDb } = require('./helpers');

after(closeDb);

test('login and /auth/me return full_name with username and role', async () => {
  const [[row]] = await db().query('SELECT full_name FROM users WHERE username = ?', [USERS.NURSE]);
  const res = await api('POST', '/auth/login', { body: { username: USERS.NURSE, password: PASSWORD } });
  assert.equal(res.body.user.full_name, row.full_name);
  const { token } = await login(USERS.NURSE);
  const me = await api('GET', '/auth/me', { token });
  assert.equal(me.status, 200);
  assert.deepEqual({ full_name: me.body.user.full_name, username: me.body.user.username, role: me.body.user.role }, { full_name: row.full_name, username: USERS.NURSE, role: 'NURSE' });
});
