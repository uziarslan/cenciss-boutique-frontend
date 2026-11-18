import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api from '../../api/axios';
import { scheduleTokenRefresh, cancelTokenRefresh } from '../../api/axios';

const initialToken = localStorage.getItem('pos_access_token');
const initialCashier = localStorage.getItem('pos_cashier');
const initialCashierData = initialCashier ? JSON.parse(initialCashier) : null;
const initialOutletCode = localStorage.getItem('pos_outlet_code') || initialCashierData?.outletCode || process.env.REACT_APP_OUTLET_CODE || '';

export const loginCashier = createAsyncThunk(
    'auth/loginCashier',
    async ({ email, password, pin }, { rejectWithValue }) => {
        try {
            const payload = { email, password, pin, role: 'cashier' };
            const response = await api.post('/api/auth/pos-login', payload);
            return response.data?.data ?? response.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Login failed');
        }
    }
);

export const fetchMe = createAsyncThunk(
    'auth/fetchMe',
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get('/api/auth/me');
            return response.data?.user ?? null;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Failed to refresh profile');
        }
    }
);

const authSlice = createSlice({
    name: 'auth',
    initialState: {
        cashier: initialCashier ? JSON.parse(initialCashier) : null,
        accessToken: initialToken || null,
        outletCode: initialOutletCode,
        isLoading: false,
        error: null,
    },
    reducers: {
        logout: (state) => {
            state.cashier = null;
            state.accessToken = null;
            state.outletCode = process.env.REACT_APP_OUTLET_CODE || '';
            state.isLoading = false;
            state.error = null;
            localStorage.removeItem('pos_access_token');
            localStorage.removeItem('pos_cashier');
            localStorage.removeItem('pos_outlet_code');
            // Cancel any pending proactive refresh so it doesn't re-authenticate after logout
            cancelTokenRefresh();
        },
        setAccessToken: (state, action) => {
            state.accessToken = action.payload ?? null;
            if (action.payload) localStorage.setItem('pos_access_token', action.payload);
            else localStorage.removeItem('pos_access_token');
        },
        // Seeds the POS-scoped auth state from the management app's auth so
        // a cashier who signs in once at /login flows straight into the
        // terminal without a second login. Called by TerminalApp on mount.
        hydrateAuth: (state, action) => {
            const { cashier, accessToken, outletCode } = action.payload || {};
            state.cashier = cashier || null;
            state.accessToken = accessToken || null;
            state.outletCode = outletCode || cashier?.outletCode || '';
            if (accessToken) localStorage.setItem('pos_access_token', accessToken);
            else localStorage.removeItem('pos_access_token');
            if (cashier) localStorage.setItem('pos_cashier', JSON.stringify(cashier));
            else localStorage.removeItem('pos_cashier');
            if (state.outletCode) localStorage.setItem('pos_outlet_code', state.outletCode);
            else localStorage.removeItem('pos_outlet_code');
            if (accessToken) scheduleTokenRefresh(accessToken);
            else cancelTokenRefresh();
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(loginCashier.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(loginCashier.fulfilled, (state, action) => {
                state.isLoading = false;
                state.cashier = action.payload.user ?? action.payload.cashier ?? null;
                state.accessToken = action.payload.token ?? action.payload.accessToken ?? null;
                state.outletCode = state.cashier?.outletCode || action.payload.outletCode || process.env.REACT_APP_OUTLET_CODE || '';
                localStorage.setItem('pos_access_token', state.accessToken || '');
                localStorage.setItem('pos_cashier', JSON.stringify(state.cashier || {}));
                localStorage.setItem('pos_outlet_code', state.outletCode || '');
                // Start proactive refresh timer
                scheduleTokenRefresh(state.accessToken);
            })
            .addCase(loginCashier.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload || 'Login failed';
            })
            .addCase(fetchMe.fulfilled, (state, action) => {
                if (action.payload) {
                    // Refresh cashier profile in-place so permissions stay current
                    state.cashier = { ...state.cashier, ...action.payload };
                    localStorage.setItem('pos_cashier', JSON.stringify(state.cashier || {}));
                }
            });
    },
});

export const { logout, setAccessToken, hydrateAuth } = authSlice.actions;
export default authSlice.reducer;

// Schedule proactive refresh for any token that was already in localStorage
// (e.g. page reload). Runs on the next tick so injectStore has time to run first.
if (initialToken) {
    setTimeout(() => scheduleTokenRefresh(initialToken), 0);
}
