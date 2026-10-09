import React from 'react';

export default function Header() {
  return (
    <header style={{ background: 'var(--bg-card)', height: '60px', display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <h2>Hospital Management System</h2>
    </header>
  );
}
