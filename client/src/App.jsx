import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { useContext } from 'react';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DoctorDashboard from './pages/Doctors/DoctorDashboard';
import PatientList from './pages/Patients/PatientList';
import PatientDetail from './pages/Patients/PatientDetail';
import DoctorList from './pages/Doctors/DoctorList';
import DoctorForm from './pages/Doctors/DoctorForm';
import BedDashboard from './pages/Beds/BedDashboard';
import AmbulanceList from './pages/Ambulances/AmbulanceList';
import EmergencyQueue from './pages/Emergency/EmergencyQueue';
import EmergencyForm from './pages/Emergency/EmergencyForm';
import AppointmentList from './pages/Appointments/AppointmentList';
import AppointmentForm from './pages/Appointments/AppointmentForm';
import AdmissionList from './pages/Admissions/AdmissionList';
import LabDashboard from './pages/Laboratory/LabDashboard';
import PharmacyDashboard from './pages/Pharmacy/PharmacyDashboard';
import BillingDashboard from './pages/Billing/BillingDashboard';
import ReportsDashboard from './pages/Reports/ReportsDashboard';
import { Toaster } from 'react-hot-toast';

function RoleBasedDashboard() {
  const { user } = useContext(AuthContext);
  if (!user) return <Navigate to="/login" />;
  if (user.role === 'DOCTOR') {
    return <DoctorDashboard />;
  }
  if (user.role === 'LABORATORY') {
    return <LabDashboard />;
  }
  if (user.role === 'PHARMACY') {
    return <PharmacyDashboard />;
  }
  // Default for ADMIN, RECEPTIONIST, NURSE
  return <Dashboard />;
}

// Higher order component for role protection
function RoleRoute({ roles, children }) {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" />;
  }
  return children;
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<RoleBasedDashboard />} />
              
              {/* Common Routes */}
              <Route path="patients" element={<PatientList />} />
              <Route path="patients/:id" element={<PatientDetail />} />
              <Route path="appointments" element={<AppointmentList />} />
              <Route path="appointments/new" element={<AppointmentForm />} />
              
              {/* Admin / General Routes */}
              <Route path="doctors" element={<RoleRoute roles={['ADMIN', 'RECEPTIONIST']}><DoctorList /></RoleRoute>} />
              <Route path="doctors/new" element={<RoleRoute roles={['ADMIN']}><DoctorForm /></RoleRoute>} />
              <Route path="beds" element={<RoleRoute roles={['ADMIN', 'NURSE', 'RECEPTIONIST']}><BedDashboard /></RoleRoute>} />
              <Route path="ambulances" element={<RoleRoute roles={['ADMIN', 'RECEPTIONIST']}><AmbulanceList /></RoleRoute>} />
              <Route path="emergency" element={<RoleRoute roles={['ADMIN', 'NURSE', 'RECEPTIONIST']}><EmergencyQueue /></RoleRoute>} />
              <Route path="emergency/new" element={<RoleRoute roles={['ADMIN', 'RECEPTIONIST']}><EmergencyForm /></RoleRoute>} />
              <Route path="admissions" element={<RoleRoute roles={['ADMIN', 'NURSE', 'RECEPTIONIST', 'DOCTOR']}><AdmissionList /></RoleRoute>} />
              <Route path="laboratory" element={<RoleRoute roles={['ADMIN', 'LABORATORY']}><LabDashboard /></RoleRoute>} />
              <Route path="pharmacy" element={<RoleRoute roles={['ADMIN', 'PHARMACY']}><PharmacyDashboard /></RoleRoute>} />
              <Route path="billing" element={<RoleRoute roles={['ADMIN', 'RECEPTIONIST']}><BillingDashboard /></RoleRoute>} />
              <Route path="reports" element={<RoleRoute roles={['ADMIN']}><ReportsDashboard /></RoleRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
