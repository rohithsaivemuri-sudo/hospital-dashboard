import React, { useEffect, useState } from 'react';
import { getPatients } from '../services/api';

const mrnOf = (id) => `MRN-${String(id).padStart(6, '0')}`;
const input = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', boxSizing: 'border-box', fontFamily: 'inherit' };

// Find a patient by name, phone, MRN or ABHA (the same search as the Patients list) and pick one.
// value: the selected patient object or null; onChange(patient | null).
export default function PatientPicker({ value, onChange }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    const q = term.trim();
    if (!q) { setResults(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await getPatients({ q, limit: 8 });
        if (!cancelled) setResults(res.data.data || []);
      } catch { if (!cancelled) setResults([]); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [term]);

  if (value) {
    return (
      <div data-testid="selected-patient" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-primary)' }}>
        <span><strong>{value.name}</strong> · {mrnOf(value.patient_id)} · {value.gender} · DOB {value.date_of_birth ? new Date(value.date_of_birth).toLocaleDateString() : '—'}{value.phone ? ` · ${value.phone}` : ''}</span>
        <button type="button" onClick={() => { onChange(null); setTerm(''); }} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }}>Change</button>
      </div>
    );
  }
  return (
    <div>
      <input name="patient-search" aria-label="Find patient" placeholder="Search name, phone, MRN or ABHA" value={term} onChange={e => setTerm(e.target.value)} style={input} autoComplete="off" />
      {results && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', border: '1px solid var(--border)', borderRadius: '6px', maxHeight: '240px', overflowY: 'auto' }}>
          {results.length === 0 && <li style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>No matching patients.</li>}
          {results.map(p => (
            <li key={p.patient_id} data-testid="patient-option" data-patient={p.patient_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
              <span><strong>{p.name}</strong> · {mrnOf(p.patient_id)} · DOB {p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString() : '—'}{p.phone ? ` · ${p.phone}` : ''}</span>
              <button type="button" onClick={() => onChange(p)} style={{ padding: '4px 10px', border: 'none', borderRadius: '4px', background: 'var(--primary)', color: 'white', cursor: 'pointer' }}>Select</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
