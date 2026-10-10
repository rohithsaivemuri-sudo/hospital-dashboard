import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FaUserNurse } from 'react-icons/fa';
import { getNurseAssignments, createNurseAssignment, endNurseAssignment, getUsers, getWards, isForbidden } from '../../services/api';
import AccessDenied from '../../components/AccessDenied';

const card = { background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' };
const input = { padding: '8px', border: '1px solid var(--border)', borderRadius: '6px' };
const cell = { padding: '10px 12px', borderBottom: '1px solid var(--border)' };
const day = (v) => (v ? new Date(v).toLocaleDateString() : '—');

// Admin: standing nurse-to-ward assignments. A nurse sees the patients in the wards they are
// currently assigned to.
export default function NurseAssignments() {
  const [rows, setRows] = useState([]);
  const [nurses, setNurses] = useState([]);
  const [wards, setWards] = useState([]);
  const [form, setForm] = useState({ nurse_user_id: '', ward_id: '', start_date: '' });
  const [denied, setDenied] = useState(false);

  const load = async () => {
    try {
      const [a, u, w] = await Promise.all([getNurseAssignments(), getUsers(), getWards()]);
      setRows(a.data.data || []);
      setNurses((u.data.data || []).filter(x => x.role === 'NURSE' && x.is_active));
      setWards(w.data.data || []);
    } catch (err) {
      if (isForbidden(err)) setDenied(true);
      else toast.error('Failed to load nurse assignments');
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await createNurseAssignment({ ...form, start_date: form.start_date || undefined });
      toast.success('Assignment created');
      setForm({ nurse_user_id: '', ward_id: '', start_date: '' });
      await load();
    } catch (err) {
      if (!isForbidden(err)) toast.error(err.response?.data?.message || 'Could not create the assignment');
    }
  };

  const end = async (row) => {
    if (!window.confirm(`End ${row.nurse_name}'s assignment to ${row.ward_name} today?`)) return;
    try {
      await endNurseAssignment(row.assignment_id);
      toast.success('Assignment ended');
      await load();
    } catch (err) {
      if (!isForbidden(err)) toast.error(err.response?.data?.message || 'Could not end the assignment');
    }
  };

  if (denied) return <AccessDenied />;

  return (
    <div style={{ padding: '24px', display: 'grid', gap: '24px' }}>
      <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><FaUserNurse color="var(--primary)" /> Nurse Assignments</h1>
      <form onSubmit={submit} style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid' }}>Nurse
          <select required value={form.nurse_user_id} onChange={e => setForm({ ...form, nurse_user_id: e.target.value })} style={input}>
            <option value="">Select…</option>{nurses.map(n => <option key={n.user_id} value={n.user_id}>{n.full_name}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid' }}>Ward
          <select required value={form.ward_id} onChange={e => setForm({ ...form, ward_id: e.target.value })} style={input}>
            <option value="">Select…</option>{wards.map(w => <option key={w.ward_id} value={w.ward_id}>{w.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid' }}>Starts (default today)
          <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={input} />
        </label>
        <button type="submit" style={{ padding: '9px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Assign</button>
      </form>
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr style={{ background: 'var(--bg-primary)' }}><th style={cell}>Nurse</th><th style={cell}>Ward</th><th style={cell}>From</th><th style={cell}>Until</th><th style={cell}>Status</th><th style={cell}></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.assignment_id}>
                <td style={cell}>{r.nurse_name}</td><td style={cell}>{r.ward_name}</td>
                <td style={cell}>{day(r.start_date)}</td><td style={cell}>{r.end_date ? day(r.end_date) : 'Ongoing'}</td>
                <td style={cell}>{r.is_current ? 'Current' : 'Not current'}</td>
                <td style={cell}>{r.is_current && !r.end_date && <button onClick={() => end(r)} style={{ padding: '4px 10px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>End</button>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6" style={{ padding: '16px', textAlign: 'center' }}>No assignments yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
