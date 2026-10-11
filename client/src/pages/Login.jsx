import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';
import ReportProblemLink from '../components/ReportProblemLink';
import { isOutdated, reloadForUpdate, updateUsername, clearUpdateUsername } from '../utils/buildVersion';

export default function Login() {
  const [updatedFor] = useState(updateUsername);
  const [username, setUsername] = useState(updatedFor || '');
  const [password, setPassword] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  // A tab still running an older build reloads before anyone signs in on it.
  useEffect(() => { clearUpdateUsername(); isOutdated().then(old => { if (old) reloadForUpdate(); }); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (await isOutdated() && reloadForUpdate(username)) return;
    try {
      await login({ username, password });
      toast.success('Logged in successfully');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed'); // e.g. invalid credentials, or rate limited
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
      <div className="card" style={{ width: '400px' }}>
        <h2 style={{ marginBottom: '20px', textAlign: 'center' }}>Smart Hospital Login</h2>
        {updatedFor && <p data-testid="updated-note" role="status" style={{ marginTop: 0, textAlign: 'center' }}>The app was updated to the latest version. Please sign in again.</p>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={{ padding: '10px' }} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '10px' }} required />
          <button type="submit" className="btn btn-primary" style={{ padding: '10px' }}>Login</button>
        </form>
        <div style={{ marginTop: '16px', textAlign: 'center' }}><ReportProblemLink /></div>
      </div>
    </div>
  );
}
