import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPatient, getPatientHistory, createLabOrder, getLabTests, createPrescription, getMedicines, createAdmission, getAvailableBeds, getLabResult, downloadLabResultReport, createConsultation, createSurgeryRequest, dischargePatient, encounterAction, getPatientAdmissions, getPatientAppointments, isForbidden, cancelPrescription } from '../../services/api';
import AccessDenied from '../../components/AccessDenied';
import { AuthContext } from '../../context/AuthContext';
import { formatAbha, hasAllergies, allergyLabel } from '../../utils/patientIds';
import toast from 'react-hot-toast';

const ageOf = (dob) => {
  if (!dob) return '—';
  const d = new Date(dob), now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age;
};
// Display MRN derived from the patient id (no separate MRN column yet).
const mrnOf = (id) => `MRN-${String(id).padStart(6, '0')}`;

const CLINICAL_ROLES = ['DOCTOR', 'NURSE'];
const FREQUENCY_TEXT = { OD: 'Once daily', BD: 'Twice daily', TDS: 'Three times daily', QID: 'Four times daily', Q6H: 'Every 6 hours', Q8H: 'Every 8 hours', STAT: 'Immediately, once', PRN: 'As needed' };
const ROUTES = ['ORAL', 'IV', 'IM', 'SC', 'SUBLINGUAL', 'INHALED', 'TOPICAL', 'RECTAL', 'OTHER'];
const TABS_BY_ROLE = {
  DOCTOR: ['Overview', 'Visits', 'Admissions', 'Lab Tests', 'Prescriptions', 'Surgery'],
  NURSE: ['Admissions', 'Lab Tests', 'Prescriptions', 'Appointments'],
  ADMIN: ['Appointments', 'Admissions'],
  RECEPTIONIST: ['Appointments', 'Admissions'],
};

