import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  CalendarDays, TrendingUp, Search, X,
} from 'lucide-react';
import clsx from 'clsx';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import { useGetOutletsQuery, useGetSalesSummaryQuery, reportQueryOpts } from '../../store/baseApi';
import ReportDrillDrawer from './ReportDrillDrawer';
import { exportToCSV } from '../../utils/exportCSV';
import { resolveBusinessDate } from '../../utils/businessDate';
import useDebounce from '../../hooks/useDebounce';
import {
  fmt, PctBar, ReportCard, ReportSectionHeader, ReportThead, ExportButton, ReportEmpty, ReportSkeleton,
} from './ReportShared';
import SalesSnapshotCards from './SalesSnapshotCards';
import useQueryState from '../../hooks/useQueryState';

const PERIOD_LABELS = {
  day:   'Day',
  week:  'Week',
  month: 'Month',
};

// Stable module-level fallback used only until the selected outlet's business
// date is resolved. Keeping it outside the component prevents a freshly-created
// "today" value from becoming a hook dependency on every render.
const INITIAL_BROWSER_DATE = format(new Date(), 'yyyy-MM-dd');

const SalesSummary = () => {
  const [from, setFrom] = useQueryState('from', INITIAL_BROWSER_DATE);
  const [to, setTo] = useQueryState('to', INITIAL_BROWSER_DATE);
  const [groupBy, setGroupBy] = useQueryState('groupBy', 'day');
  const [search, setSearch] = useQueryState('search', '');
  const debouncedSearch = useDebounce(search, 350);
  const { data: outlets = [] } = useGetOutletsQuery();
  const [selectedOutlet, setSelectedOutlet] = useQueryState('outlet', '');
  const [drill, setDrill] = useState(null);

  useEffect(() => {
    if (!outlets.length) return;
    if (outlets.length === 1 && !selectedOutlet) setSelectedOutlet(outlets[0]._id || '');
    const businessToday = resolveBusinessDate(outlets, selectedOutlet);
    setFrom((current) => current === INITIAL_BROWSER_DATE ? businessToday : current);
    setTo((current) => current === INITIAL_BROWSER_DATE ? businessToday : current);
  }, [outlets, selectedOutlet, setFrom, setSelectedOutlet, setTo]);

  const queryParams = useMemo(() => {
    const p = { from, to, groupBy };
    if (selectedOutlet) p.outlet = selectedOutlet;
    if (debouncedSearch.trim()) p.search = debouncedSearch.trim();
    return p;
  }, [from, to, groupBy, selectedOutlet, debouncedSearch]);

  const { data: payload, isLoading } = useGetSalesSummaryQuery(
    queryParams,
    { skip: !from || !to, ...reportQueryOpts },
  );
  // First load (no cached data yet) shows the skeleton; background revalidation
  // keeps the previous result on screen, so revisits render instantly.
  const loading = isLoading;

  // Render drill-down timestamps in the selected outlet's timezone (browser
  // fallback when "All outlets" is selected).
  const drillTz = outlets.find((o) => o._id === selectedOutlet)?.timezone;

  const rows = useMemo(() => {
    if (!payload) return [];
    return Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload) ? payload : [];
  }, [payload]);

  const stats = useMemo(() => {
    if (!payload) return { totalSales: 0, totalTransactions: 0, avgTransactionValue: 0 };
    const totalSales = Number(
      payload.totalSales ?? payload.grandTotalSales
        ?? rows.reduce((sum, row) => sum + Number(row.totalSales ?? row.sales ?? 0), 0)
    );
    const totalTransactions = Number(
      payload.totalTransactions ?? payload.transactionCount
        ?? rows.reduce((sum, row) => sum + Number(row.transactionCount ?? row.transactions ?? 0), 0)
    );
    const avgTransactionValue = Number(
      payload.avgTransactionValue ?? (totalTransactions ? totalSales / totalTransactions : 0)
    );
    return { totalSales, totalTransactions, avgTransactionValue };
  }, [payload, rows]);

  const maxSales = useMemo(() => {
    if (!rows.length) return 1;
    return Math.max(...rows.map((row) => Number(row.totalSales ?? row.sales ?? 0)), 1);
  }, [rows]);

  // Sub-aggregates for stats: cash vs card share + busiest period
  const totalCash = rows.reduce((s, r) => s + Number(r.cashSales ?? r.cash ?? 0), 0);
  const totalCard = rows.reduce((s, r) => s + Number(r.cardSales ?? r.card ?? 0), 0);
  const totalOnline = rows.reduce((s, r) => s + Number(r.onlineSales ?? r.online ?? 0), 0);
  const totalGross = Number(payload?.grossSales ?? rows.reduce((s, r) => s + Number(r.grossSales ?? 0), 0));
  const totalNet = Number(payload?.netSales ?? rows.reduce((s, r) => s + Number(r.netSales ?? 0), 0));
  const totalHeld = Number(payload?.heldTotal ?? rows.reduce((s, r) => s + Number(r.heldTotal ?? 0), 0));
  const totalTax = Number(payload?.salesTax ?? rows.reduce((s, r) => s + Number(r.salesTax ?? 0), 0));
  const totalDiscounts = Number(payload?.discounts ?? rows.reduce((s, r) => s + Number(r.discounts ?? 0), 0));
  const heldCount = Number(payload?.heldCount ?? rows.reduce((s, r) => s + Number(r.heldCount ?? 0), 0));
  const busiest = useMemo(() => {
    if (!rows.length) return null;
    return [...rows].sort(
      (a, b) => Number(b.totalSales ?? b.sales ?? 0) - Number(a.totalSales ?? a.sales ?? 0)
    )[0];
  }, [rows]);

  const handleExport = () => {
    const payload = rows.map((row) => ({
      Period:         row.period ?? row.label ?? '',
      'Total Sales':  fmt(Number(row.totalSales ?? row.sales ?? 0)),
      'Gross Sales':  fmt(Number(row.grossSales ?? 0)),
      'Net Sales':    fmt(Number(row.netSales ?? 0)),
      'Sales Tax': fmt(Number(row.salesTax ?? 0)),
      Discounts: fmt(Number(row.discounts ?? 0)),
      'Cash Sales':   fmt(Number(row.cashSales ?? row.cash ?? 0)),
      'Card Sales':   fmt(Number(row.cardSales ?? row.card ?? 0)),
      'Online Sales': fmt(Number(row.onlineSales ?? row.online ?? 0)),
      'Held Orders': Number(row.heldCount ?? 0),
      'Held Total': fmt(Number(row.heldTotal ?? 0)),
      Transactions:   Number(row.transactionCount ?? row.transactions ?? 0),
    }));
    exportToCSV(payload, `sales-summary-${from}-${to}`);
  };

  const periodLabel = `${from} → ${to} · by ${PERIOD_LABELS[groupBy]}`;

  return (
    <div className="space-y-6 pb-8">
      {/* ── Filters ── */}
      <FilterBar>
        <label className="relative min-w-[280px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search any order detail…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear order search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          )}
        </label>
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
            value={selectedOutlet}
            onChange={setSelectedOutlet}
            searchPlaceholder="Search outlets…"
          />
        </div>

        {/* Group by — segmented control */}
        <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {[
            { value: 'day',   label: 'Day' },
            { value: 'week',  label: 'Week' },
            { value: 'month', label: 'Month' },
          ].map((g) => {
            const active = groupBy === g.value;
            return (
              <button
                key={g.value}
                type="button"
                onClick={() => setGroupBy(g.value)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                  active ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                )}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        <ExportButton onClick={handleExport} disabled={loading || !rows.length} />
        <div className="ml-auto text-xs text-gray-400">
          {periodLabel}{debouncedSearch.trim() ? ` · matching “${debouncedSearch.trim()}”` : ''}
        </div>
      </FilterBar>

      {/* ── Compact financial snapshot ── */}
      <SalesSnapshotCards
        loading={loading}
        grossSales={totalGross}
        netSales={totalNet}
        collected={stats.totalSales}
        salesTax={totalTax}
        discounts={totalDiscounts}
        orders={stats.totalTransactions ?? 0}
        averageOrder={stats.avgTransactionValue}
        cashSales={totalCash}
        cardSales={totalCard}
        onlineSales={totalOnline}
        heldTotal={totalHeld}
        heldCount={heldCount}
      />

      {/* ── Busiest period callout ── */}
      {!loading && busiest && rows.length > 1 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-emerald-50 border-emerald-100">
          <TrendingUp size={18} className="text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-700">
              Best {PERIOD_LABELS[groupBy].toLowerCase()}: {busiest.period ?? busiest.label}
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Rs. {fmt(Number(busiest.totalSales ?? busiest.sales ?? 0))} ·
              {' '}{Number(busiest.transactionCount ?? busiest.transactions ?? 0)} transaction{Number(busiest.transactionCount ?? busiest.transactions ?? 0) === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <ReportSkeleton rows={6} cols={13} />
      ) : rows.length === 0 ? (
        <ReportEmpty message={debouncedSearch.trim() ? 'No orders match this search in the selected period.' : 'No sales recorded for this period.'} />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={CalendarDays}
            iconAccent="indigo"
            title={`Sales by ${PERIOD_LABELS[groupBy]}`}
            subtitle={`Showing ${PERIOD_LABELS[groupBy].toLowerCase()} totals from ${from} to ${to}`}
            right={(
              <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                {rows.length} {rows.length === 1 ? 'period' : 'periods'}
              </span>
            )}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={[
                'Period',
                { label: 'Sales', align: 'right' },
                { label: 'Sales Tax', align: 'right' },
                { label: 'Discount', align: 'right' },
                { label: 'Payment Mix', align: 'right' },
                { label: 'Held', align: 'right' },
                { label: 'Items', align: 'right' },
                { label: 'Orders', align: 'right' },
                { label: 'Avg.', align: 'right' },
                'Trend',
              ]} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const totalSales = Number(row.totalSales ?? row.sales ?? 0);
                  const gross      = Number(row.grossSales ?? 0);
                  const net        = Number(row.netSales ?? 0);
                  const cash       = Number(row.cashSales ?? row.cash ?? 0);
                  const card       = Number(row.cardSales ?? row.card ?? 0);
                  const online     = Number(row.onlineSales ?? row.online ?? 0);
                  const held       = Number(row.heldTotal ?? 0);
                  const txns       = Number(row.transactionCount ?? row.transactions ?? 0);
                  const average    = txns ? totalSales / txns : 0;
                  return (
                    <tr
                      key={row.period ?? row.label}
                      onClick={() => setDrill({
                        title: row.period ?? row.label,
                        subtitle: `Transactions in this ${PERIOD_LABELS[groupBy].toLowerCase()}`,
                        params: {
                          from, to, groupBy, period: row.period ?? row.label,
                          outlet: selectedOutlet || undefined,
                          search: debouncedSearch.trim() || undefined,
                        },
                      })}
                      className="hover:bg-indigo-50/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{row.period ?? row.label}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        <div className="font-bold text-gray-900">{fmt(totalSales)}</div>
                        <div className="text-[10px] text-gray-400">G {fmt(gross)} · N {fmt(net)}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-rose-600">Tax {fmt(Number(row.salesTax ?? 0))}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-rose-600 tabular-nums">{fmt(Number(row.discounts ?? 0))}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        <div className="text-gray-700">Cash {fmt(cash)} · Card {fmt(card)}</div>
                        <div className="text-[10px] text-gray-400">Online {fmt(online)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-amber-700 tabular-nums">
                        {Number(row.heldCount ?? 0)} <span className="text-gray-400">/ {fmt(held)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{Number(row.itemCount ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{txns}</td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{fmt(average)}</td>
                      <td className="px-4 py-3 w-44">
                        <PctBar pct={maxSales ? (totalSales / maxSales) * 100 : 0} color="bg-indigo-500" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                  <td className="py-3.5 px-4 font-bold text-slate-700 uppercase tracking-wide text-xs">Totals</td>
                  <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                    <div className="font-bold text-gray-900">{fmt(stats.totalSales)}</div>
                    <div className="text-[10px] text-gray-500">G {fmt(totalGross)} · N {fmt(totalNet)}</div>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                    <div className="font-bold text-rose-600">Tax {fmt(totalTax)}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-rose-600 tabular-nums">{fmt(totalDiscounts)}</td>
                  <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                    <div className="font-semibold text-gray-900">Cash {fmt(totalCash)} · Card {fmt(totalCard)}</div>
                    <div className="text-[10px] text-gray-500">Online {fmt(totalOnline)}</div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-amber-700 tabular-nums">{heldCount} / {fmt(totalHeld)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-gray-900 tabular-nums">{rows.reduce((sum, row) => sum + Number(row.itemCount ?? 0), 0)}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">{stats.totalTransactions}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">{fmt(stats.avgTransactionValue)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </ReportCard>
      )}

      <ReportDrillDrawer
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title}
        subtitle={drill?.subtitle}
        params={drill?.params}
        tz={drillTz}
      />
    </div>
  );
};

export default SalesSummary;
