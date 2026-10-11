import React, { useEffect, useState } from 'react';
import { isOutdated } from '../utils/buildVersion';

const CHECK_EVERY_MS = 60000;

// "A new version is available" when this tab is running an older build than the one deployed.
// Checked on load, every minute, and whenever the tab comes back into focus.
export default function UpdateBanner() {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = async () => { if (await isOutdated() && alive) setOutdated(true); };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  if (!outdated) return null;
  return (
    <div role="status" data-testid="update-banner" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '10px 16px', background: 'var(--primary)', color: 'white', boxShadow: 'var(--shadow)' }}>
      <span>A new version is available.</span>
      <button onClick={() => window.location.reload()} style={{ padding: '4px 12px', border: '1px solid white', borderRadius: '4px', background: 'white', color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer' }}>Reload</button>
    </div>
  );
}
