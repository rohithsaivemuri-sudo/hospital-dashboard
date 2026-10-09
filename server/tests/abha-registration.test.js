// Step 8: ABHA number capture, allergies at registration, and the duplicate-patient check.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { USERS, api, login, db, closeDb } = require('./helpers');
const { normalizeAbha, formatAbha } = require('../utils/abha');

after(closeDb);

let admin, reception, doctor, nurse, pharmacy, lab;
before(async () => {
  [admin, reception, doctor, nurse, pharmacy, lab] = await Promise.all(
    [USERS.ADMIN, USERS.RECEPTIONIST, USERS.DOCTOR, USERS.NURSE, USERS.PHARMACY, USERS.LABORATORY].map(login));
});

// Unique per run so reruns against the same test DB never collide.
let seq = 0;
const freshAbha = () => String(Date.now()).slice(-12).padStart(12, '0') + String(seq++ % 100).padStart(2, '0');
const basePatient = (over = {}) => ({
  name: `ABHA Test ${Date.now()}-${seq++}`, date_of_birth: '1988-02-29', gender: 'MALE', blood_group: 'B+',
  phone: `98${String(Date.now()).slice(-8)}`, address: '3 Test Lane', emergency_contact: 'Kin', ...over,
});
const register = (body, token = reception.token) => api('POST', '/patients', { token, body });
const row = async (id) => (await db().query('SELECT * FROM patients WHERE patient_id = ?', [id]))[0][0];

test('ABHA parsing accepts 14 digits with or without separators and rejects everything else', () => {
  assert.deepEqual(normalizeAbha('91-2345-6789-0123'), { value: '91234567890123' });
  assert.deepEqual(normalizeAbha('91 2345 6789 0123'), { value: '91234567890123' });
  assert.deepEqual(normalizeAbha('91234567890123'), { value: '91234567890123' });
  for (const empty of [undefined, null, '', '   ']) assert.deepEqual(normalizeAbha(empty), { value: null });
  for (const bad of ['9123456789012', '912345678901234', '91-2345-6789-012A', 'abc', '91.2345.6789.0123']) assert.ok(normalizeAbha(bad).error, bad);
  assert.equal(formatAbha('91234567890123'), '91-2345-6789-0123');
});

test('registration stores ABHA as 14 digits and the allergies text', async () => {
  const abha = freshAbha();
  const dashed = `${abha.slice(0, 2)}-${abha.slice(2, 6)}-${abha.slice(6, 10)}-${abha.slice(10)}`;
  const res = await register(basePatient({ abha_number: dashed, allergies: 'Penicillin (rash)' }));
  assert.equal(res.status, 201);
  const p = await row(res.body.data.id);
  assert.equal(p.abha_number, abha);
  assert.equal(p.allergies, 'Penicillin (rash)');

  // The patient header and pharmacy read the same column.
  const detail = await api('GET', `/patients/${p.patient_id}`, { token: reception.token });
  assert.equal(detail.body.data.abha_number, abha);
  assert.equal(detail.body.data.allergies, 'Penicillin (rash)');
  const [[audit]] = await db().query("SELECT details FROM audit_logs WHERE action = 'CREATE_PATIENT' AND entity_id = ?", [p.patient_id]);
  const details = typeof audit.details === 'string' ? JSON.parse(audit.details) : audit.details;
  assert.deepEqual(details, { abha_recorded: true, allergies_recorded: true }, 'audit carries flags, never the ABHA or allergy text');
});

test('ABHA is optional and the original payload shape still registers a patient', async () => {
  const res = await register(basePatient());
  assert.equal(res.status, 201);
  const p = await row(res.body.data.id);
  assert.equal(p.abha_number, null);
  assert.equal(p.allergies, null);
  const blank = await register(basePatient({ abha_number: '', allergies: '  ' }));
  assert.equal(blank.status, 201);
  assert.equal((await row(blank.body.data.id)).abha_number, null, 'empty ABHA is stored as NULL so the unique index allows many');
});

test('an invalid ABHA is rejected with 400 and nothing is created', async () => {
  const [[{ n: before }]] = await db().query('SELECT COUNT(*) n FROM patients');
  for (const bad of ['1234', '12-3456-7890-12345', '12-3456-7890-123X']) {
    const res = await register(basePatient({ abha_number: bad }));
    assert.equal(res.status, 400, bad);
    assert.equal(res.body.code, 'INVALID_ABHA');
  }
  const [[{ n: afterCount }]] = await db().query('SELECT COUNT(*) n FROM patients');
  assert.equal(afterCount, before);
});

test('the database rejects a malformed ABHA even if the API is bypassed', async () => {
  const [[{ patient_id }]] = await db().query('SELECT patient_id FROM patients ORDER BY patient_id LIMIT 1');
  await assert.rejects(db().query("UPDATE patients SET abha_number = '12345678901ab' WHERE patient_id = ?", [patient_id]), /chk_patients_abha_format|Check constraint/);
});

