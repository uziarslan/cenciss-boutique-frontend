import { NavLink, Outlet, Navigate, useLocation } from 'react-router';
import { Users, Shield, PackageOpen, Smartphone, Percent, ScanFace, Printer, ChefHat, ShoppingBag } from 'lucide-react';
import clsx from 'clsx';
import usePermissions from '../../hooks/usePermissions';
import useAuth from '../../hooks/useAuth';
import useFeatures from '../../hooks/useFeatures';

const TABS = [
  { to: '/settings/users',           label: 'User Management', icon: Users,  perm: 'settings.users' },
  { to: '/settings/roles',           label: 'Role Settings',   icon: Shield, perm: 'settings.roles' },
  { to: '/settings/outlets',         label: 'Outlets',         icon: PackageOpen, perm: 'settings.outlets' },
  { to: '/settings/integrations/shopify', label: 'Shopify', icon: ShoppingBag, perm: 'settings.integrations' },
  { to: '/settings/printers',        label: 'Printer Settings', icon: Printer, perm: 'settings.printers' },
  { to: '/settings/kds',             label: 'KDS',              icon: ChefHat, ownerOnly: true, feature: 'kds' },
  { to: '/settings/tax',             label: 'Tax & FBR',       icon: Percent, roles: ['owner', 'financeManager'] },
  { to: '/settings/attendance-devices', label: 'Attendance Devices', icon: Smartphone, ownerOnly: true },
  { to: '/settings/face-terminals',  label: 'Face Terminals', icon: ScanFace, ownerOnly: true, feature: 'attendanceExternalDevice' },
];

const SettingsLayout = () => {
  const { pathname } = useLocation();
  const { has } = usePermissions();
  const { role } = useAuth();
  const { hasFeature } = useFeatures();
  const visibleTabs = TABS.filter((t) => {
    // Feature-gated tabs are hidden unless the tenant flag is on.
    if (t.feature && !hasFeature(t.feature)) return false;
    if (t.roles) return t.roles.includes(role);
    return t.ownerOnly ? role === 'owner' : has(t.perm);
  });
  if (pathname === '/settings') {
    const first = visibleTabs[0]?.to;
    if (first) return <Navigate to={first} replace />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl">
      {/* Header */}
      <div className="mb-5 sm:mb-6">
        <h1 className="text-xl font-bold text-gray-800 sm:text-2xl">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage users, roles, and integrations.</p>
      </div>

      {/* Tab bar */}
      <div className="-mx-4 mb-5 overflow-x-auto border-b border-gray-200 px-4 overscroll-x-contain sm:mx-0 sm:mb-6 sm:px-0">
        <div className="flex min-w-max gap-1">
          {visibleTabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4',
                isActive
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              )
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-w-0"><Outlet /></div>
    </div>
  );
};

export default SettingsLayout;
