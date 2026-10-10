// Vital signs: field definitions, impossible-value limits (mirrored by the CHECK constraints in
// migration 011) and adult reference ranges used to highlight abnormal readings.
// Reference ranges are a display aid, not a clinical score.

const VITALS = [
  { key: 'temperature_c', label: 'Temperature', unit: '°C', min: 25, max: 45, decimals: 1, normalLow: 36.1, normalHigh: 37.8 },
  { key: 'pulse_bpm', label: 'Pulse', unit: 'bpm', min: 20, max: 250, decimals: 0, normalLow: 60, normalHigh: 100 },
  { key: 'resp_rate', label: 'Respiratory rate', unit: '/min', min: 4, max: 80, decimals: 0, normalLow: 12, normalHigh: 20 },
  { key: 'bp_systolic', label: 'Systolic BP', unit: 'mmHg', min: 40, max: 300, decimals: 0, normalLow: 90, normalHigh: 140 },
  { key: 'bp_diastolic', label: 'Diastolic BP', unit: 'mmHg', min: 20, max: 200, decimals: 0, normalLow: 60, normalHigh: 90 },
  { key: 'spo2_pct', label: 'SpO₂', unit: '%', min: 50, max: 100, decimals: 0, normalLow: 95, normalHigh: 100 },
  { key: 'pain_score', label: 'Pain score', unit: '/10', min: 0, max: 10, decimals: 0, normalLow: 0, normalHigh: 3 },
];
const KEYS = VITALS.map(v => v.key);

// Request body -> { values, error }. Blank fields are not recorded; at least one is required.
function parseVitals(body) {
  const values = {};
  for (const v of VITALS) {
    const raw = body[v.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const n = Number(raw);
    const pattern = v.decimals ? /^-?\d+(\.\d)?$/ : /^-?\d+$/;
    if (!pattern.test(String(raw).trim()) || !Number.isFinite(n)) {
      return { error: `${v.label} must be ${v.decimals ? 'a number with at most one decimal place' : 'a whole number'}` };
    }
    if (n < v.min || n > v.max) return { error: `${v.label} ${n} ${v.unit} is not a possible value (${v.min}–${v.max})` };
    values[v.key] = n;
  }
  if (!Object.keys(values).length) return { error: 'Enter at least one vital sign' };
  if (('bp_systolic' in values) !== ('bp_diastolic' in values)) return { error: 'Blood pressure needs both systolic and diastolic values' };
  if ('bp_systolic' in values && values.bp_systolic <= values.bp_diastolic) return { error: 'Systolic blood pressure must be higher than diastolic' };
  return { values };
}

// Keys whose value lies outside the adult reference range.
const abnormalKeys = (row) => VITALS.filter(v => row[v.key] != null && (Number(row[v.key]) < v.normalLow || Number(row[v.key]) > v.normalHigh)).map(v => v.key);

module.exports = { VITALS, KEYS, parseVitals, abnormalKeys };
