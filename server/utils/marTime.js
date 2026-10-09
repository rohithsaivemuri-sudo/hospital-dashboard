// Medication administration times.
//
// All MAR times are stored and compared in UTC: columns *_at_utc hold 'YYYY-MM-DD HH:MM:SS' UTC
// strings that are always produced and parsed here — never MySQL NOW(), which runs in the server's
// local zone. They are shown in the hospital's local time, IST (UTC+05:30, no daylight saving).
// Standard ward administration times are defined in IST.

const IST_OFFSET_MIN = 330;
const MINUTE = 60 * 1000;
const OVERDUE_AFTER_MIN = 60;  // a dose more than 60 minutes past due is overdue
const EARLY_LIMIT_MIN = 60;    // and cannot be given more than 60 minutes before it is due

const FREQUENCY_CODES = ['OD', 'BD', 'TDS', 'QID', 'Q6H', 'Q8H', 'STAT', 'PRN'];

// Standard ward times (IST) per frequency code. STAT is one dose due immediately; PRN has no schedule.
const WARD_TIMES = {
  OD: ['08:00'],
  BD: ['08:00', '20:00'],
  TDS: ['08:00', '14:00', '20:00'],
  QID: ['06:00', '12:00', '18:00', '22:00'],
  Q6H: ['00:00', '06:00', '12:00', '18:00'],
  Q8H: ['06:00', '14:00', '22:00'],
};

const FREQUENCY_LABELS = {
  OD: 'Once daily', BD: 'Twice daily', TDS: 'Three times daily', QID: 'Four times daily',
  Q6H: 'Every 6 hours', Q8H: 'Every 8 hours', STAT: 'Immediately, once', PRN: 'As needed',
};

const ROUTES = ['ORAL', 'IV', 'IM', 'SC', 'SUBLINGUAL', 'INHALED', 'TOPICAL', 'RECTAL', 'OTHER'];

const pad = (n) => String(n).padStart(2, '0');

// Date -> 'YYYY-MM-DD HH:MM:SS' in UTC (for *_at_utc columns).
function toSqlUtc(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

// 'YYYY-MM-DD HH:MM:SS' (UTC) -> Date. Accepts a Date for convenience.
function fromSqlUtc(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  return new Date(`${String(value).replace(' ', 'T')}Z`);
}

// Wall-clock fields of an instant in IST.
function istParts(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MIN * MINUTE);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), d: ist.getUTCDate(), hh: ist.getUTCHours(), mm: ist.getUTCMinutes() };
}

// The instant at IST wall-clock time y-m-d hh:mm.
function istToUtc(y, m, d, hh, mm) {
  return new Date(Date.UTC(y, m, d, hh, mm) - IST_OFFSET_MIN * MINUTE);
}

function formatIst(date) {
  if (!date) return null;
  const p = istParts(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${pad(p.d)} ${months[p.m]} ${p.y}, ${pad(p.hh)}:${pad(p.mm)} IST`;
}

// IST calendar date 'YYYY-MM-DD' of an instant (the MAR grid groups doses by IST day).
function istDate(date) {
  const p = istParts(date);
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
}

// Dose times for a structured order: the next ward slots strictly after `from`, capped at
// min(slots per day x duration_days, floor(quantity / units_per_dose)). STAT: one dose at `from`.
// PRN or anything unstructured: no schedule.
function scheduleDoses({ frequencyCode, durationDays, quantity, unitsPerDose = 1 }, from) {
  if (frequencyCode === 'STAT') return quantity >= unitsPerDose ? [new Date(from.getTime())] : [];
  const times = WARD_TIMES[frequencyCode];
  if (!times || !durationDays || durationDays < 1) return [];
  const byDuration = times.length * durationDays;
  const byQuantity = Math.floor(quantity / (unitsPerDose || 1));
  const count = Math.max(0, Math.min(byDuration, byQuantity));
  const doses = [];
  const start = istParts(from);
  for (let day = 0; doses.length < count; day++) {
    for (const t of times) {
      const [hh, mm] = t.split(':').map(Number);
      const at = istToUtc(start.y, start.m, start.d + day, hh, mm);
      if (at.getTime() > from.getTime()) doses.push(at);
      if (doses.length === count) break;
    }
  }
  return doses;
}

// Read-time state of a dose (decision: overdue is computed when the record is read).
function doseState(status, scheduledAt, now) {
  if (status !== 'PENDING') return status;
  if (scheduledAt && now.getTime() - scheduledAt.getTime() > OVERDUE_AFTER_MIN * MINUTE) return 'OVERDUE';
  return 'PENDING';
}

module.exports = {
  IST_OFFSET_MIN, OVERDUE_AFTER_MIN, EARLY_LIMIT_MIN, FREQUENCY_CODES, FREQUENCY_LABELS, WARD_TIMES, ROUTES,
  toSqlUtc, fromSqlUtc, istParts, istToUtc, istDate, formatIst, scheduleDoses, doseState,
};
