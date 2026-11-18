import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';

// Reachability-based online status for the POS header.
//
// `navigator.onLine` alone is unreliable: it reports TRUE whenever any network
// interface exists — even on a Wi-Fi with no real internet — so the header
// would wrongly show "Online" while actually offline. We confirm by pinging the
// backend health endpoint. Offline is reported when the browser says offline OR
// the health check fails. (The /api/health ping is public and goes through the
// shared axios instance, which only reacts to 401s — a network error just
// rejects with no toast/refresh side effects.)
const HEALTHY_PING_INTERVAL_MS = 60_000;
const RECOVERY_PING_INTERVAL_MS = 5_000;
const PING_TIMEOUT_MS = 8000;

const useOnlineStatus = () => {
  const [online, setOnline] = useState(window.navigator.onLine);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;

    let timer = null;
    const schedule = (delay) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(check, delay);
    };

    const check = async () => {
      if (!window.navigator.onLine) {
        if (aliveRef.current) setOnline(false);
        schedule(RECOVERY_PING_INTERVAL_MS);
        return;
      }
      try {
        await api.get('/api/health', { timeout: PING_TIMEOUT_MS });
        if (aliveRef.current) setOnline(true);
        schedule(HEALTHY_PING_INTERVAL_MS);
      } catch {
        if (aliveRef.current) setOnline(false);
        schedule(RECOVERY_PING_INTERVAL_MS);
      }
    };

    check(); // immediate
    const onBrowserOnline = () => check();             // re-verify reachability
    const onBrowserOffline = () => {
      if (aliveRef.current) setOnline(false);
      schedule(RECOVERY_PING_INTERVAL_MS);
    };
    window.addEventListener('online', onBrowserOnline);
    window.addEventListener('offline', onBrowserOffline);

    return () => {
      cancelled = true;
      aliveRef.current = false;
      clearTimeout(timer);
      window.removeEventListener('online', onBrowserOnline);
      window.removeEventListener('offline', onBrowserOffline);
    };
  }, []);

  return online;
};

export default useOnlineStatus;
