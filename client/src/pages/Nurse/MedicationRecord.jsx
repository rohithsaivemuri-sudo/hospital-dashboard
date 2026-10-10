import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaPills, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { AuthContext } from '../../context/AuthContext';
import { getPatientMar, administerDose, refuseDose, missDose, giveAsNeeded, isForbidden } from '../../services/api';
import AccessDenied from '../../components/AccessDenied';
import { hasAllergies, allergyLabel } from '../../utils/patientIds';

const ROUTES = ['ORAL', 'IV', 'IM', 'SC', 'SUBLINGUAL', 'INHALED', 'TOPICAL', 'RECTAL', 'OTHER'];
const STATE_STYLE = {
  PENDING: { bg: '#e0e7ff', fg: '#3730a3', label: 'Due' },
  OVERDUE: { bg: '#fee2e2', fg: '#b91c1c', label: 'Overdue' },
  ADMINISTERED: { bg: '#dcfce7', fg: '#15803d', label: 'Given' },
  REFUSED: { bg: '#fef3c7', fg: '#92400e', label: 'Refused' },
  MISSED: { bg: '#fef3c7', fg: '#92400e', label: 'Missed' },
  CANCELLED: { bg: '#f1f5f9', fg: '#64748b', label: 'Cancelled' },
};
const card = { background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' };
const mrnOf = (id) => `MRN-${String(id).padStart(6, '0')}`;
const timeOf = (ist) => (ist ? ist.split(', ')[1].replace(' IST', '') : '');
const shiftDay = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Medication Administration Record: one IST day per view; medicines on rows, ward times on columns.
export default function MedicationRecord() {
  const { patientId } = useParams();
  const { user } = useContext(AuthContext);
  const canRecord = user?.role === 'NURSE';
  const [mar, setMar] = useState(null);
  const [day, setDay] = useState(null);
  const [denied, setDenied] = useState(false);
  const [action, setAction] = useState(null); // { item, dose | null (as-needed) }

  const load = async () => {
    try {
      const res = await getPatientMar(patientId);
      setMar(res.data.data);
      setDay(d => d || res.data.data.today_ist);
    } catch (err) {
      if (isForbidden(err)) setDenied(true);
      else toast.error('Failed to load the medication record');
    }
  };
  useEffect(() => { load(); }, [patientId]);

  const { scheduled, asNeeded, columns } = useMemo(() => {
    if (!mar || !day) return { scheduled: [], asNeeded: [], columns: [] };
    const sched = mar.items.filter(i => i.schedule_type === 'SCHEDULED');
    const times = new Set();
    sched.forEach(i => i.doses.filter(d => d.scheduled_ist_date === day).forEach(d => times.add(timeOf(d.scheduled_ist))));
    return { scheduled: sched, asNeeded: mar.items.filter(i => i.schedule_type !== 'SCHEDULED'), columns: [...times].sort() };
  }, [mar, day]);

  if (denied) return <AccessDenied message="This patient is not under your care." />;
  if (!mar) return <div style={{ padding: '24px' }}>Loading medication record...</div>;
  const overdueCount = scheduled.flatMap(i => i.doses).filter(d => d.state === 'OVERDUE').length;

  return (
    <div style={{ padding: '24px', display: 'grid', gap: '24px' }}>
      <div data-testid="patient-context" style={{ ...card, padding: '16px 24px', borderLeft: '4px solid var(--primary)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', alignItems: 'baseline' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}><FaPills color="var(--primary)" /> {mar.patient.name}</h1>
          <span><strong>{mar.patient.age}</strong> yrs · {mar.patient.gender}</span>
          <span><strong>{mrnOf(mar.patient.patient_id)}</strong></span>
          <span style={{ color: hasAllergies(mar.patient.allergies) ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: hasAllergies(mar.patient.allergies) ? 'bold' : 'normal' }}>Allergies: {allergyLabel(mar.patient.allergies)}</span>
          {mar.admission && <span>{mar.admission.ward_name} · Bed {mar.admission.bed_number}</span>}
          <Link to={`/patients/${mar.patient.patient_id}`} style={{ marginLeft: 'auto' }}>Patient chart</Link>
        </div>
        <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Times are hospital time (IST). Now: {mar.now_ist}{overdueCount > 0 && <strong style={{ color: 'var(--danger)', marginLeft: '12px' }}>{overdueCount} overdue</strong>}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, marginRight: 'auto' }}>Scheduled medicines</h2>
          <button aria-label="Previous day" onClick={() => setDay(shiftDay(day, -1))} style={{ padding: '6px 10px' }}><FaChevronLeft /></button>
          <strong data-testid="mar-day">{dayLabel(day)}{day === mar.today_ist ? ' (today)' : ''}</strong>
          <button aria-label="Next day" onClick={() => setDay(shiftDay(day, 1))} style={{ padding: '6px 10px' }}><FaChevronRight /></button>
          {day !== mar.today_ist && <button onClick={() => setDay(mar.today_ist)} style={{ padding: '6px 10px' }}>Today</button>}
        </div>
        {scheduled.length === 0 ? <p>No scheduled medicines.</p> : columns.length === 0 ? <p>No doses scheduled on this day.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="mar-grid" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-primary)' }}>
                <th style={{ padding: '8px', textAlign: 'left', minWidth: '220px' }}>Medicine</th>
                {columns.map(c => <th key={c} style={{ padding: '8px', minWidth: '96px' }}>{c}</th>)}
              </tr></thead>
              <tbody>
                {scheduled.map(item => (
                  <tr key={item.item_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>
                      <strong>{item.medicine_name}</strong> {item.dosage}
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.frequency_code} · {item.route || 'route not set'} · {item.frequency}{item.prescription_status === 'CANCELLED' ? ' · CANCELLED' : ''}</div>
                    </td>
                    {columns.map(c => {
                      const dose = item.doses.find(d => d.scheduled_ist_date === day && timeOf(d.scheduled_ist) === c);
                      if (!dose) return <td key={c} />;
                      const st = STATE_STYLE[dose.state];
                      const actionable = canRecord && ['PENDING', 'OVERDUE'].includes(dose.state);
                      return (
                        <td key={c} style={{ padding: '6px', textAlign: 'center' }}>
                          <button data-dose={dose.administration_id} data-state={dose.state} disabled={!actionable} onClick={() => setAction({ item, dose })}
                            title={dose.reason || dose.scheduled_ist}
                            style={{ width: '100%', padding: '6px 4px', border: 'none', borderRadius: '6px', background: st.bg, color: st.fg, fontWeight: 'bold', cursor: actionable ? 'pointer' : 'default' }}>
                            {st.label}
                            {dose.administered_ist && <div style={{ fontWeight: 'normal', fontSize: '11px' }}>{timeOf(dose.administered_ist)}</div>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>As needed and unscheduled</h2>
        {asNeeded.length === 0 ? <p>None.</p> : asNeeded.map(item => (
          <div key={item.item_id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ marginRight: 'auto' }}>
                <strong>{item.medicine_name}</strong> {item.dosage}
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.schedule_type === 'PRN' ? 'PRN' : 'No structured schedule'} · {item.route || 'route not set'} · {item.frequency}</div>
              </div>
              {canRecord && item.prescription_status !== 'CANCELLED' && (
                <button onClick={() => setAction({ item, dose: null })} style={{ padding: '6px 12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Record dose</button>
              )}
            </div>
            {item.doses.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {item.doses.map(d => <li key={d.administration_id}>{d.administered_ist || d.scheduled_ist} — {STATE_STYLE[d.state].label}{d.reason ? ` (${d.reason})` : ''}{d.recorded_by_name ? ` · ${d.recorded_by_name}` : ''}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>

      {action && <AdministerModal patient={mar.patient} {...action} onClose={() => setAction(null)} onDone={() => { setAction(null); load(); }} />}
    </div>
  );
}

// Bedside check before recording a dose (WHO "Five Rights"). The server re-checks every right.
function AdministerModal({ patient, item, dose, onClose, onDone }) {
  const overdue = dose?.state === 'OVERDUE';
  const due = dose ? new Date(dose.scheduled_at) <= new Date() : true;
  const [form, setForm] = useState({ mrn: '', dose_given: item.dosage, route_given: item.route || '', reason: '' });
  const [checks, setChecks] = useState({ drug: false, dose: false, route: false, time: false });
  const [busy, setBusy] = useState(false);
  const allChecked = Object.values(checks).every(Boolean);
  const needsReason = !dose || overdue;

  const run = async (fn, okMessage) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMessage);
      onDone();
    } catch (err) {
      if (!isForbidden(err)) toast.error(err.response?.data?.message || 'Could not record the dose');
    } finally { setBusy(false); }
  };
  const give = (e) => {
    e.preventDefault();
    const body = { patient_confirmation: form.mrn, dose_given: form.dose_given, route_given: form.route_given, ...(form.reason.trim() ? { reason: form.reason } : {}) };
    run(() => (dose ? administerDose(dose.administration_id, body) : giveAsNeeded(item.item_id, body)), `${item.medicine_name} recorded as given`);
  };
  const close = (status) => {
    if (!form.reason.trim()) return toast.error(`Enter a reason for the ${status === 'REFUSED' ? 'refusal' : 'missed dose'}`);
    run(() => (status === 'REFUSED' ? refuseDose : missDose)(dose.administration_id, { reason: form.reason }), `Dose recorded as ${status.toLowerCase()}`);
  };
  const check = (key, label) => (
    <label style={{ display: 'flex', gap: '8px', alignItems: 'center', margin: '4px 0' }}>
      <input type="checkbox" name={`right-${key}`} checked={checks[key]} onChange={e => setChecks({ ...checks, [key]: e.target.checked })} /> {label}
    </label>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 1000 }}>
      <form onSubmit={give} style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', width: '100%', maxWidth: '520px', maxHeight: '92vh', overflowY: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>{dose ? 'Give scheduled dose' : 'Record as-needed dose'}</h2>
        <div style={{ padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: '6px', marginBottom: '12px' }}>
          <div><strong>{patient.name}</strong> · {mrnOf(patient.patient_id)}</div>
          <div><strong>{item.medicine_name}</strong> · {item.dosage} · {item.route || 'route not set'}</div>
          {dose && <div style={{ color: overdue ? 'var(--danger)' : 'inherit' }}>Due {dose.scheduled_ist}{overdue ? ' — OVERDUE' : ''}</div>}
        </div>
        <label style={{ display: 'block', fontWeight: 'bold' }}>Right patient: scan or type the wristband MRN</label>
        <input name="mrn" required autoFocus value={form.mrn} onChange={e => setForm({ ...form, mrn: e.target.value })} placeholder="MRN-000000" style={{ width: '100%', padding: '8px', boxSizing: 'border-box', marginBottom: '10px' }} />
        {check('drug', `Right drug: ${item.medicine_name}`)}
        {check('dose', `Right dose: ${item.dosage}`)}
        {check('route', `Right route: ${item.route || 'as prescribed'}`)}
        {check('time', dose ? `Right time: due ${dose.scheduled_ist}` : 'Right time: an as-needed dose is indicated now')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
          <label>Dose given<input name="dose_given" required value={form.dose_given} onChange={e => setForm({ ...form, dose_given: e.target.value })} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></label>
          <label>Route
            <select name="route_given" required value={form.route_given} onChange={e => setForm({ ...form, route_given: e.target.value })} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}>
              <option value="">Select…</option>{ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: 'block', marginTop: '10px' }}>Reason {needsReason ? <strong>(required{dose ? ': more than 60 minutes late' : ''})</strong> : '(needed to refuse or mark missed)'}
          <textarea name="reason" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows="2" maxLength={255} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ padding: '8px 14px' }}>Cancel</button>
          {dose && <button type="button" disabled={busy} onClick={() => close('REFUSED')} style={{ padding: '8px 14px', background: '#d97706', color: 'white', border: 'none', borderRadius: '4px' }}>Patient refused</button>}
          {dose && due && <button type="button" disabled={busy} onClick={() => close('MISSED')} style={{ padding: '8px 14px', background: 'var(--text-secondary)', color: 'white', border: 'none', borderRadius: '4px' }}>Mark missed</button>}
          <button type="submit" disabled={busy || !allChecked || (needsReason && !form.reason.trim())} style={{ padding: '8px 14px', background: 'var(--success)', color: 'white', border: 'none', borderRadius: '4px', opacity: allChecked ? 1 : 0.6 }}>Confirm given</button>
        </div>
      </form>
    </div>
  );
}
