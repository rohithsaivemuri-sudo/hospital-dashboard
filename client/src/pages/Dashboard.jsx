import React, { useState, useEffect, useContext } from 'react';
import { getDashboardStats } from '../services/api';
import { SocketContext } from '../context/SocketContext';
import { FaUserMd, FaBed, FaAmbulance, FaChartLine } from 'react-icons/fa';
import toast from 'react-hot-toast';

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
      backgroundColor: `${color}20`,
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

    const handleEmergency = (data) => {
      toast('Emergency Update: ' + (data?.message || 'New patient allocated'), { icon: '🚑' });
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
    </div>
  );
}
