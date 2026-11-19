import { useEffect, useRef, useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';

import mainStore from '../../store';
import { Toaster } from 'react-hot-toast';

import { store as posStore } from './_legacy/store';
import { injectStore } from './_legacy/api/axios';
import AppRoutes from './_legacy/routes';
import { fetchCurrentSession, clearSession } from './_legacy/store/slices/sessionSlice';
import { fetchMe, hydrateAuth, logout as posLogout } from './_legacy/store/slices/authSlice';
import { clearCart } from './_legacy/store/slices/cartSlice';
import { resetOrder } from './_legacy/store/slices/orderSlice';
import { clearMenu } from './_legacy/store/slices/menuSlice';
import ReceiptPrintProvider from './_legacy/components/Print/ReceiptPrintProvider';

// Run once at module load — gives the legacy axios interceptor a handle to
// the POS-scoped redux store so it can dispatch logout / clearCart on
// session-expiry.
injectStore(posStore);

// Mirror the management app's auth into the POS-scoped store. Returns true when
// a logged-in user was seeded, false when it dispatched a logout. Shared by the
// synchronous first-render seed and the live AuthBridge subscription below.
const syncPosAuthFromMain = () => {
  const { user, accessToken } = mainStore.getState().auth;
  if (accessToken && user) {
    const previousCashier = posStore.getState().auth.cashier;
    const previousCashierId = previousCashier?._id || previousCashier?.id || null;
    if (previousCashierId && String(previousCashierId) !== String(user.id)) {
      posStore.dispatch(clearCart());
      posStore.dispatch(resetOrder());
      posStore.dispatch(clearSession());
      posStore.dispatch(clearMenu());
      localStorage.removeItem('pos_current_order');
    }
    posStore.dispatch(
      hydrateAuth({
        cashier: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: user.permissions || {},
          posDiscountLimitPercent: Number.isFinite(Number(user.posDiscountLimitPercent))
            ? Number(user.posDiscountLimitPercent)
            : 100,
          outletCode: user.outletCode || user.outlet || '',
          // Carry the tenant (incl. feature flags) so the POS can gate features
          // like QR self-ordering immediately, before fetchMe re-fetches profile.
          tenant: user.tenant || undefined,
        },
        accessToken,
        outletCode: user.outletCode || user.outlet || '',
      })
    );
    return true;
  }
  posStore.dispatch(posLogout());
  // Also drop the persisted shift so a logged-out terminal can't preload a
  // previous user's session on the next load (any logout path is covered here).
  posStore.dispatch(clearSession());
  posStore.dispatch(clearCart());
  posStore.dispatch(resetOrder());
  posStore.dispatch(clearMenu());
  localStorage.removeItem('pos_current_order');
  return false;
};

const SessionInit = () => {
  const dispatch = useDispatch();
  const accessToken = useSelector((s) => s.auth.accessToken);
  const prevAuthenticated = useRef(false);

  useEffect(() => {
    const isNow = !!accessToken;
    const justLoggedIn = isNow && !prevAuthenticated.current;
    prevAuthenticated.current = isNow;
    if (justLoggedIn) {
      dispatch(fetchMe());
      dispatch(fetchCurrentSession());
    }
  }, [accessToken, dispatch]);

  return null;
};

// Bridges the management app's auth into the terminal's redux store. We
// subscribe to the main store directly (rather than via useSelector) because
// inside this component the closest Provider is the POS store. When the
// cashier signs in at /login, the main store updates; we mirror that into
// the POS store so the terminal skips its own login.
const AuthBridge = () => {
  useEffect(() => {
    // Re-sync on every management-store change. The initial seed already ran
    // synchronously in TerminalApp (see below), so this only keeps it current.
    syncPosAuthFromMain();
    return mainStore.subscribe(syncPosAuthFromMain);
  }, []);

  return null;
};

// POS terminal as a self-contained sub-app: its own redux store (separate
// from the management app's) but shares the parent BrowserRouter (React
// Router v6 forbids nested Routers). All legacy routes are anchored under
// /terminal/*. The cashier signs in once at /login; AuthBridge mirrors
// that into the terminal store so they don't see a second login.
const TerminalApp = () => {
  // Seed the POS auth from the management store SYNCHRONOUSLY on first render —
  // before <AppRoutes> (and its RequireAuth guard) mount. The lazy initializer
  // runs during this component's render, ahead of its children, so the guard
  // sees the hydrated token instead of the empty initial state. Without this,
  // the first navigation after login bounces back to /dashboard because the
  // guard reads an empty POS token before AuthBridge's effect can fill it.
  useState(syncPosAuthFromMain);

  return (
    <Provider store={posStore}>
      <AuthBridge />
      <div className="h-screen bg-gray-50 text-gray-900">
        <SessionInit />
        <ReceiptPrintProvider>
          <AppRoutes />
        </ReceiptPrintProvider>
        <Toaster position="top-right" />
      </div>
    </Provider>
  );
};

export default TerminalApp;
