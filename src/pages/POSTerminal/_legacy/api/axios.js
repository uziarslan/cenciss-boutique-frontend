import axios from 'axios';
import toast from 'react-hot-toast';
import {
    cancelTokenRefresh,
    refreshAccessToken,
    scheduleTokenRefresh,
} from '../../../../api/axios';

// The management shell and POS share one login and therefore must share one
// refresh timer/promise. Re-export these for the legacy POS auth slice.
export { cancelTokenRefresh, scheduleTokenRefresh };

const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL,
    withCredentials: true, // sends the httpOnly refreshToken cookie on every request
    // A hung connection (not a clean offline) would otherwise never reject —
    // freezing the boot spinner or a checkout. 20s is far above normal latency,
    // so valid-but-slow requests still complete; a timed-out sale just queues.
    timeout: 20000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Lazy store import to avoid circular dependency (store → api → store)
let _store = null;
export const injectStore = (store) => { _store = store; };

const getAuthToken = () => localStorage.getItem('pos_access_token');
const setAuthToken = (token) => localStorage.setItem('pos_access_token', token);
const removeAuthToken = () => localStorage.removeItem('pos_access_token');

api.interceptors.request.use((config) => {
    const token = getAuthToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    // Owners/managers are not permanently assigned to one outlet; their open
    // POS session supplies the outlet context used by backend feature gates.
    // Cashiers also send it, but the server still gives their account-bound
    // outlet precedence.
    const sessionOutlet = _store?.getState?.()?.session?.session?.outlet;
    const outletId = sessionOutlet?._id || sessionOutlet || null;
    if (outletId) config.headers['X-Outlet-Id'] = String(outletId);
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        // Never attempt token refresh on auth endpoints (login, refresh)
        const isAuthEndpoint = originalRequest?.url?.includes('/api/auth/pos-login') ||
            originalRequest?.url?.includes('/api/auth/refresh');
        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
            originalRequest._retry = true;
            try {
                // Shared with the management API: all concurrent main/POS 401s
                // await one refresh-token rotation instead of racing each other.
                const newToken = await refreshAccessToken();
                if (newToken) {
                    setAuthToken(newToken);
                    api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
                    if (_store) {
                        const { setAccessToken } = await import('../store/slices/authSlice');
                        _store.dispatch(setAccessToken(newToken));
                    }
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    return api(originalRequest);
                }
            } catch { /* handled below */ }

            // Refresh failed — clear both POS and management auth.
            removeAuthToken();
            if (_store) {
                const { default: unifiedLogout } = await import('../utils/unifiedLogout');
                toast.error('Your session has expired. Please log in again.');
                return unifiedLogout(_store.dispatch);
            }
            toast.error('Your session has expired. Please log in again.');
            setTimeout(() => { window.location.href = '/login'; }, 1500);
        }

        return Promise.reject(error);
    }
);

export default api;