test('a duplicate ABHA returns 409 with the existing patient, on create and on update', async () => {
  const abha = freshAbha();
  const first = await register(basePatient({ abha_number: abha }));
  assert.equal(first.status, 201);
  const dup = await register(basePatient({ abha_number: abha }));
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'DUPLICATE_ABHA');
  assert.equal(dup.body.existing_patient_id, first.body.data.id);
  assert.match(dup.body.message, /already registered/);

  const other = await register(basePatient());
  const p = await row(other.body.data.id);
  const body = { name: p.name, date_of_birth: '1988-02-29', gender: p.gender, blood_group: p.blood_group, phone: p.phone, address: p.address, emergency_contact: p.emergency_contact, abha_number: abha };
  const upd = await api('PUT', `/patients/${p.patient_id}`, { token: reception.token, body });
  assert.equal(upd.status, 409);
  assert.equal(upd.body.existing_patient_id, first.body.data.id);
  assert.equal((await row(p.patient_id)).abha_number, null, 'the failed update changed nothing');

  // Re-saving a patient with their own ABHA is not a conflict.
  const firstRow = await row(first.body.data.id);
  const same = await api('PUT', `/patients/${firstRow.patient_id}`, { token: reception.token, body: { ...body, name: firstRow.name, phone: firstRow.phone } });
  assert.equal(same.status, 200);
});

test('an update without the new fields keeps ABHA and allergies; with them, records the field names only', async () => {
  const abha = freshAbha();
  const created = await register(basePatient({ abha_number: abha, allergies: 'Sulfa' }));
  const p = await row(created.body.data.id);
  const original = { name: p.name, date_of_birth: '1988-02-29', gender: p.gender, blood_group: p.blood_group, phone: p.phone, address: 'Moved', emergency_contact: p.emergency_contact };
  assert.equal((await api('PUT', `/patients/${p.patient_id}`, { token: reception.token, body: original })).status, 200);
  const kept = await row(p.patient_id);
  assert.deepEqual([kept.abha_number, kept.allergies, kept.address], [abha, 'Sulfa', 'Moved']);

  const res = await api('PUT', `/patients/${p.patient_id}`, { token: admin.token, body: { ...original, allergies: 'Sulfa, latex', abha_number: abha.replace(/^(\d{2})(\d{4})/, '$1-$2-') } });
  assert.equal(res.status, 200);
  assert.equal((await row(p.patient_id)).allergies, 'Sulfa, latex');
  const [[audit]] = await db().query("SELECT details FROM audit_logs WHERE action = 'UPDATE_PATIENT' AND entity_id = ? ORDER BY audit_id DESC LIMIT 1", [p.patient_id]);
  const details = typeof audit.details === 'string' ? JSON.parse(audit.details) : audit.details;
  assert.deepEqual(details, { changed_fields: ['allergies'] }, 'same ABHA in another format is not a change');
});

test('duplicate check finds the same phone, the same name and date of birth, and the same ABHA', async () => {
  const abha = freshAbha();
  const p = basePatient({ abha_number: abha, phone: `+91 97${String(Date.now()).slice(-8)}` });
  const created = await register(p);
  const id = created.body.data.id;
  const check = async (body) => {
    const res = await api('POST', '/patients/duplicates', { token: reception.token, body });
    assert.equal(res.status, 200);
    return res.body.data.find(r => r.patient_id === id);
  };
  const byPhone = await check({ name: 'Somebody Else', date_of_birth: '2000-01-01', phone: p.phone.replace(/\D/g, '') });
  assert.deepEqual(byPhone?.matched_on, ['phone']);
  const byName = await check({ name: p.name.toUpperCase(), date_of_birth: p.date_of_birth, phone: '' });
  assert.deepEqual(byName?.matched_on, ['name_and_date_of_birth']);
  assert.equal(await check({ name: p.name, date_of_birth: '1988-03-01', phone: '' }), undefined, 'same name, different date of birth is not a duplicate');
  const byAbha = await check({ name: 'X', abha_number: abha });
  assert.deepEqual(byAbha?.matched_on, ['abha_number']);
  assert.ok(!('allergies' in byAbha) && !('address' in byAbha), 'the duplicate check returns identifying fields only');
  const none = await api('POST', '/patients/duplicates', { token: reception.token, body: {} });
  assert.deepEqual(none.body.data, []);
  const bad = await api('POST', '/patients/duplicates', { token: reception.token, body: { abha_number: '12' } });
  assert.equal(bad.status, 400);
});

test('patient list accepts optional ABHA and phone lookups', async () => {
  const abha = freshAbha();
  const p = basePatient({ abha_number: abha });
  const id = (await register(p)).body.data.id;
  const byAbha = await api('GET', `/patients?abha_number=${abha.slice(0, 2)}-${abha.slice(2, 6)}-${abha.slice(6, 10)}-${abha.slice(10)}`, { token: reception.token });
  assert.deepEqual(byAbha.body.data.map(r => r.patient_id), [id]);
  const byPhone = await api('GET', `/patients?phone=${p.phone}`, { token: reception.token });
  assert.ok(byPhone.body.data.some(r => r.patient_id === id));
  assert.equal((await api('GET', '/patients?abha_number=12', { token: reception.token })).status, 400);
});

test('only admin and reception can register, edit or run the duplicate check', async () => {
  for (const u of [doctor, nurse, pharmacy, lab]) {
    assert.equal((await register(basePatient(), u.token)).status, 403, u.user.role);
    assert.equal((await api('POST', '/patients/duplicates', { token: u.token, body: { phone: '9999900001' } })).status, 403, u.user.role);
  }
  assert.equal((await register(basePatient({ abha_number: freshAbha() }), admin.token)).status, 201);
  assert.equal((await api('POST', '/patients/duplicates', { body: { phone: '9999900001' } })).status, 401);
});
