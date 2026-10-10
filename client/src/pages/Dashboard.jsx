import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardStats } from '../services/api';
import { SocketContext } from '../context/SocketContext';
import { FaUserMd, FaBed, FaAmbulance, FaChartLine } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { tint } from '../utils/colors';

const StatCard = ({ title, value, icon, color }) => (
  <div style={{
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius)',
    padding: '24px',
    boxShadow: 'var(--shadow)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  }}>
    <div style={{
      backgroundColor: tint(color, 12.5),
      color: color,
      padding: '16px',
      borderRadius: '50%',
      fontSize: '24px',
      display: 'flex'
    }}>
      {icon}
    </div>
    <div>
      <h3 style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>{title}</h3>
      <p style={{ margin: '8px 0 0', color: 'var(--text-primary)', fontSize: '24px', fontWeight: 700 }}>{value}</p>
    </div>
  </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socket = useContext(SocketContext);

  const fetchStats = async () => {
    try {
      const response = await getDashboardStats();
      if (response.data && response.data.success) {
        setStats(response.data.data);
      } else if (response.data) {
        setStats(response.data);
      }
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch dashboard stats');
      toast.error('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleRefresh = () => {
      fetchStats();
    };

    const handleEmergency = () => {
      toast('Emergency update: a patient was allocated a bed', { icon: '🚑' });
      fetchStats();
    };

    socket.on('dashboard:refresh', handleRefresh);
    socket.on('emergency:allocated', handleEmergency);

    return () => {
      socket.off('dashboard:refresh', handleRefresh);
      socket.off('emergency:allocated', handleEmergency);
    };
  }, [socket]);

  if (loading) {
    return <div style={{ padding: '24px' }}>Loading dashboard...</div>;
  }

  if (error) {
    return <div style={{ padding: '24px', color: 'var(--danger)' }}>Error: {error}</div>;
  }

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>Hospital Dashboard</h1>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '24px'
      }}>
        <StatCard 
          title="Total Patients" 
          value={stats?.totalPatients || 0} 
          icon={<FaUserMd />} 
          color="var(--primary)" 
        />
        <StatCard 
          title="Available Beds" 
          value={stats?.availableBeds?.reduce((sum, item) => sum + item.count, 0) || 0} 
          icon={<FaBed />} 
          color="var(--success)" 
        />
        <StatCard 
          title="Emergency Queue" 
          value={stats?.emergencyQueueCount || 0} 
          icon={<FaAmbulance />} 
          color="var(--danger)" 
        />
        <StatCard 
          title="Active Admissions" 
          value={stats?.currentAdmissions || 0} 
          icon={<FaChartLine />} 
          color="var(--warning)" 
        />
      </div>

      {/* Security: requests refused (401/403) in the last 24 hours, from the audit trail. */}
      {stats?.deniedAccessLast24h !== undefined && (
        <div data-testid="denied-access" style={{ marginTop: '24px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Denied access (last 24 hours)</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: stats.deniedAccessLast24h ? 'var(--danger)' : 'var(--success)' }}>{stats.deniedAccessLast24h}</div>
          </div>
          <Link to={`/audit?outcome=DENIED&from=${(() => { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()}`}>Review in audit log</Link>
        </div>
      )}

      {/* Laboratory workload: counts only. The work queue itself belongs to laboratory staff. */}
      {stats?.labWorkload && (
        <div data-testid="lab-workload" style={{ marginTop: '24px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '24px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '18px' }}>Laboratory workload</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
            {[['Awaiting processing', stats.labWorkload.ordered, 'var(--warning)'],
              ['In progress', stats.labWorkload.processing, 'var(--primary)'],
              ['Completed today', stats.labWorkload.completedToday, 'var(--success)'],
              ['Overdue (> 24 h)', stats.labWorkload.overdue, 'var(--danger)']].map(([label, value, color]) => (
              <div key={label}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{label}</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
