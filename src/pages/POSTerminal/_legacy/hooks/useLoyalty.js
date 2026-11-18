import { useEffect, useState, useCallback } from 'react';
import { getLoyaltyConfig, getMember } from '../api/loyaltyApi';

// Module-level cache so multiple panels don't all re-probe the config endpoint.
// We only cache *definitive* answers:
//   - success → cachedConfig is set, feature is enabled
//   - 403 (FEATURE_DISABLED) → cachedDisabled is set, feature is off
// Network failures and other transient errors do NOT poison the cache: the
// next caller re-probes so a brief offline blip at startup doesn't disable
// the loyalty UI for the rest of the cashier's shift.
let cachedConfig = null;
let cachedConfigPromise = null;
let cachedDisabled = false;

export const useLoyalty = () => {
  const [config, setConfig] = useState(cachedConfig);
  const [enabled, setEnabled] = useState(!cachedDisabled && cachedConfig != null);
  const [ready, setReady] = useState(cachedConfig != null || cachedDisabled);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (cachedConfig) {
        if (alive) { setConfig(cachedConfig); setEnabled(true); setReady(true); }
        return;
      }
      if (cachedDisabled) {
        if (alive) { setEnabled(false); setReady(true); }
        return;
      }
      if (!cachedConfigPromise) {
        cachedConfigPromise = getLoyaltyConfig()
          .then((res) => {
            cachedConfig = res?.data?.data ?? null;
            return { kind: 'ok', config: cachedConfig };
          })
          .catch((err) => {
            const status = err?.response?.status;
            if (status === 403) {
              cachedDisabled = true;
              return { kind: 'disabled' };
            }
            // Transient (network, 5xx, etc.) — clear the in-flight promise
            // so the *next* caller re-probes. Don't cache a verdict.
            cachedConfigPromise = null;
            return { kind: 'transient' };
          });
      }
      const result = await cachedConfigPromise;
      if (!alive) return;
      if (result?.kind === 'ok' && result.config) {
        setConfig(result.config);
        setEnabled(true);
      } else if (result?.kind === 'disabled') {
        setEnabled(false);
      }
      // 'transient' → leave enabled=false but ready=true so callers don't
      // hang. Subsequent renders/online events will re-probe.
      setReady(true);
    };
    load();

    // Re-probe when the browser comes back online — covers the case where
    // the POS terminal was launched offline.
    const onOnline = () => {
      if (cachedConfig || cachedDisabled) return;
      cachedConfigPromise = null;
      load();
    };
    window.addEventListener('online', onOnline);
    return () => { alive = false; window.removeEventListener('online', onOnline); };
  }, []);

  return { config, enabled, ready };
};

/**
 * Fetch a single member's points + recent activity. Skipped silently when
 * loyalty is disabled or the network is unavailable.
 */
export const useMember = (customerId) => {
  const { enabled } = useLoyalty();
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !customerId) { setMember(null); return; }
    setLoading(true);
    try {
      const res = await getMember(customerId);
      setMember(res?.data?.data ?? null);
    } catch {
      // Offline or transient — keep whatever we already had cached.
      setMember((prev) => prev);
    } finally {
      setLoading(false);
    }
  }, [enabled, customerId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { member, loading, refresh };
};
