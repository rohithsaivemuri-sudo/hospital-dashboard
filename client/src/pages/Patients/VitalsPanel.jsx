import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getPatientVitals, recordVitals, isForbidden } from '../../services/api';

// Vitals flowsheet (report Section K-10): an entry form for nurses and one trend chart per vital,
// with readings outside the adult reference range in red. Doctors see the charts read-only.
// Limits and reference ranges come from the server (server/utils/vitals.js).

const card = { background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' };
const input = { width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', boxSizing: 'border-box', fontFamily: 'inherit' };
const DANGER = 'var(--danger)';

const isAbnormal = (def, value) => value != null && value !== '' && (Number(value) < def.normalLow || Number(value) > def.normalHigh);
const isImpossible = (def, value) => value !== '' && value != null && (Number.isNaN(Number(value)) || Number(value) < def.min || Number(value) > def.max);

export function useVitals(patientId) {
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  const load = async () => {
    try {
      const res = await getPatientVitals(patientId);
      setData(res.data.data);
    } catch (err) {
      if (isForbidden(err)) setDenied(true);
      else toast.error('Failed to load vitals');
    }
  };
  useEffect(() => { if (patientId) load(); }, [patientId]);
  return { data, denied, reload: load };
}

// Where the reading will be filed, in words.
const contextLabel = (data) => (data.open_admission
  ? `Admission · ${data.open_admission.ward_name} bed ${data.open_admission.bed_number}`
  : data.open_encounter ? `Visit with ${data.open_encounter.doctor_name} (${data.open_encounter.status.replaceAll('_', ' ')})` : null);

export function VitalsEntryForm({ patientId, data, onSaved, encounterId }) {
  const blank = Object.fromEntries(data.definitions.map(d => [d.key, '']));
  const encounter = data.open_encounter && (!encounterId || data.open_encounter.encounter_id === encounterId) ? data.open_encounter : null;
  // A visit reading is filed against the visit; otherwise against the admission (server picks the same way).
  const filedOnVisit = Boolean(encounterId || (!data.open_admission && encounter));
  const canTriage = filedOnVisit && encounter?.status === 'ARRIVED';
  const [values, setValues] = useState(blank);
  const [notes, setNotes] = useState('');
  const [markTriaged, setMarkTriaged] = useState(canTriage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const context = filedOnVisit && encounter ? `Visit with ${encounter.doctor_name} (${encounter.status.replaceAll('_', ' ')})` : contextLabel(data);
  if (!context) return <p style={{ color: 'var(--text-secondary)' }}>No open visit or admission: vitals can be recorded once the patient is checked in or admitted.</p>;

  const impossible = data.definitions.filter(d => isImpossible(d, values[d.key]));
  const bpHalf = (values.bp_systolic === '') !== (values.bp_diastolic === '');

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = { patient_id: Number(patientId), notes: notes.trim() || undefined, mark_triaged: canTriage && markTriaged };
      if (filedOnVisit && encounter) body.encounter_id = encounter.encounter_id;
      for (const d of data.definitions) if (values[d.key] !== '') body[d.key] = values[d.key];
      const res = await recordVitals(body);
      const saved = res.data.data;
      toast.success(saved.marked_triaged ? 'Vitals saved and visit marked triaged' : 'Vitals saved');
      if (saved.abnormal.length) toast(`Outside reference range: ${saved.abnormal.map(k => data.definitions.find(d => d.key === k).label).join(', ')}`, { icon: '⚠️' });
      setValues(blank); setNotes('');
      onSaved && onSaved(saved);
    } catch (err) {
      if (!isForbidden(err)) setError(err.response?.data?.message || 'Could not save vitals');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} data-testid="vitals-form" style={{ display: 'grid', gap: '12px' }}>
      <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Filed under: <strong>{context}</strong></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {data.definitions.map(d => {
          const v = values[d.key];
          const bad = isImpossible(d, v);
          const abnormal = !bad && isAbnormal(d, v);
          return (
            <label key={d.key} style={{ fontSize: '14px' }}>
              {d.label} <span style={{ color: 'var(--text-secondary)' }}>({d.unit})</span>
              <input name={d.key} type="number" inputMode="decimal" step={d.decimals ? '0.1' : '1'} value={v}
                onChange={e => setValues({ ...values, [d.key]: e.target.value })}
                style={{ ...input, borderColor: bad || abnormal ? DANGER : 'var(--border)', color: abnormal || bad ? DANGER : 'inherit', fontWeight: abnormal ? 'bold' : 'normal' }} />
              <span style={{ fontSize: '11px', color: bad ? DANGER : 'var(--text-secondary)' }}>
                {bad ? `Not possible (${d.min}–${d.max})` : `Ref ${d.normalLow}–${d.normalHigh}`}
              </span>
            </label>
          );
        })}
      </div>
      <label style={{ fontSize: '14px' }}>Notes (optional)
        <input name="notes" maxLength={255} value={notes} onChange={e => setNotes(e.target.value)} style={input} />
      </label>
      {canTriage && (
        <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '14px' }}>
          <input type="checkbox" name="mark_triaged" checked={markTriaged} onChange={e => setMarkTriaged(e.target.checked)} /> Mark the visit triaged when saving
        </label>
      )}
      {bpHalf && <div style={{ color: DANGER, fontSize: '13px' }}>Enter both systolic and diastolic blood pressure.</div>}
      {error && <div role="alert" data-testid="vitals-error" style={{ color: DANGER, fontSize: '14px' }}>{error}</div>}
      <div>
        <button type="submit" disabled={saving || impossible.length > 0 || bpHalf} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: 'var(--primary)', color: 'white', cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save vitals'}
        </button>
      </div>
    </form>
  );
}

