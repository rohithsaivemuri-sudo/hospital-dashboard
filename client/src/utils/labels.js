// Plain-language labels for status codes and times shown to staff.
export const APPOINTMENT_STATUS = {
  BOOKED: 'Booked', CHECKED_IN: 'Checked in', IN_PROGRESS: 'With the doctor', COMPLETED: 'Completed',
  CANCELLED: 'Cancelled', NO_SHOW: 'No-show',
};
export const VISIT_STATUS = {
  PLANNED: 'Planned', ARRIVED: 'Arrived', TRIAGED: 'Triaged', IN_PROGRESS: 'In progress', FINISHED: 'Finished',
  CANCELLED: 'Cancelled', ENTERED_IN_ERROR: 'Entered in error',
};
const words = (code) => (code ? String(code).toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()) : '—');
export const appointmentStatus = (code) => APPOINTMENT_STATUS[code] || words(code);
export const visitStatus = (code) => VISIT_STATUS[code] || words(code);

// "09:35:00" -> "09:35"
export const hhmm = (time) => (time ? String(time).slice(0, 5) : '');

// Local calendar date as YYYY-MM-DD.
export const localIsoDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// "1 active admission", "2 active admissions"
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
