// Laboratory reference ranges and automatic interpretation flags (report Section F, FHIR Observation
// referenceRange / interpretation).
//
// Only unambiguous numeric text is parsed — "a-b", "<x" / "≤x" (upper limit), ">x" / "≥x" (lower limit).
// Anything else ("Varies", "Normal", "EF > 55%", "No growth") is not parsed and is never auto-flagged.

const NUM = '(\\d+(?:\\.\\d+)?)';
const RANGE = new RegExp(`^\\s*${NUM}\\s*-\\s*${NUM}\\s*$`);
const UPPER = new RegExp(`^\\s*(?:<|≤|<=)\\s*${NUM}\\s*$`);
const LOWER = new RegExp(`^\\s*(?:>|≥|>=)\\s*${NUM}\\s*$`);
const NUMERIC_VALUE = /^\s*(-?\d+(?:\.\d+)?)\s*$/;

// "70-100" -> { low: 70, high: 100 }; "<0.04" -> { low: null, high: 0.04 }; anything else -> null.
function parseRange(text) {
  if (text == null) return null;
  const s = String(text);
  let m = s.match(RANGE);
  if (m) {
    const low = Number(m[1]); const high = Number(m[2]);
    return low <= high ? { low, high } : null;
  }
  if ((m = s.match(UPPER))) return { low: null, high: Number(m[1]) };
  if ((m = s.match(LOWER))) return { low: Number(m[1]), high: null };
  return null;
}

// A result value is numeric only if the whole value is one number ("14.5"); text results stay text.
function parseNumeric(value) {
  const m = String(value ?? '').match(NUMERIC_VALUE);
  return m ? Number(m[1]) : null;
}

// NORMAL / LOW / HIGH / CRITICAL for a numeric value against the bounds that exist; null when the
// value is not numeric or no bound applies.
function interpret(value, { low = null, high = null, criticalLow = null, criticalHigh = null } = {}) {
  if (value == null || Number.isNaN(value)) return null;
  if (low == null && high == null && criticalLow == null && criticalHigh == null) return null;
  if ((criticalLow != null && value < criticalLow) || (criticalHigh != null && value > criticalHigh)) return 'CRITICAL';
  if (low != null && value < low) return 'LOW';
  if (high != null && value > high) return 'HIGH';
  return 'NORMAL';
}

const sameUnit = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

module.exports = { parseRange, parseNumeric, interpret, sameUnit };
