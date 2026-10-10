// Startup configuration check. Every setting comes from the environment (server/.env in
// development); anything missing or weak stops the server with a list of what to fix, before it
// touches the database. Values are never printed.
const path = require('path');
const fs = require('fs');

const WEAK_SECRETS = new Set(['change-me', 'changeme', 'secret', 'your_jwt_secret_key_here', 'jwt_secret', 'password', 'default']);
const MODES = ['development', 'production', 'test'];

const isPort = (v) => /^\d+$/.test(String(v)) && Number(v) >= 1 && Number(v) <= 65535;
function originOf(url) {
  try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) && u.origin === url.replace(/\/$/, '') ? u.origin : null; } catch { return null; }
}

// Returns { errors: [...], config }. config holds the normalised values the server uses.
function checkConfig(env = process.env) {
  const errors = [];
  const need = (key, why) => { if (!env[key] || !String(env[key]).trim()) errors.push(`${key} is not set (${why})`); };
  const mode = env.NODE_ENV || 'development';
  if (!MODES.includes(mode)) errors.push(`NODE_ENV must be one of ${MODES.join(', ')} (got "${mode}")`);
  const production = mode === 'production';

  need('DB_HOST', 'MySQL host');
  need('DB_NAME', 'database name');
  need('DB_USER', 'the restricted app account from docs/mysql-app-user.sql');
  need('DB_PASSWORD', "the app account's password");
  if (String(env.DB_USER || '').trim().toLowerCase() === 'root') {
    errors.push('DB_USER is root: use the restricted app account (docs/mysql-app-user.sql); root belongs in DB_ADMIN_USER for migrations and backups only');
  }
  if (env.DB_PORT !== undefined && env.DB_PORT !== '' && !isPort(env.DB_PORT)) errors.push('DB_PORT must be a port number');
  if (env.PORT !== undefined && env.PORT !== '' && !(isPort(env.PORT) || env.PORT === '0')) errors.push('PORT must be a port number');

  const secret = env.JWT_SECRET || '';
  if (!secret) errors.push('JWT_SECRET is not set (signs login tokens; generate one with: openssl rand -base64 48)');
  else if (WEAK_SECRETS.has(secret.toLowerCase()) || /change.?me|your.?jwt|secret.?key/i.test(secret)) errors.push('JWT_SECRET is a placeholder/default value; generate a random one (openssl rand -base64 48)');
  else if (secret.length < 32) errors.push(`JWT_SECRET is too short (${secret.length} characters; at least 32): generate one with openssl rand -base64 48`);
  else if (new Set(secret).size < 12) errors.push('JWT_SECRET is not random enough (too few distinct characters)');

  let clientUrl = env.CLIENT_URL || (production ? '' : 'http://localhost:5173');
  if (production && !env.CLIENT_URL) errors.push('CLIENT_URL is not set (the public address of the app, e.g. https://hospital.example.org; CORS and sockets allow only this origin)');
  else if (clientUrl && !originOf(clientUrl)) errors.push(`CLIENT_URL must be an origin like https://hospital.example.org (no path)`);
  else clientUrl = originOf(clientUrl);

  const labReportDir = path.resolve(env.LAB_REPORT_DIR || path.join(__dirname, '..', 'uploads', 'lab-reports'));
  try {
    fs.mkdirSync(labReportDir, { recursive: true });
    fs.accessSync(labReportDir, fs.constants.W_OK);
  } catch (e) { errors.push(`LAB_REPORT_DIR ${labReportDir} is not a writable folder (${e.code || e.message})`); }

  return {
    errors,
    config: { mode, production, port: Number(env.PORT || 5000), clientUrl, labReportDir },
  };
}

// For server.js: exits with the list of problems.
function requireValidConfig(env = process.env) {
  const { errors, config } = checkConfig(env);
  if (errors.length) {
    console.error(`Refusing to start: ${errors.length} configuration problem${errors.length > 1 ? 's' : ''} (see server/.env.example):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  return config;
}

module.exports = { checkConfig, requireValidConfig };