export default function PatientDetail() {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  
  const [patient, setPatient] = useState(null);
  const [history, setHistory] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [denied, setDenied] = useState(false);
  // Chart tabs per role (report Section E): nurses do not see consultation notes or surgery requests;
  // the front desk and administrators see demographics, appointments and admissions only.
  const tabs = TABS_BY_ROLE[user?.role] || TABS_BY_ROLE.RECEPTIONIST;
  const canViewResults = ['DOCTOR', 'NURSE'].includes(user?.role);
  useEffect(() => { if (!tabs.includes(activeTab)) setActiveTab(tabs[0]); }, [user]);
  const [loading, setLoading] = useState(true);

  // Encounter form
  const [showEncounterModal, setShowEncounterModal] = useState(false);
  const [encSymptoms, setEncSymptoms] = useState('');
  const [encDiagnosis, setEncDiagnosis] = useState('');
  const [encAssessment, setEncAssessment] = useState('');
  const [encPlan, setEncPlan] = useState('');
  const [encNotes, setEncNotes] = useState('');
  const [activeAppointmentId, setActiveAppointmentId] = useState('');

  // Surgery form
  const [showSurgeryModal, setShowSurgeryModal] = useState(false);
  const [surgProc, setSurgProc] = useState('');
  const [surgDiag, setSurgDiag] = useState('');
  const [surgPriority, setSurgPriority] = useState('ROUTINE');
  const [surgDate, setSurgDate] = useState('');
  const [surgNotes, setSurgNotes] = useState('');

  // Lab form
  const [showLabModal, setShowLabModal] = useState(false);
  const [labTests, setLabTests] = useState([]);
  const [selectedTests, setSelectedTests] = useState([]);
  const [currentTestId, setCurrentTestId] = useState('');
  const [labNotes, setLabNotes] = useState('');

  // Lab result viewer
  const [labView, setLabView] = useState(null);

  // Presc form
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [medicines, setMedicines] = useState([]);
  const [prescriptionItems, setPrescriptionItems] = useState([]);
  const [prescNotes, setPrescNotes] = useState('');
  const [currentMed, setCurrentMed] = useState('');
  const [currentDosage, setCurrentDosage] = useState('');
  const [currentFreq, setCurrentFreq] = useState('');
  const [currentDuration, setCurrentDuration] = useState('');
  const [currentQty, setCurrentQty] = useState('');
  // Structured order (drives the ward medication schedule); the free-text fields stay alongside.
  const [currentCode, setCurrentCode] = useState('');
  const [currentDays, setCurrentDays] = useState('');
  const [currentRoute, setCurrentRoute] = useState('ORAL');
  const [currentUnits, setCurrentUnits] = useState('');

  // Admission form
  const [showAdmissionModal, setShowAdmissionModal] = useState(false);
  const [availableBeds, setAvailableBeds] = useState([]);
  const [selectedBedId, setSelectedBedId] = useState('');
  const [admissionDiagnosis, setAdmissionDiagnosis] = useState('');
  const [admissionNotes, setAdmissionNotes] = useState('');
  const [admitting, setAdmitting] = useState(false);
  const [admitError, setAdmitError] = useState(null);

  useEffect(() => {
    fetchPatientData();
    if (user?.role === 'DOCTOR') {
      fetchDropdowns();
    }
  }, [id, user]);

  const fetchPatientData = async () => {
    try {
      setLoading(true);
      if (CLINICAL_ROLES.includes(user?.role)) {
        const [patientRes, historyRes] = await Promise.all([
          getPatient(id),
          getPatientHistory(id)
        ]);
        setPatient(patientRes.data.success ? patientRes.data.data : (patientRes.data || {}));
        setHistory(historyRes.data.success ? historyRes.data.data : (historyRes.data || { admissions: [], appointments: [], labs: [], prescriptions: [], consultations: [], surgeries: [] }));
      } else {
        // Front desk and administrators: demographics, appointments and admissions only.
        const [patientRes, admRes, apptRes] = await Promise.all([getPatient(id), getPatientAdmissions(id), getPatientAppointments(id)]);
        setPatient(patientRes.data.data);
        setHistory({ admissions: admRes.data.data || [], appointments: apptRes.data.data || [], labs: [], prescriptions: [], consultations: [], surgeries: [], encounters: [] });
      }
      setDenied(false);
    } catch (err) {
      if (isForbidden(err)) setDenied(true);
      else toast.error('Failed to load patient details');
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdowns = async () => {
    try {
      const [testsRes, medsRes] = await Promise.all([getLabTests(), getMedicines()]);
      setLabTests(testsRes.data?.data || testsRes.data || []);
      setMedicines(medsRes.data?.data || medsRes.data || []);
    } catch (e) { console.error("Dropdowns failed"); }
  };

  // --- Handlers ---
  const handleCreateEncounter = async (e) => {
    e.preventDefault();
    try {
      await createConsultation({
        appointment_id: activeAppointmentId || null,
        patient_id: id,
        doctor_id: user.doctor_id,
        symptoms: encSymptoms,
        diagnosis: encDiagnosis,
        assessment: encAssessment,
        plan: encPlan,
        notes: encNotes
      });
      toast.success('Encounter saved successfully');
      setShowEncounterModal(false);
      setEncSymptoms(''); setEncDiagnosis(''); setEncAssessment(''); setEncPlan(''); setEncNotes(''); setActiveAppointmentId('');
      fetchPatientData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save encounter'); }
  };

  const handleRequestSurgery = async (e) => {
    e.preventDefault();
    try {
      await createSurgeryRequest({
        patient_id: id,
        doctor_id: user.doctor_id,
        procedure_name: surgProc,
        diagnosis: surgDiag,
        priority: surgPriority,
        requested_date: surgDate,
        notes: surgNotes
      });
      toast.success('Surgery requested successfully');
      setShowSurgeryModal(false);
      setSurgProc(''); setSurgDiag(''); setSurgDate(''); setSurgNotes(''); setSurgPriority('ROUTINE');
      fetchPatientData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to request surgery'); }
  };

  const handleDischarge = async (admissionId) => {
    try {
      await dischargePatient(admissionId);
      toast.success('Patient discharged successfully');
      fetchPatientData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to discharge'); }
  };

  const openLabResult = async (order) => {
    try {
      const res = await getLabResult(order.order_id);
      setLabView({ ...res.data.data, test_name: order.test_name });
    } catch (err) { toast.error(err.response?.data?.message || 'Unable to load lab result'); }
  };

  // Reports are fetched as an authenticated blob and opened from a local object URL, never a public link.
  const viewLabReport = async (resultId, attachment) => {
    const tab = window.open('', '_blank');
    try {
      const res = await downloadLabResultReport(resultId, attachment.attachment_id);
      const url = URL.createObjectURL(new Blob([res.data], { type: attachment.mime_type }));
      if (tab) tab.location.href = url;
      else {
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.original_filename;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      if (tab) tab.close();
      let message = null;
      if (err.response?.data instanceof Blob) {
        try { message = JSON.parse(await err.response.data.text()).message; } catch { /* not JSON */ }
      }
      toast.error(message || 'Unable to open report');
    }
  };

  const openAdmissionModal = async () => {
    setAdmitError(null);
    try {
      const response = await getAvailableBeds();
      const beds = response.data?.success ? response.data.data : response.data;
      setAvailableBeds(beds || []);
      setSelectedBedId('');
      setShowAdmissionModal(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load available beds');
    }
  };

  const handleCreateAdmission = async (e) => {
    e.preventDefault();
    if (!selectedBedId) return toast.error('Please select an available bed');

    try {
      setAdmitting(true);
      setAdmitError(null);
      const response = await createAdmission({
        patient_id: Number(id),
        doctor_id: user.doctor_id,
        bed_id: Number(selectedBedId),
        diagnosis: admissionDiagnosis,
        notes: admissionNotes
      });
      if (!response.data?.success) throw new Error(response.data?.message || 'Failed to admit patient');

      toast.success('Patient admitted successfully');
      setShowAdmissionModal(false);
      setAdmissionDiagnosis('');
      setAdmissionNotes('');
      await fetchPatientData();
      setActiveTab('Admissions');
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to admit patient';
      // Keep the form open and say why (e.g. the doctor is at maximum workload).
      setAdmitError(message);
      toast.error(message);
    } finally {
      setAdmitting(false);
    }
  };

  // Lab Handlers
  const handleAddTest = () => {
    if (!currentTestId) return;
    const testObj = labTests.find(t => t.test_id == currentTestId);
    if(selectedTests.find(t => t.test_id == currentTestId)) return toast.error("Test already added");
    setSelectedTests([...selectedTests, { test_id: currentTestId, name: testObj?.name }]);
    setCurrentTestId('');
  };
  const handleOrderLab = async (e) => {
    e.preventDefault();
    if (selectedTests.length === 0) return toast.error("Add at least one test");
    try {
      await createLabOrder({ patient_id: id, doctor_id: user.doctor_id, tests: selectedTests.map(t => ({ test_id: t.test_id })), notes: labNotes });
      toast.success('Lab tests ordered successfully');
      setShowLabModal(false); setSelectedTests([]); setLabNotes(''); fetchPatientData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to order lab tests'); }
  };

  // Presc Handlers
  const handleAddMedItem = () => {
    if (!currentMed || !currentDosage || !currentFreq || !currentDuration || !currentQty) return toast.error("Fill all medicine fields");
    if (currentCode && !['STAT', 'PRN'].includes(currentCode) && !currentDays) return toast.error('Enter the number of days for a scheduled frequency');
    const medObj = medicines.find(m => m.medicine_id == currentMed);
    setPrescriptionItems([...prescriptionItems, {
      medicine_id: currentMed, name: medObj?.name || 'Unknown', dosage: currentDosage, frequency: currentFreq, duration: currentDuration, quantity: parseInt(currentQty),
      ...(currentCode ? { frequency_code: currentCode } : {}),
      ...(currentDays ? { duration_days: parseInt(currentDays) } : {}),
      ...(currentRoute ? { route: currentRoute } : {}),
      ...(currentUnits ? { units_per_dose: parseInt(currentUnits) } : {}),
    }]);
    setCurrentMed(''); setCurrentDosage(''); setCurrentFreq(''); setCurrentDuration(''); setCurrentQty('');
    setCurrentCode(''); setCurrentDays(''); setCurrentRoute('ORAL'); setCurrentUnits('');
  };
  const handleCancelPrescription = async (prescriptionId) => {
    if (!window.confirm('Cancel this prescription? Any doses still due on the ward will be cancelled.')) return;
    try {
      const res = await cancelPrescription(prescriptionId);
      toast.success(`Prescription cancelled${res.data.data.doses_cancelled ? ` — ${res.data.data.doses_cancelled} pending doses cancelled` : ''}`);
      fetchPatientData();
    } catch (err) { if (!isForbidden(err)) toast.error(err.response?.data?.message || 'Could not cancel the prescription'); }
  };
  const handleCreatePrescription = async (e) => {
    e.preventDefault();
    if (prescriptionItems.length === 0) return toast.error("Add at least one medicine");
    try {
      await createPrescription({ patient_id: id, doctor_id: user.doctor_id, notes: prescNotes, items: prescriptionItems });
      toast.success('Prescription created successfully');
      setShowPrescriptionModal(false); setPrescriptionItems([]); setPrescNotes(''); fetchPatientData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create prescription'); }
  };

  if (denied) return <AccessDenied message="This patient is not under your care." />;
  if (loading) return <div style={{ padding: '24px' }}>Loading workspace...</div>;
  if (!patient) return <div style={{ padding: '24px' }}>Patient not found.</div>;

  const activeAdmissions = history.admissions?.filter(a => a.status === 'ACTIVE') || [];
  const currentAdmission = activeAdmissions.length > 0 ? activeAdmissions[0] : null;
  const openEncounter = (history.encounters || []).find(e => ['ARRIVED', 'TRIAGED', 'IN_PROGRESS'].includes(e.status));
  const isMyEncounter = user?.role === 'DOCTOR' && openEncounter && Number(openEncounter.doctor_id) === Number(user.doctor_id);

  const runEncounterAction = async (action) => {
    if (action === 'finish' && !window.confirm('Sign and close this visit? Its notes cannot be edited afterwards.')) return;
    try {
      await encounterAction(openEncounter.encounter_id, action);
      toast.success(action === 'start' ? 'Visit started' : 'Visit signed and closed');
      fetchPatientData();
    } catch (err) { toast.error(err.response?.data?.message || 'Unable to update the visit'); }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* PATIENT CONTEXT HEADER — stays visible across tabs so every action is taken on the right patient */}
      <div data-testid="patient-context" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg-card)', padding: '16px 24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', marginBottom: '24px', borderLeft: '4px solid var(--primary)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 24px' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{patient.name}</h1>
          <span><strong>{ageOf(patient.date_of_birth)}</strong> yrs · {patient.gender}</span>
          <span><strong>{mrnOf(patient.patient_id)}</strong></span>
          <span><strong>Blood</strong> {patient.blood_group || '—'}</span>
          <span data-testid="header-allergies" style={{ color: hasAllergies(patient.allergies) ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: hasAllergies(patient.allergies) ? 'bold' : 'normal' }}>
            <strong>Allergies</strong> {allergyLabel(patient.allergies)}
          </span>
          {currentAdmission && <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>ADMITTED · Bed #{currentAdmission.bed_id}</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', marginTop: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          <span>DOB {patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString() : 'N/A'}</span>
          <span>Contact {patient.phone || '—'}</span>
          <span data-testid="header-abha">ABHA {patient.abha_number ? formatAbha(patient.abha_number) : '—'}</span>
          {['ADMIN', 'RECEPTIONIST'].includes(user?.role) && <Link to={`/patients/${id}/edit`} data-testid="edit-patient">Edit details</Link>}
          {!CLINICAL_ROLES.includes(user?.role) ? null : openEncounter ? (
            <span data-testid="current-visit" style={{ color: 'var(--text-primary)' }}>
              <strong>Current visit:</strong> {openEncounter.status.replace('_', ' ')} with {openEncounter.doctor_name}
              {isMyEncounter && ['ARRIVED', 'TRIAGED'].includes(openEncounter.status) && (
                <button onClick={() => runEncounterAction('start')} style={{ marginLeft: '12px', padding: '4px 10px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Start Visit</button>
              )}
              {isMyEncounter && openEncounter.status === 'IN_PROGRESS' && (
                <button onClick={() => runEncounterAction('finish')} style={{ marginLeft: '12px', padding: '4px 10px', background: 'var(--success)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign &amp; Close</button>
              )}
            </span>
          ) : <span>No open visit</span>}
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '2px solid var(--border)', paddingBottom: '8px' }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 16px', background: activeTab === tab ? 'var(--primary)' : 'transparent', color: activeTab === tab ? 'white' : 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      {activeTab === 'Overview' && (
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)' }}>
          <h2>Quick Actions</h2>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {user?.role === 'DOCTOR' && <button onClick={() => setShowEncounterModal(true)} style={{ padding: '8px 16px', background: 'var(--info)', color: 'white', border: 'none', borderRadius: '4px' }}>+ New Clinical Encounter</button>}
            {user?.role === 'DOCTOR' && <button onClick={() => setShowLabModal(true)} style={{ padding: '8px 16px', background: 'var(--secondary)', color: 'white', border: 'none', borderRadius: '4px' }}>+ Order Lab Tests</button>}
            {user?.role === 'DOCTOR' && <button onClick={() => setShowPrescriptionModal(true)} style={{ padding: '8px 16px', background: 'var(--success)', color: 'white', border: 'none', borderRadius: '4px' }}>+ Create Prescription</button>}
            {user?.role === 'DOCTOR' && <button onClick={() => setShowSurgeryModal(true)} style={{ padding: '8px 16px', background: 'var(--warning)', color: 'white', border: 'none', borderRadius: '4px' }}>+ Request Surgery</button>}
            {user?.role === 'DOCTOR' && currentAdmission && <button onClick={() => handleDischarge(currentAdmission.admission_id)} style={{ padding: '8px 16px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '4px' }}>Discharge Patient</button>}
            {user?.role === 'DOCTOR' && !currentAdmission && <button onClick={openAdmissionModal} style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px' }}>Admit Patient</button>}
          </div>
        </div>
      )}

      {activeTab === 'Visits' && (
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)' }}>
          <h2>Clinical Encounters & Visits</h2>
          {history.consultations?.length > 0 ? (
            history.consultations.map(c => (
              <div key={c.consultation_id} style={{ background: '#f8fafc', padding: '16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '8px' }}>Date: {new Date(c.consultation_time).toLocaleString()}</div>
                <div><strong>Reason/Symptoms:</strong> {c.symptoms}</div>
                <div><strong>Diagnosis:</strong> {c.diagnosis}</div>
                <div><strong>Assessment:</strong> {c.assessment}</div>
                <div><strong>Plan:</strong> {c.plan}</div>
                <div><strong>Notes:</strong> {c.notes}</div>
              </div>
            ))
          ) : <p>No encounters found.</p>}
        </div>
      )}

      {activeTab === 'Admissions' && (
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)' }}>
          <h2>Admission History</h2>
          {history.admissions?.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', background: '#f1f5f9' }}><th style={{ padding: '8px' }}>Admitted</th><th style={{ padding: '8px' }}>Discharged</th><th style={{ padding: '8px' }}>Status</th><th style={{ padding: '8px' }}>Diagnosis</th></tr></thead>
              <tbody>
                {history.admissions.map(a => (
                  <tr key={a.admission_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>{new Date(a.admission_date).toLocaleDateString()}</td>
                    <td style={{ padding: '8px' }}>{a.discharge_date ? new Date(a.discharge_date).toLocaleDateString() : '-'}</td>
                    <td style={{ padding: '8px' }}><strong>{a.status}</strong></td>
                    <td style={{ padding: '8px' }}>{a.diagnosis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>No admission history.</p>}
        </div>
      )}

      {activeTab === 'Appointments' && (
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)' }}>
          <h2>Appointments</h2>
          {history.appointments?.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', background: '#f1f5f9' }}><th style={{ padding: '8px' }}>Date</th><th style={{ padding: '8px' }}>Time</th><th style={{ padding: '8px' }}>Status</th></tr></thead>
              <tbody>
                {[...history.appointments].sort((a, b) => String(b.appointment_date).localeCompare(String(a.appointment_date))).map(a => (
                  <tr key={a.appointment_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>{new Date(a.appointment_date).toLocaleDateString()}</td>
                    <td style={{ padding: '8px' }}>{a.appointment_time}</td>
                    <td style={{ padding: '8px' }}><strong>{a.status}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>No appointments.</p>}
        </div>
      )}

      {activeTab === 'Lab Tests' && (
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2>Lab Orders & Results</h2>
            {user?.role === 'DOCTOR' && <button onClick={() => setShowLabModal(true)} style={{ background: 'var(--primary)', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px' }}>+ Order Tests</button>}
          </div>
          {history.labs?.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', background: '#f1f5f9' }}><th style={{ padding: '8px' }}>Date</th><th style={{ padding: '8px' }}>Test Name</th><th style={{ padding: '8px' }}>Status</th>{canViewResults && <th style={{ padding: '8px' }}>Result</th>}</tr></thead>
              <tbody>
                {history.labs.map(l => (
                  <tr key={l.order_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>{new Date(l.order_date).toLocaleDateString()}</td>
                    <td style={{ padding: '8px' }}>{l.test_name}</td>
                    <td style={{ padding: '8px' }}><strong>{l.status}</strong></td>
                    {canViewResults && (
                      <td style={{ padding: '8px' }}>
                        {l.status === 'COMPLETED' && <button onClick={() => openLabResult(l)} style={{ padding: '4px 10px', background: 'var(--secondary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>View Result</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>No lab orders found.</p>}
        </div>
      )}

      {activeTab === 'Prescriptions' && (
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2>Prescriptions</h2>
            {canViewResults && <Link to={`/mar/${id}`} style={{ alignSelf: 'center', marginLeft: 'auto', marginRight: '12px' }}>Open medication record</Link>}
            {user?.role === 'DOCTOR' && <button onClick={() => setShowPrescriptionModal(true)} style={{ background: 'var(--primary)', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px' }}>+ Create Prescription</button>}
          </div>
          {history.prescriptions?.length > 0 ? (
             <table style={{ width: '100%', borderCollapse: 'collapse' }}>
             <thead><tr style={{ textAlign: 'left', background: '#f1f5f9' }}><th style={{ padding: '8px' }}>Date</th><th style={{ padding: '8px' }}>Medications</th><th style={{ padding: '8px' }}>Status</th>{user?.role === 'DOCTOR' && <th style={{ padding: '8px' }}></th>}</tr></thead>
             <tbody>
               {history.prescriptions.map(p => (
                 <tr key={p.prescription_id} style={{ borderBottom: '1px solid var(--border)' }}>
                   <td style={{ padding: '8px', verticalAlign: 'top' }}>{new Date(p.prescription_date).toLocaleDateString()}</td>
                   <td style={{ padding: '8px' }}>
                     {p.medication_details ? p.medication_details.split('\n').map((line, i) => <div key={i}>{line}</div>) : 'No medications'}
                   </td>
                   <td style={{ padding: '8px', verticalAlign: 'top' }}><strong>{p.status}</strong></td>
                   {user?.role === 'DOCTOR' && (
                     <td style={{ padding: '8px', verticalAlign: 'top' }}>
                       {p.status !== 'CANCELLED' && <button onClick={() => handleCancelPrescription(p.prescription_id)} style={{ padding: '4px 10px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>}
                     </td>
                   )}
                 </tr>
               ))}
             </tbody>
           </table>
          ) : <p>No prescriptions found.</p>}
        </div>
      )}

      {activeTab === 'Surgery' && (
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2>Surgery Requests</h2>
            {user?.role === 'DOCTOR' && <button onClick={() => setShowSurgeryModal(true)} style={{ background: 'var(--primary)', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px' }}>+ Request Surgery</button>}
          </div>
          {history.surgeries?.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', background: '#f1f5f9' }}><th style={{ padding: '8px' }}>Date</th><th style={{ padding: '8px' }}>Procedure</th><th style={{ padding: '8px' }}>Priority</th><th style={{ padding: '8px' }}>Status</th></tr></thead>
              <tbody>
                {history.surgeries.map(s => (
                  <tr key={s.request_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>{new Date(s.requested_date).toLocaleDateString()}</td>
                    <td style={{ padding: '8px' }}>{s.procedure_name}</td>
                    <td style={{ padding: '8px' }}>{s.priority}</td>
                    <td style={{ padding: '8px' }}><strong>{s.status}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>No surgery requests found.</p>}
        </div>
      )}

      {showAdmissionModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '8px', width: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>Admit Patient</h2>
            {admitError && <div role="alert" data-testid="admit-error" style={{ padding: '10px 12px', marginBottom: '12px', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px' }}>{admitError}</div>}
            <p><strong>Patient:</strong> {patient.name}</p>
            <p><strong>Doctor:</strong> {user?.username}</p>
            <form onSubmit={handleCreateAdmission}>
              <div style={{ marginBottom: '12px' }}>
                <label>Available Bed</label>
                <select required value={selectedBedId} onChange={e => setSelectedBedId(e.target.value)} style={{ width: '100%', padding: '8px' }}>
                  <option value="">Select an available bed</option>
                  {availableBeds.map(bed => <option key={bed.bed_id} value={bed.bed_id}>{bed.bed_number} — {bed.bed_type}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}><label>Admission Reason / Diagnosis</label><textarea required value={admissionDiagnosis} onChange={e => setAdmissionDiagnosis(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ marginBottom: '16px' }}><label>Notes</label><textarea value={admissionNotes} onChange={e => setAdmissionNotes(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" disabled={admitting} onClick={() => setShowAdmissionModal(false)}>Cancel</button>
                <button type="submit" disabled={admitting} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px' }}>{admitting ? 'Admitting...' : 'Confirm Admission'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODALS --- */}
      {showEncounterModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '8px', width: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>New Clinical Encounter</h2>
            <form onSubmit={handleCreateEncounter}>
              <div style={{ marginBottom: '12px' }}><label>Reason / Symptoms</label><textarea required value={encSymptoms} onChange={e => setEncSymptoms(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ marginBottom: '12px' }}><label>Diagnosis</label><input required type="text" value={encDiagnosis} onChange={e => setEncDiagnosis(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ marginBottom: '12px' }}><label>Assessment</label><textarea required value={encAssessment} onChange={e => setEncAssessment(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ marginBottom: '12px' }}><label>Plan</label><textarea required value={encPlan} onChange={e => setEncPlan(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ marginBottom: '12px' }}><label>Notes</label><textarea value={encNotes} onChange={e => setEncNotes(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowEncounterModal(false)}>Cancel</button>
                <button type="submit" style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px' }}>Save Encounter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSurgeryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '8px', width: '400px' }}>
            <h2>Request Surgery</h2>
            <form onSubmit={handleRequestSurgery}>
              <div style={{ marginBottom: '12px' }}><label>Procedure</label><input required type="text" value={surgProc} onChange={e => setSurgProc(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ marginBottom: '12px' }}><label>Diagnosis</label><input required type="text" value={surgDiag} onChange={e => setSurgDiag(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ marginBottom: '12px' }}>
                <label>Priority</label>
                <select value={surgPriority} onChange={e => setSurgPriority(e.target.value)} style={{ width: '100%', padding: '8px' }}>
                  <option value="ROUTINE">Routine</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}><label>Requested Date</label><input required type="date" value={surgDate} onChange={e => setSurgDate(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ marginBottom: '12px' }}><label>Notes</label><textarea value={surgNotes} onChange={e => setSurgNotes(e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowSurgeryModal(false)}>Cancel</button>
                <button type="submit" style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px' }}>Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {labView && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', width: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0 }}>{labView.test_name} — Result</h2>
            {labView.result ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div><strong>Value:</strong> <span data-testid="lab-value" style={{ fontWeight: 'bold', color: labView.result.interpretation && labView.result.interpretation !== 'NORMAL' ? 'var(--danger)' : 'inherit' }}>{labView.result.result_value} {labView.result.unit}</span></div>
                <div><strong>Interpretation:</strong> <span style={{ fontWeight: 'bold', color: labView.result.interpretation && labView.result.interpretation !== 'NORMAL' ? 'var(--danger)' : 'inherit' }}>{labView.result.interpretation || '—'}</span></div>
                <div><strong>Reference Range:</strong> {labView.result.reference_range || '—'}{labView.result.interpretation_source ? <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}> · flag {labView.result.interpretation_source === 'AUTO' ? 'automatic' : 'manual'}</span> : null}</div>
                <div><strong>Reported:</strong> {new Date(labView.result.result_date).toLocaleString()}</div>
                <div style={{ gridColumn: '1 / -1' }}><strong>Technician Notes:</strong> {labView.result.technician_notes || 'None'}</div>
              </div>
            ) : <p>No result recorded yet.</p>}
            {labView.attachments?.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ marginBottom: '8px' }}>Reports</h3>
                {labView.attachments.map(a => (
                  <div key={a.attachment_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '4px', marginBottom: '8px' }}>
                    <span>{a.original_filename}</span>
                    <button onClick={() => viewLabReport(labView.result.result_id, a)} style={{ padding: '4px 10px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>View Report</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ textAlign: 'right' }}><button onClick={() => setLabView(null)} style={{ padding: '8px 16px' }}>Close</button></div>
          </div>
        </div>
      )}

      {showLabModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', width: '500px' }}>
            <h2 style={{ marginTop: 0 }}>ORDER LAB TESTS</h2>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={currentTestId} onChange={(e) => setCurrentTestId(e.target.value)} style={{ flex: 1, padding: '8px' }}>
                  <option value="">-- Choose a Test --</option>
                  {labTests.map(t => (<option key={t.test_id} value={t.test_id}>{t.name} (₹{t.price})</option>))}
                </select>
                <button type="button" onClick={handleAddTest} style={{ padding: '8px 16px', background: 'var(--secondary)', color: 'white', border: 'none', borderRadius: '4px' }}>+ Add Test</button>
              </div>
            </div>
            {selectedTests.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '16px' }}>
                {selectedTests.map((t, idx) => (
                  <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f1f5f9', marginBottom: '4px', borderRadius: '4px' }}>
                    <span>{t.name}</span>
                    <button onClick={() => setSelectedTests(selectedTests.filter((_, i) => i !== idx))} style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={handleOrderLab}>
              <div style={{ marginBottom: '16px' }}><label>Clinical Notes</label><textarea value={labNotes} onChange={(e) => setLabNotes(e.target.value)} style={{ width: '100%', padding: '8px', height: '60px' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowLabModal(false)} style={{ padding: '8px 16px' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px' }}>Order Tests</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPrescriptionModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0 }}>CREATE PRESCRIPTION</h2>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <select value={currentMed} onChange={e => setCurrentMed(e.target.value)} style={{ padding: '8px' }}><option value="">-- Select Medicine --</option>{medicines.map(m => (<option key={m.medicine_id} value={m.medicine_id}>{m.name} (Stock: {m.stock_quantity})</option>))}</select>
                <input type="text" placeholder="Dosage (e.g. 500mg)" value={currentDosage} onChange={e => setCurrentDosage(e.target.value)} style={{ padding: '8px' }} />
                <input type="text" placeholder="Frequency (e.g. Twice daily)" value={currentFreq} onChange={e => setCurrentFreq(e.target.value)} style={{ padding: '8px' }} />
                <input type="text" placeholder="Duration (e.g. 5 days)" value={currentDuration} onChange={e => setCurrentDuration(e.target.value)} style={{ padding: '8px' }} />
                <input type="number" placeholder="Total Qty" value={currentQty} onChange={e => setCurrentQty(e.target.value)} style={{ padding: '8px' }} />
                <select name="frequency_code" value={currentCode} onChange={e => { const c = e.target.value; setCurrentCode(c); if (c && !currentFreq) setCurrentFreq(FREQUENCY_TEXT[c]); }} style={{ padding: '8px' }}>
                  <option value="">Frequency code (optional)</option>
                  {Object.entries(FREQUENCY_TEXT).map(([code, text]) => <option key={code} value={code}>{code} — {text}</option>)}
                </select>
                <input type="number" min="1" name="duration_days" placeholder="Days (for the ward schedule)" value={currentDays} onChange={e => { setCurrentDays(e.target.value); if (e.target.value && !currentDuration) setCurrentDuration(`${e.target.value} days`); }} style={{ padding: '8px' }} />
                <select name="route" value={currentRoute} onChange={e => setCurrentRoute(e.target.value)} style={{ padding: '8px' }}>
                  {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <input type="number" min="1" name="units_per_dose" placeholder="Units per dose (default 1)" value={currentUnits} onChange={e => setCurrentUnits(e.target.value)} style={{ padding: '8px' }} />
                <button type="button" onClick={handleAddMedItem} style={{ padding: '8px', background: 'var(--secondary)', color: 'white', border: 'none', borderRadius: '4px' }}>+ Add Medicine</button>
              </div>
            </div>
            {prescriptionItems.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '14px' }}>
                <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}><th style={{ padding: '8px' }}>Medicine</th><th style={{ padding: '8px' }}>Dosage</th><th style={{ padding: '8px' }}>Freq</th><th style={{ padding: '8px' }}>Dur</th><th style={{ padding: '8px' }}>Qty</th><th style={{ padding: '8px' }}>Action</th></tr></thead>
                <tbody>
                  {prescriptionItems.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '8px' }}>{item.name}</td><td style={{ padding: '8px' }}>{item.dosage}</td><td style={{ padding: '8px' }}>{item.frequency}</td><td style={{ padding: '8px' }}>{item.duration}</td><td style={{ padding: '8px' }}>{item.quantity}</td>
                      <td style={{ padding: '8px' }}><button onClick={() => setPrescriptionItems(prescriptionItems.filter((_, i) => i !== idx))} style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form onSubmit={handleCreatePrescription}>
              <div style={{ marginBottom: '16px' }}><label>Notes</label><textarea value={prescNotes} onChange={(e) => setPrescNotes(e.target.value)} style={{ width: '100%', padding: '8px', height: '60px' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowPrescriptionModal(false)} style={{ padding: '8px 16px' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px' }}>Create Prescription</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
