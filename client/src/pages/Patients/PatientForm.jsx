import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaUserPlus, FaSave, FaExclamationTriangle } from 'react-icons/fa';
import { createPatient, updatePatient, getPatient, checkDuplicatePatients, isForbidden } from '../../services/api';
import { abhaError, abhaDigits, formatAbha, formatAbhaInput, NO_KNOWN_ALLERGIES } from '../../utils/patientIds';
import AccessDenied from '../../components/AccessDenied';
import { ageParts, ageText, estimatedBirthDate } from '../../utils/age';

const input = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '14px' };
const label = { display: 'block', marginBottom: '8px', fontWeight: 'bold' };
// The date of birth starts empty (never today). dob_mode 'age': an age in years for a patient who
// does not know the date; it is stored as an estimated date of birth.
const EMPTY = { name: '', date_of_birth: '', dob_mode: 'date', age_years: '', gender: '', blood_group: '', phone: '', address: '', emergency_contact: '', abha_number: '', allergies: '', no_known_allergies: false };
const MATCH_LABEL = { phone: 'same phone', name_and_date_of_birth: 'same name and date of birth', abha_number: 'same ABHA number' };

// mysql DATE values arrive as ISO timestamps; the form needs the local calendar date.
const localDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Patient registration (front desk / admin) and editing of an existing record (/patients/:id/edit).
// New registrations are checked for likely duplicates first; the receptionist can open the existing
// record instead of creating a second one.
export default function PatientForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState(null);
  const [abhaConflict, setAbhaConflict] = useState(null);
  const [denied, setDenied] = useState(false);
  const [savedEstimate, setSavedEstimate] = useState(null); // editing: { date, years } of a stored estimate
  const warningRef = useRef(null);
  // The warning sits under the form; bring it into view so it is not missed.
  useEffect(() => { if (duplicates) warningRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [duplicates]);

  useEffect(() => {
    if (!editing) return;
    getPatient(id).then(res => {
      const p = res.data.data;
      setForm({
        ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map(k => [k, p[k] ?? EMPTY[k]])),
        date_of_birth: p.dob_estimated ? '' : localDate(p.date_of_birth),
        dob_mode: p.dob_estimated ? 'age' : 'date',
        age_years: p.dob_estimated ? String(ageParts(p.date_of_birth)?.years ?? '') : '',
        abha_number: p.abha_number ? formatAbha(p.abha_number) : '',
        allergies: p.allergies === NO_KNOWN_ALLERGIES ? '' : (p.allergies || ''),
        no_known_allergies: p.allergies === NO_KNOWN_ALLERGIES,
      });
      if (p.dob_estimated) setSavedEstimate({ date: localDate(p.date_of_birth), years: ageParts(p.date_of_birth)?.years });
    }).catch(err => { if (isForbidden(err)) setDenied(true); else toast.error('Failed to load the patient'); });
  }, [id, editing]);

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    if (['name', 'date_of_birth', 'dob_mode', 'age_years', 'phone', 'abha_number'].includes(field)) setDuplicates(null);
    if (field === 'abha_number') setAbhaConflict(null);
  };
  const abhaProblem = abhaError(form.abha_number);

  // An unchanged estimate is sent back as it is, so editing other details does not move it.
  const birth = () => (form.dob_mode === 'date' ? { date_of_birth: form.date_of_birth, dob_estimated: false }
    : savedEstimate && Number(form.age_years) === savedEstimate.years ? { date_of_birth: savedEstimate.date, dob_estimated: true }
      : { age_years: Number(form.age_years) });
  const payload = () => ({
    name: form.name.trim(), ...birth(), gender: form.gender,
    blood_group: form.blood_group || null, phone: form.phone.trim() || null,
    address: form.address.trim() || null, emergency_contact: form.emergency_contact.trim() || null,
    abha_number: abhaDigits(form.abha_number) || null,
    allergies: form.no_known_allergies ? NO_KNOWN_ALLERGIES : (form.allergies.trim() || null),
  });

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await updatePatient(id, payload());
        toast.success('Patient details updated');
        navigate(`/patients/${id}`);
      } else {
        const res = await createPatient(payload());
        toast.success('Patient registered');
        navigate(`/patients/${res.data.data.id}`);
      }
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.code === 'DUPLICATE_ABHA') setAbhaConflict(err.response.data);
      else if (!isForbidden(err)) toast.error(err.response?.data?.message || 'Could not save the patient');
    } finally {
      setSaving(false);
    }
  };

  // Also checked by the server; not every browser enforces the date input's max.
  const dobInFuture = form.dob_mode === 'date' && Boolean(form.date_of_birth) && form.date_of_birth > localDate(new Date());
  const ageInvalid = form.dob_mode === 'age' && form.age_years !== '' && !(Number.isInteger(Number(form.age_years)) && Number(form.age_years) >= 1 && Number(form.age_years) <= 130);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (abhaProblem || dobInFuture || ageInvalid) return;
    if (editing || duplicates) return save(); // duplicates already shown: "Register anyway"
    setSaving(true);
    try {
      const { name, date_of_birth, phone, abha_number } = payload();
      const res = await checkDuplicatePatients({ name, date_of_birth, phone, abha_number });
      const found = res.data.data || [];
      if (found.length) { setDuplicates(found); setSaving(false); return; }
    } catch (err) {
      setSaving(false);
      if (!isForbidden(err)) toast.error(err.response?.data?.message || 'Could not check for existing patients');
      return;
    }
    await save();
  };

  if (denied) return <AccessDenied />;

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', width: '100%', maxWidth: '720px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <FaUserPlus color="var(--primary)" /> {editing ? 'Edit Patient Details' : 'Register Patient'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={label}>Full name</label>
            <input name="name" required value={form.name} onChange={e => set('name', e.target.value)} style={input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <div role="radiogroup" aria-label="Date of birth or age" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: '8px' }}>
                <label><input type="radio" name="dob-mode" value="date" checked={form.dob_mode === 'date'} onChange={() => set('dob_mode', 'date')} /> Date of birth</label>
                <label><input type="radio" name="dob-mode" value="age" checked={form.dob_mode === 'age'} onChange={() => set('dob_mode', 'age')} /> Age in years (date not known)</label>
              </div>
              {form.dob_mode === 'date' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <label style={{ ...label, marginBottom: 0 }}>Date of birth
                    <input name="date_of_birth" type="date" required max={localDate(new Date())} value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} aria-invalid={dobInFuture} style={{ ...input, border: dobInFuture ? '1px solid var(--danger)' : input.border, fontWeight: 'normal', marginTop: '4px' }} />
                  </label>
                  {form.date_of_birth && !dobInFuture && <span data-testid="age-preview" aria-live="polite" style={{ fontWeight: 'bold' }}>Age: {ageText(form.date_of_birth)}</span>}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <label style={{ ...label, marginBottom: 0 }}>Age in years
                    <input name="age_years" type="number" required min="1" max="130" step="1" value={form.age_years} onChange={e => set('age_years', e.target.value)} aria-invalid={ageInvalid} style={{ ...input, border: ageInvalid ? '1px solid var(--danger)' : input.border, fontWeight: 'normal', marginTop: '4px', width: '120px' }} />
                  </label>
                  {form.age_years !== '' && !ageInvalid && <span data-testid="age-preview" aria-live="polite" style={{ fontWeight: 'bold' }}>Age: approx. {Number(form.age_years)} yrs <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)' }}>(estimated date of birth {new Date(`${savedEstimate && Number(form.age_years) === savedEstimate.years ? savedEstimate.date : estimatedBirthDate(Number(form.age_years))}T00:00`).toLocaleDateString()})</span></span>}
                </div>
              )}
              {dobInFuture && <div role="alert" data-testid="dob-error" style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '4px' }}>Date of birth cannot be in the future</div>}
              {ageInvalid && <div role="alert" data-testid="age-error" style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '4px' }}>Age in years must be a whole number from 1 to 130. For a baby under one, enter the date of birth.</div>}
            </div>
            <div>
              <label style={label}>Gender</label>
              <select name="gender" required value={form.gender} onChange={e => set('gender', e.target.value)} style={input}>
                <option value="">Select…</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label style={label}>Blood group</label>
              <select name="blood_group" value={form.blood_group} onChange={e => set('blood_group', e.target.value)} style={input}>
                <option value="">Unknown</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div>
              <label style={label}>Phone</label>
              <input name="phone" type="tel" maxLength={20} value={form.phone} onChange={e => set('phone', e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>ABHA number <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)' }}>(optional)</span></label>
              <input name="abha_number" inputMode="numeric" placeholder="XX-XXXX-XXXX-XXXX" value={form.abha_number}
                onChange={e => set('abha_number', formatAbhaInput(e.target.value))}
                aria-invalid={Boolean(abhaProblem)} style={{ ...input, borderColor: abhaProblem || abhaConflict ? 'var(--danger)' : 'var(--border)' }} />
              {abhaProblem && <div data-testid="abha-error" style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '4px' }}>{abhaProblem}</div>}
              {abhaConflict && (
                <div data-testid="abha-conflict" role="alert" style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '4px' }}>
                  {abhaConflict.message}{abhaConflict.existing_patient_id && <> · <Link to={`/patients/${abhaConflict.existing_patient_id}`}>Open that record</Link></>}
                </div>
              )}
            </div>
          </div>
          <div>
            <label style={label}>Address</label>
            <textarea name="address" rows="2" value={form.address} onChange={e => set('address', e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>Emergency contact</label>
            <input name="emergency_contact" maxLength={100} value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>Allergies</label>
            <textarea name="allergies" rows="2" placeholder="e.g. Penicillin (rash), peanuts" disabled={form.no_known_allergies}
              value={form.allergies} onChange={e => set('allergies', e.target.value)} style={input} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '14px' }}>
              <input type="checkbox" name="no_known_allergies" checked={form.no_known_allergies} onChange={e => set('no_known_allergies', e.target.checked)} />
              No known allergies (patient asked)
            </label>
          </div>

          {duplicates && (
            <div ref={warningRef} data-testid="duplicate-warning" role="alert" style={{ border: '1px solid var(--warning)', background: '#fffbeb', borderRadius: '6px', padding: '12px 16px', color: '#92400e' }}>
              <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <FaExclamationTriangle /> This patient may already be registered
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px' }}>
                {duplicates.map(d => (
                  <li key={d.patient_id} style={{ marginBottom: '6px' }}>
                    <strong>{d.name}</strong> · DOB {d.date_of_birth ? new Date(d.date_of_birth).toLocaleDateString() : '—'} · {d.phone || 'no phone'}
                    {d.abha_number && <> · ABHA {formatAbha(d.abha_number)}</>}
                    <span style={{ fontSize: '12px' }}> ({d.matched_on.map(m => MATCH_LABEL[m] || m).join(', ')})</span>
                    {' '}<Link to={`/patients/${d.patient_id}`} data-testid="open-existing">Open existing record</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button type="button" onClick={() => navigate(-1)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving || Boolean(abhaProblem)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: duplicates ? 'var(--warning)' : 'var(--primary)', color: duplicates ? 'var(--text-primary)' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaSave /> {saving ? 'Saving...' : editing ? 'Save Changes' : duplicates ? 'Register Anyway' : 'Register Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
