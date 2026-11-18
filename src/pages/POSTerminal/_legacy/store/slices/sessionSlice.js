import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api from '../../api/axios';

export const fetchCurrentSession = createAsyncThunk('session/fetchCurrentSession', async (_, { rejectWithValue }) => {
    try {
        const response = await api.get('/api/pos/sessions/current');
        return response.data?.data ?? response.data;
    } catch (err) {
        return rejectWithValue(err.response?.data?.message || 'Failed to load session');
    }
});

export const openSession = createAsyncThunk('session/openSession', async (payload, { rejectWithValue }) => {
    try {
        const response = await api.post('/api/pos/sessions/open', payload);
        return response.data?.data ?? response.data;
    } catch (err) {
        return rejectWithValue(err.response?.data?.message || 'Failed to open session');
    }
});

export const closeSession = createAsyncThunk('session/closeSession', async (payload, { rejectWithValue }) => {
    try {
        const response = await api.post('/api/pos/sessions/close', payload);
        return response.data?.data ?? response.data;
    } catch (err) {
        return rejectWithValue(err.response?.data?.message || 'Failed to close session');
    }
});

const sessionSlice = createSlice({
    name: 'session',
    initialState: {
        session: null,
        isLoading: false,
        error: null,
        // false until the current session has been fetched at least once. The
        // route guards wait for this so refreshing the POS doesn't flash the
        // "Open Session" screen before the existing open session is known.
        resolved: false,
    },
    reducers: {
        clearSession: (state) => {
            state.session = null;
            state.error = null;
            state.isLoading = false;
            state.resolved = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchCurrentSession.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(fetchCurrentSession.fulfilled, (state, action) => {
                state.isLoading = false;
                state.resolved = true;
                state.session = action.payload || null;
            })
            .addCase(fetchCurrentSession.rejected, (state, action) => {
                state.isLoading = false;
                state.resolved = true;
                state.error = action.payload || 'Could not load current session';
            })
            .addCase(openSession.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(openSession.fulfilled, (state, action) => {
                state.isLoading = false;
                state.resolved = true;
                state.session = action.payload;
            })
            .addCase(openSession.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload || 'Could not open session';
            })
            .addCase(closeSession.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(closeSession.fulfilled, (state, action) => {
                state.isLoading = false;
                state.resolved = true;
                state.session = action.payload;
            })
            .addCase(closeSession.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload || 'Could not close session';
            });
    },
});

export const { clearSession } = sessionSlice.actions;
export default sessionSlice.reducer;
