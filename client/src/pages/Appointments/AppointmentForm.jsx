import React, { useState } from 'react';
import { createAppointment } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaCalendarPlus, FaSave } from 'react-icons/fa';
import PatientPicker from '../../components/PatientPicker';
import DoctorPicker from '../../components/DoctorPicker';

export default function AppointmentForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [patient, setPatient] = useState(null);
  const [doctor, setDoctor] = useState(null);
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    reason: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patient) return toast.error('Find and select the patient');
    if (!doctor) return toast.error('Choose a doctor');
    setLoading(true);
    try {
      const res = await createAppointment({
        patient_id: patient.patient_id,
        doctor_id: doctor.doctor_id,
        appointment_date: formData.date,
        appointment_time: formData.time,
        reason: formData.reason
      });
      if (res.data?.success) {
        toast.success('Appointment created successfully!');
        navigate('/appointments');
      } else {
        toast.error(res.data?.message || 'Failed to create appointment');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'An error occurred while saving.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', width: '100%', maxWidth: '760px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <FaCalendarPlus color="var(--primary)" /> Book Appointment
        </h2>
        
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Patient</label>
            <PatientPicker value={patient} onChange={setPatient} />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Doctor</label>
            <DoctorPicker value={doctor?.doctor_id ?? ''} onChange={setDoctor} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Date</label>
              <input 
                type="date" 
                name="date" 
                value={formData.date} 
                onChange={handleChange} 
                required
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Time</label>
              <input 
                type="time" 
                name="time" 
                value={formData.time} 
                onChange={handleChange} 
                required
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Reason for Visit</label>
            <textarea 
              name="reason" 
              value={formData.reason} 
              onChange={handleChange} 
              rows="3"
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
              style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'var(--primary)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <FaSave /> {loading ? 'Saving...' : 'Book Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
