// Staff accounts from the command line (npm run accounts -- <command>):
//
//   create <file.csv | ->   Create accounts from a CSV list (or stdin). Header row required:
//                           full_name,role[,username,email,phone,department,specialization,shift,max_workload]
//                           role: ADMIN, DOCTOR, NURSE, RECEPTIONIST, LABORATORY, PHARMACY.
//                           Doctors also need department (id or name), specialization and shift.
//                           A missing username is made from the name; a missing email/phone gets a
//                           placeholder (<username>@users.invalid / 0000000000) to update later.
//   reset <username...>     Give accounts a new password.
//
// Every password is random, printed once here and stored nowhere (bcrypt hash only). All rows are
// checked first and created in one transaction: one bad row creates nothing. Each change is audited
// (no passwords). Runs against DB_NAME as the app account (DB_USER); --db <name> picks another.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { writeAudit } = require('../utils/audit');
const { ROLES, randomPassword, validateAccount, insertAccount } = require('../services/accountService');

const COLUMNS = ['full_name', 'role', 'username', 'email', 'phone', 'department', 'specialization', 'shift', 'max_workload'];

// Minimal CSV: commas, double-quoted fields with "" escapes, # comment lines.
function parseCsv(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const cells = []; let cur = ''; let quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (quoted) { if (ch === '"' && raw[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
      else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  if (!rows.length) throw new Error('the list is empty');
  const header = rows.shift().map(h => h.toLowerCase());
  for (const h of ['full_name', 'role']) if (!header.includes(h)) throw new Error(`the header row must include ${h} (columns: ${COLUMNS.join(', ')})`);
  const unknown = header.filter(h => !COLUMNS.includes(h));
  if (unknown.length) throw new Error(`unknown column(s): ${unknown.join(', ')}`);
  return rows.map((cells, i) => ({ line: i + 2, ...Object.fromEntries(header.map((h, j) => [h, cells[j] || ''])) }));
}

// "Dr. Asha Rao" -> asha.rao (titles dropped, letters only), unique against `taken`.
function usernameFor(fullName, taken) {
  const base = fullName.toLowerCase().replace(/^(dr|mr|mrs|ms|miss|prof)\.?\s+/i, '')
    .normalize('NFKD').replace(/[^a-z\s]/g, '').trim().split(/\s+/).filter(Boolean).join('.').slice(0, 45) || 'user';
  let name = base.length >= 3 ? base : `${base}.user`; let n = 2;
  while (taken.has(name)) name = `${base}${n++}`;
  taken.add(name);
  return name;
}

async function connect(database) {
  return mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database });
}

function printAccounts(list) {
  const w = Math.max(...list.map(a => a.username.length), 8);
  console.log('\nPasswords are shown only now and stored nowhere. Give each person theirs securely.\n');
  for (const a of list) console.log(`  ${a.role.padEnd(13)} ${a.username.padEnd(w)}  ${a.password}   ${a.full_name}`);
  console.log('');
}

async function create(source, database) {
  const text = source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(source, 'utf8');
  const rows = parseCsv(text);
  const conn = await connect(database);
  try {
    const [existing] = await conn.query('SELECT username FROM users');
    const taken = new Set(existing.map(u => u.username.toLowerCase()));
    const [departments] = await conn.query('SELECT department_id, name FROM departments');
    const problems = []; const accounts = []; const placeholders = [];
    for (const r of rows) {
      const role = r.role.toUpperCase();
      if (!ROLES.includes(role)) { problems.push(`line ${r.line}: role must be one of ${ROLES.join(', ')}`); continue; }
      const username = r.username ? r.username.trim() : usernameFor(r.full_name, taken);
      if (r.username) { if (taken.has(username.toLowerCase())) { problems.push(`line ${r.line}: username ${username} is already in use`); continue; } taken.add(username.toLowerCase()); }
      let departmentId = null;
      if (role === 'DOCTOR' && r.department) {
        const d = departments.find(x => String(x.department_id) === r.department || x.name.toLowerCase() === r.department.toLowerCase());
        if (!d) { problems.push(`line ${r.line}: department "${r.department}" not found`); continue; }
        departmentId = d.department_id;
      }
      const account = {
        username, role, full_name: r.full_name, password: randomPassword(),
        email: r.email || `${username}@users.invalid`, phone: r.phone || '0000000000',
        department_id: departmentId, specialization: r.specialization, shift: (r.shift || '').toUpperCase(), max_workload: r.max_workload,
      };
      if (!r.email || !r.phone) placeholders.push(username);
      const invalid = validateAccount(account);
      if (invalid) { problems.push(`line ${r.line}: ${invalid}`); continue; }
      accounts.push(account);
    }
    if (problems.length) throw new Error(`nothing created:\n  ${problems.join('\n  ')}`);

    await conn.beginTransaction();
    try {
      for (const a of accounts) {
        const ids = await insertAccount(conn, a);
        await writeAudit(conn, null, { action: 'CREATE_USER', entityType: 'user', entityId: ids.user_id, details: { role: a.role, doctor_id: ids.doctor_id, source: 'accounts script' } });
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY') throw new Error(`nothing created: ${/email/.test(e.message) ? 'an email' : 'a username'} is already in use`);
      throw e;
    }
    console.log(`Created ${accounts.length} account(s) in ${database}.`);
    printAccounts(accounts);
    if (placeholders.length) console.log(`Placeholder email/phone set for: ${placeholders.join(', ')}.`);
  } finally { await conn.end(); }
}

async function reset(usernames, database) {
  if (!usernames.length) throw new Error('give at least one username');
  const conn = await connect(database);
  try {
    const [users] = await conn.query('SELECT user_id, username, role, full_name FROM users WHERE username IN (?)', [usernames]);
    const missing = usernames.filter(u => !users.some(x => x.username === u));
    if (missing.length) throw new Error(`no such account: ${missing.join(', ')}`);
    await conn.beginTransaction();
    const out = [];
    try {
      for (const u of users) {
        const password = randomPassword();
        await conn.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [await bcrypt.hash(password, 10), u.user_id]);
        await writeAudit(conn, null, { action: 'RESET_PASSWORD', entityType: 'user', entityId: u.user_id, details: { source: 'accounts script' } });
        out.push({ ...u, password });
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; }
    printAccounts(out);
  } finally { await conn.end(); }
}

async function main(argv) {
  const dbFlag = argv.indexOf('--db');
  const database = dbFlag > -1 ? argv[dbFlag + 1] : process.env.DB_NAME;
  const args = dbFlag > -1 ? argv.filter((_, i) => i !== dbFlag && i !== dbFlag + 1) : argv;
  const [command, ...rest] = args;
  if (!database) throw new Error('set DB_NAME or pass --db <name>');
  if (command === 'create' && rest.length === 1) return create(rest[0], database);
  if (command === 'reset') return reset(rest, database);
  throw new Error('usage: accounts create <file.csv | ->  |  accounts reset <username...>  [--db <name>]');
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(e => { console.error(`[accounts] ${e.message}`); process.exit(1); });
}

module.exports = { parseCsv, usernameFor };
