import React, { useState } from 'react';
import { createEmergency } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaHospitalSymbol, FaSave } from 'react-icons/fa';

export default function EmergencyForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    patientId: '',
    severity: 'High',
    requiredSpecialization: '',
    bedType: 'ICU',
    description: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createEmergency(formData);
      if (res.data?.success) {
        toast.success('Emergency recorded successfully!');
        navigate(-1);
      } else {
        toast.error(res.data?.message || 'Failed to record emergency');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred while saving.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', width: '100%', maxWidth: '600px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', color: 'var(--danger)' }}>
          <FaHospitalSymbol /> Record Emergency
        </h2>
        
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Patient ID</label>
            <input 
              type="text" 
              name="patientId" 
              value={formData.patientId} 
              onChange={handleChange} 
              required 
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Severity</label>
            <select 
              name="severity" 
              value={formData.severity} 
              onChange={handleChange}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
            >
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Required Specialization</label>
            <input 
              type="text" 
              name="requiredSpecialization" 
              value={formData.requiredSpecialization} 
              onChange={handleChange} 
              required
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Bed Type</label>
            <select 
              name="bedType" 
              value={formData.bedType} 
              onChange={handleChange}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
            >
              <option value="ICU">ICU</option>
              <option value="General">General</option>
              <option value="Trauma">Trauma</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Description</label>
            <textarea 
              name="description" 
              value={formData.description} 
              onChange={handleChange} 
              rows="4"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
            ></textarea>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button 
              type="button" 
              onClick={() => navigate(-1)}
              style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'var(--danger)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <FaSave /> {loading ? 'Saving...' : 'Record Emergency'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
