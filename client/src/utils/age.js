// Age shown to staff. Dates of birth arrive as "YYYY-MM-DD" (forms) or as ISO timestamps (MySQL
// DATE values); both are read as a local calendar date.
const calendarDate = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// Whole years, months and days from the date of birth to `now`; null for no date or a future one.
export function ageParts(dob, now = new Date()) {
  const birth = calendarDate(dob);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!birth || birth > today) return null;
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
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

// Today, N years back, as YYYY-MM-DD (29 Feb -> 28 Feb), the same estimate the server stores.
export function estimatedBirthDate(years, now = new Date()) {
  const d = new Date(now.getFullYear() - years, now.getMonth(), now.getDate());
  if (d.getMonth() !== now.getMonth()) d.setDate(0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
