import React, { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// Where problem reports go: a GitHub "new issue" URL with the problem-report form (override at build
// time with VITE_ISSUES_URL).
const ISSUES_URL = import.meta.env.VITE_ISSUES_URL || 'https://github.com/rohithsaivemuri-sudo/hospital-dashboard/issues/new';

// Record numbers in a path (/patients/16) become :id, so no patient identifier reaches the issue.
export const pagePattern = (pathname) => pathname.split('/').map(s => (/^\d+$/.test(s) ? ':id' : s)).join('/') || '/';

// Local time with its UTC offset, e.g. 2026-10-10 14:05 (UTC+05:30).
function localTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} (UTC${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)})`;
}

export function reportProblemUrl({ role, pathname, now = new Date() }) {
  const params = new URLSearchParams({ template: 'problem-report.yml', role: role || 'Not signed in', page: pagePattern(pathname), time: localTime(now) });
  return `${ISSUES_URL}?${params}`;
}

// "Report a problem": opens a new GitHub issue pre-filled with role, page and time. The URL is built
// when clicked, so the time is the moment of the report.
export default function ReportProblemLink({ style }) {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const open = (e) => { e.currentTarget.href = reportProblemUrl({ role: user?.role, pathname: location.pathname }); };
  return (
    <a data-testid="report-problem" href={reportProblemUrl({ role: user?.role, pathname: location.pathname })}
      onClick={open} onAuxClick={open} target="_blank" rel="noopener noreferrer"
      style={{ color: 'var(--primary)', fontSize: '14px', fontWeight: 600, textDecoration: 'none', ...style }}>
      Report a problem
    </a>
  );
}
