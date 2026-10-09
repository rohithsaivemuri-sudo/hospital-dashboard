import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaConciergeBell, FaPlus, FaSearch, FaUserPlus } from 'react-icons/fa';
import { getAppointments, getEncounterQueue, getPatients, checkInAppointment, updateAppointmentStatus, isForbidden } from '../../services/api';
import AccessDenied from '../../components/AccessDenied';

const card = { background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' };
const cell = { padding: '10px 12px', borderBottom: '1px solid var(--border)' };
const btn = (color) => ({ padding: '4px 10px', borderRadius: '6px', border: 'none', background: color, color: 'white', cursor: 'pointer', marginRight: '6px', fontSize: '12px' });
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Receptionist landing page: what needs the front desk right now.
export default function FrontDesk() {
  const [appointments, setAppointments] = useState([]);
  const [visits, setVisits] = useState([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [denied, setDenied] = useState(false);

  const load = async () => {
    try {
      const [apptRes, queueRes] = await Promise.all([getAppointments({ date: todayIso() }), getEncounterQueue()]);
      setAppointments((apptRes.data.data || []).sort((a, b) => a.appointment_time.localeCompare(b.appointment_time)));
      setVisits(queueRes.data.data || []);
    } catch (err) {
      if (isForbidden(err)) setDenied(true);
      else toast.error('Failed to load the front desk');
    }
  };
  useEffect(() => { load(); }, []);

  const run = async (apt, label, fn) => {
    setBusyId(apt.appointment_id);
    try {
      await fn();
      toast.success(`${apt.patient_name}: ${label}`);
      await load();
    } catch (err) {
      if (!isForbidden(err)) toast.error(err.response?.data?.message || `Could not ${label.toLowerCase()}`);
    } finally {
      setBusyId(null);
    }
  };

  const runSearch = async (e) => {
    e.preventDefault();
    try {
      const res = await getPatients({ search, limit: 20 });
      setResults(res.data.data || []);
    } catch (err) {
      if (!isForbidden(err)) toast.error('Search failed');
    }
  };

  if (denied) return <AccessDenied />;
  const waiting = appointments.filter(a => a.status === 'BOOKED').length;

  return (
    <div style={{ padding: '24px', display: 'grid', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><FaConciergeBell color="var(--primary)" /> Front Desk</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link to="/patients/new" style={{ textDecoration: 'none' }}>
            <button style={{ ...btn('var(--success)'), padding: '8px 16px', fontSize: '14px' }}><FaUserPlus /> Register Patient</button>
          </Link>
          <Link to="/appointments/new" style={{ textDecoration: 'none' }}>
            <button style={{ ...btn('var(--primary)'), padding: '8px 16px', fontSize: '14px' }}><FaPlus /> Book Appointment</button>
          </Link>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Today's appointments <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>· {waiting} still to arrive</span></h2>
        {appointments.length === 0 ? <p>No appointments today.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr style={{ background: 'var(--bg-primary)' }}>
                <th style={cell}>Time</th><th style={cell}>Patient</th><th style={cell}>Doctor</th><th style={cell}>Status</th><th style={cell}>Visit</th><th style={cell}>Actions</th>
              </tr></thead>
              <tbody>
                {appointments.map(apt => (
                  <tr key={apt.appointment_id}>
                    <td style={cell}>{apt.appointment_time}</td>
                    <td style={cell}><Link to={`/patients/${apt.patient_id}`}>{apt.patient_name}</Link></td>
                    <td style={cell}>{apt.doctor_name}</td>
                    <td style={cell}>{apt.status}</td>
                    <td style={cell}>{apt.encounter_status ? apt.encounter_status.replace('_', ' ') : '—'}</td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      {apt.status === 'BOOKED' && <>
                        <button disabled={busyId === apt.appointment_id} style={btn('var(--primary)')} onClick={() => run(apt, 'Checked in', () => checkInAppointment(apt.appointment_id))}>Check In</button>
                        <button disabled={busyId === apt.appointment_id} style={btn('var(--text-secondary)')} onClick={() => run(apt, 'Marked no-show', () => updateAppointmentStatus(apt.appointment_id, 'NO_SHOW'))}>No-show</button>
                        <button disabled={busyId === apt.appointment_id} style={btn('var(--danger)')} onClick={() => run(apt, 'Cancelled', () => updateAppointmentStatus(apt.appointment_id, 'CANCELLED'))}>Cancel</button>
                      </>}
                      {apt.status === 'CHECKED_IN' && (
                        <button disabled={busyId === apt.appointment_id} style={btn('var(--danger)')} onClick={() => run(apt, 'Visit cancelled', () => updateAppointmentStatus(apt.appointment_id, 'CANCELLED'))}>Left without being seen</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Patients in the building</h2>
          {visits.length === 0 ? <p>No open visits.</p> : visits.map(v => (
            <div key={v.encounter_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{v.patient_name} <span style={{ color: 'var(--text-secondary)' }}>· {v.doctor_name}</span></span>
              <strong>{v.status.replace('_', ' ')}</strong>
            </div>
          ))}
        </div>
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Find a patient</h2>
          <form onSubmit={runSearch} style={{ display: 'flex', gap: '8px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Patient name" style={{ flex: 1, padding: '8px', border: '1px solid var(--border)', borderRadius: '6px' }} />
            <button type="submit" style={{ ...btn('var(--primary)'), padding: '8px 12px' }}><FaSearch /></button>
          </form>
          {results && (results.length === 0 ? <p>No matching patients.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
              {results.map(p => (
                <li key={p.patient_id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <Link to={`/patients/${p.patient_id}`}>{p.name}</Link> <span style={{ color: 'var(--text-secondary)' }}>· {p.gender} · {p.phone || 'no phone'}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
