// Calendar days in India time (IST, UTC+05:30, no daylight saving), whatever the browser's time
// zone. The server decides "today" the same way (server/utils/clock.js).
const IST_OFFSET_MS = 330 * 60 * 1000;

// IST calendar date 'YYYY-MM-DD' of an instant (Date, ISO string or timestamp); null if invalid.
export function istDate(value = new Date()) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// Today's IST date, 'YYYY-MM-DD'.
export const istToday = (now = new Date()) => istDate(now);

// 'YYYY-MM-DD' plus n calendar days.
export function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// A DATE value as its calendar date: 'YYYY-MM-DD' (forms) or a UTC-midnight ISO timestamp (MySQL
// DATE columns, server/config/dbTime.js) -> its first ten characters, never shifted by a time zone.
export function calendarDate(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value instanceof Date ? value.toISOString() : String(value));
  return m ? m[0] : null;
}
