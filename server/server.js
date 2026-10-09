const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

// Socket.io setup
require('./sockets/socketHandler')(io);
app.set('io', io);

// Routes
const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const bedRoutes = require('./routes/bedRoutes');
const wardRoutes = require('./routes/wardRoutes');
const ambulanceRoutes = require('./routes/ambulanceRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const consultationRoutes = require('./routes/consultationRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const labRoutes = require('./routes/labRoutes');
const admissionRoutes = require('./routes/admissionRoutes');
const billingRoutes = require('./routes/billingRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const surgeryRoutes = require('./routes/surgeryRoutes');
const encounterRoutes = require('./routes/encounterRoutes');

const { verifyToken } = require('./middleware/auth');
const { auditAccess } = require('./middleware/audit');

app.use('/api', auditAccess); // PHI reads and denied requests; data changes are audited in-transaction

app.use('/api/auth', authRoutes); // Auth routes manage their own protection internally
app.use('/api/patients', verifyToken, patientRoutes);
app.use('/api/doctors', verifyToken, doctorRoutes);
app.use('/api/departments', verifyToken, departmentRoutes);
app.use('/api/beds', verifyToken, bedRoutes);
app.use('/api/wards', verifyToken, wardRoutes);
app.use('/api/ambulances', verifyToken, ambulanceRoutes);
app.use('/api/emergency', verifyToken, emergencyRoutes);
app.use('/api/appointments', verifyToken, appointmentRoutes);
app.use('/api/consultations', verifyToken, consultationRoutes);
app.use('/api/prescriptions', verifyToken, prescriptionRoutes);
app.use('/api/lab', verifyToken, labRoutes);
app.use('/api/admissions', verifyToken, admissionRoutes);
app.use('/api/bills', verifyToken, billingRoutes);
app.use('/api/dashboard', verifyToken, dashboardRoutes);
app.use('/api/medicines', verifyToken, medicineRoutes);
app.use('/api/surgery', verifyToken, surgeryRoutes);
app.use('/api/encounters', verifyToken, encounterRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
