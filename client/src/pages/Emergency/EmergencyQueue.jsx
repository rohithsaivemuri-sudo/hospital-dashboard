import React, { useState, useEffect, useContext } from 'react';
import { getEmergencyQueue, allocateEmergency } from '../../services/api';
import { SocketContext } from '../../context/SocketContext';
import toast from 'react-hot-toast';

export default function EmergencyQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const socket = useContext(SocketContext);

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

    socket.on('emergency:queue_updated', handleQueueUpdate);
    socket.on('emergency:new', () => {
      toast.error('New Emergency Patient Arrived!', { icon: '🚨' });
      fetchQueue();
    });

    return () => {
      socket.off('emergency:queue_updated', handleQueueUpdate);
      socket.off('emergency:new');
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
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>{patient.patient_name || 'Unknown Patient'}</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{patient.symptoms || 'None specified'}</td>
                  <td style={{ padding: '16px 24px' }}>{getSeverityBadge(patient.severity)}</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>
                    {patient.arrival_time ? new Date(patient.arrival_time).toLocaleTimeString() : 'N/A'}
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <button
                      onClick={() => handleAllocate(patient.emergency_id)}
                      disabled={processingId === patient.emergency_id}
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
