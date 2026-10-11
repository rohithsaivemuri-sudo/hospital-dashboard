// Where uploaded files live. UPLOAD_DIR is the base folder (put it on a persistent disk in
// production); lab reports go in its lab-reports subfolder. LAB_REPORT_DIR overrides that one
// folder (the test suite uses a throwaway directory). Default: server/uploads/lab-reports.
const path = require('path');

function labReportDir(env = process.env) {
  if (env.LAB_REPORT_DIR) return path.resolve(env.LAB_REPORT_DIR);
  if (env.UPLOAD_DIR) return path.resolve(env.UPLOAD_DIR, 'lab-reports');
  return path.join(__dirname, '..', 'uploads', 'lab-reports');
}

module.exports = { labReportDir };
