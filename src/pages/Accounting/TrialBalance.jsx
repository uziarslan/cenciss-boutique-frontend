import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle, XCircle, Scale, ArrowDownLeft, ArrowUpRight, BookOpen, Wallet, Receipt, Landmark, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { useGetTrialBalanceQuery, listQueryOpts } from '../../store/baseApi';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchInput from '../../components/UI/SearchInput';
import HeroBanner from '../../components/UI/HeroBanner';
import FilterBar from '../../components/UI/FilterBar';
import SearchableSelect from '../../components/UI/SearchableSelect';
import useQueryState from '../../hooks/useQueryState';

const fmt = (n) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const TYPE_META = {
  asset:     { label: 'Assets',      icon: Wallet,       chip: 'bg-blue-50 text-blue-700',         iconChip: 'bg-blue-50 text-blue-600' },
  liability: { label: 'Liabilities', icon: Receipt,      chip: 'bg-orange-50 text-orange-700',     iconChip: 'bg-orange-50 text-orange-600' },
  equity:    { label: 'Equity',      icon: Landmark,     chip: 'bg-purple-50 text-purple-700',     iconChip: 'bg-purple-50 text-purple-600' },
  revenue:   { label: 'Revenue',     icon: TrendingUp,   chip: 'bg-emerald-50 text-emerald-700',   iconChip: 'bg-emerald-50 text-emerald-600' },
  expense:   { label: 'Expenses',    icon: TrendingDown, chip: 'bg-rose-50 text-rose-700',         iconChip: 'bg-rose-50 text-rose-600' },
};

