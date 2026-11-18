import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import sessionReducer from './slices/sessionSlice';
import menuReducer from './slices/menuSlice';
import cartReducer from './slices/cartSlice';
import offlineReducer from './slices/offlineSlice';
import orderReducer from './slices/orderSlice';
import taxConfigReducer, { DEFAULT_TAX_CONFIG_STATE } from './slices/taxConfigSlice';

const PERSIST_KEY = 'pos_current_order';

const sessionOutletId = (session) => String(session?.outlet?._id || session?.outlet || '');

export function deserializePersistedState(raw) {
    try {
        if (!raw) return undefined;
        const parsed = JSON.parse(raw);
        const preloaded = {};
        if (parsed.cart) {
            // Backfill the cart line identity for carts persisted before sizes
            // existed: those lines have no `lineKey`, which would make the new
            // key-based mutations (remove/qty) target the wrong line or wipe the
            // cart. Recompute it from id + variationId for any line missing it.
            if (Array.isArray(parsed.cart.items)) {
                parsed.cart.items = parsed.cart.items.map((it) => (
                    it.lineKey
                        ? it
                        : {
                            ...it,
                            variationId: it.variationId ?? null,
                            variationName: it.variationName ?? null,
                            lineKey: `${it.id}::${it.variationId ?? ''}`,
                        }
                ));
            }
            preloaded.cart = parsed.cart;
        }
        if (parsed.order) preloaded.order = parsed.order;
        // Restore the open shift so a refresh — including an OFFLINE refresh —
        // lands back on the POS instead of the Open-Shift screen. `resolved:true`
        // lets the route guards decide immediately (no spinner); when online the
        // app still revalidates via fetchCurrentSession and corrects/clears it.
        if (parsed.session) {
            preloaded.session = { session: parsed.session, isLoading: false, error: null, resolved: true };
        }
        const persistedOutletId = String(parsed.taxConfig?.outletId || '');
        if (
            parsed.taxConfig?.loaded === true
            && persistedOutletId
            && persistedOutletId === sessionOutletId(parsed.session)
        ) {
            preloaded.taxConfig = {
                ...DEFAULT_TAX_CONFIG_STATE,
                ...parsed.taxConfig,
                outletId: persistedOutletId,
                loaded: true,
                error: null,
            };
        }
        return Object.keys(preloaded).length ? preloaded : undefined;
    } catch {
        return undefined;
    }
}

function loadPersistedState() {
    return deserializePersistedState(localStorage.getItem(PERSIST_KEY));
}

export const store = configureStore({
    reducer: {
        auth: authReducer,
        session: sessionReducer,
        menu: menuReducer,
        cart: cartReducer,
        offline: offlineReducer,
        order: orderReducer,
        taxConfig: taxConfigReducer,
    },
    preloadedState: loadPersistedState(),
});

// Persist the order, open shift, and last server-confirmed tax configuration.
// The tax snapshot is what lets an offline refresh retain the exact outlet total.
let _prevCart = null;
let _prevOrder = null;
let _prevSession = null;
let _prevTaxConfig = null;
store.subscribe(() => {
    const state = store.getState();
    const sess = state.session?.session ?? null;
    if (
        state.cart === _prevCart
        && state.order === _prevOrder
        && sess === _prevSession
        && state.taxConfig === _prevTaxConfig
    ) return;
    _prevCart = state.cart;
    _prevOrder = state.order;
    _prevSession = sess;
    _prevTaxConfig = state.taxConfig;
    try {
        localStorage.setItem(PERSIST_KEY, JSON.stringify({
            cart: state.cart,
            order: state.order,
            session: sess,
            taxConfig: state.taxConfig?.loaded ? state.taxConfig : null,
        }));
    } catch {
        // storage quota exceeded — silently ignore
    }
});
