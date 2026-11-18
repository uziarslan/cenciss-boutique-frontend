import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { scheduleTokenRefresh, cancelTokenRefresh } from '../../api/axios';
import { disconnectOpsSocket } from '../../utils/opsSocket';

// ── Thunks ────────────────────────────────────────────────────────────────────

export const loginUser = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const { data } = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/auth/login`,
        { email, password },
        { withCredentials: true }
      );
      return { user: data.user, accessToken: data.accessToken };
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message ?? 'Login failed. Please try again.'
      );
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/auth/logout`,
        {},
        { withCredentials: true }
      );
    } catch {
      // best-effort — always clear local state
    }
  }
);

// ── Slice ─────────────────────────────────────────────────────────────────────

const stored = (() => {
  try {
    return {
      user: JSON.parse(localStorage.getItem('user')),
      accessToken: localStorage.getItem('accessToken'),
    };
  } catch {
    return { user: null, accessToken: null };
  }
})();

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: stored.user ?? null,
    accessToken: stored.accessToken ?? null,
    isLoading: false,
    error: null,
  },
  reducers: {
    clearError(state) {
      state.error = null;
    },
    setUser(state, action) {
      state.user = action.payload ?? null;
      if (action.payload) localStorage.setItem('user', JSON.stringify(action.payload));
      else localStorage.removeItem('user');
    },
    setAccessToken(state, action) {
      state.accessToken = action.payload ?? null;
      if (action.payload) localStorage.setItem('accessToken', action.payload);
      else localStorage.removeItem('accessToken');
    },
    clearAuth(state) {
      state.user = null;
      state.accessToken = null;
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      cancelTokenRefresh();
    },
  },
  extraReducers: (builder) => {
    // ── login ────────────────────────────────────────────────────────────────
    builder
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        localStorage.setItem('user', JSON.stringify(action.payload.user));
        localStorage.setItem('accessToken', action.payload.accessToken);
        // Start proactive refresh timer
        scheduleTokenRefresh(action.payload.accessToken);
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // ── logout ───────────────────────────────────────────────────────────────
    builder
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        localStorage.removeItem('user');
        localStorage.removeItem('accessToken');
        cancelTokenRefresh();
        disconnectOpsSocket();
      })
      .addCase(logoutUser.rejected, (state) => {
        // still clear on failure
        state.user = null;
        state.accessToken = null;
        localStorage.removeItem('user');
        localStorage.removeItem('accessToken');
        cancelTokenRefresh();
        disconnectOpsSocket();
      });
  },
});

export const { clearError, setUser, setAccessToken, clearAuth } = authSlice.actions;
export default authSlice.reducer;

// Schedule proactive refresh for any token already in localStorage (page reload).
// Runs on next tick so the store and injectStore are both ready.
if (stored.accessToken) {
  setTimeout(() => scheduleTokenRefresh(stored.accessToken), 0);
}
