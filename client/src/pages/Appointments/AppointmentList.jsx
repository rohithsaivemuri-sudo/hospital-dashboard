import React, { useState, useEffect, useContext } from 'react';
import { getAppointments, checkInAppointment, updateAppointmentStatus } from '../../services/api';
import { AuthContext } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaCalendarAlt, FaSpinner, FaPlus } from 'react-icons/fa';
import { appointmentStatus, visitStatus, hhmm, localIsoDate } from '../../utils/labels';

export default function AppointmentList() {
  const { user } = useContext(AuthContext);
  const isFrontDesk = ['ADMIN', 'RECEPTIONIST'].includes(user?.role);
  const [appointments, setAppointments] = useState([]);
  const [openEarlier, setOpenEarlier] = useState([]);
  const [date, setDate] = useState(localIsoDate());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    fetchAppointments();
  }, [date]);

  // The chosen day (sorted by time on the server), plus visits from earlier days never closed.
  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const [day, earlier] = await Promise.all([getAppointments({ date }), getAppointments({ open_before: localIsoDate() })]);
      setAppointments(day.data.data || []);
      setOpenEarlier(earlier.data.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Error fetching appointments');
    } finally {
      setLoading(false);
    }
  };

  // Front-desk actions. Check-in opens the visit's encounter; the server keeps both in step.
  const runAction = async (apt, label, fn) => {
    setBusyId(apt.appointment_id);
    try {
      await fn();
      toast.success(`${apt.patient_name || 'Patient'}: ${label}`);
      await fetchAppointments();
    } catch (err) {
      toast.error(err.response?.data?.message || `Could not ${label.toLowerCase()}`);
    } finally {
      setBusyId(null);
    }
  };

  const actionButton = (label, color, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: color, color: 'white', cursor: disabled ? 'wait' : 'pointer', marginRight: '6px', fontSize: '12px' }}>{label}</button>
  );

  const badge = (status) => {
    const done = status === 'COMPLETED'; const off = ['CANCELLED', 'NO_SHOW'].includes(status);
    return (
      <span style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
        backgroundColor: done ? 'var(--success)' : off ? 'var(--danger)' : 'var(--warning)', color: done || off ? '#fff' : 'var(--text-primary)' }}>
        {appointmentStatus(status)}
      </span>
    );
  };
  const actions = (apt) => (
    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
      {apt.status === 'BOOKED' && <>
        {actionButton('Check In', 'var(--primary)', () => runAction(apt, 'Checked in', () => checkInAppointment(apt.appointment_id)), busyId === apt.appointment_id)}
        {actionButton('No-show', 'var(--text-secondary)', () => runAction(apt, 'Marked no-show', () => updateAppointmentStatus(apt.appointment_id, 'NO_SHOW')), busyId === apt.appointment_id)}
        {actionButton('Cancel', 'var(--danger)', () => runAction(apt, 'Cancelled', () => updateAppointmentStatus(apt.appointment_id, 'CANCELLED')), busyId === apt.appointment_id)}
      </>}
      {apt.status === 'CHECKED_IN' && actionButton('Left without being seen', 'var(--danger)', () => runAction(apt, 'Visit cancelled', () => updateAppointmentStatus(apt.appointment_id, 'CANCELLED')), busyId === apt.appointment_id)}
    </td>
  );
  const cell = { padding: '12px' };
  const head = (cols) => <thead><tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)' }}>{cols.map(c => <th key={c} style={cell}>{c}</th>)}</tr></thead>;
  const longDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <FaCalendarAlt color="var(--primary)" /> Appointments
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>Date
              <input type="date" name="appointment-date" value={date} onChange={e => e.target.value && setDate(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px' }} />
            </label>
            <button onClick={() => setDate(localIsoDate())} disabled={date === localIsoDate()} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }}>Today</button>
            {isFrontDesk && <Link to="/appointments/new" style={{ textDecoration: 'none' }}>
              <button style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaPlus /> New Appointment
              </button>
            </Link>}
          </div>
        </div>

        {openEarlier.length > 0 && (
          <div data-testid="open-earlier" style={{ border: '1px solid var(--danger)', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--danger)', fontSize: '16px' }}>Still open from earlier days ({openEarlier.length})</h3>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-secondary)' }}>These visits were checked in on an earlier day and never closed. Finish, cancel or mark them as needed.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                {head(['Opened', 'Time', 'Patient', 'Doctor', 'Status', 'Visit', ...(isFrontDesk ? ['Actions'] : [])])}
                <tbody>
                  {openEarlier.map(apt => (
                    <tr key={apt.appointment_id} data-appointment={apt.appointment_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...cell, color: 'var(--danger)', fontWeight: 600, whiteSpace: 'nowrap' }}>Open since {longDate(apt.appointment_date)}</td>
                      <td style={cell}>{hhmm(apt.appointment_time)}</td>
                      <td style={cell}><Link to={`/patients/${apt.patient_id}`}>{apt.patient_name || apt.patient_id}</Link></td>
                      <td style={cell}>{apt.doctor_name || apt.doctor_id}</td>
                      <td style={cell}>{badge(apt.status)}</td>
                      <td style={{ ...cell, fontSize: '13px' }}>{apt.encounter_status ? visitStatus(apt.encounter_status) : '—'}</td>
                      {isFrontDesk && actions(apt)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div data-testid="appointments-day">
          <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>{date === localIsoDate() ? 'Today' : longDate(`${date}T00:00:00`)} · {appointments.length} appointment{appointments.length === 1 ? '' : 's'}</h3>
          {loading ? <div style={{ padding: '24px', textAlign: 'center' }}><FaSpinner className="spin" size={24} /></div>
            : appointments.length === 0 ? <p>No appointments on this day.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                {head(['Time', 'Patient', 'Doctor', 'Status', 'Visit', ...(isFrontDesk ? ['Actions'] : [])])}
                <tbody>
                  {appointments.map(apt => (
                    <tr key={apt.appointment_id} data-appointment={apt.appointment_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={cell}>{hhmm(apt.appointment_time)}</td>
                      <td style={cell}><Link to={`/patients/${apt.patient_id}`}>{apt.patient_name || apt.patient_id}</Link></td>
                      <td style={cell}>{apt.doctor_name || apt.doctor_id}</td>
                      <td style={cell}>{badge(apt.status)}</td>
                      <td style={{ ...cell, fontSize: '13px', color: 'var(--text-secondary)' }}>{apt.encounter_status ? visitStatus(apt.encounter_status) : '—'}</td>
                      {isFrontDesk && actions(apt)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
