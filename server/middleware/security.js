// HTTP hardening without extra dependencies: request ids, security headers, login rate limiting,
// and error responses that never leak stack traces or SQL.
const crypto = require('crypto');
const { logAccess } = require('../utils/audit');

// Every request gets an id (X-Request-Id) to match a user's report with the server log.
function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

function securityHeaders({ production, clientUrl }) {
  const wsOrigin = clientUrl ? clientUrl.replace(/^http/, 'ws') : '';
  // React styles are set through the DOM (allowed); react-hot-toast injects a <style> element, hence
  // 'unsafe-inline' for styles only. Scripts come from this origin only.
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    `connect-src 'self' ${wsOrigin}`.trim(), "font-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  return (req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (production) {
      // Development is served by Vite (inline HMR scripts), so the policy applies in production only.
      res.set('Content-Security-Policy', csp);
      res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  };
}

// Login attempts: at most maxPerIp per window from one address, and at most maxFailures failed
// attempts per username per window (whatever the address). Over the limit -> 429 + Retry-After.
// In memory: limits are per server process.
function loginRateLimit({ windowMs, maxPerIp, maxFailures }) {
  const byIp = new Map(); const failures = new Map();
  const hit = (map, key, now) => {
    const e = map.get(key);
    if (!e || e.reset <= now) { const n = { count: 1, reset: now + windowMs }; map.set(key, n); return n; }
    e.count++; return e;
  };
  const peek = (map, key, now) => { const e = map.get(key); return e && e.reset > now ? e : null; };
  setInterval(() => { const now = Date.now(); for (const m of [byIp, failures]) for (const [k, e] of m) if (e.reset <= now) m.delete(k); }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const ip = peek(byIp, req.ip, now);
    const account = username ? peek(failures, username, now) : null;
    const blocked = (ip && ip.count >= maxPerIp) ? ip : (account && account.count >= maxFailures) ? account : null;
    if (blocked) {
      const seconds = Math.max(1, Math.ceil((blocked.reset - now) / 1000));
      res.set('Retry-After', String(seconds));
      logAccess(req, { action: 'LOGIN_RATE_LIMITED', outcome: 'DENIED', statusCode: 429, entityType: 'auth', details: { username: username.slice(0, 50) } });
      return res.status(429).json({ success: false, code: 'RATE_LIMITED', message: `Too many login attempts. Try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}.` });
    }
    hit(byIp, req.ip, now);
    res.on('finish', () => {
      if (!username) return;
      if (res.statusCode === 401) hit(failures, username, Date.now());
      else if (res.statusCode < 300) failures.delete(username);
    });
    next();
  };
}

// Quoted values in database error text can be patient data: keep the shape, drop the values.
const redact = (msg) => String(msg ?? '').replace(/'[^']*'/g, "'?'").replace(/"[^"]*"/g, '"?"').slice(0, 500);

// Any 5xx JSON response is replaced by a generic message with the request id; the real error goes
// to the server log (redacted). Deadlocks are marked retryable.
function safeErrorResponses(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === 'object' && !body.__safe) {
      const original = body.message || body.error;
      const deadlock = /deadlock/i.test(original || '');
      console.error(JSON.stringify({ level: 'error', time: new Date().toISOString(), request_id: req.id, method: req.method, path: req.baseUrl + (req.route?.path || ''), status: res.statusCode, error: redact(original) }));
      body = deadlock
        ? { success: false, code: 'DB_DEADLOCK', retryable: true, message: 'The database was busy. Please try again.', request_id: req.id }
        : { success: false, message: 'Something went wrong on the server. Please try again; if it keeps happening, report it with this request id.', request_id: req.id };
    }
    return json(body);
  };
  next();
}

// Last handler: body-parser and other thrown errors become clean JSON, never a stack trace.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request body is too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Request body is not valid JSON' });
  if (err.name === 'MulterError') return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'Invalid upload' });
  if (err.status && err.status >= 400 && err.status < 500) return res.status(err.status).json({ success: false, message: err.expose ? err.message : 'Bad request' });
  res.status(500).json({ success: false, message: err.message });
}

module.exports = { requestId, securityHeaders, loginRateLimit, safeErrorResponses, errorHandler, redact };
