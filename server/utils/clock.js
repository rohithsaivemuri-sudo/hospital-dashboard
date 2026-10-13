// The hospital's clock. "Today" is always the calendar date in India (IST, UTC+05:30, no daylight
// saving), decided here in Node and passed to SQL as a parameter — never CURDATE() or a local-time
// Date method, which follow the MySQL server's or this process's time zone (UTC on the Azure host,
// so the date was a day behind between 00:00 and 05:30 IST).
//
// HMS_FAKE_NOW (an ISO instant, tests only) starts the clock at that instant; it then runs at normal
// speed. It is ignored in production.
const { istDate, istToUtc, toSqlUtc } = require('./marTime');

const DAY = 24 * 60 * 60 * 1000;
const bootedAt = Date.now();
const fakeStart = process.env.NODE_ENV !== 'production' && process.env.HMS_FAKE_NOW ? Date.parse(process.env.HMS_FAKE_NOW) : NaN;
if (process.env.HMS_FAKE_NOW && Number.isNaN(fakeStart) && process.env.NODE_ENV !== 'production') {
  throw new Error(`HMS_FAKE_NOW is not a valid date: ${process.env.HMS_FAKE_NOW}`);
}

function now() {
  return Number.isNaN(fakeStart) ? new Date() : new Date(fakeStart + (Date.now() - bootedAt));
}

// Today's IST date, 'YYYY-MM-DD'.
const todayIst = () => istDate(now());

// 'YYYY-MM-DD' plus n calendar days.
function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
}

// An IST calendar day as a UTC range [start, end) of 'YYYY-MM-DD HH:MM:SS' strings, for DATETIME
// columns (stored in UTC, config/dbTime.js): col >= start AND col < end.
function istDayUtc(isoDate = todayIst()) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return [toSqlUtc(istToUtc(y, m - 1, d, 0, 0)), toSqlUtc(istToUtc(y, m - 1, d + 1, 0, 0))];
}

module.exports = { now, todayIst, addDays, istDayUtc };
