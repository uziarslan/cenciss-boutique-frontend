import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router';
import { Menu, LogOut, ChevronDown, ChevronRight, Settings, User as UserIcon, LayoutGrid, Store, ReceiptText } from 'lucide-react';
import clsx from 'clsx';
import useAuth from '../../hooks/useAuth';
import usePermissions from '../../hooks/usePermissions';
import useFeatures from '../../hooks/useFeatures';
import SidebarTabsDrawer from './SidebarTabsDrawer';

const ROLE_LABELS = {
  owner:           'Owner',
  financeManager:  'Finance Manager',
  purchaseManager: 'Purchase Manager',
  receivingStaff:  'Receiving Staff',
  cashier:         'Cashier',
};

const ROLE_COLORS = {
  owner:           'bg-indigo-50 text-indigo-700 border-indigo-100',
  financeManager:  'bg-blue-50 text-blue-700 border-blue-100',
  purchaseManager: 'bg-amber-50 text-amber-700 border-amber-100',
  receivingStaff:  'bg-slate-100 text-slate-700 border-slate-200',
  cashier:         'bg-emerald-50 text-emerald-700 border-emerald-100',
};

// ── Breadcrumb labels per route segment ───────────────────────────────────────
const SEGMENT_LABELS = {
  dashboard:                'Dashboard',
  billing:                  'Subscription Billing',
  account:                  'Account',
  vendors:                  'Vendors',
  products:                 'Products',
  purchases:                'Purchases',
  payments:                 'Payments',
  accounting:               'Accounting',
  'chart-of-accounts':      'Chart of Accounts',
  'journal-entries':        'Journal Entries',
  ledger:                   'Ledger',
  'trial-balance':          'Trial Balance',
  'profit-and-loss':        'Profit & Loss',
  'balance-sheet':          'Balance Sheet',
  assets:                   'Asset Audit',
  register:                 'Asset Register',
  audits:                   'Physical Audits',
  categories:               'Categories & COA',
  'depreciation-runs':      'Depreciation',
  menu:                     'Menu Management',
  inventory:                'Finished Goods',
  'retail-inventory':       'Finished Goods',
  production:               'Manufacturing',
  store:                    'Raw Materials',
  stock:                    'Stock',
  count:                    'Stock Count',
  waste:                    'Waste Log',
  insights:                 'Insights',
  pos:                      'POS',
  sessions:                 'Sessions',
  allowances:               'Staff Allowances',
  employees:                'Employees',
  attendance:               'Attendance',
  salaries:                 'Salaries',
  pay:                      'Pay Salary',
  reports:                  'Reports',
  cogs:                     'COGS',
  spend:                    'Spend',
  'price-history':          'Price History',
  'vendor-performance':     'Vendor Performance',
  aging:                    'Aging',
  'sales-summary':          'Sales Summary',
  'sales-transactions':     'Sales Transactions',
  'sales-by-item':          'Sales by Item',
  'sales-by-cashier':       'Sales by Cashier',
  'hourly-breakdown':       'Hourly Breakdown',
  settings:                 'Settings',
  users:                    'User Management',
  roles:                    'Role Settings',
  outlets:                  'Outlets',
  new:                      'New',
  edit:                     'Edit',
};

