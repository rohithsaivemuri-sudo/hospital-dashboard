import React, { useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FaUsersCog, FaUserPlus } from 'react-icons/fa';
import { AuthContext } from '../../context/AuthContext';
import { getUsers, registerUser, deactivateUser, reactivateUser, getDepartments, isForbidden } from '../../services/api';
import AccessDenied from '../../components/AccessDenied';

const ROLES = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LABORATORY', 'PHARMACY'];
const EMPTY = { username: '', password: '', role: 'RECEPTIONIST', full_name: '', email: '', phone: '', department_id: '', specialization: '', shift: 'MORNING', max_workload: 5 };
const card = { background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' };
const input = { width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', boxSizing: 'border-box' };
const cell = { padding: '10px 12px', borderBottom: '1px solid var(--border)' };

// Admin: create staff accounts and switch them on or off.
export default function StaffAccounts() {
  const { user } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [denied, setDenied] = useState(false);

  const load = async () => {
    try {
      const [u, d] = await Promise.all([getUsers(), getDepartments()]);
      setUsers(u.data.data || []);
      setDepartments(d.data.data || []);
    } catch (err) {
      if (isForbidden(err)) setDenied(true);
      else toast.error('Failed to load staff accounts');
    }
  };
  useEffect(() => { load(); }, []);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form };
      if (body.role !== 'DOCTOR') ['department_id', 'specialization', 'shift', 'max_workload'].forEach(k => delete body[k]);
      await registerUser(body);
      toast.success(`Account created for ${form.full_name}`);
      setForm(EMPTY);
      await load();
    } catch (err) {
      if (!isForbidden(err)) toast.error(err.response?.data?.message || 'Could not create the account');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (u) => {
    const deactivating = u.is_active;
    if (deactivating && !window.confirm(`Deactivate ${u.full_name}? They will be signed out and unable to log in.`)) return;
    try {
      await (deactivating ? deactivateUser(u.user_id) : reactivateUser(u.user_id));
      toast.success(`${u.full_name} ${deactivating ? 'deactivated' : 'reactivated'}`);
      await load();
    } catch (err) {
      if (!isForbidden(err)) toast.error(err.response?.data?.message || 'Could not update the account');
    }
  };

  if (denied) return <AccessDenied />;

  return (
    <div style={{ padding: '24px', display: 'grid', gap: '24px' }}>
      <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><FaUsersCog color="var(--primary)" /> Staff Accounts</h1>

      <form onSubmit={submit} style={card}>
        <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><FaUserPlus /> New account</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <label>Full name<input required name="full_name" value={form.full_name} onChange={set('full_name')} style={input} /></label>
          <label>Role
            <select name="role" value={form.role} onChange={set('role')} style={input}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
          </label>
          <label>Username<input required name="username" value={form.username} onChange={set('username')} style={input} /></label>
          <label>Temporary password<input required type="password" minLength={8} name="password" value={form.password} onChange={set('password')} style={input} /></label>
          <label>Email<input required type="email" name="email" value={form.email} onChange={set('email')} style={input} /></label>
          <label>Phone<input required name="phone" value={form.phone} onChange={set('phone')} style={input} /></label>
          {form.role === 'DOCTOR' && <>
            <label>Department
              <select required name="department_id" value={form.department_id} onChange={set('department_id')} style={input}>
                <option value="">Select…</option>
                {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
              </select>
            </label>
            <label>Specialization<input required name="specialization" value={form.specialization} onChange={set('specialization')} style={input} /></label>
            <label>Shift
              <select name="shift" value={form.shift} onChange={set('shift')} style={input}>{['MORNING', 'AFTERNOON', 'NIGHT'].map(s => <option key={s}>{s}</option>)}</select>
            </label>
            <label>Max workload<input type="number" min="1" name="max_workload" value={form.max_workload} onChange={set('max_workload')} style={input} /></label>
          </>}
        </div>
        <div style={{ marginTop: '16px', textAlign: 'right' }}>
          <button type="submit" disabled={saving} style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>{saving ? 'Creating…' : 'Create account'}</button>
        </div>
      </form>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>All staff</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead><tr style={{ background: 'var(--bg-primary)' }}><th style={cell}>Name</th><th style={cell}>Username</th><th style={cell}>Role</th><th style={cell}>Email</th><th style={cell}>Status</th><th style={cell}></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id} style={{ opacity: u.is_active ? 1 : 0.6 }}>
                  <td style={cell}>{u.full_name}</td>
                  <td style={cell}>{u.username}</td>
                  <td style={cell}>{u.role}</td>
                  <td style={cell}>{u.email}</td>
                  <td style={cell}>{u.is_active ? 'Active' : 'Deactivated'}</td>
                  <td style={cell}>
                    {u.user_id !== user?.user_id && (
                      <button onClick={() => toggle(u)} style={{ padding: '4px 10px', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', background: u.is_active ? 'var(--danger)' : 'var(--success)' }}>
                        {u.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
