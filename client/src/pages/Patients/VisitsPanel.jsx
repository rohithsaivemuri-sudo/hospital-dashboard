import React from 'react';
import { useVitals } from './VitalsPanel';
import { visitStatus } from '../../utils/labels';

// Visits tab: every visit (open ones first), each with its notes, vitals, lab orders and
// prescriptions. Records written before visits existed are listed under "Not linked to a visit".

const OPEN = ['ARRIVED', 'TRIAGED', 'IN_PROGRESS'];
const TYPE = { OUTPATIENT: 'Outpatient', INPATIENT: 'Inpatient', EMERGENCY: 'Emergency' };
const when = (t) => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null);
const box = { background: 'var(--bg-secondary, #f8fafc)', padding: '16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid var(--border)' };
const heading = { margin: '12px 0 4px', fontSize: '0.95rem' };

function Records({ notes, vitals, labs, prescriptions, definitions }) {
  return (
    <>
      <h4 style={heading}>Notes ({notes.length})</h4>
      {notes.length ? notes.map(c => (
        <div key={c.consultation_id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{when(c.consultation_time)}</div>
          <div><strong>Reason/Symptoms:</strong> {c.symptoms}</div>
          <div><strong>Diagnosis:</strong> {c.diagnosis}</div>
          {c.assessment && <div><strong>Assessment:</strong> {c.assessment}</div>}
          {c.plan && <div><strong>Plan:</strong> {c.plan}</div>}
          {c.notes && <div><strong>Notes:</strong> {c.notes}</div>}
        </div>
      )) : <div style={{ color: 'var(--text-secondary)' }}>None</div>}

      <h4 style={heading}>Vitals ({vitals.length})</h4>
      {vitals.length ? vitals.map(v => (
        <div key={v.vital_id} style={{ padding: '4px 0' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{when(v.recorded_at)} · {v.recorded_by_name}: </span>
          {definitions.filter(d => v[d.key] != null).map(d => `${d.label} ${v[d.key]} ${d.unit}`).join(' · ')}
        </div>
      )) : <div style={{ color: 'var(--text-secondary)' }}>None</div>}

      <h4 style={heading}>Lab orders ({labs.length})</h4>
      {labs.length ? labs.map(l => (
        <div key={l.order_id} style={{ padding: '4px 0' }}>{l.test_name} · {visitStatus(l.status)} · ordered {when(l.order_date)}</div>
      )) : <div style={{ color: 'var(--text-secondary)' }}>None</div>}

      <h4 style={heading}>Prescriptions ({prescriptions.length})</h4>
      {prescriptions.length ? prescriptions.map(p => (
        <div key={p.prescription_id} style={{ padding: '4px 0' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Prescription #{p.prescription_id} · {visitStatus(p.status)} · {when(p.prescription_date)}</div>
          <div style={{ whiteSpace: 'pre-line' }}>{p.medication_details}</div>
        </div>
      )) : <div style={{ color: 'var(--text-secondary)' }}>None</div>}
    </>
  );
}

export default function VisitsPanel({ patientId, history, noteButton }) {
  const { data: vitalsData } = useVitals(patientId);
  const readings = vitalsData?.readings || [];
  const definitions = vitalsData?.definitions || [];
  const encounters = [...(history.encounters || [])].sort((a, b) => (OPEN.includes(b.status) - OPEN.includes(a.status)));
  const ids = new Set(encounters.map(e => e.encounter_id));
  // Orders filed under an admission (no visit) belong to the admission, not to the unlinked group.
  const of = (list, id) => (list || []).filter(r => (id == null ? !ids.has(r.encounter_id) && r.admission_id == null : r.encounter_id === id));
  const records = (id) => ({
    notes: of(history.consultations, id), labs: of(history.labs, id), prescriptions: of(history.prescriptions, id),
    // A reading taken on the ward belongs to the admission, not to an unlinked group.
    vitals: id == null ? readings.filter(v => !ids.has(v.encounter_id) && v.admission_id == null) : readings.filter(v => v.encounter_id === id),
    definitions,
  });
  const unlinked = records(null);
  const hasUnlinked = unlinked.notes.length + unlinked.labs.length + unlinked.prescriptions.length + unlinked.vitals.length > 0;

  return (
    <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Visits</h2>
        {noteButton}
      </div>
      {encounters.length === 0 && !hasUnlinked && <p>No visits yet.</p>}
      {encounters.map(e => {
        const open = OPEN.includes(e.status);
        const times = [['Arrived', e.arrived_at], ['Triaged', e.triaged_at], ['Started', e.start_timestamp], ['Ended', e.end_timestamp]].filter(([, t]) => t);
        return (
          <div key={e.encounter_id} data-testid="visit-card" data-encounter={e.encounter_id} style={{ ...box, marginTop: '16px', borderLeft: open ? '4px solid var(--primary)' : box.border }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'baseline' }}>
              {open && <strong style={{ color: 'var(--primary)' }}>Current visit</strong>}
              <strong>{visitStatus(e.status)}</strong>
              <span>{TYPE[e.encounter_type] || visitStatus(e.encounter_type)}</span>
              <span>{e.doctor_name}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {times.map(([label, t]) => <span key={label}>{label} {when(t)}</span>)}
            </div>
            <Records {...records(e.encounter_id)} />
          </div>
        );
      })}
      {hasUnlinked && (
        <div data-testid="visit-card-unlinked" style={{ ...box, marginTop: '16px' }}>
          <strong>Not linked to a visit</strong>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Records written before visits were tracked.</div>
          <Records {...unlinked} />
        </div>
      )}
    </div>
  );
}
