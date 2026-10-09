import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    if (error.response?.status === 403) {
      // Permission is enforced by the server; tell the user why, once per distinct reason.
      const message = error.response.data?.message || 'You do not have access to this.';
      toast.error(message, { id: `forbidden:${message}` });
    }
    return Promise.reject(error);
  }
);

export const isForbidden = (error) => error?.response?.status === 403;

// Auth
export const login = (credentials) => api.post('/auth/login', credentials);
export const getMe = () => api.get('/auth/me');

// Dashboard
export const getDashboardStats = () => api.get('/dashboard/stats');

// Patients
export const getPatients = (params) => api.get('/patients', { params });
export const getPatient = (id) => api.get(`/patients/${id}`);
export const createPatient = (data) => api.post('/patients', data);
export const updatePatient = (id, data) => api.put(`/patients/${id}`, data);
export const getPatientHistory = (id) => api.get(`/patients/${id}/history`);
export const getPatientAdmissions = (id) => api.get(`/patients/${id}/admissions`);
export const getPatientAppointments = (id) => api.get(`/patients/${id}/appointments`);

// Doctors
export const getDoctors = (params) => api.get('/doctors', { params });
export const getDoctor = (id) => api.get(`/doctors/${id}`);
export const createDoctor = (data) => api.post('/doctors', data);
export const getAvailableDoctors = (params) => api.get('/doctors/available', { params });
export const updateDoctorStatus = (id, status) => api.put(`/doctors/${id}/status`, { status });
export const getDoctorAnalytics = () => api.get('/doctors/me/analytics');

// Departments
export const getDepartments = () => api.get('/departments');

// Beds
export const getBeds = (params) => api.get('/beds', { params });
export const getAvailableBeds = (params) => api.get('/beds/available', { params });
export const getBedSummary = () => api.get('/beds/summary');
export const updateBedStatus = (id, status) => api.put(`/beds/${id}/status`, { status });

// Ambulances
export const getAmbulances = () => api.get('/ambulances');
export const updateAmbulanceStatus = (id, status) => api.put(`/ambulances/${id}/status`, { status });
export const reportEmergency = (id, data) => api.post(`/ambulances/${id}/report-emergency`, data);

// Emergency
export const createEmergency = (data) => api.post('/emergency', data);
export const getEmergencies = () => api.get('/emergency');
export const getEmergencyQueue = () => api.get('/emergency/queue');
export const allocateEmergency = (id) => api.post(`/emergency/${id}/allocate`);

// Appointments
export const getAppointments = (params) => api.get('/appointments', { params });
export const createAppointment = (data) => api.post('/appointments', data);
export const updateAppointmentStatus = (id, status) => api.put(`/appointments/${id}/status`, { status });

// Admissions
export const getAdmissions = (params) => api.get('/admissions', { params });
export const getCurrentAdmissions = () => api.get('/admissions/current');
export const createAdmission = (data) => api.post('/admissions', data);
export const dischargePatient = (id) => api.post(`/admissions/${id}/discharge`);

// Consultations
export const createConsultation = (data) => api.post('/consultations', data);

// Prescriptions
export const getPrescriptions = () => api.get('/prescriptions');
export const createPrescription = (data) => api.post('/prescriptions', data);
export const dispensePrescription = (id) => api.post(`/prescriptions/${id}/dispense`);
export const getPrescription = (id) => api.get(`/prescriptions/${id}`);
export const updateMedicineStock = (id, data) => api.post(`/medicines/${id}/stock`, data);

// Lab
export const getLabTests = () => api.get('/lab/tests');
export const createLabOrder = (data) => api.post('/lab/orders', data);
export const getLabOrders = (params) => api.get('/lab/orders', { params });
export const updateLabOrderStatus = (id, status) => api.put(`/lab/orders/${id}/status`, { status });
export const addLabResult = (data) => api.post('/lab/results', data);
export const getLabResult = (orderId) => api.get(`/lab/results/${orderId}`);
export const downloadLabReport = (id) => api.get(`/lab/attachments/${id}`, { responseType: 'blob' });
export const downloadLabResultReport = (resultId, attachmentId) => api.get(`/lab/reports/${resultId}/download`, { params: attachmentId ? { attachment_id: attachmentId } : {}, responseType: 'blob' });
export const uploadLabReport = (orderId, data) => api.post(`/lab/results/${orderId}/attachments`, data, { headers: { 'Content-Type': 'multipart/form-data' } });

// Staff accounts (admin)
export const getUsers = () => api.get('/users');
export const registerUser = (data) => api.post('/auth/register', data);
export const deactivateUser = (id) => api.put(`/users/${id}/deactivate`);
export const reactivateUser = (id) => api.put(`/users/${id}/reactivate`);

// Nursing
export const getNurseStation = () => api.get('/nurse/station');
export const getNurseAssignments = () => api.get('/nurse-assignments');
export const createNurseAssignment = (data) => api.post('/nurse-assignments', data);
export const endNurseAssignment = (id, data = {}) => api.put(`/nurse-assignments/${id}`, data);
export const getWards = () => api.get('/wards');

// Encounters
export const getEncounterQueue = () => api.get('/encounters/queue');
export const checkInAppointment = (appointmentId) => api.post('/encounters', { appointment_id: appointmentId });
export const encounterAction = (encounterId, action) => api.post(`/encounters/${encounterId}/${action}`);

// Surgery
export const createSurgeryRequest = (data) => api.post('/surgery', data);

// Billing
export const getBills = (params) => api.get('/bills', { params });
export const getBill = (id) => api.get(`/bills/${id}`);
export const createBill = (data) => api.post('/bills', data);
export const addBillItem = (billId, data) => api.post(`/bills/${billId}/items`, data);
export const payBill = (id, data) => api.put(`/bills/${id}/pay`, data);
export const generateBill = (admissionId) => api.post(`/bills/generate/${admissionId}`);

export default {
  login, getMe, getDashboardStats,
  getPatients, getPatient, createPatient, updatePatient, getPatientHistory,
  getDoctors, getDoctor, createDoctor, getAvailableDoctors, updateDoctorStatus, getDoctorAnalytics,
  getDepartments,
  getBeds, getAvailableBeds, getBedSummary, updateBedStatus,
  getAmbulances, updateAmbulanceStatus, reportEmergency,
  createEmergency, getEmergencies, getEmergencyQueue, allocateEmergency,
  getAppointments, createAppointment, updateAppointmentStatus,
  getAdmissions, getCurrentAdmissions, createAdmission, dischargePatient,
  createConsultation,
  getPrescriptions, createPrescription, dispensePrescription, getPrescription, updateMedicineStock,
  getLabTests, createLabOrder, getLabOrders, updateLabOrderStatus, addLabResult, getLabResult, uploadLabReport, downloadLabReport, downloadLabResultReport,
  getEncounterQueue, checkInAppointment, encounterAction,
  getUsers, registerUser, deactivateUser, reactivateUser,
  getNurseStation, getNurseAssignments, createNurseAssignment, endNurseAssignment, getWards,
  getPatientAdmissions, getPatientAppointments,
  createSurgeryRequest,
  getBills, getBill, createBill, addBillItem, payBill, generateBill
};
export const getMedicines = () => api.get('/medicines');
