import axios from 'axios';
import { getRecipeUnlockToken, RECIPE_UNLOCK_HEADER } from '../utils/recipeUnlock';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
  withCredentials: true,
});

// ── Request interceptor: attach access token ─────────────────────────────────

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Attach the recipe-unlock token when one is held (and still valid) so the
  // backend will return locked recipes' ingredients. Absent/expired ⇒ no header,
  // and locked recipes stay withheld.
  const unlock = getRecipeUnlockToken();
  if (unlock) {
    config.headers[RECIPE_UNLOCK_HEADER] = unlock;
  }
  return config;
});

// ── Single-flight token refresh ──────────────────────────────────────────────
// Both the proactive timer and the reactive 401 interceptor funnel through
// requestRefresh(). The in-flight promise is shared, so no matter how many
// callers ask at once (multiple tabs' requests, proactive + reactive, a burst
// of parallel 401s) only ONE /api/auth/refresh hits the server. That prevents
// the refresh-token rotation race that used to cause spurious logouts.

let refreshPromise = null;

const syncNewToken = async (newToken) => {
  localStorage.setItem('accessToken', newToken);
  api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
  try {
    const storeMod = await import('../store');
    const actions = await import('../store/slices/authSlice');
    storeMod.default.dispatch(actions.setAccessToken(newToken));
  } catch (e) { /* best-effort */ }
  scheduleTokenRefresh(newToken);
};

const handleAuthFailure = async () => {
  try {
    const storeMod = await import('../store');
    const actions = await import('../store/slices/authSlice');
    storeMod.default.dispatch(actions.clearAuth());
  } catch (e) { /* best-effort */ }
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

export const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${process.env.REACT_APP_API_URL}/api/auth/refresh`, {}, { withCredentials: true })
      .then(async ({ data }) => {
        const newToken = data.accessToken;
        if (!newToken) throw new Error('Refresh response missing access token.');
        await syncNewToken(newToken);
        return newToken;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
};

// ── Proactive token refresh ───────────────────────────────────────────────────
const getTokenTimes = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { iat: payload.iat * 1000, exp: payload.exp * 1000 };
  } catch {
    return null;
  }
};

let _refreshTimer = null;
let _refreshCancelled = false;

const doProactiveRefresh = async () => {
  _refreshTimer = null;
  if (_refreshCancelled) return;
  try {
    await refreshAccessToken();
  } catch {
    // Check the flag after the await — user may have logged out while in-flight.
    if (_refreshCancelled) return;
    // A temporary network/cookie failure must not destroy a still-valid login.
    // Retry within the remaining access-token window; the reactive interceptor
    // remains authoritative once an API request actually receives a 401.
    const token = localStorage.getItem('accessToken');
    const times = token ? getTokenTimes(token) : null;
    const remaining = times ? times.exp - Date.now() : 0;
    if (remaining > 0) {
      const retryDelay = Math.min(5 * 60 * 1000, Math.max(30 * 1000, remaining / 2));
      _refreshTimer = setTimeout(doProactiveRefresh, retryDelay);
      return;
    }
    await handleAuthFailure();
  }
};

export const cancelTokenRefresh = () => {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer);
    _refreshTimer = null;
  }
  _refreshCancelled = true;
};

export const scheduleTokenRefresh = (token) => {
  cancelTokenRefresh();
  _refreshCancelled = false; // reset flag for the new session
  if (!token) return;
  const envLifetimeMs = parseInt(process.env.REACT_APP_ACCESS_TOKEN_LIFETIME_MS, 10) || null;
  const times = getTokenTimes(token);
  if (!times && !envLifetimeMs) return;
  // Drive the timer off the token's ACTUAL lifetime (exp − iat). The env value
  // is only a fallback for when the token can't be parsed — it must never
  // override the real expiry, or a backend lifetime change (or a build whose
  // env is stale) would schedule the refresh at the wrong time.
  const lifetime = times ? (times.exp - times.iat) : envLifetimeMs;
  const issuedAt = times ? times.iat : Date.now();
  const delay = Math.max(0, (issuedAt + lifetime * 0.8) - Date.now());
  _refreshTimer = setTimeout(doProactiveRefresh, delay);
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Subscription expired / suspended — redirect to billing-blocked screen.
    if (error.response?.status === 402) {
      if (window.location.pathname !== '/billing/expired') {
        window.location.href = '/billing/expired';
      }
      return Promise.reject(error);
    }

    // Feature disabled — the backend explicitly rejected because the tenant's
    // plan does not include this module. Silently return empty data so any
    // page that indirectly calls a disabled endpoint degrades gracefully
    // instead of crashing. No permission-refresh needed (this is not a perm
    // change — the feature flag is already in Redux state).
    if (error.response?.status === 403 && error.response?.data?.code === 'FEATURE_DISABLED') {
      return Promise.resolve({ data: { success: false, data: null, _featureDisabled: true } });
    }

    // If forbidden for any other reason, attempt to refresh current user's
    // profile so client state reflects permission changes applied server-side.
    if (error.response?.status === 403 && !original._permissionRefreshed) {
      original._permissionRefreshed = true;
      try {
        const token = localStorage.getItem('accessToken');
        const resp = await axios.get(`${process.env.REACT_APP_API_URL}/api/auth/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        });
        if (resp?.data?.user) {
          try {
            const storeMod = await import('../store');
            const actions = await import('../store/slices/authSlice');
            storeMod.default.dispatch(actions.setUser(resp.data.user));
          } catch (e) { /* best-effort */ }
        }
      } catch (e) {
        // ignore — user may be logged out
      }
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;

    // All concurrent 401s await the same single-flight refresh, then retry with
    // the fresh token. Only one /refresh request is sent regardless of how many
    // requests failed.
    try {
      const newToken = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (err) {
      await handleAuthFailure();
      return Promise.reject(err);
    }
  }
);

export default api;
