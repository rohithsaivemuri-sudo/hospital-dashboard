// Same rules as server/utils/abha.js: 14 digits stored without separators, shown as XX-XXXX-XXXX-XXXX.
export const abhaDigits = (input) => String(input ?? '').replace(/[\s-]/g, '');

export const abhaError = (input) => {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (!/^[0-9\s-]+$/.test(s)) return 'ABHA number must contain digits only (format XX-XXXX-XXXX-XXXX)';
  const n = abhaDigits(s).length;
  return n === 14 ? null : `ABHA number must be 14 digits (got ${n})`;
};

export const formatAbha = (digits) => {
  const d = abhaDigits(digits);
  return /^\d{14}$/.test(d) ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}-${d.slice(10)}` : (digits || '');
};

// Formats as the receptionist types: "9123" -> "91-23".
export const formatAbhaInput = (input) => {
  const d = abhaDigits(input).replace(/\D/g, '').slice(0, 14);
  return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10, 14)].filter(Boolean).join('-');
};

// "No known allergies" is recorded explicitly so it is not confused with "never asked".
export const NO_KNOWN_ALLERGIES = 'No known allergies';
export const hasAllergies = (text) => !!(text && text.trim() && text.trim() !== NO_KNOWN_ALLERGIES);
export const allergyLabel = (text) => (text && text.trim() ? text : 'Not recorded');
