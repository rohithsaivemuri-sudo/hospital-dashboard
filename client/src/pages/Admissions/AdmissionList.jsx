import React, { useState, useEffect } from 'react';
import { getAdmissions, dischargePatient } from '../../services/api';
import toast from 'react-hot-toast';
import { FaProcedures, FaSpinner, FaSignOutAlt } from 'react-icons/fa';

export default function AdmissionList() {
  const [admissions, setAdmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdmissions();
  }, []);

  const fetchAdmissions = async () => {
    try {
      setLoading(true);
      const res = await getAdmissions();
      if (res.data?.success) {
        setAdmissions(res.data.data || []);
      } else {
        toast.error('Failed to load admissions');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error fetching admissions');
    } finally {
      setLoading(false);
    }
  };

  const handleDischarge = async (id) => {
    if (!window.confirm('Are you sure you want to discharge this patient?')) return;
    
    try {
      const res = await dischargePatient(id);
      if (res.data?.success) {
        toast.success('Patient discharged successfully');
        fetchAdmissions(); // Refresh the list
      } else {
        toast.error(res.data?.message || 'Failed to discharge patient');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error discharging patient');
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><FaSpinner className="spin" size={32} /></div>;

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <FaProcedures color="var(--primary)" /> Admissions
        </h2>
        
        {admissions.length === 0 ? (
          <p>No active admissions found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px' }}>Patient</th>
                <th style={{ padding: '12px' }}>Bed Number</th>
                <th style={{ padding: '12px' }}>Admission Date</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admissions.map((adm) => (
                <tr key={adm.admission_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px' }}>{adm.patient_name || adm.patient_id}</td>
                  <td style={{ padding: '12px' }}>{adm.bed_number || adm.bed_id}</td>
                  <td style={{ padding: '12px' }}>{adm.admission_date ? new Date(adm.admission_date).toLocaleDateString() : 'N/A'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 12px', 
                      borderRadius: '12px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      backgroundColor: adm.status === 'DISCHARGED' ? 'var(--success)' : 'var(--warning)',
                      color: adm.status === 'DISCHARGED' ? 'white' : '#000'
                    }}>
                      {adm.status || 'ACTIVE'}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {adm.status !== 'DISCHARGED' && (
                      <button 
                        onClick={() => handleDischarge(adm.admission_id)}
                        style={{ 
                          backgroundColor: 'var(--primary)', 
                          color: 'white', 
                          border: 'none', 
                          padding: '6px 12px', 
                          borderRadius: '6px', 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '14px'
                        }}
                      >
                        <FaSignOutAlt /> Discharge
                      </button>
                    )}
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
