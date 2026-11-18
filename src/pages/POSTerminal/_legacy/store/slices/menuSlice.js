import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { getMenu, getMenuAvailability } from '../../api/menuApi';
import { posMenuCacheKey } from '../../../../../utils/posMenuRefresh';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cacheKey = posMenuCacheKey;

const loadCachedMenu = (outletCode = localStorage.getItem('pos_outlet_code') || '') => {
    try {
        if (!outletCode) return null;
        const raw = localStorage.getItem(cacheKey(outletCode));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.categories || !parsed?.fetchedAt) return null;
        return { ...parsed, outletCode, stale: Date.now() - parsed.fetchedAt > CACHE_TTL };
    } catch (error) {
        return null;
    }
};

const writeCachedMenu = (outletCode, patch) => {
    if (!outletCode) return;
    let current = {};
    try {
        current = JSON.parse(localStorage.getItem(cacheKey(outletCode))) || {};
    } catch {
        current = {};
    }
    localStorage.setItem(cacheKey(outletCode), JSON.stringify({
        ...current,
        ...patch,
        outletCode,
    }));
};

const cachedMenu = loadCachedMenu();

export const fetchMenu = createAsyncThunk(
    'menu/fetchMenu',
    async (outletCode, { getState, rejectWithValue }) => {
        const state = getState();
        if (
            state.menu.outletCode === outletCode
            && state.menu.lastFetched
            && Date.now() - state.menu.lastFetched < CACHE_TTL
        ) {
            return {
                categories: state.menu.categories,
                cached: true,
                stale: false,
                fetchedAt: state.menu.lastFetched,
                outletCode,
            };
        }

        try {
            const result = await getMenu(outletCode);
            return {
                categories: result.categories || result || [],
                cached: false,
                stale: false,
                fetchedAt: Date.now(),
                outletCode,
            };
        } catch (err) {
            const fallback = loadCachedMenu(outletCode);
            if (fallback) {
                return {
                    categories: fallback.categories,
                    cached: true,
                    stale: true,
                    fetchedAt: fallback.fetchedAt,
                    outletCode,
                };
            }
            return rejectWithValue(err.response?.data?.message || 'Failed to load menu');
        }
    }
);

// Availability is intentionally NOT cached — we re-pull it on cart change and
// after every paid sale so the cashier sees a near-real-time count.
export const fetchMenuAvailability = createAsyncThunk(
    'menu/fetchMenuAvailability',
    async (outletCode, { rejectWithValue }) => {
        try {
            return {
                availability: await getMenuAvailability(outletCode),
                fetchedAt: Date.now(),
                outletCode,
                cached: false,
            };
        } catch (err) {
            const fallback = loadCachedMenu(outletCode);
            if (fallback?.availability) {
                return {
                    availability: fallback.availability,
                    fetchedAt: fallback.availabilityFetchedAt || fallback.fetchedAt,
                    outletCode,
                    cached: true,
                };
            }
            return rejectWithValue(err.response?.data?.message || 'Failed to load availability');
        }
    }
);

const menuSlice = createSlice({
    name: 'menu',
    initialState: {
        categories: cachedMenu?.categories || [],
        isLoading: false,
        lastFetched: cachedMenu?.fetchedAt || null,
        outletCode: cachedMenu?.outletCode || '',
        isStale: cachedMenu?.stale === true,
        error: null,
        // Map { menuItemId: { available, hasRecipe, missingRecipe, bottleneck? } }
        // available is null for items that don't track inventory.
        availability: cachedMenu?.availability || {},
        availabilityLoading: false,
        availabilityLastFetched: cachedMenu?.availabilityFetchedAt || null,
    },
    reducers: {
        clearMenu: (state) => {
            if (state.outletCode) localStorage.removeItem(cacheKey(state.outletCode));
            state.categories = [];
            state.lastFetched = null;
            state.outletCode = '';
            state.isStale = false;
            state.error = null;
            state.availability = {};
            state.availabilityLastFetched = null;
        },
        // Clears only the cache timestamp so the next fetchMenu call hits the API
        // without blanking the currently displayed categories first.
        invalidateMenuCache: (state) => {
            state.lastFetched = null;
            state.isStale = true;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchMenu.pending, (state, action) => {
                state.isLoading = true;
                state.error = null;
                if (state.outletCode !== action.meta.arg) {
                    const scopedCache = loadCachedMenu(action.meta.arg);
                    state.categories = scopedCache?.categories || [];
                    state.availability = scopedCache?.availability || {};
                    state.availabilityLastFetched = scopedCache?.availabilityFetchedAt || null;
                    state.outletCode = action.meta.arg;
                    state.lastFetched = null;
                    state.isStale = Boolean(scopedCache);
                }
            })
            .addCase(fetchMenu.fulfilled, (state, action) => {
                state.isLoading = false;
                state.categories = action.payload.categories;
                state.lastFetched = action.payload.fetchedAt;
                state.outletCode = action.payload.outletCode;
                state.isStale = action.payload.stale === true;
                if (!action.payload.cached) {
                    writeCachedMenu(action.payload.outletCode, {
                        categories: action.payload.categories,
                        fetchedAt: action.payload.fetchedAt,
                    });
                }
            })
            .addCase(fetchMenu.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload || 'Failed to load menu';
            })
            .addCase(fetchMenuAvailability.pending, (state, action) => {
                state.availabilityLoading = true;
                if (state.outletCode !== action.meta.arg) {
                    const scopedCache = loadCachedMenu(action.meta.arg);
                    state.availability = scopedCache?.availability || {};
                    state.availabilityLastFetched = scopedCache?.availabilityFetchedAt || null;
                    state.outletCode = action.meta.arg;
                }
            })
            .addCase(fetchMenuAvailability.fulfilled, (state, action) => {
                state.availability = action.payload.availability || {};
                state.availabilityLoading = false;
                state.availabilityLastFetched = action.payload.fetchedAt;
                if (!action.payload.cached) {
                    writeCachedMenu(action.payload.outletCode, {
                        availability: action.payload.availability || {},
                        availabilityFetchedAt: action.payload.fetchedAt,
                    });
                }
            })
            .addCase(fetchMenuAvailability.rejected, (state) => {
                state.availabilityLoading = false;
            });
    },
});

export const { clearMenu, invalidateMenuCache } = menuSlice.actions;
export default menuSlice.reducer;
