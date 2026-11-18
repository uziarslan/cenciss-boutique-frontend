import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { BarChart3, Boxes, ClipboardCheck, Settings } from 'lucide-react';
import clsx from 'clsx';
import usePermissions from '../../hooks/usePermissions';

const tabs = [
  { to: '/assets/register', label: 'Asset Register', icon: Boxes, permissions: ['assets.view'] },
  { to: '/assets/audits', label: 'Audits', icon: ClipboardCheck, permissions: ['assets.view'] },
  { to: '/assets/categories', label: 'Categories & COA', icon: Settings, permissions: ['assets.manage'] },
  { to: '/assets/accounting', label: 'Depreciation & Reconciliation', icon: BarChart3, permissions: ['assets.accounting'] },
];

const AssetsLayout = () => {
  const { has } = usePermissions();
  const location = useLocation();
  const visible = tabs.filter((tab) => tab.permissions.some(has));
  if (location.pathname === '/assets' && visible[0]) {
    return <Navigate to={visible[0].to} replace />;
  }
  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => clsx(
              'inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
              isActive
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
            )}
          >
            <Icon size={15} /> {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
};

export default AssetsLayout;
