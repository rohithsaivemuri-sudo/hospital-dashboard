import React, { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { FaHospital, FaUserInjured, FaUserMd, FaBed, FaAmbulance, FaExclamationTriangle, FaCalendarAlt, FaFlask, FaPills, FaFileInvoiceDollar, FaChartBar, FaSignOutAlt, FaUsersCog, FaUserNurse, FaClipboardList } from 'react-icons/fa';

export default function Sidebar() {
  const { logout, user } = useContext(AuthContext);
  const location = useLocation();

  const navs = [
    { name: 'Dashboard', path: '/', icon: <FaHospital /> },
    { name: 'Emergency', path: '/emergency', icon: <FaExclamationTriangle />, roles: ['ADMIN', 'NURSE', 'RECEPTIONIST'] },
    { name: 'Patients', path: '/patients', icon: <FaUserInjured />, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] },
    { name: 'Doctors', path: '/doctors', icon: <FaUserMd />, roles: ['ADMIN', 'RECEPTIONIST'] },
    { name: 'Beds', path: '/beds', icon: <FaBed />, roles: ['ADMIN', 'NURSE', 'RECEPTIONIST'] },
    { name: 'Ambulances', path: '/ambulances', icon: <FaAmbulance />, roles: ['ADMIN', 'RECEPTIONIST'] },
    { name: 'Appointments', path: '/appointments', icon: <FaCalendarAlt />, roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST'] },
    { name: 'Admissions', path: '/admissions', icon: <FaBed />, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] },
    { name: 'Laboratory', path: '/laboratory', icon: <FaFlask />, roles: ['LABORATORY'] },
    { name: 'Pharmacy', path: '/pharmacy', icon: <FaPills />, roles: ['ADMIN', 'PHARMACY'] },
    { name: 'Billing', path: '/billing', icon: <FaFileInvoiceDollar />, roles: ['ADMIN', 'RECEPTIONIST'] },
    { name: 'Reports', path: '/reports', icon: <FaChartBar />, roles: ['ADMIN'] },
    { name: 'Staff Accounts', path: '/staff', icon: <FaUsersCog />, roles: ['ADMIN'] },
    { name: 'Nurse Assignments', path: '/nurse-assignments', icon: <FaUserNurse />, roles: ['ADMIN'] },
    { name: 'Audit Log', path: '/audit', icon: <FaClipboardList />, roles: ['ADMIN'] },
  ].filter(nav => !nav.roles || nav.roles.includes(user?.role));

  return (
    <div style={{ width: '250px', background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '20px', fontSize: '1.2rem', fontWeight: 'bold', color: 'white', borderBottom: '1px solid #334155' }}>
        Smart Hospital
      </div>
      <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
        {navs.map(nav => {
          const isActive = location.pathname === nav.path || (nav.path !== '/' && location.pathname.startsWith(nav.path));
          return (
            <Link key={nav.name} to={nav.path} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', color: isActive ? 'white' : 'var(--sidebar-text)', background: isActive ? 'var(--sidebar-active)' : 'transparent', textDecoration: 'none', gap: '10px' }}>
              {nav.icon} {nav.name}
            </Link>
          );
        })}
      </nav>
      <div style={{ padding: '20px', borderTop: '1px solid #334155' }}>
        <div style={{ marginBottom: '10px', color: 'white' }}>{user?.name}</div>
        <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'transparent', color: 'var(--sidebar-text)', border: 'none', cursor: 'pointer' }}>
          <FaSignOutAlt /> Logout
        </button>
      </div>
    </div>
  );
}
