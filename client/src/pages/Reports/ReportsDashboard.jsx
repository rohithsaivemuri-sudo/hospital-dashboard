import React, { useState, useEffect } from 'react';
import { FaChartBar, FaUsers, FaBed, FaStethoscope } from 'react-icons/fa';
import api from '../../services/api';

export default function ReportsDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.getDashboardStats();
        if (res.data && res.data.success) {
          setStats(res.data.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Loading reports...</div>;
  }

  if (!stats) {
    return <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Failed to load reports.</div>;
  }

  const statCards = [
    { label: 'Total Patients', value: stats.totalPatients || 0, icon: <FaUsers size={24} />, color: 'var(--primary)' },
    { label: 'Active Admissions', value: stats.currentAdmissions || 0, icon: <FaBed size={24} />, color: 'var(--warning)' },
    { label: 'Doctors On Duty', value: stats.availableDoctors || 0, icon: <FaStethoscope size={24} />, color: 'var(--success)' },
    { label: 'Occupied Beds', value: stats.occupiedBeds || 0, icon: <FaChartBar size={24} />, color: 'var(--danger)' },
  ];

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>
        <FaChartBar style={{ marginRight: '8px' }} />
        Reports & Analytics
      </h1>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '24px',
        marginBottom: '24px'
      }}>
        {statCards.map((stat, idx) => (
          <div key={idx} style={{ 
            backgroundColor: 'var(--bg-card)', 
            padding: '24px', 
            borderRadius: 'var(--radius)', 
            boxShadow: 'var(--shadow)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ 
              backgroundColor: `${stat.color}20`, 
              color: stat.color, 
              padding: '16px', 
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '4px' }}>{stat.label}</div>
              <div style={{ color: 'var(--text-primary)', fontSize: '24px', fontWeight: 'bold' }}>{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>Hospital Occupancy Trend</h2>
        <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', borderRadius: 'var(--radius)', border: '1px dashed var(--border)', flexDirection: 'column' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '18px' }}>Current Occupancy: {stats.hospitalOccupancy ? stats.hospitalOccupancy.toFixed(1) : 0}%</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>Based on {stats.totalPatients || 0} registered patients and {stats.occupiedBeds || 0} occupied beds.</p>
        </div>
      </div>
    </div>
  );
}
