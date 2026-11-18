import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Download, CheckCircle, XCircle, Scale, Wallet, Receipt, Landmark, Calculator, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { useGetBalanceSheetQuery, listQueryOpts } from '../../store/baseApi';
import SearchInput from '../../components/UI/SearchInput';
import HeroBanner from '../../components/UI/HeroBanner';
import FilterBar from '../../components/UI/FilterBar';
import Button from '../../components/UI/Button';
import useQueryState from '../../hooks/useQueryState';

const fmt = (n) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const exportCSV = (result, asOf) => {
  const asOfLabel = asOf || format(new Date(), 'yyyy-MM-dd');
  const rows = [
    ['Balance Sheet'],
    [`As of: ${asOfLabel}`],
    [],
    ['Section', 'Code', 'Account', 'Amount'],
    ...result.assets.map((a)      => ['Assets',      a.code, a.name, a.amount.toFixed(2)]),
    ['', '', 'Total Assets',      result.totalAssets.toFixed(2)],
    [],
    ...result.liabilities.map((a) => ['Liabilities', a.code, a.name, a.amount.toFixed(2)]),
    ['', '', 'Total Liabilities', result.totalLiabilities.toFixed(2)],
    [],
    ...result.equity.map((a)      => ['Equity',      a.code, a.name, a.amount.toFixed(2)]),
    ['', '', 'Total Equity',      result.totalEquity.toFixed(2)],
    [],
    ['', '', 'Total Liabilities + Equity', (result.totalLiabilities + result.totalEquity).toFixed(2)],
  ];

  const csv  = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `balance-sheet-${asOfLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Section card (Assets / Liabilities / Equity) ──────────────────────────────
const TONES = {
  blue:   { iconChip: 'bg-blue-50 text-blue-600',     labelText: 'text-blue-700',   footBg: 'bg-blue-50/80',   footBorder: 'border-blue-100' },
  orange: { iconChip: 'bg-orange-50 text-orange-600', labelText: 'text-orange-700', footBg: 'bg-orange-50/80', footBorder: 'border-orange-100' },
  purple: { iconChip: 'bg-purple-50 text-purple-600', labelText: 'text-purple-700', footBg: 'bg-purple-50/80', footBorder: 'border-purple-100' },
};

const Section = ({ title, rows, total, accent, icon: Icon, emptyMessage, onRowClick }) => {
  const tone = TONES[accent] || TONES.blue;
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
            ) : rows.map((row) => (
              <tr
                key={row.accountId ?? row.code}
                onClick={() => onRowClick?.(row.accountId)}
                title="View ledger breakdown"
                className="group hover:bg-slate-50/60 transition-colors cursor-pointer"
              >
                <td className="py-2.5 px-5 font-mono text-xs text-gray-500 w-24">{row.code}</td>
                <td className="py-2.5 px-4 text-gray-800">
                  <span className="inline-flex items-center gap-1.5">
                    {row.name}
                    <ChevronRight
                      size={14}
                      className="text-indigo-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition"
                    />
                  </span>
                </td>
                <td className={clsx(
                  'py-2.5 px-5 text-right font-medium tabular-nums',
                  (row.amount ?? 0) < 0 ? 'text-rose-600' : 'text-gray-700'
                )}>
                  {fmt(row.amount)}
                </td>
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

// ─────────────────────────────────────────────────────────────────────────────

const BalanceSheet = () => {
  const navigate = useNavigate();
  const [asOf, setAsOf] = useQueryState('asOf', '');
  const [search, setSearch] = useQueryState('search', '');

  const queryParams = useMemo(() => ({ asOf: asOf || undefined }), [asOf]);
  const { data: result, isLoading: loading } = useGetBalanceSheetQuery(queryParams, listQueryOpts);

  // Search filters the account rows within each section; section totals reflect
  // the matching rows. The KPI tiles + the accounting-equation check stay full.
  const q = search.trim().toLowerCase();
  const match = (r) => `${r.code} ${r.name}`.toLowerCase().includes(q);
  const filterRows = (rows) => (q ? (rows ?? []).filter(match) : (rows ?? []));
  const sumRows = (rows, full) => (q ? (rows ?? []).filter(match).reduce((s, r) => s + (r.amount || 0), 0) : full);

  // Drill into a head: open its ledger up to the same as-of date. Forward only the
  // user-typed as-of (a yyyy-MM-dd the Ledger reinterprets in the outlet tz). When
  // blank ("today"), omit `to` so the Ledger defaults to now — never round-trip the
  // server's result.asOf instant through browser-tz format() (that shifts a day for
  // outlets behind UTC and would break report↔ledger reconciliation).
  const openLedger = (accountId) => {
    if (!accountId) return;
    const params = new URLSearchParams({ account: accountId });
    if (asOf) params.set('to', asOf);
    navigate(`/accounting/ledger?${params.toString()}`);
  };

  const liabPlusEquity = (result?.totalLiabilities ?? 0) + (result?.totalEquity ?? 0);
  const diff           = Math.abs((result?.totalAssets ?? 0) - liabPlusEquity);
  const isBalanced     = result?.isBalanced;

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={Scale}
        eyebrow="Accounting"
        title="Balance Sheet"
        subtitle="Assets = Liabilities + Equity — exportable as CSV."
        accent="indigo"
        compact
        actions={result && (
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => exportCSV(result, asOf)}
          >
            Export CSV
          </Button>
        )}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Assets',      value: `Rs. ${fmt(result?.totalAssets ?? 0)}`,      icon: Wallet,   color: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'Total Liabilities', value: `Rs. ${fmt(result?.totalLiabilities ?? 0)}`, icon: Receipt,  color: 'text-orange-600',  bg: 'bg-orange-50' },
          { label: 'Total Equity',      value: `Rs. ${fmt(result?.totalEquity ?? 0)}`,      icon: Landmark, color: 'text-purple-600',  bg: 'bg-purple-50' },
          {
            label: 'Difference',
            value: `Rs. ${fmt(diff)}`,
            icon:  isBalanced ? CheckCircle : XCircle,
            color: isBalanced ? 'text-emerald-600' : 'text-rose-600',
            bg:    isBalanced ? 'bg-emerald-50'    : 'bg-rose-50',
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
        <label className="text-sm font-medium text-gray-700">As of date</label>
        <input
          type="date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
        />
        {asOf && (
          <button
            onClick={() => setAsOf('')}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            Clear (use today)
          </button>
        )}
        <div className="ml-auto text-xs text-gray-400">
          As of {result?.asOf ? format(new Date(result.asOf), 'dd MMM yyyy') : asOf ? format(new Date(asOf), 'dd MMM yyyy') : 'today'}
        </div>
      </FilterBar>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && result && (
        <div className="space-y-5">
          {/* Balance status banner */}
          <div className={clsx(
            'flex items-center gap-3 px-5 py-3 rounded-2xl border',
            isBalanced ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
          )}>
            {isBalanced
              ? <CheckCircle size={16} className="text-emerald-500 shrink-0" />
              : <XCircle     size={16} className="text-rose-500 shrink-0" />
            }
            <div className="flex-1">
              <p className={clsx('text-sm font-bold', isBalanced ? 'text-emerald-700' : 'text-rose-700')}>
                {isBalanced ? 'Balanced' : 'Unbalanced'}
              </p>
              <p className={clsx('text-xs mt-0.5', isBalanced ? 'text-emerald-600' : 'text-rose-600')}>
                {isBalanced
                  ? 'Total assets equal liabilities plus equity.'
                  : `Assets Rs. ${fmt(result.totalAssets)} vs Liabilities + Equity Rs. ${fmt(liabPlusEquity)} — review entries before period close.`}
              </p>
            </div>
          </div>

          <Section
            title="Assets"
            rows={filterRows(result.assets)}
            total={sumRows(result.assets, result.totalAssets)}
            accent="blue"
            icon={Wallet}
            emptyMessage={q ? `No asset accounts match “${search}”.` : 'No asset accounts on the books.'}
            onRowClick={openLedger}
          />

          <Section
            title="Liabilities"
            rows={filterRows(result.liabilities)}
            total={sumRows(result.liabilities, result.totalLiabilities)}
            accent="orange"
            icon={Receipt}
            emptyMessage={q ? `No liability accounts match “${search}”.` : 'No liability accounts on the books.'}
            onRowClick={openLedger}
          />

          <Section
            title="Equity"
            rows={filterRows(result.equity)}
            total={sumRows(result.equity, result.totalEquity)}
            accent="purple"
            icon={Landmark}
            emptyMessage={q ? `No equity accounts match “${search}”.` : 'No equity accounts on the books.'}
            onRowClick={openLedger}
          />

          {/* Equation check */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Calculator size={15} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Accounting Equation</h2>
                <p className="text-xs text-gray-400 mt-0.5">Assets must equal Liabilities + Equity</p>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Total Assets</p>
                <p className="text-2xl font-bold text-blue-700 tabular-nums">Rs. {fmt(result.totalAssets)}</p>
              </div>
              <div className="flex items-center justify-center">
                <span className={clsx(
                  'inline-flex items-center justify-center w-12 h-12 rounded-2xl text-2xl font-bold',
                  isBalanced ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                )}>
                  {isBalanced ? '=' : '≠'}
                </span>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Liabilities + Equity</p>
                <p className="text-2xl font-bold text-gray-700 tabular-nums">Rs. {fmt(liabPlusEquity)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BalanceSheet;
