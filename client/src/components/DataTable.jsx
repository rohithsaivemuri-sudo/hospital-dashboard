import React from 'react';

export default function DataTable({ columns, data }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} style={{ borderBottom: '2px solid var(--border)', padding: '12px', textAlign: 'left', background: 'var(--bg-primary)' }}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map((c, j) => (
              <td key={j} style={{ padding: '12px' }}>{c.cell ? c.cell(row) : row[c.accessor]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
