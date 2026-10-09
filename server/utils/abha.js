// ABHA (Ayushman Bharat Health Account) number: 14 digits, stored without separators and shown as
// XX-XXXX-XXXX-XXXX. Input may use hyphens or spaces in any position; anything else is rejected.

// '' / null / undefined -> { value: null }; '91-2345-6789-0123' -> { value: '91234567890123' };
// anything that is not exactly 14 digits once separators are removed -> { error }.
function normalizeAbha(input) {
  if (input == null || String(input).trim() === '') return { value: null };
  const s = String(input).trim();
  if (!/^[0-9\s-]+$/.test(s)) return { error: 'ABHA number must contain digits only (format XX-XXXX-XXXX-XXXX)' };
  const digits = s.replace(/[\s-]/g, '');
  if (digits.length !== 14) return { error: `ABHA number must be 14 digits (got ${digits.length})` };
  return { value: digits };
}

const formatAbha = (digits) => (digits && /^\d{14}$/.test(digits)
  ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}` : digits ?? null);

module.exports = { normalizeAbha, formatAbha };
