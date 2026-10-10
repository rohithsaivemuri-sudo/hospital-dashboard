const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

// Every setting is checked before anything else runs (config/env.js): missing or weak values, a
// root DB_USER, a default JWT_SECRET... stop the server with a list of what to fix.
const config = require('./config/env').requireValidConfig();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.clientUrl,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },
  // The cors option covers HTTP long-polling only; WebSocket upgrades are checked here. Requests
  // without an Origin header (non-browser clients) still need a valid token (sockets/socketHandler).
  allowRequest: (req, callback) => callback(null, !req.headers.origin || req.headers.origin === config.clientUrl),
});

// Middleware
const { requestId, securityHeaders, loginRateLimit, safeErrorResponses, errorHandler } = require('./middleware/security');
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(requestId);
app.use(securityHeaders(config));
app.use(safeErrorResponses);
app.use(cors({ origin: config.clientUrl }));
app.use(express.json({ limit: config.jsonLimit }));
app.post('/api/auth/login', loginRateLimit(config.loginLimit));

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
const userRoutes = require('./routes/userRoutes');
const nurseRoutes = require('./routes/nurseRoutes');
const nurseAssignmentRoutes = require('./routes/nurseAssignmentRoutes');
const marRoutes = require('./routes/marRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const vitalsRoutes = require('./routes/vitalsRoutes');

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
app.use('/api/users', verifyToken, userRoutes);
app.use('/api/nurse', verifyToken, nurseRoutes);
app.use('/api/nurse-assignments', verifyToken, nurseAssignmentRoutes);
app.use('/api/mar', verifyToken, marRoutes);
app.use('/api/audit-logs', verifyToken, auditLogRoutes);
app.use('/api/vitals', verifyToken, vitalsRoutes);

// Production: the built client is served from this same port, so pages, /api and /socket.io run
// together (npm run start:prod). In development Vite serves the client and proxies to here.
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(process.env.CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist'));
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error(`Refusing to start in production: no client build at ${dist}. Run npm run build (or set CLIENT_DIST).`);
    process.exit(1);
  }
  // Hashed asset files never change; the page itself must always be revalidated.
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '365d', fallthrough: false }));
  app.use(express.static(dist, { index: false, maxAge: 0 }));
  // Client-side routes (/patients/16, /laboratory, ...) all load the app shell.
  app.get(/^\/(?!api(\/|$)|socket\.io(\/|$)).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}
// Unknown API paths answer in JSON, not with an HTML page.
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Not found' }));
app.use(errorHandler);

const PORT = config.port;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
