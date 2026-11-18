import { NavLink, Outlet, Navigate, useLocation } from 'react-router';
import { PieChart, Users, Settings as SettingsIcon } from 'lucide-react';
import clsx from 'clsx';
import usePermissions from '../../hooks/usePermissions';

const TABS = [
  { to: '/loyalty',          label: 'Overview', icon: PieChart,     end: true },
  { to: '/loyalty/members',  label: 'Members',  icon: Users,        perm: 'pos.manage' },
  { to: '/loyalty/settings', label: 'Settings', icon: SettingsIcon, perm: 'pos.manage' },
];

const LoyaltyLayout = () => {
  const { pathname } = useLocation();
  const { has } = usePermissions();

  const visibleTabs = TABS.filter((t) => !t.perm || has(t.perm));

  if (pathname === '/loyalty/' && visibleTabs[0]) {
    return <Navigate to={visibleTabs[0].to} replace />;
  }

  return (
    <div>
      <div className="mb-1">
        <h1 className="text-xl font-bold text-gray-800">Membership / Rewards</h1>
        <p className="text-sm text-gray-500 mt-0.5">Customer loyalty programme · earn, redeem, manage</p>
      </div>

      <div className="flex items-center gap-1 mt-4 mb-6 border-b border-gray-200 overflow-x-auto">
        {visibleTabs.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">You do not have permission to view this section.</div>
        ) : (
          visibleTabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0',
                  isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                )
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))
        )}
      </div>

      <Outlet />
    </div>
  );
};

export default LoyaltyLayout;
