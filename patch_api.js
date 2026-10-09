const fs = require('fs');
let code = fs.readFileSync('client/src/services/api.js', 'utf8');

if (!code.includes('downloadLabReport')) {
  code = code.replace(
    "export const uploadLabReport",
    "export const downloadLabReport = (id) => api.get(`/lab/attachments/${id}`, { responseType: 'blob' });\nexport const uploadLabReport"
  );
  code = code.replace(
    "uploadLabReport,",
    "uploadLabReport, downloadLabReport,"
  );
  fs.writeFileSync('client/src/services/api.js', code);
  console.log("Patched api.js with downloadLabReport");
}
