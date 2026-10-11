import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaClipboardList, FaSearch } from 'react-icons/fa';
import { getAuditLogs, getAuditActions, getUsers, isForbidden } from '../../services/api';
import AccessDenied from '../../components/AccessDenied';

const card = { background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' };
const input = { width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', boxSizing: 'border-box' };
const cell = { padding: '8px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
const FILTERS = ['from', 'to', 'user_id', 'action', 'patient_id', 'status_code', 'outcome'];
const PAGE_SIZE = 25;
const mrnOf = (id) => `MRN-${String(id).padStart(6, '0')}`;

// Admin: read-only view of the audit trail. Every search is itself recorded in the trail, so filters
// are applied with the Search button rather than on every keystroke.
export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(() => Object.fromEntries(FILTERS.map(f => [f, params.get(f) || ''])));
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  const page = Number(params.get('page') || 1);

  const load = async () => {
    setLoading(true);
    try {
      const query = Object.fromEntries([...FILTERS, 'page', 'until_id'].filter(f => params.get(f)).map(f => [f, params.get(f)]));
      const res = await getAuditLogs({ ...query, page_size: PAGE_SIZE });
      setRows(res.data.data || []);
      setPagination(res.data.pagination);
    } catch (err) {
      if (isForbidden(err)) setDenied(true);
      else toast.error(err.response?.data?.message || 'Failed to load the audit log');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [params]);
  useEffect(() => {
    Promise.all([getAuditActions(), getUsers()])
      .then(([a, u]) => { setActions(a.data.data || []); setUsers(u.data.data || []); })
      .catch(err => { if (isForbidden(err)) setDenied(true); });
  }, []);

  // A new search starts a new snapshot; paging keeps the snapshot so rows do not shift.
  const search = (e) => {
    e.preventDefault();
    setParams(Object.fromEntries(Object.entries(draft).filter(([, v]) => v)));
  };
  const goTo = (p) => {
    const next = Object.fromEntries(params.entries());
    setParams({ ...next, page: String(p), until_id: String(pagination.until_id) });
  };
  const clear = () => { setDraft(Object.fromEntries(FILTERS.map(f => [f, '']))); setParams({}); };
  const set = (f) => (e) => setDraft({ ...draft, [f]: e.target.value });

  if (denied) return <AccessDenied />;

  return (
    <div style={{ padding: '24px', display: 'grid', gap: '24px' }}>
      <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><FaClipboardList color="var(--primary)" /> Audit Log</h1>

      <form onSubmit={search} style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', alignItems: 'end' }}>
        <label>From<input type="date" name="from" value={draft.from} onChange={set('from')} style={input} /></label>
        <label>To<input type="date" name="to" value={draft.to} onChange={set('to')} style={input} /></label>
        <label>User
          <select name="user_id" value={draft.user_id} onChange={set('user_id')} style={input}>
            <option value="">Anyone</option>
            {users.map(u => <option key={u.user_id} value={u.user_id}>{u.full_name || u.username} ({u.role})</option>)}
          </select>
        </label>
        <label>Action
          <select name="action" value={draft.action} onChange={set('action')} style={input}>
            <option value="">Any</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>Patient<input name="patient_id" placeholder="16 or MRN-000016" value={draft.patient_id} onChange={set('patient_id')} style={input} /></label>
        <label>Status code<input name="status_code" inputMode="numeric" placeholder="e.g. 403" value={draft.status_code} onChange={set('status_code')} style={input} /></label>
        <label>Outcome
          <select name="outcome" value={draft.outcome} onChange={set('outcome')} style={input}>
            <option value="">Any</option><option value="SUCCESS">Success</option><option value="DENIED">Denied</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="submit" style={{ padding: '8px 14px', border: 'none', borderRadius: '6px', background: 'var(--primary)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><FaSearch /> Search</button>
          <button type="button" onClick={clear} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: '6px', background: 'transparent', cursor: 'pointer' }}>Clear</button>
        </div>
      </form>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span data-testid="audit-total" style={{ color: 'var(--text-secondary)' }}>
            {pagination ? `${pagination.total} entries · page ${pagination.page} of ${pagination.pages}` : ''}{loading ? ' · loading…' : ''}
          </span>
          {pagination && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button disabled={page <= 1} onClick={() => goTo(page - 1)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Previous</button>
              <button disabled={page >= pagination.pages} onClick={() => goTo(page + 1)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Next</button>
            </div>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead><tr style={{ background: 'var(--bg-primary)' }}>
              {['Time', 'User', 'Action', 'Outcome', 'Patient', 'Entity', 'Request', 'Details'].map(h => <th key={h} style={cell}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.audit_id} data-testid="audit-row">
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={cell}>{r.username || '—'}{r.role && <div style={{ color: 'var(--text-secondary)' }}>{r.role}</div>}</td>
                  <td style={cell}>{r.action}</td>
                  <td style={{ ...cell, color: r.outcome === 'DENIED' ? 'var(--danger)' : 'inherit', fontWeight: r.outcome === 'DENIED' ? 'bold' : 'normal' }}>{r.outcome}{r.status_code ? ` (${r.status_code})` : ''}</td>
                  <td style={cell}>{r.patient_id ? mrnOf(r.patient_id) : '—'}</td>
                  <td style={cell}>{r.entity_type ? `${r.entity_type}${r.entity_id ? ` #${r.entity_id}` : ''}` : '—'}</td>
                  <td style={cell}>{r.method} {r.path}<div style={{ color: 'var(--text-secondary)' }}>{r.ip_address}</div></td>
                  <td style={{ ...cell, fontFamily: 'monospace', fontSize: '12px', maxWidth: '280px', wordBreak: 'break-word' }}>{r.details ? JSON.stringify(r.details) : ''}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan="8" style={{ ...cell, textAlign: 'center' }}>No entries match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
