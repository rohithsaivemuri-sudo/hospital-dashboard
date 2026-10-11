import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { getPatients, isForbidden } from '../../services/api';
import toast from 'react-hot-toast';
import { FaSearch, FaEye, FaUserInjured, FaUserPlus } from 'react-icons/fa';

const PAGE_SIZE = 20;
const mrnOf = (id) => `MRN-${String(id).padStart(6, '0')}`;
const cell = { padding: '12px' };

// Patients: newest first, paged on the server, one search box for name, phone, MRN or ABHA.
// Doctors and nurses see only their own patients (the server applies the scope).
export default function PatientList() {
  const [patients, setPatients] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { user } = useContext(AuthContext);
  const canRegister = ['ADMIN', 'RECEPTIONIST'].includes(user?.role);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const t = setTimeout(() => { setQuery(searchTerm.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await getPatients({ q: query || undefined, page, limit: PAGE_SIZE });
        if (cancelled) return;
        setPatients(res.data.data || []);
        setPagination(res.data.pagination || null);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError('Failed to fetch patients.');
        if (!isForbidden(err)) toast.error('Failed to load patients');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [query, page]);

  const first = pagination && pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const last = pagination ? Math.min(pagination.total, first + patients.length - 1) : 0;
  const pageButton = { padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' };

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaUserInjured color="var(--primary)" /> Patients
          </h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {canRegister && (
              <Link to="/patients/new" style={{ textDecoration: 'none' }}>
                <button style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--success)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><FaUserPlus /> Register Patient</button>
              </Link>
            )}
            <div style={{ position: 'relative', width: '320px' }}>
              <FaSearch style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-secondary)' }} />
              <input
                type="search"
                name="patient-search"
                aria-label="Search patients"
                placeholder="Search name, phone, MRN or ABHA"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '8px 12px 8px 36px', border: '1px solid var(--border)', borderRadius: '6px', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>

        {error ? (
          <div style={{ color: 'var(--danger)' }}>{error}</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', opacity: loading ? 0.6 : 1 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
                  {['MRN', 'Name', 'Gender', 'DOB', 'Phone', 'Blood Group', 'Actions'].map(h => <th key={h} style={cell}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {patients.length > 0 ? patients.map(patient => (
                  <tr key={patient.patient_id} data-testid="patient-row" data-patient={patient.patient_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>{mrnOf(patient.patient_id)}</td>
                    <td style={cell}>{patient.name}</td>
                    <td style={cell}>{patient.gender}</td>
                    <td style={cell}>{patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString() : 'N/A'}</td>
                    <td style={cell}>{patient.phone || '—'}</td>
                    <td style={cell}>
                      <span style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#f3f4f6', color: 'var(--text-secondary)' }}>
                        {patient.blood_group || 'N/A'}
                      </span>
                    </td>
                    <td style={cell}>
                      <Link to={`/patients/${patient.patient_id}`} style={{ textDecoration: 'none' }}>
                        <button style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FaEye /> View
                        </button>
                      </Link>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="7" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {loading ? 'Loading patients...' : query ? `No patients match "${query}".` : 'No patients found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {pagination && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <span data-testid="patient-count" style={{ color: 'var(--text-secondary)' }}>
                  {pagination.total ? `Showing ${first}–${last} of ${pagination.total} patients · newest first` : 'No patients'}
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pageButton}>Previous</button>
                  <span style={{ color: 'var(--text-secondary)' }}>Page {pagination.page} of {pagination.pages}</span>
                  <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} style={pageButton}>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
