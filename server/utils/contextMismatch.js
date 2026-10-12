// Migration 018 gave every record that copies a patient (or doctor, or medicine) from the visit,
// admission, appointment, note or batch it is filed under a composite foreign key (fk_ctx_*), so the
// database refuses a copy that disagrees. The API checks first and answers 400; this maps the
// database's refusal to the same 400 in case a request gets past those checks.
const CONTEXT_MISMATCH = 'This record does not match the visit, admission, appointment or note it is filed under';

const isContextMismatch = (error) => error?.errno === 1452 && /`fk_ctx_/.test(error.message || '');

module.exports = { CONTEXT_MISMATCH, isContextMismatch };
