import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Search, X } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Package,
  ClipboardCheck,
  BookOpen,
  List,
  BookMarked,
  Scale,
  TrendingUp,
  BarChart3,
  Boxes,
  Warehouse,
  BarChart2,
  Banknote,
  Tag,
  Clock,
  Ban,
  UserCog,
  Shield,
  PackageOpen,
  Percent,
  Smartphone,
  Monitor,
  Wallet,
  BadgeDollarSign,
  UserCheck,
  Settings,
  ScrollText,
  Activity,
  PieChart,
  Sparkles,
  QrCode,
  ScanFace,
  Printer,
  ReceiptText,
  ChefHat,
  Bike,
  Factory,
} from 'lucide-react';
import clsx from 'clsx';
import useAuth from '../../hooks/useAuth';
import usePermissions from '../../hooks/usePermissions';
import useFeatures from '../../hooks/useFeatures';
import logo from '../../assets/logo.png';
import { getOutlets } from '../../api/outletApi';

const FINANCE = ['owner', 'financeManager'];
const OWNER   = ['owner'];

// Groups whose items are entirely gated behind a single feature flag.
// When the feature is disabled the whole group collapses into a locked accordion.
const GROUP_FEATURE_MAP = {
  Purchasing: 'purchasing',
  Accounting: 'accounting',
  'Asset Audit': 'assetAudit',
  Reports:    'reports',
  'Membership / Rewards': 'membershipRewards',
};

