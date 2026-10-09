import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { getPatients } from '../../services/api';
import toast from 'react-hot-toast';
import { FaSearch, FaEye, FaUserInjured, FaUserPlus } from 'react-icons/fa';

export default function PatientList() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useContext(AuthContext);
  const canRegister = ['ADMIN', 'RECEPTIONIST'].includes(user?.role);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const res = await getPatients();
      if (res.data && res.data.success) {
        setPatients(res.data.data);
      } else {
        setPatients(res.data || []);
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch patients.');
      toast.error('Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.mrn?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaUserInjured color="var(--primary)" /> Patients
          </h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {canRegister && (
            <Link to="/patients/new" style={{ textDecoration: 'none' }}>
              <button style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--success)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><FaUserPlus /> Register Patient</button>
            </Link>
          )}
          <div style={{ position: 'relative', width: '300px' }}>
            <FaSearch style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              placeholder="Search by name or MRN..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 36px', border: '1px solid var(--border)', borderRadius: '6px', boxSizing: 'border-box' }}
            />
          </div>
          </div>
        </div>

        {loading ? (
          <div>Loading patients...</div>
        ) : error ? (
          <div style={{ color: 'var(--danger)' }}>{error}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px' }}>Name</th>
                <th style={{ padding: '12px' }}>Patient ID</th>
                <th style={{ padding: '12px' }}>Gender</th>
                <th style={{ padding: '12px' }}>DOB</th>
                <th style={{ padding: '12px' }}>Blood Group</th>
                <th style={{ padding: '12px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length > 0 ? filteredPatients.map(patient => (
                <tr key={patient.patient_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px' }}>{patient.name}</td>
                  <td style={{ padding: '12px' }}>{patient.patient_id}</td>
                  <td style={{ padding: '12px' }}>{patient.gender}</td>
                  <td style={{ padding: '12px' }}>
                    {patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString() : 'N/A'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 12px', 
                      borderRadius: '12px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      backgroundColor: '#f3f4f6',
                      color: 'var(--text-secondary)'
                    }}>
                      {patient.blood_group || 'N/A'}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <Link to={`/patients/${patient.patient_id}`} style={{ textDecoration: 'none' }}>
                      <button style={{ 
                        padding: '6px 12px', 
                        borderRadius: '6px', 
                        border: 'none',
                        backgroundColor: 'var(--primary)', 
                        color: 'white', 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <FaEye /> View
                      </button>
                    </Link>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No patients found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
