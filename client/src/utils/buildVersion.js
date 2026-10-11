// Noticing a newer deployment. Each build has an id (vite.config.js): compiled in as __BUILD_ID__
// and published as /version.json. A tab whose id differs from the published one is running an
// older build: it shows a reload banner, and reloads by itself before the next sign-in.
/* global __BUILD_ID__ */
export const BUILD_ID = __BUILD_ID__;
const TRIED = 'hms-reloaded-from-build';
const USERNAME = 'hms-update-username';

// The deployed build's id, or null when unknown (no version.json, e.g. the dev server; offline).
export async function deployedBuild() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.build === 'string' ? body.build : null;
  } catch { return null; }
}
export async function isOutdated() {
  const deployed = await deployedBuild();
  return Boolean(deployed) && deployed !== BUILD_ID;
}

// Reload once to pick up the new build, keeping the username typed so far. Not repeated when a
// reload already happened from this same build (the new one did not arrive): no reload loop.
export function reloadForUpdate(username) {
  try {
    if (sessionStorage.getItem(TRIED) === BUILD_ID) return false;
    sessionStorage.setItem(TRIED, BUILD_ID);
    if (username) sessionStorage.setItem(USERNAME, username);
  } catch { /* storage blocked: still reload */ }
  window.location.reload();
  return true;
}
// After an update reload: the username to prefill (read during render, cleared once shown).
export function updateUsername() {
  try { return sessionStorage.getItem(USERNAME); } catch { return null; }
}
export function clearUpdateUsername() {
  try { sessionStorage.removeItem(USERNAME); } catch { /* ignore */ }
}
