// Structured request log: one JSON line per request on stdout. It records the route pattern
// (/api/patients/:id), never the actual path, query string or body, so no patient identifiers or
// clinical data reach the log. Health checks are not logged.
function requestLog({ enabled = true } = {}) {
  return (req, res, next) => {
    if (!enabled || req.path === '/health') return next();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route?.path
        ? `${req.baseUrl}${req.route.path}`
        : req.originalUrl.startsWith('/api') ? `${req.baseUrl || '/api'} (unmatched)` : req.originalUrl.startsWith('/assets/') ? '/assets/*' : '(page)';
      process.stdout.write(JSON.stringify({
        time: new Date().toISOString(), level: res.statusCode >= 500 ? 'error' : 'info', type: 'request',
        request_id: req.id, method: req.method, route, status: res.statusCode,
        duration_ms: Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10,
        user_id: req.user?.user_id ?? null, role: req.user?.role ?? null,
      }) + '\n');
    });
    next();
  };
}

module.exports = { requestLog };
