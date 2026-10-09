import React, { useState, useEffect } from 'react';
import { getAppointments } from '../../services/api';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaCalendarAlt, FaSpinner, FaPlus } from 'react-icons/fa';

export default function AppointmentList() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const res = await getAppointments();
      if (res.data?.success) {
        setAppointments(res.data.data || []);
      } else {
        toast.error('Failed to load appointments');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error fetching appointments');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><FaSpinner className="spin" size={32} /></div>;

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <FaCalendarAlt color="var(--primary)" /> Appointments
          </h2>
          <Link to="/appointments/new" style={{ textDecoration: 'none' }}>
            <button style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaPlus /> New Appointment
            </button>
          </Link>
        </div>
        
        {appointments.length === 0 ? (
          <p>No appointments found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px' }}>Date</th>
                <th style={{ padding: '12px' }}>Time</th>
                <th style={{ padding: '12px' }}>Patient</th>
                <th style={{ padding: '12px' }}>Doctor</th>
                <th style={{ padding: '12px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((apt) => (
                <tr key={apt.appointment_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px' }}>
                    {apt.appointment_date ? new Date(apt.appointment_date).toLocaleDateString() : 'N/A'}
                  </td>
                  <td style={{ padding: '12px' }}>{apt.appointment_time}</td>
                  <td style={{ padding: '12px' }}>{apt.patient_name || apt.patient_id}</td>
                  <td style={{ padding: '12px' }}>{apt.doctor_name || apt.doctor_id}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 12px', 
                      borderRadius: '12px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      backgroundColor: apt.status === 'COMPLETED' ? 'var(--success)' : (apt.status === 'CANCELLED' ? 'var(--danger)' : 'var(--warning)'),
                      color: apt.status === 'SCHEDULED' ? '#000' : '#fff'
                    }}>
                      {apt.status || 'SCHEDULED'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
