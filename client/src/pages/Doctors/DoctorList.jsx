import React, { useState, useEffect } from 'react';
import { getDoctors, updateDoctorStatus } from '../../services/api';
import toast from 'react-hot-toast';
import { FaUserMd, FaSync } from 'react-icons/fa';

export default function DoctorList() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const res = await getDoctors();
      if (res.data && res.data.success) {
        setDoctors(res.data.data);
      } else {
        setDoctors(res.data || []);
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch doctors.');
      toast.error('Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (doctor) => {
    const docId = doctor.doctor_id;
    if (!docId) return;
    
    // Toggle between AVAILABLE and OFF_DUTY according to backend enums
    const newStatus = doctor.status === 'AVAILABLE' ? 'OFF_DUTY' : 'AVAILABLE';
    
    try {
      await updateDoctorStatus(docId, newStatus);
      toast.success(`Status updated to ${newStatus}`);
      fetchDoctors(); // Refresh from backend
    } catch (err) {
      toast.error('Failed to update status');
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaUserMd color="var(--primary)" /> Doctors
          </h2>
          <button onClick={fetchDoctors} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FaSync /> Refresh
          </button>
        </div>

        {loading ? (
          <div>Loading doctors...</div>
        ) : error ? (
          <div style={{ color: 'var(--danger)' }}>{error}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px' }}>Name</th>
                <th style={{ padding: '12px' }}>Specialization</th>
                <th style={{ padding: '12px' }}>Workload</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {doctors.length > 0 ? doctors.map(doctor => {
                const docId = doctor.doctor_id;
                const maxW = doctor.max_workload || 10;
                const curW = doctor.current_workload || 0;
                const workloadPercent = (curW / maxW) * 100;
                
                return (
                  <tr key={docId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px' }}>{doctor.name}</td>
                    <td style={{ padding: '12px' }}>{doctor.specialization}</td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{curW} / {maxW}</span>
                        <div style={{ width: '60px', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(workloadPercent, 100)}%`, height: '100%', backgroundColor: workloadPercent > 80 ? 'var(--danger)' : 'var(--primary)' }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ 
                        padding: '4px 12px', 
                        borderRadius: '12px', 
                        fontSize: '12px', 
                        fontWeight: 600,
                        backgroundColor: doctor.status === 'AVAILABLE' ? '#dcfce7' : '#fee2e2',
                        color: doctor.status === 'AVAILABLE' ? 'var(--success)' : 'var(--danger)'
                      }}>
                        {doctor.status || 'AVAILABLE'}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <button 
                        onClick={() => toggleStatus(doctor)}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'white', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Change Status
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No doctors found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
