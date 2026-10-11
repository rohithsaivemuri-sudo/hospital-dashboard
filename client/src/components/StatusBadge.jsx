import React from 'react';
import { tint } from '../utils/colors';

const colors = {
  AVAILABLE: 'var(--success)',
  OCCUPIED: 'var(--danger)',
  MAINTENANCE: 'var(--warning)',
  RESERVED: 'var(--info)',
  CRITICAL: 'var(--danger)',
  STABLE: 'var(--success)'
};

export default function StatusBadge({ status }) {
  const color = colors[status] || 'var(--text-secondary)';
  return (
    <span style={{ padding: '4px 8px', borderRadius: '12px', background: tint(color, 12.5), color: color, fontSize: '0.85em', fontWeight: 'bold' }}>
      {status}
    </span>
  );
}