const labelFor = (segment) => {
  if (!segment) return '';
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (/^[a-f0-9]{24}(?:%3A|:)\d{4}-\d{2}-\d{2}$/i.test(segment)) return 'Employee report';
  // Looks like an id (ObjectId / uuid) — skip
  if (/^[a-f0-9]{20,}$/i.test(segment)) return null;
  if (/^\d+$/.test(segment))             return null;
  // Fallback: title-case the slug
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const Topbar = ({ onMenuClick }) => {
  const { user, role, logout } = useAuth();
  const { has } = usePermissions();
  const { hasFeature } = useFeatures();
  // Anyone who can take POS sales (cashiers, or other roles granted pos.sale)
  // can jump to the terminal — including a cashier who switched into management.
  const canUsePosTerminal = hasFeature('pos') && has('pos.sale');
  const canViewSubscriptionBilling = role === 'owner' || role === 'financeManager';
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [tabsDrawerOpen, setTabsDrawerOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close dropdown on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Build crumbs from pathname segments, skipping ids
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = [];
  let acc = '';
  segments.forEach((seg) => {
    acc += `/${seg}`;
    const label = labelFor(seg);
    if (label) crumbs.push({ to: acc, label });
  });

  // User initials for the avatar
  const initials = (() => {
    const n = (user?.name || '').trim();
    if (!n) return user?.email?.charAt(0).toUpperCase() || '?';
    const parts = n.split(/\s+/);
    return ((parts[0] || '').charAt(0) + (parts[1] || '').charAt(0)).toUpperCase();
  })();

  return (
    <header className="min-h-[4rem] flex items-center justify-between px-4 sm:px-6 pt-[env(safe-area-inset-top)] bg-white/80 backdrop-blur-xl border-b border-gray-100 shrink-0 sticky top-0 z-30">
      {/* ── Left: hamburger + breadcrumbs ─────────────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Breadcrumb trail */}
        {crumbs.length > 0 && (
          <nav className="hidden sm:flex items-center gap-1.5 min-w-0" aria-label="Breadcrumb">
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <div key={c.to} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && <ChevronRight size={13} className="text-gray-300 shrink-0" />}
                  {isLast ? (
                    <span className="text-sm font-bold text-gray-900 truncate">{c.label}</span>
                  ) : (
                    <Link
                      to={c.to}
                      className="text-sm text-gray-500 hover:text-gray-800 transition truncate"
                    >
                      {c.label}
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        {/* Mobile-only condensed page title */}
        {crumbs.length > 0 && (
          <span className="sm:hidden text-sm font-bold text-gray-900 truncate">
            {crumbs[crumbs.length - 1].label}
          </span>
        )}
      </div>

      {/* ── Right: customize sidebar + user dropdown ─────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTabsDrawerOpen(true)}
          className="p-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-slate-50 hover:text-gray-900 transition"
          aria-label="Customize sidebar tabs"
          title="Customize sidebar"
        >
          <LayoutGrid size={18} />
        </button>

      <div ref={wrapRef} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className={clsx(
            'flex items-center gap-2 px-1.5 py-1.5 rounded-xl border transition',
            open
              ? 'bg-slate-50 border-slate-200'
              : 'bg-white border-gray-200 hover:bg-slate-50'
          )}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-xs font-bold shadow-sm ring-1 ring-white/30">
            {initials}
          </div>
          <div className="hidden sm:block min-w-0 text-left pr-1">
            <p className="text-sm font-semibold text-gray-900 truncate max-w-[140px]">
              {user?.name || user?.email || 'User'}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 truncate">
              {ROLE_LABELS[role] ?? role}
            </p>
          </div>
          <ChevronDown
            size={14}
            className={clsx('text-gray-400 transition-transform shrink-0 mr-1', open && 'rotate-180')}
          />
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white border border-gray-100 shadow-xl ring-1 ring-black/[0.02] overflow-hidden z-40"
            role="menu"
          >
            {/* Header */}
            <div className="px-4 py-4 border-b border-gray-100 bg-slate-50/40">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-sm font-bold shadow-sm ring-1 ring-white/30">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  {role && (
                    <span className={clsx(
                      'inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border',
                      ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                    )}>
                      {ROLE_LABELS[role] ?? role}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1.5">
              {canUsePosTerminal && (
                <Link
                  to="/terminal/pos"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition"
                >
                  <span className="flex items-center gap-3">
                    <Store size={14} className="text-indigo-500" />
                    Switch to POS Terminal
                  </span>
                  <ChevronRight size={13} className="text-indigo-400" />
                </Link>
              )}
              {canViewSubscriptionBilling && (
                <Link
                  to="/billing"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-slate-50 transition"
                >
                  <ReceiptText size={14} className="text-gray-400" />
                  Subscription Billing
                </Link>
              )}
              {role === 'owner' && (
                <Link
                  to="/settings/users"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-slate-50 transition"
                >
                  <Settings size={14} className="text-gray-400" />
                  Settings
                </Link>
              )}
              <Link
                to="/account"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-slate-50 transition"
              >
                <UserIcon size={14} className="text-gray-400" />
                Account
              </Link>
            </div>

            {/* Divider + logout */}
            <div className="border-t border-gray-100 py-1.5">
              <button
                type="button"
                onClick={() => { setOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 transition"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      <SidebarTabsDrawer open={tabsDrawerOpen} onClose={() => setTabsDrawerOpen(false)} />
    </header>
  );
};

export default Topbar;
