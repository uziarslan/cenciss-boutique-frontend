import { Navigate, useLocation } from 'react-router';
import useAuth from '../hooks/useAuth';
import { canAccessManagement } from '../utils/managementAccess';

/**
 * Sits between the auth check and the rest of the app shell. Decides where
 * a logged-in user should actually be:
 *   - cashier → /terminal (POS punching UI)
 *   - subscription expired/suspended → /billing/expired
 *   - outlet not yet configured → /onboarding/outlet
 *   - everyone else → render children (the main app layout)
 */
const AppGate = ({ children }) => {
  const { isAuthenticated, user, role } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Plain cashiers go straight to the punching screen. A cashier who has been
  // granted management-side permissions is allowed into management instead —
  // their per-route guards (ProtectedRoute) still gate individual tabs.
  if (
    role === 'cashier' &&
    !location.pathname.startsWith('/terminal') &&
    !canAccessManagement({ role, permissions: user?.permissions })
  ) {
    return <Navigate to="/terminal/pos" replace />;
  }

  const tenant = user?.tenant;
  const isAccessActive =
    tenant && tenant.status !== 'suspended' && tenant.accessUntil &&
    new Date(tenant.accessUntil).getTime() > Date.now();
  if (tenant && !isAccessActive && location.pathname !== '/billing/expired') {
    return <Navigate to="/billing/expired" replace />;
  }

  if (
    tenant &&
    !tenant.outletConfigured &&
    role === 'owner' &&
    !location.pathname.startsWith('/onboarding')
  ) {
    return <Navigate to="/onboarding/outlet" replace />;
  }

  return children;
};

export default AppGate;
