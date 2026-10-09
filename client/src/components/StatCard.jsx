import React from 'react';

export default function StatCard({ title, value, icon, color = 'var(--primary)' }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ fontSize: '2rem', color }}>{icon}</div>
      <div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{title}</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  );
}
