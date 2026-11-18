import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Download, TrendingUp, TrendingDown, Percent, BarChart3, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { useGetProfitAndLossQuery, listQueryOpts } from '../../store/baseApi';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchInput from '../../components/UI/SearchInput';
import HeroBanner from '../../components/UI/HeroBanner';
import FilterBar from '../../components/UI/FilterBar';
import Button from '../../components/UI/Button';
import useQueryState from '../../hooks/useQueryState';

const fmt = (n) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const exportCSV = (result, from, to) => {
  const rows = [
    ['Profit & Loss Statement'],
    [`Period: ${from || 'All time'} to ${to || 'Today'}`],
    [],
    ['Section', 'Code', 'Account', 'Amount'],
    ...(result.revenue.map((r) => ['Revenue', r.code, r.name, r.amount.toFixed(2)])),
    ['', '', 'Total Revenue', result.totalRevenue.toFixed(2)],
    [],
    ...(result.expenses.map((e) => ['Expenses', e.code, e.name, e.amount.toFixed(2)])),
    ['', '', 'Total Expenses', result.totalExpenses.toFixed(2)],
    [],
    ['', '', 'Net Profit / Loss', result.netProfit.toFixed(2)],
  ];

  const csv  = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `profit-loss-${from || 'all'}-to-${to || 'today'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Section card (Revenue / Expenses) ─────────────────────────────────────────
const SectionTable = ({ title, rows, total, accent, emptyMessage, onRowClick }) => {
  const tone = accent === 'emerald'
    ? { iconChip: 'bg-emerald-50 text-emerald-600', icon: TrendingUp,   labelText: 'text-emerald-700', footBg: 'bg-emerald-50/80', footBorder: 'border-emerald-100' }
    : { iconChip: 'bg-rose-50 text-rose-600',       icon: TrendingDown, labelText: 'text-rose-700',    footBg: 'bg-rose-50/80',    footBorder: 'border-rose-100' };
  const Icon = tone.icon;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', tone.iconChip)}>
            <Icon size={15} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{rows.length} account{rows.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <span className={clsx('text-sm font-bold tabular-nums', tone.labelText)}>Rs. {fmt(total)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-gray-400 text-sm">{emptyMessage}</td>
              </tr>
            ) : rows.map((r) => (
              <tr
                key={r.code}
                onClick={() => onRowClick?.(r.accountId)}
                title="View ledger breakdown"
                className="group hover:bg-slate-50/60 transition-colors cursor-pointer"
              >
                <td className="py-2.5 px-5 font-mono text-xs text-gray-500 w-24">{r.code}</td>
                <td className="py-2.5 px-4 text-gray-800">
                  <span className="inline-flex items-center gap-1.5">
                    {r.name}
                    <ChevronRight
                      size={14}
                      className="text-indigo-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition"
                    />
                  </span>
                </td>
                <td className="py-2.5 px-5 text-right font-medium text-gray-700 tabular-nums">{fmt(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className={clsx('border-t-2', tone.footBorder, tone.footBg)}>
                <td colSpan={2} className={clsx('py-3 px-5 text-sm font-bold uppercase tracking-wide text-right', tone.labelText)}>
                  Total {title}
                </td>
                <td className={clsx('py-3 px-5 text-right text-lg font-bold tabular-nums', tone.labelText)}>
                  {fmt(total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

const ProfitAndLoss = () => {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useQueryState('from', '');
  const [dateTo, setDateTo] = useQueryState('to', '');
  const [search, setSearch] = useQueryState('search', '');

  // Drill into a head: open its ledger for the same period.
  const openLedger = (accountId) => {
    if (!accountId) return;
    const params = new URLSearchParams({ account: accountId });
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo)   params.set('to', dateTo);
    navigate(`/accounting/ledger?${params.toString()}`);
  };

  const queryParams = useMemo(() => ({
    from: dateFrom || undefined,
    to:   dateTo   || undefined,
  }), [dateFrom, dateTo]);

  const { data: result, isLoading: loading } = useGetProfitAndLossQuery(queryParams, listQueryOpts);

  const isProfit = result ? result.netProfit >= 0 : null;
  const margin   = result && result.totalRevenue > 0
    ? (result.netProfit / result.totalRevenue) * 100
    : null;

  // Search filters the account rows within each section; the section totals then
  // reflect the matching rows so each card stays self-consistent. The KPI tiles
  // and the Net Profit/Loss banner stay on the full period.
  const q = search.trim().toLowerCase();
  const match = (r) => `${r.code} ${r.name}`.toLowerCase().includes(q);
  const revenueRows = result ? (q ? result.revenue.filter(match)  : result.revenue)  : [];
  const expenseRows = result ? (q ? result.expenses.filter(match) : result.expenses) : [];
  const revenueTotal = q ? revenueRows.reduce((s, r) => s + (r.amount || 0), 0) : (result?.totalRevenue ?? 0);
  const expenseTotal = q ? expenseRows.reduce((s, r) => s + (r.amount || 0), 0) : (result?.totalExpenses ?? 0);

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={BarChart3}
        eyebrow="Accounting"
        title="Profit & Loss"
        subtitle="Revenue vs expenses for the selected period — exportable as CSV."
        accent="indigo"
        compact
        actions={result && (
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => exportCSV(result, dateFrom, dateTo)}
          >
            Export CSV
          </Button>
        )}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Revenue',
            value: `Rs. ${fmt(result?.totalRevenue ?? 0)}`,
            icon:  TrendingUp,
            color: 'text-emerald-600',
            bg:    'bg-emerald-50',
          },
          {
            label: 'Total Expenses',
            value: `Rs. ${fmt(result?.totalExpenses ?? 0)}`,
            icon:  TrendingDown,
            color: 'text-rose-600',
            bg:    'bg-rose-50',
          },
          {
            label: isProfit ? 'Net Profit' : 'Net Loss',
            value: `Rs. ${fmt(result?.netProfit ?? 0)}`,
            icon:  isProfit ? TrendingUp : TrendingDown,
            color: isProfit ? 'text-emerald-600' : 'text-rose-600',
            bg:    isProfit ? 'bg-emerald-50'    : 'bg-rose-50',
          },
          {
            label: 'Margin',
            value: margin == null ? '—' : `${margin.toFixed(1)}%`,
            icon:  Percent,
            color: margin == null
              ? 'text-slate-600'
              : margin >= 0 ? 'text-emerald-600' : 'text-rose-600',
            bg:    margin == null
              ? 'bg-slate-100'
              : margin >= 0 ? 'bg-emerald-50' : 'bg-rose-50',
          },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon size={16} className={s.color} />
            </div>
            <div className="min-w-0">
              <p className={clsx('text-xl font-bold leading-tight tabular-nums truncate', s.color)}>
                {loading ? '…' : s.value}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-widest">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search account code or name…"
          className="min-w-[220px]"
        />
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            Clear
          </button>
        )}
        <div className="ml-auto text-xs text-gray-400">
          {dateFrom || dateTo ? (
            <span>
              {dateFrom ? format(new Date(dateFrom), 'dd MMM yyyy') : '—'}
              {' → '}
              {dateTo ? format(new Date(dateTo), 'dd MMM yyyy') : 'today'}
            </span>
          ) : 'All time'}
        </div>
      </FilterBar>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && result && (
        <div className="space-y-5">
          <SectionTable
            title="Revenue"
            rows={revenueRows}
            total={revenueTotal}
            accent="emerald"
            emptyMessage={q ? `No revenue accounts match “${search}”.` : 'No revenue accounts in this period.'}
            onRowClick={openLedger}
          />

          <SectionTable
            title="Expenses"
            rows={expenseRows}
            total={expenseTotal}
            accent="rose"
            emptyMessage={q ? `No expense accounts match “${search}”.` : 'No expense accounts in this period.'}
            onRowClick={openLedger}
          />

          {/* Net Profit / Loss banner */}
          <div className={clsx(
            'rounded-2xl border shadow-sm p-6 flex items-center justify-between gap-4 flex-wrap',
            isProfit ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
          )}>
            <div className="flex items-center gap-3">
              <div className={clsx(
                'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
                isProfit ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              )}>
                {isProfit
                  ? <TrendingUp size={22} />
                  : <TrendingDown size={22} />
                }
              </div>
              <div>
                <p className={clsx(
                  'text-[10px] font-bold uppercase tracking-widest',
                  isProfit ? 'text-emerald-600' : 'text-rose-600'
                )}>
                  Period Result
                </p>
                <p className={clsx(
                  'text-base font-bold leading-tight',
                  isProfit ? 'text-emerald-700' : 'text-rose-700'
                )}>
                  Net {isProfit ? 'Profit' : 'Loss'}
                </p>
                {margin != null && (
                  <p className={clsx(
                    'text-xs mt-0.5',
                    isProfit ? 'text-emerald-600' : 'text-rose-600'
                  )}>
                    {Math.abs(margin).toFixed(1)}% of revenue
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">Amount</p>
              <p className={clsx(
                'text-3xl font-bold tabular-nums leading-tight',
                isProfit ? 'text-emerald-700' : 'text-rose-700'
              )}>
                Rs. {fmt(result.netProfit)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfitAndLoss;
