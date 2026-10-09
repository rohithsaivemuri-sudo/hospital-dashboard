import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaUserNurse } from 'react-icons/fa';
import { getNurseStation, encounterAction, isForbidden } from '../../services/api';
import AccessDenied from '../../components/AccessDenied';

const card = { background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' };

// Nurse landing page: the wards this nurse covers (beds and patients) and the open visits waiting
// for triage.
export default function NurseStation() {
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const res = await getNurseStation();
      setData(res.data.data);
    } catch (err) {
      if (isForbidden(err)) setDenied(true);
      else toast.error('Failed to load the nurse station');
    }
  };
  useEffect(() => { load(); }, []);

  const triage = async (visit) => {
    setBusy(visit.encounter_id);
    try {
      await encounterAction(visit.encounter_id, 'triage');
      toast.success(`${visit.patient_name} triaged`);
      await load();
    } catch (err) {
      if (!isForbidden(err)) toast.error(err.response?.data?.message || 'Could not triage');
    } finally {
      setBusy(null);
    }
  };

  if (denied) return <AccessDenied />;
  if (!data) return <div style={{ padding: '24px' }}>Loading nurse station...</div>;

  const byWard = data.wards.map(w => ({ ...w, beds: data.beds.filter(b => b.ward_id === w.ward_id) }));
  const occupied = data.beds.filter(b => b.patient_id).length;

  return (
    <div style={{ padding: '24px', display: 'grid', gap: '24px' }}>
      <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><FaUserNurse color="var(--primary)" /> Nurse Station</h1>

      {data.wards.length === 0 ? (
        <div style={card}><p style={{ margin: 0 }}>You have no ward assignment for today. Ask an administrator to assign you to a ward.</p></div>
      ) : (
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>My wards <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>· {occupied} patients</span></h2>
          {byWard.map(w => (
            <div key={w.ward_id} style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 10px' }}>{w.ward_name}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
                {w.beds.map(b => (
                  <div key={b.bed_id} data-testid="bed-card" style={{ border: '1px solid var(--border)', borderLeft: `4px solid ${b.patient_id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '8px', padding: '10px 12px', background: b.patient_id ? 'var(--bg-card)' : 'var(--bg-primary)' }}>
                    <div style={{ fontWeight: 'bold' }}>{b.bed_number} <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', fontSize: '12px' }}>{b.bed_type}</span></div>
                    {b.patient_id ? (
                      <>
                        <Link to={`/patients/${b.patient_id}`} style={{ display: 'block', marginTop: '4px' }}>{b.patient_name}</Link>
                        <Link to={`/mar/${b.patient_id}`} data-testid="bed-mar-link" style={{ fontSize: '12px' }}>Medication record</Link>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{b.age} yrs · {b.gender} · {b.doctor_name}</div>
                        {b.allergies && <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 'bold' }}>Allergies: {b.allergies}</div>}
                      </>
                    ) : <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{b.bed_status === 'AVAILABLE' ? 'Empty' : b.bed_status}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Outpatient visits</h2>
        {data.open_visits.length === 0 ? <p>No patients waiting.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead><tr style={{ background: 'var(--bg-primary)' }}><th style={{ padding: '8px' }}>Patient</th><th style={{ padding: '8px' }}>Doctor</th><th style={{ padding: '8px' }}>Status</th><th style={{ padding: '8px' }}></th></tr></thead>
            <tbody>
              {data.open_visits.map(v => (
                <tr key={v.encounter_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px' }}><Link to={`/patients/${v.patient_id}`}>{v.patient_name}</Link></td>
                  <td style={{ padding: '8px' }}>{v.doctor_name}</td>
                  <td style={{ padding: '8px' }}>{v.status.replace('_', ' ')}</td>
                  <td style={{ padding: '8px' }}>
                    {v.status === 'ARRIVED' && <button disabled={busy === v.encounter_id} onClick={() => triage(v)} style={{ padding: '4px 10px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Mark Triaged</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