// One small line chart: readings over time, shaded reference band, abnormal points in red.
function TrendChart({ def, readings }) {
  const points = readings.filter(r => r[def.key] != null).map(r => ({ t: new Date(r.recorded_at).getTime(), v: r[def.key], r }));
  const W = 320, H = 130, PAD = { l: 34, r: 10, t: 10, b: 20 };
  const latest = points.at(-1);
  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
      <strong style={{ fontSize: '14px' }}>{def.label}</strong>
      <span data-testid={`latest-${def.key}`} style={{ fontSize: '14px', fontWeight: 'bold', color: latest && isAbnormal(def, latest.v) ? DANGER : 'inherit' }}>
        {latest ? `${latest.v} ${def.unit}` : '—'}
      </span>
    </div>
  );
  if (!points.length) return <div data-chart={def.key} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>{header}<div style={{ height: H, display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>No readings</div></div>;

  const values = points.map(p => p.v);
  let lo = Math.min(def.normalLow, ...values), hi = Math.max(def.normalHigh, ...values);
  const span = hi - lo || 1; lo -= span * 0.1; hi += span * 0.1;
  const t0 = points[0].t, t1 = points.at(-1).t;
  const x = (t) => PAD.l + (t1 === t0 ? (W - PAD.l - PAD.r) / 2 : ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const fmt = (t) => new Date(t).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div data-chart={def.key} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
      {header}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${def.label} trend`}>
        <rect x={PAD.l} width={W - PAD.l - PAD.r} y={y(def.normalHigh)} height={Math.max(0, y(def.normalLow) - y(def.normalHigh))} fill="#22c55e" opacity="0.12" />
        {[def.normalLow, def.normalHigh].map(v => (
          <text key={v} x={PAD.l - 4} y={y(v) + 4} fontSize="10" textAnchor="end" fill="#64748b">{v}</text>
        ))}
        <polyline fill="none" stroke="#64748b" strokeWidth="1.5" points={points.map(p => `${x(p.t)},${y(p.v)}`).join(' ')} />
        {points.map(p => {
          const bad = isAbnormal(def, p.v);
          return (
            <circle key={p.r.vital_id} data-abnormal={bad ? 'true' : 'false'} cx={x(p.t)} cy={y(p.v)} r={bad ? 4.5 : 3.5} fill={bad ? '#dc2626' : '#2563eb'}>
              <title>{`${p.v} ${def.unit} · ${p.r.recorded_at_ist} · ${p.r.recorded_by_name}`}</title>
            </circle>
          );
        })}
        <text x={PAD.l} y={H - 4} fontSize="10" fill="#64748b">{fmt(t0)}</text>
        {t1 !== t0 && <text x={W - PAD.r} y={H - 4} fontSize="10" textAnchor="end" fill="#64748b">{fmt(t1)}</text>}
      </svg>
    </div>
  );
}

export default function VitalsPanel({ patientId }) {
  const { data, denied, reload } = useVitals(patientId);
  if (denied) return <div style={card}><p>You do not have access to this patient's vitals.</p></div>;
  if (!data) return <div style={card}>Loading vitals…</div>;
  const recent = [...data.readings].reverse().slice(0, 10);
  const charted = data.definitions.filter(d => d.key !== 'bp_diastolic');
  const diastolic = data.definitions.find(d => d.key === 'bp_diastolic');

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {data.can_record && (
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Record vitals</h2>
          <VitalsEntryForm patientId={patientId} data={data} onSaved={reload} />
        </div>
      )}
      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Vitals trends {!data.can_record && <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>· read-only</span>}</h2>
        <p style={{ marginTop: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>Shaded band: adult reference range. Red points are outside it.</p>
        <div data-testid="vitals-charts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {charted.map(d => <TrendChart key={d.key} def={d} readings={data.readings} />)}
          <TrendChart def={diastolic} readings={data.readings} />
        </div>
      </div>
      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Recent readings</h2>
        {recent.length === 0 ? <p>No vitals recorded yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead><tr style={{ background: 'var(--bg-primary)' }}>
                <th style={{ padding: '8px' }}>Time</th>
                {data.definitions.filter(d => d.key !== 'bp_diastolic').map(d => <th key={d.key} style={{ padding: '8px' }}>{d.key === 'bp_systolic' ? 'BP' : d.label}</th>)}
                <th style={{ padding: '8px' }}>By</th>
              </tr></thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.vital_id} data-testid="vitals-row" style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{r.recorded_at_ist}</td>
                    {data.definitions.filter(d => d.key !== 'bp_diastolic').map(d => {
                      const keys = d.key === 'bp_systolic' ? ['bp_systolic', 'bp_diastolic'] : [d.key];
                      const bad = keys.some(k => r.abnormal.includes(k));
                      const text = d.key === 'bp_systolic' ? (r.bp_systolic != null ? `${r.bp_systolic}/${r.bp_diastolic}` : '—') : (r[d.key] ?? '—');
                      return <td key={d.key} style={{ padding: '8px', color: bad ? DANGER : 'inherit', fontWeight: bad ? 'bold' : 'normal' }}>{text}</td>;
                    })}
                    <td style={{ padding: '8px' }}>{r.recorded_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
