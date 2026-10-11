import React from 'react';
import { FaLock } from 'react-icons/fa';

// Shown instead of a page's content when the server refuses access (HTTP 403).
export default function AccessDenied({ message = 'You do not have access to this page.' }) {
  return (
    <div role="alert" style={{ margin: '24px', padding: '32px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
      <FaLock size={28} color="var(--text-secondary)" />
      <h2 style={{ margin: '12px 0 8px' }}>Access denied</h2>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{message}</p>
    </div>
  );
}
