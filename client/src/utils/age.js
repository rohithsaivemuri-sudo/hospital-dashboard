import { calendarDate, istToday } from './istDate';

// Age shown to staff, counted on today's date in India whatever the browser's time zone. Dates of
// birth arrive as "YYYY-MM-DD" (forms) or as UTC-midnight ISO timestamps (MySQL DATE values); both
// are read as that calendar date. All arithmetic is on UTC midnights, so no time zone shifts a day.
const utcDate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? t : null;
};

// Whole years, months and days from the date of birth to `now`; null for no date or a future one.
export function ageParts(dob, now = new Date()) {
  const birth = utcDate(calendarDate(dob));
  const today = utcDate(istToday(now));
  if (!birth || birth > today) return null;
  let months = (today.getUTCFullYear() - birth.getUTCFullYear()) * 12 + today.getUTCMonth() - birth.getUTCMonth();
  if (today.getUTCDate() < birth.getUTCDate()) months -= 1;
  const days = Math.round((today - birth) / 864e5);
  return { years: Math.floor(months / 12), months, days };
}

const unit = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

// "34 yrs"; under one year "5 months" or "12 days"; an estimated date of birth "approx. 34 yrs".
export function ageText(dob, estimated = false, now = new Date()) {
  const a = ageParts(dob, now);
  if (!a) return '—';
  if (estimated && Number(estimated)) return `approx. ${a.years} yrs`;
  if (a.years >= 1) return `${a.years} yrs`;
  if (a.months >= 1) return unit(a.months, 'month');
  return unit(a.days, 'day');
}

// Today (IST), N years back, as YYYY-MM-DD (29 Feb -> 28 Feb), the same estimate the server stores.
export function estimatedBirthDate(years, now = new Date()) {
  const [y, m, d] = istToday(now).split('-').map(Number);
  const t = new Date(Date.UTC(y - years, m - 1, d));
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0);
  return t.toISOString().slice(0, 10);
}
