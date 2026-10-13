// Calendar dates for the UI tests, in India time. The server and the pages decide "today" in IST
// (server/utils/clock.js, client/src/utils/istDate.js) and every test page runs with its browser
// time zone set to Asia/Kolkata (lib/readable.js), so no test depends on this machine's time zone.
const { todayIst, addDays } = require(require('path').join(__dirname, '..', '..', '..', 'server', 'utils', 'clock'));

const today = () => todayIst();
const daysFromToday = (n) => addDays(todayIst(), n);
// Whole years from a 'YYYY-MM-DD' date of birth to today (IST).
const ageOn = (dob, on = today()) => Number(on.slice(0, 4)) - Number(dob.slice(0, 4)) - (on.slice(5) < dob.slice(5) ? 1 : 0);

module.exports = { today, daysFromToday, ageOn };
