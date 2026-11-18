import { PERMISSIONS } from '../config/permissions';
import { NAV_ITEMS, buildPermChecks } from '../components/Layout/Sidebar';

// Build a has(key) resolver from a user's role + permission map. The map may be
// a full effective map (login / getMe) or stored overrides only (PATCH user);
// either way we fall back to the role default for any key not present.
export const buildHas = ({ role, permissions }) => {
  const overrides = permissions || {};
  return (key) => {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) return !!overrides[key];
    const def = PERMISSIONS.find((p) => p.key === key);
    return !!(def && def[role]);
  };
};

// Whether the user may enter the restaurant-management app at all.
//   - Any non-cashier role: yes.
//   - A cashier: only if they were granted at least one permission BEYOND the
//     default cashier set (i.e. an elevated/management permission). Default
//     cashiers (pos.sale only) stay locked to the POS terminal.
export const canAccessManagement = ({ role, permissions }) => {
  if (role && role !== 'cashier') return true;
  const perms = permissions || {};
  return PERMISSIONS.some((p) => {
    if (p.cashier) return false; // a default cashier permission grants nothing extra
    return Object.prototype.hasOwnProperty.call(perms, p.key) && !!perms[p.key];
  });
};

// The first management route (in sidebar order) the user can actually open,
// using the sidebar's own permission checks. Falls back to /account, which has
// no permission guard, so we never land on a page that bounces them.
export const firstAccessibleRoute = ({ role, permissions }) => {
  const has = buildHas({ role, permissions });
  const checks = buildPermChecks(has);
  for (const item of NAV_ITEMS) {
    if (!item.to) continue; // group header
    const fn = checks[item.to];
    if (fn && fn()) return item.to;
  }
  return '/account';
};
