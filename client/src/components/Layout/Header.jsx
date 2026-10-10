import React from 'react';
import ReportProblemLink from '../ReportProblemLink';

export default function Header() {
  return (
    <header style={{ background: 'var(--bg-card)', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <h2>Hospital Management System</h2>
      <ReportProblemLink />
    </header>
  );
}
