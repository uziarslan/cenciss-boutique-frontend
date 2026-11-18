import { NavLink, Outlet, Navigate, useLocation } from 'react-router';
import { Banknote, Tag, Users, Clock, BarChart3, Package, Activity, Sparkles, Ban, ReceiptText, ChefHat, ListChecks } from 'lucide-react';
import clsx from 'clsx';
import usePermissions from '../../hooks/usePermissions';
import useFeatures from '../../hooks/useFeatures';

const TABS = [
  { to: '/reports/spend',                label: 'Spend',                icon: Banknote   },
  { to: '/reports/price-history',        label: 'Price History',        icon: Tag        },
  { to: '/reports/vendor-performance',   label: 'Vendor Performance',   icon: Users      },
  { to: '/reports/aging',                label: 'Aging',                icon: Clock      },
  { to: '/reports/sales-summary',        label: 'Sales Summary',        icon: BarChart3  },
  { to: '/reports/sales-transactions',   label: 'Sales Transactions',   icon: ReceiptText },
  { to: '/reports/sales-by-item',        label: 'Sales by Item',        icon: Package    },
  { to: '/reports/sales-by-cashier',     label: 'Sales by Cashier',     icon: Users      },
  { to: '/reports/hourly-breakdown',     label: 'Hourly Breakdown',     icon: Clock      },
  { to: '/reports/cancelled-orders',     label: 'Cancelled Orders',     icon: Ban        },
  { to: '/reports/order-lifecycle',      label: 'Order Lifecycle',      icon: ListChecks, feature: 'kds' },
  { to: '/reports/kitchen-counter-sales', label: 'Kitchen vs Counter',  icon: ChefHat,    feature: 'kds' },
  { to: '/reports/membership-movements', label: 'Rewards Movements',    icon: Activity,  feature: 'membershipRewards' },
  { to: '/reports/membership-summary',   label: 'Rewards Summary',      icon: Sparkles,  feature: 'membershipRewards' },
];

const ReportsLayout = () => {
  const { pathname } = useLocation();
  const { has } = usePermissions();
  const { hasFeature } = useFeatures();

  const tabPermissionMap = {
    '/reports/spend': 'reports.spend',
    '/reports/price-history': 'reports.priceHistory',
    '/reports/vendor-performance': 'reports.vendorPerformance',
    '/reports/aging': 'reports.aging',
    '/reports/sales-summary': 'reports.salesSummary',
    '/reports/sales-transactions': 'reports.salesTransactions',
    '/reports/sales-by-item': 'reports.salesByItem',
    '/reports/sales-by-cashier': 'reports.salesByCashier',
    '/reports/hourly-breakdown': 'reports.hourly',
    '/reports/cancelled-orders': 'reports.salesSummary',
    '/reports/order-lifecycle': 'reports.orderLifecycle',
    '/reports/kitchen-counter-sales': 'reports.kitchenCounterSales',
  };

  const visibleTabs = TABS.filter(({ to, feature }) => {
    if (feature && !hasFeature(feature)) return false;
    const perm = tabPermissionMap[to];
    return perm ? has(perm) : true;
  });

  if (pathname === '/reports' || pathname === '/reports/') {
    const first = visibleTabs[0];
    return first ? <Navigate to={first.to} replace /> : <Navigate to="/" replace />;
  }

  return (
    <div>
      <div className="mb-1">
        <h1 className="text-xl font-bold text-gray-800">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Financial and operational analytics</p>
      </div>

      {/* Tab row */}
      <div className="flex items-center gap-1 mt-4 mb-6 border-b border-gray-200 overflow-x-auto">
        {visibleTabs.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">You do not have permission to view any reports.</div>
        ) : (
          visibleTabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
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

export default ReportsLayout;
