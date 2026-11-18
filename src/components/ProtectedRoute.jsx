import { useEffect } from 'react';
import { Navigate } from 'react-router';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuth from '../hooks/useAuth';
import usePermissions from '../hooks/usePermissions';
import useFeatures from '../hooks/useFeatures';
import { firstAccessibleRoute } from '../utils/managementAccess';

// Shows a one-time toast and redirects to the first page the user CAN open.
// Using their first accessible route (rather than a hardcoded /dashboard)
// avoids a redirect loop for users who lack dashboard.view — e.g. a cashier
// granted only a specific management tab.
const PermissionDenied = () => {
  const { role, user } = useAuth();
  const target = firstAccessibleRoute({ role, permissions: user?.permissions });
  useEffect(() => {
    toast.error("You don't have permission to access that page.", { id: 'perm-denied' });
  }, []);
  return <Navigate to={target} replace />;
};

// Shown in-place when a feature is disabled for this tenant.
// The app's main content area uses bg-gray-100, so this is designed for that background.
const FeatureDisabled = () => (
  <div className="flex items-center justify-center min-h-[60vh] px-6 py-10">
    <div className="w-full max-w-sm text-center">
      {/* Icon container */}
      <div className="mx-auto mb-7 relative w-fit">
        <div className="w-[88px] h-[88px] rounded-[28px] bg-white shadow-sm ring-1 ring-gray-200 flex items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
            <Lock size={28} className="text-indigo-500" strokeWidth={1.75} />
          </div>
        </div>
        {/* Subtle glow */}
        <div className="absolute inset-0 rounded-[28px] bg-indigo-400/10 blur-xl -z-10" />
      </div>

      {/* Content card — white on the gray-100 background */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 px-7 py-6">
        <h2 className="text-[17px] font-bold text-gray-900 mb-1.5 tracking-tight">
          Feature Not Available
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">
          This feature hasn't been enabled for your account. Contact your administrator to get access.
        </p>

        {/* Status badge */}
        <div className="inline-flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2 text-[13px] font-medium text-amber-700">
          <Lock size={12} strokeWidth={2.5} />
          Disabled by administrator
        </div>
      </div>

      {/* Footnote */}
      <p className="mt-4 text-[11px] text-gray-400">
        Other modules of your account remain fully accessible.
      </p>
    </div>
  </div>
);

/**
 * Route guard component.
 *
 * Props:
 *   children      – the route element to render when access is granted.
 *   feature       – feature flag key; shows FeatureDisabled if tenant flag is false.
 *   permission    – single permission key; user must have it.
 *   permissions   – array of permission keys; user must have AT LEAST ONE.
 *   allowedRoles  – (legacy) array of role strings; kept for backward-compat.
 *
 * Priority: unauthenticated → login, feature disabled → FeatureDisabled,
 *           then permission / allowedRoles → PermissionDenied.
 */
const ProtectedRoute = ({ children, feature, permission, permissions, allowedRoles }) => {
  const { isAuthenticated, role } = useAuth();
  const { has } = usePermissions();
  const { hasFeature } = useFeatures();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Feature flag guard — shown in-place (not a redirect) per product decision.
  if (feature && !hasFeature(feature)) {
    return <FeatureDisabled />;
  }

  // Single-key permission guard
  if (permission && !has(permission)) {
    return <PermissionDenied />;
  }

  // Any-of permission guard
  if (permissions && permissions.length > 0 && !permissions.some((p) => has(p))) {
    return <PermissionDenied />;
  }

  // Legacy role guard (still honoured if caller passes allowedRoles)
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <PermissionDenied />;
  }

  return children;
};

export default ProtectedRoute;