// ── Nav item definitions ──────────────────────────────────────────────────────
// `feature` ties each item (and its group) to a feature flag key.
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'financeManager', 'purchaseManager', 'receivingStaff'] },

  { groupLabel: 'Purchasing' },
  { to: '/purchases',       label: 'Purchases',       icon: ClipboardCheck, roles: ['owner', 'financeManager', 'purchaseManager', 'receivingStaff'], feature: 'purchasing', activeMatch: ['/purchases', '/payments'] },
  { to: '/vendors',         label: 'Vendors',         icon: Users,          roles: ['owner', 'purchaseManager'],                              feature: 'purchasing' },
  { to: '/products',        label: 'Items',           icon: Package,        roles: ['owner', 'purchaseManager', 'receivingStaff'],            feature: 'purchasing' },

  { groupLabel: 'Accounting', roles: FINANCE },
  { to: '/accounting/chart-of-accounts', label: 'Chart of Accounts', icon: List,       roles: FINANCE, indent: true, feature: 'accounting' },
  { to: '/accounting/journal-entries',   label: 'Journal Entries',   icon: BookOpen,   roles: FINANCE, indent: true, feature: 'accounting' },
  { to: '/accounting/ledger',            label: 'Ledger',            icon: BookMarked, roles: FINANCE, indent: true, feature: 'accounting' },
  { to: '/accounting/trial-balance',     label: 'Trial Balance',     icon: Scale,      roles: FINANCE, indent: true, feature: 'accounting' },
  { to: '/accounting/profit-and-loss',   label: 'Profit & Loss',     icon: TrendingUp, roles: FINANCE, indent: true, feature: 'accounting' },
  { to: '/accounting/balance-sheet',     label: 'Balance Sheet',     icon: BarChart3,  roles: FINANCE, indent: true, feature: 'accounting' },
  { to: '/accounting/ap-aging',          label: 'AP Aging',          icon: Clock,      roles: FINANCE, indent: true, feature: 'accounting' },
  { to: '/accounting/ar-aging',          label: 'AR Aging',          icon: Clock,      roles: FINANCE, indent: true, feature: 'accounting' },

  { groupLabel: 'Asset Audit' },
  { to: '/assets/register',   label: 'Asset Register',  icon: Boxes,          roles: ['owner', 'financeManager', 'purchaseManager', 'receivingStaff'], indent: true, feature: 'assetAudit', activeMatch: '/assets/register' },
  { to: '/assets/audits',     label: 'Physical Audits', icon: ClipboardCheck, roles: ['owner', 'financeManager', 'purchaseManager', 'receivingStaff'], indent: true, feature: 'assetAudit' },
  { to: '/assets/categories', label: 'Categories & COA', icon: Settings,       roles: ['owner', 'purchaseManager'], indent: true, feature: 'assetAudit' },
  { to: '/assets/accounting', label: 'Asset Accounting', icon: Scale,          roles: FINANCE, indent: true, feature: 'assetAudit' },

  { groupLabel: 'Operations' },
  { to: '/menu',            label: 'Menu Management',  icon: PackageOpen,     roles: OWNER,                                         feature: 'menu' },
  { to: '/store/stock',      label: 'Raw Materials',  icon: Warehouse,       roles: ['owner', 'purchaseManager', 'receivingStaff'], feature: 'store', activeMatch: '/store' },
  { to: '/production',       label: 'Manufacturing',  icon: Factory,         roles: ['owner', 'purchaseManager', 'receivingStaff'], activeMatch: '/production' },
  { to: '/retail-inventory', label: 'Finished Goods', icon: Boxes,           roles: ['owner', 'purchaseManager', 'receivingStaff'], activeMatch: '/retail-inventory' },
  { to: '/kds',             label: 'Kitchen Display',  icon: ChefHat,         roles: ['owner', 'financeManager', 'purchaseManager', 'receivingStaff', 'cashier'], feature: 'kds' },
  { to: '/rider-operations', label: 'Rider Operations', icon: Bike,            roles: FINANCE, feature: 'riderTracking' },
  { to: '/pos/sessions',    label: 'POS Sessions',     icon: Monitor,         roles: FINANCE,                                       feature: 'pos' },
  { to: '/allowances',      label: 'Staff Allowances', icon: Wallet,          roles: FINANCE,                                       feature: 'payroll' },
  { to: '/employees',       label: 'Employees',        icon: Users,           roles: ['owner', 'financeManager', 'purchaseManager'], feature: 'employees' },
  { to: '/attendance',      label: 'Attendance',       icon: UserCheck,       roles: ['owner', 'financeManager', 'purchaseManager'], feature: 'attendance' },
  { to: '/salaries',        label: 'Salaries',         icon: BadgeDollarSign, roles: FINANCE,                                       feature: 'payroll' },
  { to: '/tables',          label: 'Tables (QR)',      icon: QrCode,          roles: OWNER,                                         feature: 'qrOrdering' },

  { groupLabel: 'Membership / Rewards', roles: FINANCE },
  { to: '/loyalty',              label: 'Overview', icon: PieChart, roles: FINANCE, indent: true, feature: 'membershipRewards', end: true },
  { to: '/loyalty/members',      label: 'Members',  icon: Users,    roles: FINANCE, indent: true, feature: 'membershipRewards' },
  { to: '/loyalty/settings',     label: 'Settings', icon: Settings, roles: FINANCE, indent: true, feature: 'membershipRewards' },

  { groupLabel: 'Reports', roles: FINANCE },
  { to: '/reports/spend',                label: 'Spend',                icon: Banknote,   roles: FINANCE, indent: true, feature: 'reports' },
  { to: '/reports/price-history',        label: 'Price History',        icon: Tag,        roles: FINANCE, indent: true, feature: 'reports' },
  { to: '/reports/vendor-performance',   label: 'Vendor Performance',   icon: Users,      roles: FINANCE, indent: true, feature: 'reports' },
  { to: '/reports/aging',                label: 'Aging',                icon: Clock,      roles: FINANCE, indent: true, feature: 'reports' },
  { to: '/reports/sales-summary',        label: 'Sales Summary',        icon: BarChart3,  roles: FINANCE, indent: true, feature: 'reports' },
  { to: '/reports/sales-transactions',   label: 'Sales Transactions',   icon: ReceiptText, roles: FINANCE, indent: true, feature: 'reports' },
  { to: '/reports/sales-by-item',        label: 'Sales by Item',        icon: Package,    roles: FINANCE, indent: true, feature: 'reports' },
  { to: '/reports/sales-by-cashier',     label: 'Sales by Cashier',     icon: Users,      roles: FINANCE, indent: true, feature: 'reports' },
  { to: '/reports/hourly-breakdown',     label: 'Hourly Breakdown',     icon: Clock,      roles: FINANCE, indent: true, feature: 'reports' },
  { to: '/reports/cancelled-orders',     label: 'Cancelled Orders',     icon: Ban,        roles: FINANCE, indent: true, feature: 'reports' },
  { to: '/reports/order-lifecycle',      label: 'Order Lifecycle',      icon: Clock,      roles: FINANCE, indent: true, feature: 'kds' },
  { to: '/reports/kitchen-counter-sales', label: 'Kitchen vs Counter',  icon: ChefHat,    roles: FINANCE, indent: true, feature: 'kds' },
  { to: '/reports/membership-movements', label: 'Rewards Movements',    icon: Activity,   roles: FINANCE, indent: true, feature: 'membershipRewards' },
  { to: '/reports/membership-summary',   label: 'Rewards Summary',      icon: Sparkles,   roles: FINANCE, indent: true, feature: 'membershipRewards' },

  { groupLabel: 'Settings', roles: OWNER },
  { to: '/settings/users',              label: 'User Management',    icon: UserCog,     roles: OWNER, indent: true },
  { to: '/settings/roles',              label: 'Role Settings',      icon: Shield,      roles: OWNER, indent: true },
  { to: '/settings/outlets',            label: 'Outlets',            icon: PackageOpen, roles: OWNER, indent: true },
  { to: '/settings/printers',           label: 'Printer Settings',   icon: Printer,     roles: OWNER, indent: true },
  { to: '/settings/kds',                label: 'KDS Settings',       icon: ChefHat,     roles: OWNER, indent: true, feature: 'kds' },
  { to: '/settings/tax',                label: 'Tax & FBR',          icon: Percent,     roles: OWNER, indent: true },
  { to: '/settings/attendance-devices', label: 'Attendance Devices', icon: Smartphone,  roles: OWNER, indent: true },
  { to: '/settings/face-terminals',     label: 'Face Terminals',     icon: ScanFace,    roles: OWNER, indent: true, feature: 'attendanceExternalDevice' },
  { to: '/audit-logs',                  label: 'Audit Logs',         icon: ScrollText,  roles: OWNER, indent: true },
];

