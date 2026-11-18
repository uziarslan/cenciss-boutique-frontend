import { useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { Banknote, Tag, Users, FileText, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { useGetSpendQuery, useGetOutletsQuery, reportQueryOpts } from '../../store/baseApi';
import { exportToCSV } from '../../utils/exportCSV';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import {
  fmt, StatCard, ReportSkeleton, ReportEmpty,
  PctBar, ExportButton, ReportCard, ReportSectionHeader, ReportThead,
} from './ReportShared';
import useQueryState from '../../hooks/useQueryState';

const SpendReport = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useQueryState('from', today);
  const [dateTo, setDateTo] = useQueryState('to', today);
  const [groupBy, setGroupBy] = useQueryState('groupBy', 'vendor');
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const [search, setSearch] = useQueryState('search', '');
  const [minSpend, setMinSpend] = useQueryState('minSpend', '');
  const [minPurchases, setMinPurchases] = useQueryState('minPurchases', '');
  const [sort, setSort] = useQueryState('sort', 'amountHigh');
  const { data: outlets = [] } = useGetOutletsQuery();

  useEffect(() => {
    if (outlets.length === 1 && !outlet) setOutlet(outlets[0]._id || '');
  }, [outlets, outlet, setOutlet]);

  const queryParams = useMemo(() => ({
    from: dateFrom || undefined,
    to: dateTo || undefined,
    groupBy,
    outlet: outlet || undefined,
  }), [dateFrom, dateTo, groupBy, outlet]);

  const { data, isLoading: loading } = useGetSpendQuery(queryParams, reportQueryOpts);
  const groups = (data?.groups ?? []).filter((row) => (
    (!search.trim() || String(row.name || '').toLowerCase().includes(search.trim().toLowerCase()))
    && (minSpend === '' || Number(row.amount || 0) >= Number(minSpend))
    && (minPurchases === '' || Number(row.purchaseCount || 0) >= Number(minPurchases))
  )).sort((a, b) => {
    if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
    if (sort === 'purchasesHigh') return Number(b.purchaseCount || 0) - Number(a.purchaseCount || 0);
    if (sort === 'amountLow') return Number(a.amount || 0) - Number(b.amount || 0);
    return Number(b.amount || 0) - Number(a.amount || 0);
  });

  const handleExport = () => {
    if (!groups.length) return;
    exportToCSV(
      groups.map((r) => ({
        [groupBy === 'vendor' ? 'Vendor' : 'Category']: r.name,
        'Amount (Rs.)':     r.amount.toFixed(2),
        'Purchase Count':   r.purchaseCount,
        '% of Total':       r.percentOfTotal.toFixed(1),
      })),
      `spend-by-${groupBy}-${dateFrom}-to-${dateTo}`
    );
  };

  const periodLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), 'd MMM yyyy')} – ${format(new Date(dateTo), 'd MMM yyyy')}`
    : 'All time';

  // Aggregate metrics
  const totalSpend     = data?.totalSpend ?? 0;
  const totalPurchases = (data?.groups ?? []).reduce((s, g) => s + (g.purchaseCount ?? 0), 0);
  const groupCount     = data?.groups?.length ?? 0;
  const avgPerGroup    = groupCount > 0 ? totalSpend / groupCount : 0;

  return (
    <div className="space-y-6 pb-8">
      {/* ── Filters ── */}
      <FilterBar>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${groupBy}…`} className="min-w-[240px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
            value={outlet}
            onChange={setOutlet}
            searchPlaceholder="Search outlets…"
          />
        </div>
        <input type="number" min="0" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} placeholder="Minimum spend" className="w-44 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input type="number" min="0" value={minPurchases} onChange={(e) => setMinPurchases(e.target.value)} placeholder="Minimum purchases" className="w-48 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'amountHigh', label: 'Highest spend' }, { value: 'amountLow', label: 'Lowest spend' }, { value: 'purchasesHigh', label: 'Most purchases' }, { value: 'name', label: 'Name' }]} value={sort} onChange={setSort} /></div>

        {/* GroupBy segmented control */}
        <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {[
            { value: 'vendor',   label: 'Vendor',   icon: Users },
            { value: 'category', label: 'Category', icon: Tag },
          ].map((g) => {
            const active = groupBy === g.value;
            return (
              <button
                key={g.value}
                onClick={() => setGroupBy(g.value)}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                )}
              >
                <g.icon size={13} />
                {g.label}
              </button>
            );
          })}
        </div>

        <ExportButton onClick={handleExport} disabled={!groups.length} />

        <div className="ml-auto text-xs text-gray-400">{periodLabel}</div>
      </FilterBar>

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[88px] bg-gray-100 rounded-2xl animate-pulse" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Spend"
              value={`Rs. ${fmt(totalSpend)}`}
              sub={periodLabel}
              icon={Wallet}
              color="indigo"
              highlight
            />
            <StatCard
              label={groupBy === 'vendor' ? 'Vendors' : 'Categories'}
              value={groupCount}
              sub="With purchases in period"
              icon={groupBy === 'vendor' ? Users : Tag}
              color="violet"
            />
            <StatCard
              label="Purchases"
              value={totalPurchases}
              sub="Counted in spend"
              icon={FileText}
              color="cyan"
            />
            <StatCard
              label={groupBy === 'vendor' ? 'Avg per Vendor' : 'Avg per Category'}
              value={`Rs. ${fmt(avgPerGroup)}`}
              sub={`${groupCount} ${groupBy === 'vendor' ? 'vendor' : 'categor'}${groupCount === 1 ? '' : (groupBy === 'vendor' ? 's' : 'ies')}`}
              icon={Banknote}
              color="emerald"
            />
          </>
        )}
      </div>

      {/* ── Breakdown table ── */}
      {loading ? (
        <ReportSkeleton rows={8} cols={5} />
      ) : !data?.groups?.length ? (
        <ReportEmpty message={`No ${groupBy === 'vendor' ? 'vendor' : 'category'} spend in this period.`} />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={groupBy === 'vendor' ? Users : Tag}
            iconAccent={groupBy === 'vendor' ? 'indigo' : 'violet'}
            title={`Spend by ${groupBy === 'vendor' ? 'Vendor' : 'Category'}`}
            subtitle="Sorted by amount, highest first"
            right={(
              <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                {groups.length} {groups.length === 1 ? 'group' : 'groups'}
              </span>
            )}
          />

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={[
                groupBy === 'vendor' ? 'Vendor' : 'Category',
                { label: 'Amount (Rs.)', align: 'right' },
                { label: 'Purchases',    align: 'right' },
                { label: '% of Total',   align: 'right' },
                'Distribution',
              ]} />
              <tbody className="divide-y divide-slate-100">
                {groups.map((row, idx) => (
                  <tr key={row.name ?? idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-medium text-gray-900">{row.name || '—'}</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-800 tabular-nums">{fmt(row.amount)}</td>
                    <td className="py-3 px-4 text-right text-gray-500 tabular-nums">{row.purchaseCount ?? '—'}</td>
                    <td className="py-3 px-4 text-right text-gray-500 tabular-nums">{(row.percentOfTotal ?? 0).toFixed(1)}%</td>
                    <td className="py-3 px-4 w-48">
                      <PctBar pct={row.percentOfTotal ?? 0} color="bg-indigo-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                  <td className="py-3.5 px-4 font-bold text-slate-700 uppercase tracking-wide text-xs">Total</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums text-base">{fmt(totalSpend)}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-700 tabular-nums">{totalPurchases}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-500">100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </ReportCard>
      )}
    </div>
  );
};

export default SpendReport;