const TrialBalance = () => {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useQueryState('from', '');
  const [dateTo, setDateTo] = useQueryState('to', '');
  const [search, setSearch] = useQueryState('search', '');
  const [accountType, setAccountType] = useQueryState('accountType', '');
  const [balanceSide, setBalanceSide] = useQueryState('balanceSide', '');
  const [zeroState, setZeroState] = useQueryState('zeroState', 'non-zero');
  const [minMovement, setMinMovement] = useQueryState('minMovement', '');
  const [sort, setSort] = useQueryState('sort', 'code');

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

  const { data: result, isLoading: loading } = useGetTrialBalanceQuery(queryParams, listQueryOpts);

  // Search filters the visible account rows by code / name. Totals, subtotals
  // and the balance banner stay on the full report (they're the period figures).
  const q = search.trim().toLowerCase();
  const visibleAccounts = result ? result.accounts.filter((account) => {
    const movement = Number(account.totalDebit || 0) + Number(account.totalCredit || 0);
    return (!q || `${account.code} ${account.name}`.toLowerCase().includes(q))
      && (!accountType || account.type === accountType)
      && (!balanceSide || (balanceSide === 'debit' ? Number(account.totalDebit || 0) > Number(account.totalCredit || 0) : Number(account.totalCredit || 0) > Number(account.totalDebit || 0)))
      && (zeroState !== 'non-zero' || movement !== 0)
      && (zeroState !== 'zero' || movement === 0)
      && (minMovement === '' || movement >= Number(minMovement));
  }).sort((a, b) => {
    if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
    if (sort === 'debitHigh') return Number(b.totalDebit || 0) - Number(a.totalDebit || 0);
    if (sort === 'creditHigh') return Number(b.totalCredit || 0) - Number(a.totalCredit || 0);
    if (sort === 'movementHigh') return (Number(b.totalDebit || 0) + Number(b.totalCredit || 0)) - (Number(a.totalDebit || 0) + Number(a.totalCredit || 0));
    return String(a.code || '').localeCompare(String(b.code || ''));
  }) : [];

  // Group accounts by type
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    rows: visibleAccounts.filter((a) => a.type === type),
  })).filter((g) => g.rows.length > 0);

  const totalDebit  = result?.totals?.totalDebit  ?? 0;
  const totalCredit = result?.totals?.totalCredit ?? 0;
  const isBalanced  = result?.totals?.isBalanced;
  const diff        = Math.abs(totalDebit - totalCredit);

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={Scale}
        eyebrow="Accounting"
        title="Trial Balance"
        subtitle="Debit and credit totals for every account, grouped by category."
        accent="indigo"
        compact
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Debits',  value: `Rs. ${fmt(totalDebit)}`,  icon: ArrowDownLeft, color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
          { label: 'Total Credits', value: `Rs. ${fmt(totalCredit)}`, icon: ArrowUpRight,  color: 'text-teal-600',    bg: 'bg-teal-50'    },
          { label: 'Difference',    value: `Rs. ${fmt(diff)}`,
            icon: isBalanced ? CheckCircle : XCircle,
            color: isBalanced ? 'text-emerald-600' : 'text-rose-600',
            bg:    isBalanced ? 'bg-emerald-50'    : 'bg-rose-50' },
          { label: 'Accounts',      value: result?.accounts?.length ?? 0, icon: BookOpen, color: 'text-violet-600', bg: 'bg-violet-50' },
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
        <div className="min-w-[160px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'All account types' }, ...TYPE_ORDER.map((value) => ({ value, label: TYPE_META[value].label }))]} value={accountType} onChange={setAccountType} /></div>
        <div className="min-w-[170px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'Either balance side' }, { value: 'debit', label: 'Net debit' }, { value: 'credit', label: 'Net credit' }]} value={balanceSide} onChange={setBalanceSide} /></div>
        <div className="min-w-[170px]"><SearchableSelect searchable={false} options={[{ value: 'non-zero', label: 'Non-zero accounts' }, { value: '', label: 'All accounts' }, { value: 'zero', label: 'Zero movement only' }]} value={zeroState} onChange={setZeroState} /></div>
        <input type="number" min="0" value={minMovement} onChange={(e) => setMinMovement(e.target.value)} placeholder="Minimum movement" className="w-44 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'code', label: 'Account code' }, { value: 'name', label: 'Account name' }, { value: 'movementHigh', label: 'Highest movement' }, { value: 'debitHigh', label: 'Highest debit' }, { value: 'creditHigh', label: 'Highest credit' }]} value={sort} onChange={setSort} /></div>
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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Balance status banner */}
          <div className={clsx(
            'flex items-center gap-3 px-5 py-3 border-b',
            isBalanced ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
          )}>
            {isBalanced
              ? <CheckCircle size={16} className="text-emerald-500" />
              : <XCircle     size={16} className="text-rose-500" />
            }
            <div className="flex-1">
              <p className={clsx('text-sm font-bold', isBalanced ? 'text-emerald-700' : 'text-rose-700')}>
                {isBalanced ? 'Balanced' : 'Unbalanced'}
              </p>
              <p className={clsx('text-xs mt-0.5', isBalanced ? 'text-emerald-600' : 'text-rose-600')}>
                {isBalanced
                  ? 'Total debits equal total credits across every account.'
                  : `Difference: Rs. ${fmt(diff)} — review entries before period close.`}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5">Code</th>
                  <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4">Account Name</th>
                  <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5 whitespace-nowrap">Debit (Rs.)</th>
                  <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5 whitespace-nowrap">Credit (Rs.)</th>
                  <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5 whitespace-nowrap">Balance (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(({ type, rows }) => {
                  const meta            = TYPE_META[type];
                  const subtotalDebit   = rows.reduce((s, r) => s + (r.totalDebit  ?? 0), 0);
                  const subtotalCredit  = rows.reduce((s, r) => s + (r.totalCredit ?? 0), 0);
                  const subtotalBal     = rows.reduce((s, r) => s + (r.balance     ?? 0), 0);

                  return [
                    <tr key={`hdr-${type}`} className="bg-slate-50/60 border-b border-slate-100">
                      <td colSpan={5} className="py-3 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', meta.iconChip)}>
                            <meta.icon size={13} />
                          </div>
                          <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-gray-400">({rows.length})</span>
                        </div>
                      </td>
                    </tr>,

                    ...rows.map((row) => (
                      <tr
                        key={row.accountId ?? row.code}
                        onClick={() => openLedger(row.accountId)}
                        title="View ledger breakdown"
                        className="group hover:bg-slate-50/60 border-b border-slate-100 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-5 font-mono text-xs text-gray-500">{row.code}</td>
                        <td className="py-2.5 px-4 text-gray-800">
                          <span className="inline-flex items-center gap-1.5">
                            {row.name}
                            <ChevronRight
                              size={14}
                              className="text-indigo-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition"
                            />
                          </span>
                        </td>
                        <td className="py-2.5 px-5 text-right text-gray-700 tabular-nums">{fmt(row.totalDebit)}</td>
                        <td className="py-2.5 px-5 text-right text-gray-700 tabular-nums">{fmt(row.totalCredit)}</td>
                        <td className={clsx(
                          'py-2.5 px-5 text-right font-semibold tabular-nums',
                          (row.balance ?? 0) < 0 ? 'text-rose-600' : 'text-gray-800'
                        )}>
                          {fmt(row.balance)}
                        </td>
                      </tr>
                    )),

                    <tr key={`sub-${type}`} className="bg-slate-50 border-b border-slate-200">
                      <td colSpan={2} className="py-2.5 px-5 text-xs font-semibold text-gray-600 text-right uppercase tracking-wide">
                        Subtotal · {meta.label}
                      </td>
                      <td className="py-2.5 px-5 text-right text-sm font-semibold text-gray-700 tabular-nums">{fmt(subtotalDebit)}</td>
                      <td className="py-2.5 px-5 text-right text-sm font-semibold text-gray-700 tabular-nums">{fmt(subtotalCredit)}</td>
                      <td className={clsx(
                        'py-2.5 px-5 text-right text-sm font-bold tabular-nums',
                        subtotalBal < 0 ? 'text-rose-600' : 'text-gray-800'
                      )}>
                        {fmt(subtotalBal)}
                      </td>
                    </tr>,
                  ];
                })}

                {grouped.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-gray-400">
                      {q ? `No accounts match “${search}”.` : 'No journal activity in this period.'}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-100/60">
                  <td colSpan={2} className="py-3 px-5 text-sm font-bold text-slate-700 text-right uppercase tracking-wide">
                    Grand Total
                  </td>
                  <td className="py-3 px-5 text-right text-sm font-bold text-gray-800 tabular-nums">
                    {fmt(totalDebit)}
                  </td>
                  <td className="py-3 px-5 text-right text-sm font-bold text-gray-800 tabular-nums">
                    {fmt(totalCredit)}
                  </td>
                  <td className={clsx(
                    'py-3 px-5 text-right text-sm font-bold tabular-nums',
                    isBalanced ? 'text-emerald-700' : 'text-rose-600'
                  )}>
                    {isBalanced ? '✓' : `Δ ${fmt(diff)}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrialBalance;