// ── Permission map (single source of truth for visibility) ────────────────────
export const buildPermChecks = (has) => ({
  '/dashboard':                        () => has('dashboard.view'),
  '/vendors':                          () => has('vendors.manage'),
  '/products':                         () => has('products.manage'),
  '/purchases':                        () => ['purchases.view', 'purchases.create', 'purchases.post', 'purchases.edit', 'purchases.delete'].some(has),
  '/payments':                         () => ['payments.view', 'payments.record', 'payments.edit', 'payments.delete'].some(has),
  '/accounting/chart-of-accounts':     () => has('accounting.coa'),
  '/accounting/journal-entries':       () => has('accounting.journalEntries'),
  '/accounting/ledger':                () => has('accounting.ledger'),
  '/accounting/trial-balance':         () => has('accounting.ledger') || has('accounting.reports'),
  '/accounting/profit-and-loss':       () => has('accounting.reports'),
  '/accounting/balance-sheet':         () => has('accounting.reports'),
  '/accounting/ap-aging':              () => has('accounting.apAging'),
  '/accounting/ar-aging':              () => has('accounting.arAging'),
  '/assets/register':                  () => has('assets.view'),
  '/assets/audits':                    () => has('assets.view'),
  '/assets/categories':                () => has('assets.manage'),
  '/assets/accounting':                () => has('assets.accounting'),
  '/menu':                             () => has('menu.manage'),
  '/store/stock':                      () => has('store.view'),
  '/inventory/stock':                  () => has('inventory.view'),
  '/kds':                              () => has('kds.view'),
  '/rider-operations':                 () => has('riderTracking.live') || has('riderTracking.history'),
  '/pos/sessions':                     () => has('reports.salesSummary') || has('pos.manage'),
  '/allowances':                       () => has('allowances.view') || has('allowances.manage'),
  '/employees':                        () => has('employees.view') || has('employees.manage'),
  '/attendance':                       () => has('attendance.view') || has('attendance.manage'),
  '/salaries':                         () => has('salaries.view') || has('salaries.manage'),
  '/reports/spend':                    () => has('reports.spend'),
  '/reports/price-history':            () => has('reports.priceHistory'),
  '/reports/vendor-performance':       () => has('reports.vendorPerformance'),
  '/reports/aging':                    () => has('reports.aging'),
  '/reports/sales-summary':            () => has('reports.salesSummary'),
  '/reports/sales-transactions':       () => has('reports.salesTransactions'),
  '/reports/sales-by-item':            () => has('reports.salesByItem'),
  '/reports/sales-by-cashier':         () => has('reports.salesByCashier'),
  '/reports/hourly-breakdown':         () => has('reports.hourly'),
  '/reports/cancelled-orders':         () => has('reports.salesSummary'),
  '/reports/order-lifecycle':          () => has('reports.orderLifecycle'),
  '/reports/kitchen-counter-sales':    () => has('reports.kitchenCounterSales'),
  '/tables':                           () => has('tables.manage'),
  '/loyalty':                          () => has('loyalty.manage'),
  '/loyalty/members':                  () => has('loyalty.manage'),
  '/loyalty/settings':                 () => has('loyalty.manage'),
  '/reports/membership-movements':     () => has('loyalty.manage'),
  '/reports/membership-summary':       () => has('loyalty.manage'),
  '/settings/users':                   () => has('settings.users'),
  '/settings/roles':                   () => has('settings.roles'),
  '/settings/outlets':                 () => has('settings.outlets'),
  '/settings/printers':                () => has('settings.printers'),
});

