import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { getTaxConfig } from '../../api/taxApi';

export const DEFAULT_TAX_CONFIG_STATE = {
    standardRate: 16,
    cardRate: 5,
    cardReducedEnabled: true,
    onlineReducedEnabled: true,
    serviceChargeRate: 0,
    serviceChargeOrderTypes: ['dine-in'],
    outletId: null,
    loaded: false,
    error: null,
};

export const fetchTaxConfig = createAsyncThunk(
    'taxConfig/fetch',
    async (outletId, { rejectWithValue }) => {
        try {
            return await getTaxConfig(outletId);
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Failed to load tax config');
        }
    }
);

const taxConfigSlice = createSlice({
    name: 'taxConfig',
    initialState: { ...DEFAULT_TAX_CONFIG_STATE },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchTaxConfig.pending, (state, action) => {
                const requestedOutletId = String(action.meta.arg || '');
                if (state.outletId && String(state.outletId) !== requestedOutletId) {
                    Object.assign(state, {
                        ...DEFAULT_TAX_CONFIG_STATE,
                        outletId: requestedOutletId,
                    });
                } else if (!state.outletId) {
                    state.outletId = requestedOutletId;
                }
                state.error = null;
            })
            .addCase(fetchTaxConfig.fulfilled, (state, action) => {
                const cfg = action.payload || {};
                if (typeof cfg.standardRate === 'number') state.standardRate = cfg.standardRate;
                if (typeof cfg.cardRate === 'number') state.cardRate = cfg.cardRate;
                if (typeof cfg.cardReducedEnabled === 'boolean') state.cardReducedEnabled = cfg.cardReducedEnabled;
                if (typeof cfg.onlineReducedEnabled === 'boolean') state.onlineReducedEnabled = cfg.onlineReducedEnabled;
                if (typeof cfg.serviceChargeRate === 'number') state.serviceChargeRate = cfg.serviceChargeRate;
                if (Array.isArray(cfg.serviceChargeOrderTypes)) state.serviceChargeOrderTypes = cfg.serviceChargeOrderTypes;
                state.outletId = String(action.meta.arg || '');
                state.loaded = true;
                state.error = null;
            })
            .addCase(fetchTaxConfig.rejected, (state, action) => {
                // A confirmed snapshot for this outlet remains usable offline.
                // With no snapshot, `loaded` stays false and checkout is blocked.
                state.error = action.payload || 'Failed to load tax config';
            });
    },
});

// Effective tax rate (%) for the fraction already determined to be eligible for
// the shared reduced payment rate. Payment-method settings are applied by the
// caller before this calculation.
export const effectiveTaxRate = (cfg, reducedFraction) => {
    const f = Math.min(1, Math.max(0, Number(reducedFraction) || 0));
    const standard = Number(cfg?.standardRate ?? 0);
    const reduced = Number(cfg?.cardRate ?? standard);
    return reduced * f + standard * (1 - f);
};

export default taxConfigSlice.reducer;
