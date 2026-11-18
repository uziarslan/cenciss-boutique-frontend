import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router';
import { useSelector, useDispatch } from 'react-redux';
import { Lock, LogOut, RefreshCw } from 'lucide-react';
import POSScreen from './pages/BoutiquePOSScreen';
import BoutiqueReturnsScreen from './pages/BoutiqueReturnsScreen';
import BoutiqueCloseShiftScreen from './pages/BoutiqueCloseShiftScreen';
import OpenSession from './components/Session/OpenSession';
import SessionSummary from './pages/SessionSummary';
import NotFound from './pages/NotFound';
import POSLayout from './components/Layout/BoutiquePOSLayout';
import Spinner from './components/UI/Spinner';
import { fetchMe } from './store/slices/authSlice';
import { fetchCurrentSession } from './store/slices/sessionSlice';
import unifiedLogout from './utils/unifiedLogout';

// Shown while the current session is being resolved on load/refresh, so the
// guards don't flash the "Open Session" screen before we know a session exists.
const SessionResolving = () => {
    const dispatch = useDispatch();
    const { isLoading, resolved } = useSelector((s) => s.session);
    useEffect(() => {
        if (!resolved && !isLoading) dispatch(fetchCurrentSession());
    }, [resolved, isLoading, dispatch]);
    return (
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center lg:min-h-[calc(100vh-7rem)]">
            <Spinner size="lg" />
        </div>
    );
};

const RequireAuth = ({ children }) => {
    const accessToken = useSelector((state) => state.auth.accessToken);
    return accessToken ? children : <Navigate to="/login" replace />;
};

// Effective permission lookup: explicit override wins, else role default.
// Mirrors the management app's usePermissions and the backend's hasPermission
// so the gating semantics match end-to-end.
const cashierHasPermission = (cashier, key) => {
    if (!cashier) return false;
    const overrides = cashier.permissions || {};
    if (Object.prototype.hasOwnProperty.call(overrides, key)) return !!overrides[key];
    // Cashier role defaults — keep this in sync with backend
    // src/config/permissions.js. Only the keys the POS terminal actually
    // uses need to be listed here.
    const cashierDefaults = {
        'pos.sale': true,
        'pos.discount': false,
        'pos.drawerAdd': true,
        'pos.drawerEdit': false,
        'pos.drawerDelete': false,
    };
    return !!cashierDefaults[key];
};

const RequirePosSale = ({ children }) => {
    const cashier = useSelector((state) => state.auth.cashier);
    const dispatch = useDispatch();
    const [refreshing, setRefreshing] = useState(false);

    // The cashier object can be stale — it lives in localStorage and only
    // refreshes on login. If we render the lockout panel, kick off a fresh
    // /api/auth/me right away so a permission change made by the owner shows
    // up without forcing the cashier to sign out and back in. Also poll every
    // 30s while the lockout is visible.
    const allowed = cashierHasPermission(cashier, 'pos.sale');
    useEffect(() => {
        if (allowed) return undefined;
        dispatch(fetchMe());
        const t = setInterval(() => dispatch(fetchMe()), 30000);
        return () => clearInterval(t);
    }, [allowed, dispatch]);

    if (allowed) return children;

    const handleRefresh = async () => {
        setRefreshing(true);
        try { await dispatch(fetchMe()); } finally { setRefreshing(false); }
    };

    return (
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 lg:min-h-[calc(100vh-7rem)]">
            <div className="max-w-md w-full rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-600 text-white">
                    <Lock size={20} />
                </div>
                <h1 className="text-lg font-extrabold text-rose-900">POS access disabled</h1>
                <p className="mt-2 text-sm text-rose-800">
                    Your account does not have permission to take orders. Ask an
                    owner to grant <span className="font-mono font-semibold">POS Sale</span> in
                    Role Settings, then tap Refresh below — or sign out and back in.
                </p>
                <div className="mt-5 flex items-center justify-center gap-2">
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Checking…' : 'Refresh'}
                    </button>
                    <button
                        type="button"
                        onClick={() => unifiedLogout(dispatch)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
                    >
                        <LogOut size={14} />
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
};

const RequireOpenSession = ({ children }) => {
    const { session, resolved } = useSelector((state) => state.session);
    if (!resolved) return <SessionResolving />;
    return session?.status === 'open' ? children : <Navigate to="/terminal/session/open" replace />;
};

const RequireNoSession = ({ children }) => {
    const { session, resolved } = useSelector((state) => state.session);
    if (!resolved) return <SessionResolving />;
    return session?.status === 'open' ? <Navigate to="/terminal/pos" replace /> : children;
};

/* Authenticated layout — header visible on all protected pages */
const AuthenticatedLayout = () => (
    <RequireAuth>
        <POSLayout>
            <Outlet />
        </POSLayout>
    </RequireAuth>
);

const AppRoutes = () => (
    <Routes>
        {/* Paths are relative to the parent route /terminal/* in the
            management app's routes.js — nested <Routes> only sees the
            remainder after the parent splat. Internal navigate() calls
            still use the absolute /terminal/... form. */}
        {/* Terminal in this app is POS-only — attendance lives in the
            standalone attendance-frontend, paired per outlet. */}
        <Route index element={<Navigate to="/terminal/pos" replace />} />

        {/* All authenticated routes share the POSLayout shell */}
        <Route element={<AuthenticatedLayout />}>
            <Route
                path="session/open"
                element={<RequirePosSale><RequireNoSession><OpenSession /></RequireNoSession></RequirePosSale>}
            />
            <Route
                path="pos"
                element={<RequirePosSale><RequireOpenSession><POSScreen /></RequireOpenSession></RequirePosSale>}
            />
            <Route path="returns" element={<RequirePosSale><BoutiqueReturnsScreen /></RequirePosSale>} />
            <Route path="held" element={<Navigate to="/terminal/pos?held=1" replace />} />
            <Route path="end-of-day" element={<Navigate to="/terminal/pos?eod=1" replace />} />
            <Route path="session/summary" element={<BoutiqueCloseShiftScreen />} />
            <Route path="session/closed" element={<SessionSummary />} />
        </Route>

        <Route path="*" element={<NotFound />} />
    </Routes>
);

export default AppRoutes;