const ROLE_LABELS = {
  owner:           'Owner',
  financeManager:  'Finance Manager',
  purchaseManager: 'Purchase Manager',
  receivingStaff:  'Receiving Staff',
  cashier:         'Cashier',
  rider:           'Rider',
};

// ── Section builder — groups NAV_ITEMS into sections for easier rendering ─────
const buildSections = () => {
  const sections = [];
  let current = null;
  for (const item of NAV_ITEMS) {
    if (item.groupLabel) {
      current = { groupLabel: item.groupLabel, groupRoles: item.roles || null, children: [] };
      sections.push(current);
    } else if (!current) {
      sections.push({ standalone: true, item });
    } else {
      current.children.push(item);
    }
  }
  return sections;
};

const NAV_SECTIONS = buildSections();

// ── Sidebar ───────────────────────────────────────────────────────────────────
const Sidebar = ({ onClose }) => {
  const { role, user } = useAuth();
  const { has } = usePermissions();
  const { hasFeature } = useFeatures();
  const { pathname } = useLocation();
  const permChecks = buildPermChecks(has);

  // A nav item is active for its whole section: the exact path OR any deeper
  // route/subtab under its base (so /store/report keeps "Store" highlighted).
  // `activeMatch` overrides the base(s) for items whose subtabs live under a
  // different path than the link — a string, or an array when the tabs span
  // separate top-level routes (e.g. Purchases → /purchases + /payments).
  // `end` forces an exact match (used where one item's path prefixes another).
  const isItemActive = (item) => {
    const bases = item.activeMatch
      ? (Array.isArray(item.activeMatch) ? item.activeMatch : [item.activeMatch])
      : [item.to];
    if (item.end) return bases.includes(pathname);
    return bases.some((b) => pathname === b || pathname.startsWith(b + '/'));
  };
  const hiddenTabs = new Set(user?.sidebarPreferences?.hiddenTabs ?? []);
  const [kdsEnabled, setKdsEnabled] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (item) => !q || (item.label && item.label.toLowerCase().includes(q));

  useEffect(() => {
    if (!hasFeature('kds')) {
      setKdsEnabled(false);
      return undefined;
    }
    let active = true;
    const loadKdsAvailability = () => getOutlets({ limit: 100 })
      .then(({ data }) => {
        if (!active) return;
        const rows = data?.data || [];
        const assignedId = String(user?.outletRef?._id || user?.outletRef || '');
        const assignedCode = String(user?.outletCode || user?.outlet || '');
        const available = role === 'owner'
          ? rows.some((outlet) => outlet.kds?.enabled === true)
          : rows.some((outlet) => outlet.kds?.enabled === true
            && (String(outlet._id) === assignedId || String(outlet.code) === assignedCode));
        setKdsEnabled(available);
      })
      .catch(() => { if (active) setKdsEnabled(false); });
    loadKdsAvailability();
    window.addEventListener('kds-settings-changed', loadKdsAvailability);
    return () => {
      active = false;
      window.removeEventListener('kds-settings-changed', loadKdsAvailability);
    };
  }, [hasFeature, role, user?.outlet, user?.outletCode, user?.outletRef]);

  // User initials for footer chip
  const initials = (() => {
    const n = (user?.name || '').trim();
    if (!n) return user?.email?.charAt(0).toUpperCase() || '?';
    const parts = n.split(/\s+/);
    return ((parts[0] || '').charAt(0) + (parts[1] || '').charAt(0)).toUpperCase();
  })();

  // ── Render a single normal nav item ────────────────────────────────────────
  const renderNavItem = (item) => {
    if (!matches(item)) return null;
    if (item.to === '/kds' && !kdsEnabled) return null;
    if (hiddenTabs.has(item.to)) return null;
    const permFn = permChecks[item.to];
    if (permFn) {
      if (!permFn()) return null;
    } else if (!item.roles?.includes(role)) {
      return null;
    }
    const Icon = item.icon;
    const active = isItemActive(item);
    const badge = 0;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={onClose}
        className={clsx(
          'group relative flex items-center gap-2.5 py-2 rounded-lg text-sm font-medium transition-all',
          item.indent ? 'pl-8 pr-3' : 'px-3',
          active
            ? 'bg-gradient-to-r from-indigo-600/90 to-violet-600/90 text-white shadow-md shadow-indigo-500/20 ring-1 ring-white/10'
            : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
        )}
      >
        {item.indent && (
          <span className={clsx('absolute left-4 top-1 bottom-1 w-px transition-colors', active ? 'bg-white/30' : 'bg-white/5 group-hover:bg-white/10')} />
        )}
        {item.indent && active && (
          <span className="absolute left-[14px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
        )}
        <Icon size={item.indent ? 13 : 15} className="shrink-0" />
        <span className="truncate">{item.label}</span>
        {badge > 0 && (
          <span
            className={clsx(
              'ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold shrink-0',
              active ? 'bg-white text-indigo-700' : 'bg-amber-500 text-white',
            )}
            title={`${badge} transfer${badge > 1 ? 's' : ''} awaiting acceptance`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </NavLink>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <aside className="flex flex-col h-full w-64 shrink-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-300 border-r border-white/5 relative overflow-hidden">
      {/* Decorative orbs */}
      <div className="absolute -top-24 -left-12 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-16 w-56 h-56 rounded-full bg-violet-500/8 blur-3xl pointer-events-none" />

      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="relative px-5 pb-5 pt-[calc(1.25rem_+_env(safe-area-inset-top))] border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/30 ring-1 ring-white/15 overflow-hidden">
            <img src={logo} alt="Cenciss" className="h-6 w-6 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white text-sm tracking-tight leading-tight">Cenciss</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-0.5">Operations</p>
          </div>
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="relative px-3 pt-3 pb-1">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search menu…"
            aria-label="Search sidebar"
            className="w-full h-9 pl-8 pr-8 rounded-lg bg-white/5 ring-1 ring-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:bg-white/10 transition"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="relative flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV_SECTIONS.map((section, sIdx) => {
          // ── Standalone item (Dashboard) ─────────────────────────────────
          if (section.standalone) {
            return renderNavItem(section.item);
          }

          const { groupLabel, children } = section;
          const groupFeatureKey = GROUP_FEATURE_MAP[groupLabel];
          const isGroupFeatureLocked = !!groupFeatureKey && !hasFeature(groupFeatureKey);

          // ── Feature disabled → hide group entirely ──────────────────────
          if (isGroupFeatureLocked) return null;

          // Visibility is permission-driven: a group shows whenever at least one
          // of its tabs is permitted for this user (see filter below). We do NOT
          // gate the whole group by role — otherwise granting a permission to a
          // user whose role isn't in the group's default list would have no
          // effect, and the tab would stay hidden.
          const visibleItems = children.filter((child) => {
            if (child.feature && !hasFeature(child.feature)) return false;
            if (hiddenTabs.has(child.to)) return false;
            if (!matches(child)) return false;
            const permFn = permChecks[child.to];
            if (permFn) return permFn();
            return Array.isArray(child.roles) && child.roles.includes(role);
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx}>
              {/* Group header */}
              <div className="px-3 pt-5 pb-1.5 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  {groupLabel}
                </span>
                <span className="flex-1 h-px bg-white/5" />
              </div>

              {/* Group items */}
              {visibleItems.map((child) => renderNavItem(child))}
            </div>
          );
        })}

        {/* No search results fallback */}
        {q && (() => {
          const anyVisible = NAV_SECTIONS.some((section) => {
            if (section.standalone) return matches(section.item);
            if (GROUP_FEATURE_MAP[section.groupLabel] && !hasFeature(GROUP_FEATURE_MAP[section.groupLabel])) return false;
            return section.children?.some((child) => {
              if (!matches(child)) return false;
              if (child.feature && !hasFeature(child.feature)) return false;
              if (hiddenTabs.has(child.to)) return false;
              const permFn = permChecks[child.to];
              if (permFn) return permFn();
              return Array.isArray(child.roles) && child.roles.includes(role);
            });
          });
          if (anyVisible) return null;
          return (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              No tabs match "{q}".
            </p>
          );
        })()}
      </nav>

      {/* ── User footer ──────────────────────────────────────────────────── */}
      {user && (
        <div className="relative px-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-2 border-t border-white/5">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/[0.03] ring-1 ring-white/5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 text-xs font-bold text-white ring-1 ring-white/15 shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">
                {user.name || user.email || 'User'}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-0.5 truncate">
                {ROLE_LABELS[role] ?? role}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
