import React, { useEffect, useState } from 'react';
import { getDoctors } from '../services/api';

const STATUS = { AVAILABLE: ['Available', 'var(--success)'], BUSY: ['Busy', '#b45309'], OFF_DUTY: ['Off duty', 'var(--text-secondary)'], ON_LEAVE: ['On leave', 'var(--text-secondary)'] };

// Choose a doctor from a list showing name, specialization, availability and workload.
// value: the selected doctor_id or ''; onChange(doctor).
export default function DoctorPicker({ value, onChange }) {
  const [doctors, setDoctors] = useState(null);
  const [filter, setFilter] = useState('');
  useEffect(() => { getDoctors().then(r => setDoctors(r.data.data || [])).catch(() => setDoctors([])); }, []);
  if (!doctors) return <p>Loading doctors...</p>;
  const f = filter.trim().toLowerCase();
  const shown = doctors.filter(d => !f || `${d.name} ${d.specialization}`.toLowerCase().includes(f));
  return (
    <div>
      <input name="doctor-filter" aria-label="Filter doctors" placeholder="Filter by name or specialization" value={filter} onChange={e => setFilter(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', boxSizing: 'border-box', marginBottom: '6px', fontFamily: 'inherit' }} />
      <div role="radiogroup" aria-label="Doctor" style={{ border: '1px solid var(--border)', borderRadius: '6px', maxHeight: '260px', overflowY: 'auto' }}>
        {shown.map(d => {
          const [label, color] = STATUS[d.status] || [String(d.status || '').replaceAll('_', ' '), 'var(--text-secondary)'];
          const full = d.current_workload >= d.max_workload;
          return (
            <label key={d.doctor_id} data-testid="doctor-option" data-doctor={d.doctor_id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '10px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: String(value) === String(d.doctor_id) ? 'var(--bg-primary)' : 'transparent' }}>
              <input type="radio" name="doctor" value={d.doctor_id} checked={String(value) === String(d.doctor_id)} onChange={() => onChange(d)} />
              <span><strong>{d.name}</strong><span style={{ color: 'var(--text-secondary)' }}> · {d.specialization}</span></span>
              <span style={{ color, fontWeight: 600, fontSize: '13px' }}>{label}</span>
              <span style={{ fontSize: '13px', color: full ? 'var(--danger)' : 'var(--text-secondary)' }}>{d.current_workload} of {d.max_workload} patients</span>
            </label>
          );
        })}
        {shown.length === 0 && <div style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>No doctors match.</div>}
      </div>
    </div>
  );
}
