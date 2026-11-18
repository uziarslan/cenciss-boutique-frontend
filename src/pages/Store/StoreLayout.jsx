import { NavLink, Outlet, Navigate, useLocation } from 'react-router';
import { Warehouse, BarChart3 } from 'lucide-react';
import clsx from 'clsx';
import usePermissions from '../../hooks/usePermissions';

// Store holds raw materials used by boutique production.
const TABS = [
  { to: '/store/stock',     label: 'Raw Material Stock', icon: Warehouse },
  { to: '/store/report',    label: 'Movement Report',    icon: BarChart3 },
];

const StoreLayout = () => {
  const { pathname } = useLocation();
  const { has } = usePermissions();

  const visibleTabs = TABS.filter((t) => !t.requires || has(t.requires));

  if (pathname === '/store' || pathname === '/store/') {
    return <Navigate to="/store/stock" replace />;
  }

  const activeRequiresPerm = TABS.find((t) => pathname.startsWith(t.to))?.requires;
  if (activeRequiresPerm && !has(activeRequiresPerm)) {
    return <Navigate to="/store/stock" replace />;
  }

  return (
    <div className="min-w-0">
      <div className="-mx-4 mb-5 overflow-x-auto border-b border-gray-200 px-4 overscroll-x-contain sm:mx-0 sm:mb-6 sm:px-0">
        <div className="flex min-w-max items-center gap-1">
        {visibleTabs.map(({ to, label, icon: Icon }) => {
          const badge = 0;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4',
                  isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
                )
              }
            >
              <Icon size={15} />
              {label}
              {badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </NavLink>
          );
        })}
        </div>
      </div>

      <div className="min-w-0"><Outlet /></div>
    </div>
  );
};

export default StoreLayout;
