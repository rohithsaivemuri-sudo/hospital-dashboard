import React, { useState, useEffect, useContext } from 'react';
import { getBeds, getBedSummary } from '../../services/api';
import { SocketContext } from '../../context/SocketContext';
import { FaBed } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { tint } from '../../utils/colors';

export default function BedDashboard() {
  const [beds, setBeds] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socket = useContext(SocketContext);

  const fetchData = async () => {
    try {
      const [bedsRes, summaryRes] = await Promise.all([
        getBeds(),
        getBedSummary()
      ]);
      
      const bedsData = bedsRes.data?.success ? bedsRes.data.data : bedsRes.data;
      const rawSummary = summaryRes.data?.success ? summaryRes.data.data : summaryRes.data;
      
      const mappedSummary = { total: 0, available: 0, occupied: 0, maintenance: 0 };
      if (Array.isArray(rawSummary)) {
        rawSummary.forEach(row => {
          const count = Number(row.count) || 0;
          mappedSummary.total += count;
          if (row.status === 'AVAILABLE') mappedSummary.available += count;
          else if (row.status === 'OCCUPIED') mappedSummary.occupied += count;
          else if (row.status === 'MAINTENANCE') mappedSummary.maintenance += count;
        });
      }
      
      setBeds(bedsData || []);
      setSummary(mappedSummary);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch bed data');
      toast.error('Failed to load beds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!socket) return;
    
    // The server sends bed:updated { bedId, status } for status changes, admissions, discharges and
    // emergency allocations; the board refetches through the API.
    const handleBedUpdate = () => {
      toast.success('Bed status updated');
      fetchData();
    };

    socket.on('bed:updated', handleBedUpdate);

    return () => {
      socket.off('bed:updated', handleBedUpdate);
    };
  }, [socket]);

  const getStatusColor = (status) => {
    switch (status?.toUpperCase()) {
      case 'AVAILABLE': return 'var(--success)';
      case 'OCCUPIED': return 'var(--danger)';
      case 'MAINTENANCE': return '#b45309'; // amber dark enough to read as text on white (the yellow was 1.7:1)
      case 'CLEANING': return '#0ea5e9'; // light blue
      default: return 'var(--text-secondary)';
    }
  };

  if (loading) return <div style={{ padding: '24px' }}>Loading bed dashboard...</div>;
  if (error) return <div style={{ padding: '24px', color: 'var(--danger)' }}>Error: {error}</div>;

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>Bed Management</h1>
      
      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        {['Total', 'Available', 'Occupied', 'Maintenance'].map((type) => {
          const count = type === 'Total' 
            ? summary?.total || 0 
            : summary?.[type.toLowerCase()] || 0;
            
          const colors = {
            Total: 'var(--primary)',
            Available: 'var(--success)',
            Occupied: 'var(--danger)',
            Maintenance: 'var(--warning)'
          };

          return (
            <div key={type} style={{
              background: 'var(--bg-card)',
              padding: '16px',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow)',
              borderLeft: `4px solid ${colors[type]}`
            }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                {type} Beds
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {count}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bed Grid */}
      <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '18px', color: 'var(--text-primary)' }}>
          Ward Overview
        </h2>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          gap: '16px'
        }}>
          {beds.map((bed) => {
            const color = getStatusColor(bed.status);
            return (
              <div key={bed.bed_id} data-testid="bed-tile" data-status={bed.status} style={{
                border: `1px solid ${tint(color, 25)}`,
                backgroundColor: tint(color, 6),
                padding: '16px 8px',
                borderRadius: 'var(--radius)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'transform 0.2s'
              }}
              title={`Ward: ${bed.ward || 'General'} | Status: ${bed.status}`}
              >
                <FaBed size={24} color={color} />
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                  {bed.bed_number}
                </div>
                <div style={{ 
                  fontSize: '11px', 
                  fontWeight: 600,
                  color: color,
                  backgroundColor: tint(color, 12.5),
                  padding: '2px 6px',
                  borderRadius: '10px'
                }}>
                  {bed.status}
                </div>
              </div>
            );
          })}
          
          {beds.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
              No beds found in the system.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
