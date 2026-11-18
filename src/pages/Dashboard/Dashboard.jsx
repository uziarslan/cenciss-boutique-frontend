import { useNavigate } from 'react-router';
import {
  FileText, AlertCircle, PackageOpen,
  TrendingUp, DollarSign, Trash2,
  CreditCard, ArrowRight, BarChart2, Users,
  Activity, ChevronRight, FlaskConical, Factory, ShoppingBag,
  TrendingDown, AlertTriangle, Lock,
  Warehouse,
} from 'lucide-react';
import clsx from 'clsx';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine,
} from 'recharts';
import { useGetDashboardQuery, useGetInventoryInsightsQuery, reportQueryOpts } from '../../store/baseApi';
import usePermissions from '../../hooks/usePermissions';
import useAuth from '../../hooks/useAuth';
import useFeatures from '../../hooks/useFeatures';

const fmtCurrency = (n) =>
  // Whole rupees render clean (12,345); fractional amounts (e.g. a small waste
  // cost of 0.17) keep up to 2 decimals instead of rounding to 0.
  (n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtFull = (n) =>
  (n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Skeleton = ({ className }) => (
  <div className={clsx('animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-lg', className)} />
);

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
// Soft white card with tinted icon chip — matches the app-wide StatTile theme.
const KPI_TONES = {
  indigo:  { text: 'text-indigo-600',  bg: 'bg-indigo-50'  },
  violet:  { text: 'text-violet-600',  bg: 'bg-violet-50'  },
  emerald: { text: 'text-emerald-600', bg: 'bg-emerald-50' },
  amber:   { text: 'text-amber-600',   bg: 'bg-amber-50'   },
  orange:  { text: 'text-orange-600',  bg: 'bg-orange-50'  },
  rose:    { text: 'text-rose-600',    bg: 'bg-rose-50'    },
  red:     { text: 'text-red-600',     bg: 'bg-red-50'     },
  cyan:    { text: 'text-cyan-600',    bg: 'bg-cyan-50'    },
  slate:   { text: 'text-slate-700',   bg: 'bg-slate-100'  },
  teal:    { text: 'text-teal-600',    bg: 'bg-teal-50'    },
};

const KpiCard = ({ label, value, subValue, icon: Icon, tone = 'indigo', loading, href }) => {
  const navigate = useNavigate();
  const t = KPI_TONES[tone] || KPI_TONES.indigo;
  const clickable = !!href;
  const valueLength = String(value ?? '').length;
  return (
    <div
      onClick={() => clickable && navigate(href)}
      className={clsx(
        'group relative min-h-[132px] rounded-2xl p-5 sm:p-6 flex items-start gap-4 bg-white border border-gray-100 shadow-sm transition-all duration-200',
        clickable && 'cursor-pointer hover:shadow-md hover:border-gray-200'
      )}
    >
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', t.bg)}>
        <Icon size={18} className={t.text} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 leading-snug">{label}</p>
        {loading ? (
          <div className="mt-2 h-7 w-24 animate-pulse bg-gray-100 rounded-md" />
        ) : (
          <p className={clsx(
            'mt-1 font-bold leading-tight tabular-nums whitespace-nowrap tracking-tight',
            valueLength > 18 ? 'text-base sm:text-lg' : valueLength > 13 ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl',
            t.text,
          )}>
            {value ?? '—'}
          </p>
        )}
        {subValue && !loading && (
          <p className="text-xs text-gray-500 mt-1 break-words">{subValue}</p>
        )}
      </div>
      {clickable && (
        <ChevronRight
          size={16}
          className="text-gray-300 shrink-0 mt-0.5 transition-colors group-hover:text-gray-400"
        />
      )}
    </div>
  );
};

// ─── Locked KPI Card ─────────────────────────────────────────────────────────
const LockedKpiCard = ({ label, icon: Icon }) => (
  <div className="relative min-h-[132px] rounded-2xl p-5 sm:p-6 flex items-start gap-4 bg-amber-50/60 border border-amber-200/70">
    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-100">
      <Icon size={18} className="text-amber-400" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] uppercase tracking-widest text-amber-600/70 truncate">{label}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <Lock size={12} className="text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-amber-600">Not in plan</span>
      </div>
    </div>
  </div>
);

// ─── Locked Section Body ──────────────────────────────────────────────────────
const LockedSectionBody = () => (
  <div className="flex flex-col items-center justify-center py-10 gap-3">
    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
      <Lock size={16} className="text-amber-500" />
    </div>
    <div className="text-center">
      <p className="text-sm font-semibold text-amber-700">Not in plan</p>
      <p className="text-xs text-amber-500/80 mt-0.5">Contact your administrator to enable this feature.</p>
    </div>
  </div>
);

// ─── Section wrapper ──────────────────────────────────────────────────────────
const Section = ({ title, subtitle, action, children }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const ViewMore = ({ href, label = 'View Details' }) => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(href)}
      className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap"
    >
      {label} <ArrowRight size={13} />
    </button>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 text-white rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>Rs. {fmtCurrency(p.value)}</p>
      ))}
    </div>
  );
};

