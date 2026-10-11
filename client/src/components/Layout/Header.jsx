import React, { useContext } from 'react';
import ReportProblemLink from '../ReportProblemLink';
import { AuthContext } from '../../context/AuthContext';
import { staffName, roleLabel } from '../../utils/staff';

export default function Header() {
  const { user } = useContext(AuthContext);
  return (
    <header style={{ background: 'var(--bg-card)', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <h2>Hospital Management System</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {user && (
          <span data-testid="signed-in-as" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Signed in as <strong style={{ color: 'var(--text-primary)' }}>{staffName(user.full_name, user.username)}</strong> · {roleLabel(user.role)}
          </span>
        )}
        <ReportProblemLink />
      </div>
    </header>
  );
}
