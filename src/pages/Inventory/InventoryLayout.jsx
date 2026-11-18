import { NavLink, Outlet, Navigate, useLocation } from 'react-router';
import { Package, ClipboardList, Trash2, FlaskConical, BarChart3, ArrowRightLeft, History } from 'lucide-react';
import clsx from 'clsx';
import usePermissions from '../../hooks/usePermissions';
import useTransferBadges from '../../hooks/useTransferBadges';

// Tabs are filtered by permission. `requires` is the permission key that must
// be true for the tab to render — view-only users (inventory.view but not
// inventory.manage) lose the mutation tabs (Stock Count, Waste Log).
const TABS = [
  { to: '/inventory/stock',     label: 'Stock',        icon: Package       },
  { to: '/inventory/count',     label: 'Stock Count',  icon: ClipboardList, requires: 'inventory.manage' },
  { to: '/inventory/waste',     label: 'Waste Log',    icon: Trash2,        requires: 'inventory.manage' },
  { to: '/inventory/transfer',  label: 'Send to Store', icon: ArrowRightLeft, requires: 'inventory.manage' },
  { to: '/inventory/transfers', label: 'Transfers',    icon: History       },
  { to: '/inventory/insights',  label: 'Insights',     icon: FlaskConical  },
  { to: '/inventory/report',    label: 'Report',       icon: BarChart3     },
];

const InventoryLayout = () => {
  const { pathname } = useLocation();
  const { has } = usePermissions();
  const { kitchenPending } = useTransferBadges();

  const visibleTabs = TABS.filter((t) => !t.requires || has(t.requires));

  // Redirect bare /inventory to the first tab the user can actually see —
  // /inventory/stock is always available since the route itself only requires
  // inventory.view.
  if (pathname === '/inventory' || pathname === '/inventory/') {
    return <Navigate to="/inventory/stock" replace />;
  }

  // If the user landed on a tab they no longer have access to (e.g. an owner
  // just demoted them while they were on the Stock Count tab), bounce them
  // back to /inventory/stock so they don't see a permission-denied panel.
  // Segment-aware match so '/inventory/transfers' isn't captured by the
  // '/inventory/transfer' (Send to Store) tab, which needs inventory.manage.
  const activeRequiresPerm = TABS.find((t) => pathname === t.to || pathname.startsWith(`${t.to}/`))?.requires;
  if (activeRequiresPerm && !has(activeRequiresPerm)) {
    return <Navigate to="/inventory/stock" replace />;
  }

  return (
    <div className="min-w-0">
      {/* Tab row */}
      <div className="-mx-4 mb-5 overflow-x-auto border-b border-gray-200 px-4 overscroll-x-contain sm:mx-0 sm:mb-6 sm:px-0">
        <div className="flex min-w-max items-center gap-1">
        {visibleTabs.map(({ to, label, icon: Icon }) => {
          const badge = to === '/inventory/transfers' ? kitchenPending : 0;
          return (
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

export default InventoryLayout;
