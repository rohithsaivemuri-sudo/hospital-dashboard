import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { getDoctor, getAppointments, getPatients, getDoctorAnalytics, getCurrentAdmissions, updateAppointmentStatus as putAppointmentStatus, encounterAction } from '../../services/api';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaUserMd, FaHospitalUser, FaExclamationTriangle, FaCalendarCheck, FaNotesMedical, FaUserInjured, FaBed, FaBell } from 'react-icons/fa';

export default function DoctorDashboard() {
  const { user } = useContext(AuthContext);
  const [doctor, setDoctor] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.doctor_id) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const docRes = await getDoctor(user.doctor_id);
      setDoctor(docRes.data?.data || docRes.data);

      const analyticsRes = await getDoctorAnalytics();
      setAnalytics(analyticsRes.data?.data || analyticsRes.data);
      
      // Use local date for Today string representation to avoid UTC shift
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      const apptRes = await getAppointments({ date: today });
      setAppointments(apptRes.data?.data || apptRes.data || []);

      const patRes = await getPatients();
      setPatients(patRes.data?.data || patRes.data || []);

      const admRes = await getCurrentAdmissions();
      setAdmissions(admRes.data?.data || []);

    } catch (err) {
      setError('Failed to fetch dashboard data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Visits run on the appointment's encounter (start / sign & close); the appointment status follows it.
  const updateAppointmentStatus = async (id, status) => {
    const app = appointments.find(a => a.appointment_id === id);
    try {
      if (app?.encounter_id) await encounterAction(app.encounter_id, status === 'IN_PROGRESS' ? 'start' : 'finish');
      else await putAppointmentStatus(id, status);
      toast.success(status === 'IN_PROGRESS' ? 'Visit started' : 'Visit signed and closed');
      fetchDashboardData(); // Refetch
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  if (loading) return <div style={{ padding: '24px' }}>Loading workspace...</div>;
  if (error) return <div style={{ padding: '24px', color: 'var(--danger)' }}>{error}</div>;
  if (!doctor) return <div style={{ padding: '24px' }}>Doctor profile not found.</div>;

  const todayStats = analytics?.today || { patients_seen: 0, emergency_cases: 0, appointment_patients: 0, patients_treated: 0, cases_solved: 0, cases_postponed: 0, cases_pending: 0 };
  const history = analytics?.history || [];

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>
        <FaUserMd style={{ marginRight: '8px' }} /> Welcome, {doctor.name}
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        <strong>{doctor.specialization}</strong> | Physician Workspace
      </p>
      
      {/* Top Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', borderLeft: '4px solid var(--primary)' }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}><FaHospitalUser /> Patients Seen</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>{todayStats.patients_seen}</p>
        </div>
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', borderLeft: '4px solid var(--danger)' }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}><FaExclamationTriangle /> Emergency</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>{todayStats.emergency_cases}</p>
        </div>
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', borderLeft: '4px solid var(--info)' }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}><FaCalendarCheck /> Appointments</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>{todayStats.appointment_patients}</p>
        </div>
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', borderLeft: '4px solid var(--success)' }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}><FaNotesMedical /> Treated</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>{todayStats.patients_treated}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        
        {/* TODAY'S APPOINTMENTS */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><FaCalendarCheck /> Today's Appointments</h2>
            <Link to="/appointments" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' }}>View Full Schedule</Link>
          </div>
          {appointments.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No appointments scheduled for today.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Time</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Patient</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {appointments.sort((a,b) => a.appointment_time.localeCompare(b.appointment_time)).map(app => (
                  <tr key={app.appointment_id}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{app.appointment_time}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{app.patient_name}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{app.encounter_status === 'TRIAGED' ? 'TRIAGED' : app.status}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Link to={`/patients/${app.patient_id}`} style={{ padding: '4px 8px', background: 'var(--secondary)', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>Open</Link>
                        {app.status === 'CHECKED_IN' && <button onClick={() => updateAppointmentStatus(app.appointment_id, 'IN_PROGRESS')} style={{ padding: '4px 8px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Start Visit</button>}
                        {app.status === 'IN_PROGRESS' && <button onClick={() => updateAppointmentStatus(app.appointment_id, 'COMPLETED')} style={{ padding: '4px 8px', background: 'var(--success)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign &amp; Close</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* NEEDS ATTENTION */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
          <h2 style={{ marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><FaBell color="var(--warning)" /> Needs Attention</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {appointments.filter(a => a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS').map(a => (
               <li key={`appt-${a.appointment_id}`} style={{ padding: '12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                 <span>Patient <strong>{a.patient_name}</strong> is {a.status === 'CHECKED_IN' ? 'waiting' : 'in progress'}.</span>
                 <Link to={`/patients/${a.patient_id}`}>Open Patient</Link>
               </li>
            ))}
            {admissions.length > 0 && (
               <li style={{ padding: '12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                 <span>You have {admissions.length} active admissions to round on.</span>
               </li>
            )}
            {appointments.filter(a => a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS').length === 0 && admissions.length === 0 && (
              <li style={{ color: 'var(--text-secondary)' }}>You're all caught up!</li>
            )}
          </ul>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        
        {/* MY ACTIVE ADMISSIONS */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
          <h2 style={{ marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaBed /> My Active Admissions
          </h2>
          {admissions.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No active admissions right now.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Patient</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Bed</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Admitted</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {admissions.map(adm => (
                  <tr key={adm.admission_id}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{adm.patient_name}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{adm.bed_name}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{new Date(adm.admission_date).toLocaleDateString()}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                      <Link to={`/patients/${adm.patient_id}`} style={{ padding: '4px 8px', background: 'var(--secondary)', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>Open Patient</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* MY PATIENTS */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
          <h2 style={{ marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaUserInjured /> My Patients
          </h2>
          {patients.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No patients associated with you yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Patient</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Contact</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p.patient_id}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{p.name}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{p.phone}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                      <Link to={`/patients/${p.patient_id}`} style={{ padding: '4px 8px', background: 'var(--primary)', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
                        View Patient
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {/* TODAY'S PERFORMANCE */}
      <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h2 style={{ marginTop: 0, marginBottom: '16px' }}>Today's Performance</h2>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: '0 0 4px', color: 'var(--text-secondary)' }}>Cases Solved</h4>
            <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>{todayStats.cases_solved}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px', color: 'var(--text-secondary)' }}>Pending</h4>
            <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: 'var(--warning)' }}>{todayStats.cases_pending}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px', color: 'var(--text-secondary)' }}>Cancelled</h4>
            <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: 'var(--danger)' }}>{todayStats.cases_cancelled}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px', color: 'var(--text-secondary)' }}>Postponed</h4>
            <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{todayStats.cases_postponed}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
