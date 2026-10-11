import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { getEmergencyQueue, allocateEmergency, linkEmergencyPatient, getPatients } from '../../services/api';
import { AuthContext } from '../../context/AuthContext';
import { SocketContext } from '../../context/SocketContext';
import toast from 'react-hot-toast';

export default function EmergencyQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const socket = useContext(SocketContext);
  const { user } = useContext(AuthContext);
  // Linking a registered patient to a case that arrived without one (allocation needs a patient).
  const [linking, setLinking] = useState(null); // emergency_id being linked
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState(null);

  const fetchQueue = async () => {
    try {
      const response = await getEmergencyQueue();
      const data = response.data?.success ? response.data.data : response.data;
      setQueue(data || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch emergency queue');
      toast.error('Failed to load emergency queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  useEffect(() => {
    if (!socket) return;
    
    const handleQueueUpdate = () => {
      fetchQueue();
    };

    const handleNew = () => {
      toast.error('New Emergency Patient Arrived!', { icon: '🚨' });
      fetchQueue();
    };
    const QUEUE_EVENTS = ['emergency:allocated', 'emergency:no-bed', 'emergency:no-doctor', 'emergency:queue_updated'];

    socket.on('emergency:new', handleNew);
    QUEUE_EVENTS.forEach(e => socket.on(e, handleQueueUpdate));

    return () => {
      socket.off('emergency:new', handleNew);
      QUEUE_EVENTS.forEach(e => socket.off(e, handleQueueUpdate));
    };
  }, [socket]);

  const handleAllocate = async (patientId) => {
    setProcessingId(patientId);
    try {
      const res = await allocateEmergency(patientId);
      toast.success(res.data?.message || 'Patient allocated successfully');
      fetchQueue();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to allocate patient');
    } finally {
      setProcessingId(null);
    }
  };

  const findPatients = async (e) => {
    e.preventDefault();
    try {
      const res = await getPatients({ search, limit: 10 });
      setMatches(res.data.data || []);
    } catch (err) { toast.error(err.response?.data?.message || 'Search failed'); }
  };
  const link = async (emergencyId, patient) => {
    try {
      await linkEmergencyPatient(emergencyId, patient.patient_id);
      toast.success(`${patient.name} linked to the case`);
      setLinking(null); setMatches(null); setSearch('');
      fetchQueue();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not link the patient'); }
  };

  const getSeverityBadge = (level) => {
    const styles = {
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      display: 'inline-block'
    };
    
    switch (level?.toUpperCase()) {
      case 'CRITICAL':
        return <span style={{ ...styles, backgroundColor: '#ffebe9', color: 'var(--danger)' }}>Critical</span>;
      case 'HIGH':
        return <span style={{ ...styles, backgroundColor: '#fff8c5', color: 'var(--warning)' }}>High</span>;
      case 'MODERATE':
        return <span style={{ ...styles, backgroundColor: '#ddf4ff', color: 'var(--primary)' }}>Moderate</span>;
      default:
        return <span style={{ ...styles, backgroundColor: '#dafbe1', color: 'var(--success)' }}>Low</span>;
    }
  };

  if (loading) return <div style={{ padding: '24px' }}>Loading emergency queue...</div>;
  if (error) return <div style={{ padding: '24px', color: 'var(--danger)' }}>Error: {error}</div>;

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>Emergency Queue</h1>
      
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
            <tr>
              <th style={{ padding: '12px 24px', color: 'var(--text-secondary)' }}>Patient Name</th>
              <th style={{ padding: '12px 24px', color: 'var(--text-secondary)' }}>Condition</th>
              <th style={{ padding: '12px 24px', color: 'var(--text-secondary)' }}>Severity</th>
              <th style={{ padding: '12px 24px', color: 'var(--text-secondary)' }}>Arrival Time</th>
              <th style={{ padding: '12px 24px', color: 'var(--text-secondary)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No emergency patients in queue.
                </td>
              </tr>
            ) : (
              queue.map((patient) => (
                <tr key={patient.emergency_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td data-testid="emergency-patient" style={{ padding: '16px 24px', fontWeight: 500 }}>
                    {patient.patient_id ? patient.patient_name : (
                      <div>
                        <span style={{ color: 'var(--danger)' }}>Not registered</span>
                        {linking === patient.emergency_id ? (
                          <div style={{ marginTop: '8px', fontWeight: 'normal' }}>
                            <form onSubmit={findPatients} style={{ display: 'flex', gap: '6px' }}>
                              <input name="link-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Patient name" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px' }} />
                              <button type="submit" style={{ padding: '6px 10px', background: 'var(--secondary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Find</button>
                            </form>
                            {matches && (matches.length === 0 ? <div style={{ fontSize: '13px', marginTop: '6px' }}>No matching patients.</div> : (
                              <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
                                {matches.map(m => (
                                  <li key={m.patient_id} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', padding: '2px 0' }}>
                                    {m.name} · {m.gender} · {m.date_of_birth ? new Date(m.date_of_birth).toLocaleDateString() : '—'}
                                    <button type="button" onClick={() => link(patient.emergency_id, m)} style={{ padding: '2px 8px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Link</button>
                                  </li>
                                ))}
                              </ul>
                            ))}
                            {['ADMIN', 'RECEPTIONIST'].includes(user?.role) && <Link to="/patients/new" style={{ fontSize: '13px' }}>Register a new patient</Link>}
                          </div>
                        ) : (
                          <button type="button" onClick={() => { setLinking(patient.emergency_id); setMatches(null); setSearch(''); }} style={{ marginLeft: '8px', padding: '4px 10px', background: 'var(--secondary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Link patient</button>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{patient.symptoms || 'None specified'}</td>
                  <td style={{ padding: '16px 24px' }}>{getSeverityBadge(patient.severity)}</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>
                    {patient.arrival_time ? new Date(patient.arrival_time).toLocaleTimeString() : 'N/A'}
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <button
                      onClick={() => handleAllocate(patient.emergency_id)}
                      disabled={processingId === patient.emergency_id || !patient.patient_id}
                      title={patient.patient_id ? undefined : 'Link a registered patient first'}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: processingId === patient.emergency_id ? 'not-allowed' : 'pointer',
                        opacity: processingId === patient.emergency_id ? 0.7 : 1
                      }}
                    >
                      {processingId === patient.emergency_id ? 'Allocating...' : 'Allocate Bed'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
