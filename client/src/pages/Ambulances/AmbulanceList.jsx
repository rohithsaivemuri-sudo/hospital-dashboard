import React, { useState, useEffect } from 'react';
import { getAmbulances } from '../../services/api';
import toast from 'react-hot-toast';
import { FaAmbulance, FaSpinner, FaExclamationTriangle } from 'react-icons/fa';

export default function AmbulanceList() {
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAmbulances();
  }, []);

  const fetchAmbulances = async () => {
    try {
      setLoading(true);
      const res = await getAmbulances();
      if (res.data?.success) {
        setAmbulances(res.data.data || []);
      } else {
        setAmbulances(res.data || []);
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch ambulances');
      toast.error('Failed to load ambulances');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><FaSpinner className="spin" size={32} /></div>;
  }

  if (error) {
    return <div style={{ color: 'var(--danger)', padding: '20px' }}><FaExclamationTriangle /> {error}</div>;
  }

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <FaAmbulance color="var(--primary)" /> Ambulance Fleet
        </h2>
        
        {ambulances.length === 0 ? (
          <p>No ambulances found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px' }}>Vehicle Number</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Driver</th>
                <th style={{ padding: '12px' }}>Location</th>
              </tr>
            </thead>
            <tbody>
              {ambulances.map((amb) => (
                <tr key={amb.ambulance_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px' }}>{amb.vehicle_number}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 12px', 
                      borderRadius: '12px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      backgroundColor: amb.status === 'AVAILABLE' ? 'var(--success)' : 'var(--warning)',
                      color: amb.status === 'AVAILABLE' ? 'white' : 'var(--text-primary)'
                    }}>
                      {amb.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>{amb.driver_name} ({amb.driver_phone})</td>
                  <td style={{ padding: '12px' }}>{amb.current_location || 'Unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
