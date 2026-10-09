// Access audit middleware (NIST AU-2/AU-6): records PHI reads and every denied request.
// Runs after the response has been sent ('finish'), so it never delays or fails a request.
// Data changes are NOT logged here: controllers write those inside their own transactions
// (utils/audit.js writeAudit). Login outcomes are logged by the auth controller.
const { logAccess } = require('../utils/audit');

// Routers whose GET responses contain patient data.
const PHI_ROUTERS = new Set([
  '/api/patients', '/api/appointments', '/api/consultations', '/api/prescriptions', '/api/lab',
  '/api/admissions', '/api/bills', '/api/surgery', '/api/emergency', '/api/encounters',
]);

const numeric = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);

function describe(req, res) {
  const params = req.params || {};
  const base = req.baseUrl || '';
  return {
    entityType: base.startsWith('/api/') ? base.slice(5) : null,
    entityId: numeric(params.id ?? params.orderId ?? params.result_id),
    patientId: res.locals.auditPatientId
      ?? numeric(params.patientId)
      ?? (base === '/api/patients' ? numeric(params.id) : null),
  };
}

function auditAccess(req, res, next) {
  res.on('finish', () => {
    const status = res.statusCode;
    if (req.path === '/auth/login' || req.originalUrl.startsWith('/api/auth/login')) return;
    if (status === 401 || status === 403) {
      logAccess(req, { action: 'ACCESS_DENIED', outcome: 'DENIED', statusCode: status, ...describe(req, res) });
    } else if (req.method === 'GET' && status < 400 && PHI_ROUTERS.has(req.baseUrl)) {
      logAccess(req, { action: 'READ', statusCode: status, ...describe(req, res) });
    }
  });
  next();
}

module.exports = { auditAccess };