const EmptyState = ({ icon: Icon, message, good }) => (
  <div className="flex flex-col items-center justify-center py-8 gap-2">
    <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', good ? 'bg-emerald-50' : 'bg-gray-100')}>
      <Icon size={18} className={good ? 'text-emerald-500' : 'text-gray-400'} />
    </div>
    <p className="text-sm text-gray-400 text-center max-w-xs">{message}</p>
  </div>
);

const BelowParRow = ({ item }) => {
  const pct = item.parLevel > 0 ? Math.round((item.qtyOnHand / item.parLevel) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
        <PackageOpen size={14} className="text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-400">{item.qtyOnHand} / {item.parLevel} {item.unit}</p>
      </div>
      <span className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0',
        pct <= 25 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
      )}>
        {pct}%
      </span>
    </div>
  );
};

const InvoiceBar = ({ label, count, amount, color, total }) => {
  const width = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600 font-medium">{label}</span>
        <span className="text-xs font-bold text-gray-700">
          {count} <span className="font-normal text-gray-400">(Rs. {fmtCurrency(amount)})</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${Math.max(width, count > 0 ? 5 : 0)}%` }}
        />
      </div>
    </div>
  );
};

const QuickLink = ({ label, href, icon: Icon, color, bg, locked }) => {
  const navigate = useNavigate();
  if (locked) {
    return (
      <div className="flex items-center gap-3 p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/70 w-full">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-amber-100">
          <Lock size={13} className="text-amber-500" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-amber-700 truncate block">{label}</span>
          <span className="text-[10px] font-semibold text-amber-500">Not in plan</span>
        </div>
      </div>
    );
  }
  return (
    <button
      onClick={() => navigate(href)}
      className="flex items-center gap-3 p-3.5 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all w-full text-left"
    >
      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', bg)}>
        <Icon size={15} className={color} />
      </div>
      <span className="text-xs font-medium text-gray-700">{label}</span>
    </button>
  );
};

const QUICK_LINKS = [
  { label: 'Purchases',       href: '/purchases',                    icon: FileText,      color: 'text-amber-600',  bg: 'bg-amber-50',  perm: 'purchases.view',       feature: 'purchasing' },
  { label: 'Raw Materials',   href: '/store/stock',                  icon: PackageOpen,   color: 'text-orange-600', bg: 'bg-orange-50', perm: 'store.view',           feature: 'store'      },
  { label: 'Finished Goods',  href: '/retail-inventory',             icon: PackageOpen,   color: 'text-indigo-600', bg: 'bg-indigo-50', perm: 'inventory.view' },
  { label: 'Manufacturing',   href: '/production',                   icon: Factory,       color: 'text-amber-600',  bg: 'bg-amber-50',  perm: 'inventory.view' },
  { label: 'Shopify',         href: '/settings/integrations/shopify',icon: ShoppingBag,   color: 'text-emerald-600',bg: 'bg-emerald-50',perm: 'settings.integrations' },
  { label: 'Payments',        href: '/payments',                     icon: CreditCard,    color: 'text-cyan-600',   bg: 'bg-cyan-50',   perm: 'payments.view',        feature: 'purchasing' },
  { label: 'Reports',         href: '/reports/sales-summary',        icon: BarChart2,     color: 'text-indigo-600', bg: 'bg-indigo-50', perm: 'reports.salesSummary', feature: 'reports'    },
  { label: 'Accounting',      href: '/accounting/chart-of-accounts', icon: DollarSign,    color: 'text-emerald-600',bg: 'bg-emerald-50',perm: 'accounting.view',      feature: 'accounting' },
  { label: 'Employees',       href: '/employees',                    icon: Users,         color: 'text-blue-600',   bg: 'bg-blue-50',   perm: 'employees.view',       feature: 'employees'  },
];

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const Dashboard = () => {
  const { has } = usePermissions();
  const { hasFeature } = useFeatures();
  const { user } = useAuth();
  const navigate = useNavigate();

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  // Dashboard KPIs — cached + revalidated in the background, so returning to the
  // home screen renders instantly from cache instead of refetching cold.
  const reportsEnabled = hasFeature('reports');
  const { data: stats, isLoading: statsLoading, isError } = useGetDashboardQuery(
    undefined,
    { skip: !reportsEnabled, ...reportQueryOpts },
  );
  const loading = reportsEnabled && statsLoading;

  const invEnabled = has('inventory.view') && hasFeature('inventory');
  const { data: invInsights, isLoading: invInsightsLoading } = useGetInventoryInsightsQuery(
    { days: 14 },
    { skip: !invEnabled, ...reportQueryOpts },
  );

  if (isError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl">
        Failed to load dashboard data.
      </div>
    );
  }

  const s = stats ?? {};
  const businessDate = s.businessDate
    ? new Date(`${s.businessDate}T12:00:00Z`)
    : new Date();
  const businessDateOptions = s.businessDate ? { timeZone: 'UTC' } : {};
  const monthLabel = businessDate.toLocaleDateString('en-GB', {
    ...businessDateOptions,
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Good {getGreeting()}, {firstName} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Operations overview &mdash;{' '}
            {businessDate.toLocaleDateString('en-GB', {
              ...businessDateOptions,
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl">
          <Activity size={14} className="text-indigo-500" />
          <span className="text-xs font-medium text-indigo-600">Live Overview</span>
        </div>
      </div>

      {/* Financial KPIs — wider cards keep large currency values readable. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {has('reports.salesSummary') && (
          hasFeature('reports')
            ? <KpiCard label="Today's Sales" value={`Rs. ${fmtCurrency(s.todaySales)}`}
                subValue={`${s.todaySalesCount ?? 0} transactions`}
                icon={TrendingUp} tone="indigo" loading={loading} href="/reports/sales-summary" />
            : <LockedKpiCard label="Today's Sales" icon={TrendingUp} />
        )}
        {has('payments.view') && (
          hasFeature('purchasing')
            ? <KpiCard label={`Payments — ${monthLabel}`} value={`Rs. ${fmtCurrency(s.monthlyPaymentsAmount)}`}
                subValue={`${s.monthlyPaymentsCount ?? 0} payments made`}
                icon={DollarSign} tone="cyan" loading={loading} href="/payments" />
            : <LockedKpiCard label="Payments" icon={DollarSign} />
        )}
        {has('purchases.view') && (
          hasFeature('purchasing')
            ? <KpiCard label="Total Outstanding" value={`Rs. ${fmtCurrency(s.totalOutstanding)}`}
                subValue="All unpaid purchases"
                icon={CreditCard} tone="slate" loading={loading} href="/purchases" />
            : <LockedKpiCard label="Total Outstanding" icon={CreditCard} />
        )}
      </div>

      {/* Accounts attention — kept separate so status cards stay spacious. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {has('purchases.view') && (
          hasFeature('purchasing')
            ? <KpiCard label="Open Purchases" value={s.pendingInvoices}
                subValue={s.pendingInvoicesAmount > 0 ? `Rs. ${fmtCurrency(s.pendingInvoicesAmount)} due` : null}
                icon={FileText} tone="amber" loading={loading} href="/purchases" />
            : <LockedKpiCard label="Open Purchases" icon={FileText} />
        )}
        {has('purchases.view') && (
          hasFeature('purchasing')
            ? <KpiCard label="Overdue Purchases" value={s.overdueInvoices}
                subValue={s.overdueInvoicesAmount > 0 ? `Rs. ${fmtCurrency(s.overdueInvoicesAmount)} overdue` : 'None overdue'}
                icon={AlertCircle} tone={s.overdueInvoices > 0 ? 'red' : 'emerald'}
                loading={loading} href="/purchases" />
            : <LockedKpiCard label="Overdue Purchases" icon={AlertCircle} />
        )}
      </div>

      {/* Stock attention — one balanced row on desktop. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {has('store.view') && (
          hasFeature('store')
            ? <KpiCard label="Raw Materials Below Par" value={s.storeItemsBelowPar} subValue="Needs purchasing"
                icon={Warehouse} tone={s.storeItemsBelowPar > 0 ? 'red' : 'teal'}
                loading={loading} href="/store/stock" />
            : <LockedKpiCard label="Raw Materials Below Par" icon={Warehouse} />
        )}
        {has('inventory.view') && hasFeature('inventory') && <KpiCard label={`Waste — ${monthLabel}`} value={`Rs. ${fmtCurrency(s.monthlyWasteCost)}`}
          subValue={`${s.monthlyWasteCount ?? 0} log entries`}
          icon={Trash2} tone="rose" loading={loading} href="/inventory/waste" />}
      </div>

      {/* Sales Trend + Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {has('reports.salesSummary') && (
          <div className="lg:col-span-2">
            <Section
              title="7-Day Sales Trend"
              subtitle="Daily revenue for the last 7 days"
              action={hasFeature('reports') ? <ViewMore href="/reports/sales-summary" /> : null}
            >
              {!hasFeature('reports') ? <LockedSectionBody /> : loading ? (
                <Skeleton className="h-52 w-full" />
              ) : s.salesTrend?.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={s.salesTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => fmtCurrency(v)} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={65} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2.5}
                      fill="url(#salesGrad)" dot={false}
                      activeDot={{ r: 4, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={BarChart2} message="No sales data for the last 7 days." />
              )}
            </Section>
          </div>
        )}

        {has('inventory.view') && hasFeature('inventory') && (
          <Section title="Low Stock Alerts" subtitle="Items below par level" action={hasFeature('inventory') ? <ViewMore href="/inventory" /> : null}>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : s.belowParItems?.length > 0 ? (
              <div>
                {s.belowParItems.map((item, i) => <BelowParRow key={i} item={item} />)}
                {s.itemsBelowPar > 5 && (
                  <button onClick={() => navigate('/inventory')}
                    className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                    +{s.itemsBelowPar - 5} more <ArrowRight size={11} />
                  </button>
                )}
              </div>
            ) : (
              <EmptyState icon={PackageOpen} message="All items are at or above par level." good />
            )}
          </Section>
        )}
      </div>

      {/* Purchase Summary */}
      {has('purchases.view') && (
        <div className="grid grid-cols-1 gap-4">
          {has('purchases.view') && (
            <Section title="Purchase Summary" subtitle="Current purchasing and payable status" action={hasFeature('purchasing') ? <ViewMore href="/purchases" /> : null}>
              {!hasFeature('purchasing') ? <LockedSectionBody /> : loading ? <Skeleton className="h-32 w-full" /> : (
                <div className="space-y-3">
                  <InvoiceBar label="Draft / Open" count={s.pendingInvoices ?? 0}
                    amount={s.pendingInvoicesAmount ?? 0} color="bg-amber-400"
                    total={Math.max(1, (s.pendingInvoices ?? 0) + (s.overdueInvoices ?? 0))} />
                  <InvoiceBar label="Overdue" count={s.overdueInvoices ?? 0}
                    amount={s.overdueInvoicesAmount ?? 0} color="bg-red-500"
                    total={Math.max(1, (s.pendingInvoices ?? 0) + (s.overdueInvoices ?? 0))} />
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Total Outstanding</span>
                    <span className="text-sm font-bold text-gray-800">Rs. {fmtFull(s.totalOutstanding ?? 0)}</span>
                  </div>
                </div>
              )}
            </Section>
          )}
        </div>
      )}

      {/* Daily Transaction Bar Chart */}
      {has('reports.salesSummary') && (
        <Section title="Daily Transaction Count" subtitle="Transactions per day — last 7 days" action={hasFeature('reports') ? <ViewMore href="/reports/sales-summary" /> : null}>
          {!hasFeature('reports') ? <LockedSectionBody /> : loading ? <Skeleton className="h-44 w-full" /> : s.salesTrend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={s.salesTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={({ active, payload, label: l }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-gray-900 text-white rounded-xl px-3 py-2 shadow-xl text-xs">
                      <p className="font-semibold mb-1">{l}</p>
                      <p className="text-indigo-300">{payload[0]?.value} transactions</p>
                    </div>
                  );
                }} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={BarChart2} message="No transaction data for the last 7 days." />
          )}
        </Section>
      )}

      {/* Inventory Overview — recipe-linked ingredients & adaptive variance */}
      {has('inventory.view') && hasFeature('inventory') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <FlaskConical size={15} className="text-violet-500" />
                Ingredient &amp; Variance Overview
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">14-day adaptive usage tracking for recipe-linked ingredients</p>
            </div>
            <button
              onClick={() => navigate('/inventory/insights')}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
            >
              Detailed View <ArrowRight size={12} />
            </button>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              {
                label: 'Tracked Ingredients',
                value: invInsights?.kpis?.totalTracked ?? '—',
                icon: FlaskConical,
                color: 'text-violet-600', bg: 'bg-violet-50',
              },
              {
                label: 'Below Par Level',
                value: invInsights?.kpis?.belowParCount ?? '—',
                icon: PackageOpen,
                color: invInsights?.kpis?.belowParCount > 0 ? 'text-orange-600' : 'text-emerald-600',
                bg: invInsights?.kpis?.belowParCount > 0 ? 'bg-orange-50' : 'bg-emerald-50',
              },
              {
                label: 'Par Level Breaches',
                value: invInsights?.kpis?.parLevelBreaches ?? '—',
                icon: AlertTriangle,
                color: invInsights?.kpis?.parLevelBreaches > 0 ? 'text-red-600' : 'text-emerald-600',
                bg: invInsights?.kpis?.parLevelBreaches > 0 ? 'bg-red-50' : 'bg-emerald-50',
              },
              {
                label: 'High Variance Items',
                value: invInsights?.kpis?.highVarianceCount ?? '—',
                icon: TrendingDown,
                color: invInsights?.kpis?.highVarianceCount > 0 ? 'text-rose-600' : 'text-emerald-600',
                bg: invInsights?.kpis?.highVarianceCount > 0 ? 'bg-rose-50' : 'bg-emerald-50',
              },
            ].map((kpi) => (
              <div key={kpi.label} className={clsx('flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm', invInsightsLoading && 'animate-pulse')}>
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', kpi.bg)}>
                  <kpi.icon size={16} className={kpi.color} />
                </div>
                <div>
                  <p className={clsx('text-xl font-bold leading-tight', kpi.color)}>
                    {invInsightsLoading ? '…' : kpi.value}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Usage trend */}
            <div className="lg:col-span-2">
              <Section title="14-Day Usage Trend" subtitle="Expected vs actual ingredient consumption">
                {invInsightsLoading ? (
                  <Skeleton className="h-44 w-full" />
                ) : invInsights?.dailyTrend?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={invInsights.dailyTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                        tickFormatter={(d) => d?.slice(5)} />
                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={35} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-gray-900 text-white rounded-xl px-3 py-2 shadow-xl text-xs space-y-1">
                              <p className="font-semibold">{label}</p>
                              {payload.map((p) => (
                                <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value?.toFixed(2)}</p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine y={0} stroke="#e5e7eb" />
                      <Line type="monotone" dataKey="totalExpected" name="Expected" stroke="#6366f1" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="totalActual" name="Actual" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState icon={BarChart2} message="No usage data yet. Link menu items to ingredients to start tracking." />
                )}
              </Section>
            </div>

            {/* Top ingredients with variance */}
            <Section title="Variance Alerts" subtitle="Ingredients with highest variance">
              {invInsightsLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : invInsights?.ingredients?.filter((i) => i.usage && Math.abs(i.usage.avgVariancePct) > 0).length > 0 ? (
                <div className="space-y-2">
                  {invInsights.ingredients
                    .filter((i) => i.usage)
                    .sort((a, b) => Math.abs(b.usage.avgVariancePct) - Math.abs(a.usage.avgVariancePct))
                    .slice(0, 5)
                    .map((ing) => {
                      const pct = ing.usage.avgVariancePct ?? 0;
                      const over = pct > ing.adaptiveVariance;
                      return (
                        <div key={ing._id?.toString()} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                          <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', over ? 'bg-red-50' : 'bg-emerald-50')}>
                            {pct > 0
                              ? <TrendingUp size={12} className={over ? 'text-red-500' : 'text-emerald-500'} />
                              : <TrendingDown size={12} className="text-blue-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate">{ing.productName}</p>
                            <p className="text-[10px] text-gray-400">Adaptive: {ing.adaptiveVariance?.toFixed(1)}%</p>
                          </div>
                          <span className={clsx(
                            'text-xs font-bold shrink-0',
                            over ? 'text-red-600' : 'text-emerald-600'
                          )}>
                            {pct > 0 ? '+' : ''}{pct?.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              ) : invInsights?.ingredients?.filter((i) => i.usage && i.usage.totalExpected > 0).length > 0 ? (
                <div className="space-y-2">
                  {invInsights.ingredients
                    .filter((i) => i.usage && i.usage.totalExpected > 0)
                    .sort((a, b) => (b.usage.totalExpected ?? 0) - (a.usage.totalExpected ?? 0))
                    .slice(0, 5)
                    .map((ing) => (
                      <div key={ing._id?.toString()} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-violet-50">
                          <FlaskConical size={12} className="text-violet-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{ing.productName}</p>
                          <p className="text-[10px] text-gray-400">Expected: {ing.usage.totalExpected?.toFixed(2)} {ing.unit ?? ''}</p>
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">awaiting count</span>
                      </div>
                    ))}
                </div>
              ) : (
                <EmptyState icon={FlaskConical} message="No recipe-linked sales yet. Add recipes and make a sale to see tracking." good />
              )}
            </Section>
          </div>
        </div>
      )}

      {/* Quick Navigation */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Quick Navigation</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {QUICK_LINKS.filter((l) => !l.perm || has(l.perm)).map((link) => (
            <QuickLink key={link.href} {...link} locked={!!link.feature && !hasFeature(link.feature)} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
