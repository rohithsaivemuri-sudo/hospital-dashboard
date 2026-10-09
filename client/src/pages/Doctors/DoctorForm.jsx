import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaUserMd, FaSave, FaTimes } from 'react-icons/fa';
import api from '../../services/api';

export default function DoctorForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  
  const [formData, setFormData] = useState({
    user_id: 2, // Defaulting to an existing user for testing
    name: '',
    department_id: '',
    specialization: '',
    phone: '',
    shift: 'MORNING',
    maxWorkload: 10
  });

  useEffect(() => {
    const fetchDeps = async () => {
      try {
        const res = await api.getDepartments();
        if (res.data && res.data.success) setDepartments(res.data.data);
      } catch (err) {
        toast.error('Failed to load departments');
      }
    };
    fetchDeps();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.department_id) {
      return toast.error('Please select a department');
    }
    setLoading(true);
    try {
      await api.createDoctor({
        user_id: formData.user_id,
        name: formData.name,
        department_id: formData.department_id,
        specialization: formData.specialization,
        phone: formData.phone,
        shift: formData.shift,
        max_workload: formData.maxWorkload
      });
      toast.success('Doctor added successfully!');
      navigate('/doctors'); 
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to add doctor');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', boxSizing: 'border-box', marginTop: '4px', marginBottom: '16px' };
  const labelStyle = { display: 'block', fontWeight: 500, color: 'var(--text-primary)' };

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '32px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', width: '100%', maxWidth: '600px', height: 'fit-content' }}>
        <h2 style={{ margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <FaUserMd color="var(--primary)" /> Add New Doctor
        </h2>

        <form onSubmit={handleSubmit}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input 
              type="text" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              required 
              style={inputStyle}
              placeholder="Dr. John Doe"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Department</label>
              <select name="department_id" value={formData.department_id} onChange={handleChange} required style={inputStyle}>
                <option value="">Select Department</option>
                {departments.map(d => (
                  <option key={d.department_id} value={d.department_id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Specialization</label>
              <input 
                type="text" 
                name="specialization" 
                value={formData.specialization} 
                onChange={handleChange} 
                required 
                style={inputStyle}
                placeholder="e.g. Heart Surgeon"
              />
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input 
                type="text" 
                name="phone" 
                value={formData.phone} 
                onChange={handleChange} 
                required 
                style={inputStyle}
                placeholder="1234567890"
              />
            </div>
            <div>
              <label style={labelStyle}>System User ID</label>
              <input 
                type="number" 
                name="user_id" 
                value={formData.user_id} 
                onChange={handleChange} 
                required 
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Max Workload (Patients)</label>
              <input 
                type="number" 
                name="maxWorkload" 
                value={formData.maxWorkload} 
                onChange={handleChange} 
                required 
                min="1"
                max="50"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Shift</label>
              <select name="shift" value={formData.shift} onChange={handleChange} required style={inputStyle}>
                <option value="MORNING">Morning</option>
                <option value="AFTERNOON">Afternoon</option>
                <option value="NIGHT">Night</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button 
              type="button" 
              onClick={() => navigate(-1)}
              style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <FaTimes /> Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <FaSave /> {loading ? 'Saving...' : 'Save Doctor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
