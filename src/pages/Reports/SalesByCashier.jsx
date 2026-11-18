import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Users, Trophy, Wallet, Receipt, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import { useGetOutletsQuery, useGetSalesByCashierQuery, reportQueryOpts } from '../../store/baseApi';
import ReportDrillDrawer from './ReportDrillDrawer';
import { exportToCSV } from '../../utils/exportCSV';
import { resolveBusinessDate } from '../../utils/businessDate';
import {
  fmt, StatCard, PctBar, ReportCard, ReportSectionHeader, ReportThead,
  ExportButton, ReportEmpty, ReportSkeleton,
} from './ReportShared';
import useQueryState from '../../hooks/useQueryState';

const TODAY = format(new Date(), 'yyyy-MM-dd');

const SalesByCashier = () => {
  const [from, setFrom] = useQueryState('from', TODAY);
  const [to, setTo] = useQueryState('to', TODAY);
  const { data: outlets = [] } = useGetOutletsQuery();
  const [selectedOutlet, setSelectedOutlet] = useQueryState('outlet', '');
  const [drill, setDrill] = useState(null);
  const [search, setSearch] = useQueryState('search', '');
  const [minSales, setMinSales] = useQueryState('minSales', '');
  const [minTransactions, setMinTransactions] = useQueryState('minTransactions', '');
  const [sort, setSort] = useQueryState('sort', 'salesHigh');

  useEffect(() => {
    if (!outlets.length) return;
    if (outlets.length === 1 && !selectedOutlet) setSelectedOutlet(outlets[0]._id || '');
    const businessToday = resolveBusinessDate(outlets, selectedOutlet);
    setFrom((current) => current === TODAY ? businessToday : current);
    setTo((current) => current === TODAY ? businessToday : current);
  }, [outlets, selectedOutlet, setFrom, setSelectedOutlet, setTo]);

  const queryParams = useMemo(() => {
    const p = { from, to };
    if (selectedOutlet) p.outlet = selectedOutlet;
    return p;
  }, [from, to, selectedOutlet]);

  const { data: payload, isLoading: loading } = useGetSalesByCashierQuery(
    queryParams,
    { skip: !from || !to, ...reportQueryOpts },
  );

  // Render drill-down timestamps in the selected outlet's timezone (browser
  // fallback when "All outlets" is selected).
  const drillTz = outlets.find((o) => o._id === selectedOutlet)?.timezone;

  const rows = useMemo(() => {
    if (!payload) return [];
    return Array.isArray(payload) ? payload : payload.rows ?? [];
  }, [payload]);

  const sortedRows = useMemo(() => rows.filter((row) => {
    const name = String(row.name ?? row.cashierName ?? '').toLowerCase();
    return (!search.trim() || name.includes(search.trim().toLowerCase()))
      && (minSales === '' || Number(row.totalSales ?? row.sales ?? 0) >= Number(minSales))
      && (minTransactions === '' || Number(row.transactionCount ?? row.transactions ?? 0) >= Number(minTransactions));
  }).sort((a, b) => {
    if (sort === 'name') return String(a.name ?? a.cashierName ?? '').localeCompare(String(b.name ?? b.cashierName ?? ''));
    if (sort === 'transactionsHigh') return Number(b.transactionCount ?? b.transactions ?? 0) - Number(a.transactionCount ?? a.transactions ?? 0);
    if (sort === 'averageHigh') return Number(b.avgTransactionValue ?? b.averageValue ?? 0) - Number(a.avgTransactionValue ?? a.averageValue ?? 0);
    return Number(b.totalSales ?? b.sales ?? 0) - Number(a.totalSales ?? a.sales ?? 0);
  }), [rows, search, minSales, minTransactions, sort]);

  // Aggregate metrics
  const totalRevenue   = sortedRows.reduce((s, r) => s + Number(r.totalSales ?? r.sales ?? 0), 0);
  const totalTxns      = sortedRows.reduce((s, r) => s + Number(r.transactionCount ?? r.transactions ?? 0), 0);
  const avgTicket      = totalTxns > 0 ? totalRevenue / totalTxns : 0;
  const topCashier = sortedRows.reduce((best, row) => !best || Number(row.totalSales ?? row.sales ?? 0) > Number(best.totalSales ?? best.sales ?? 0) ? row : best, null);
  const maxRevenue = topCashier ? Number(topCashier.totalSales ?? topCashier.sales ?? 0) : 0;

  const handleExport = () => {
    const payload = sortedRows.map((row) => ({
      'Cashier Name':          row.name ?? row.cashierName ?? 'Unknown',
      'Total Sales':           fmt(Number(row.totalSales ?? row.sales ?? 0)),
      Transactions:            Number(row.transactionCount ?? row.transactions ?? 0),
      'Avg Transaction Value': fmt(Number(row.avgTransactionValue ?? row.averageValue ?? 0)),
    }));
    exportToCSV(payload, `sales-by-cashier-${from}-${to}`);
  };

  // Build initials for cashier avatar chip
  const initials = (name) => {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/);
    return ((parts[0] || '').charAt(0) + (parts[1] || parts[0] || '').charAt(0)).toUpperCase();
  };

  const periodLabel = `${from} → ${to}`;

  return (
    <div className="space-y-6 pb-8">
      {/* ── Filters ── */}
      <FilterBar>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cashier…" className="min-w-[240px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
            value={selectedOutlet}
            onChange={setSelectedOutlet}
            searchPlaceholder="Search outlets…"
          />
        </div>
        <input type="number" min="0" value={minSales} onChange={(e) => setMinSales(e.target.value)} placeholder="Minimum sales" className="w-44 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input type="number" min="0" value={minTransactions} onChange={(e) => setMinTransactions(e.target.value)} placeholder="Minimum transactions" className="w-48 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <div className="min-w-[190px]"><SearchableSelect searchable={false} options={[{ value: 'salesHigh', label: 'Highest sales' }, { value: 'transactionsHigh', label: 'Most transactions' }, { value: 'averageHigh', label: 'Highest average ticket' }, { value: 'name', label: 'Cashier name' }]} value={sort} onChange={setSort} /></div>
        <ExportButton onClick={handleExport} disabled={loading || !sortedRows.length} />
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
              label="Total Revenue"
              value={`Rs. ${fmt(totalRevenue)}`}
              sub={`${sortedRows.length} cashier${sortedRows.length === 1 ? '' : 's'}`}
              icon={Wallet}
              color="indigo"
              highlight
            />
            <StatCard
              label="Transactions"
              value={totalTxns}
              sub="Total checkouts"
              icon={Receipt}
              color="violet"
            />
            <StatCard
              label="Avg Ticket"
              value={`Rs. ${fmt(avgTicket)}`}
              sub="Across all cashiers"
              icon={TrendingUp}
              color="cyan"
            />
            <StatCard
              label="Top Cashier"
              value={topCashier ? (topCashier.name ?? topCashier.cashierName ?? '—') : '—'}
              sub={topCashier ? `Rs. ${fmt(Number(topCashier.totalSales ?? topCashier.sales ?? 0))} revenue` : 'No sales yet'}
              icon={Trophy}
              color="amber"
            />
          </>
        )}
      </div>

      {/* ── Top cashier callout ── */}
      {!loading && topCashier && sortedRows.length > 1 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-amber-50 border-amber-100">
          <Trophy size={18} className="text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-700">
              Top performer: {topCashier.name ?? topCashier.cashierName ?? 'Unknown'}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Rs. {fmt(Number(topCashier.totalSales ?? topCashier.sales ?? 0))} ·
              {' '}{Number(topCashier.transactionCount ?? topCashier.transactions ?? 0)} transactions ·
              {' '}{totalRevenue > 0 ? `${((Number(topCashier.totalSales ?? topCashier.sales ?? 0) / totalRevenue) * 100).toFixed(1)}% of total` : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Cashiers table ── */}
      {loading ? (
        <ReportSkeleton rows={6} cols={5} />
      ) : !sortedRows.length ? (
        <ReportEmpty message="No cashier sales found for this period." />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={Users}
            iconAccent="indigo"
            title="Cashier Performance"
            subtitle={`Cashier performance from ${from} to ${to}`}
            right={(
              <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                {sortedRows.length} {sortedRows.length === 1 ? 'cashier' : 'cashiers'}
              </span>
            )}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={[
                { label: '#',              align: 'center' },
                'Cashier',
                { label: 'Total Sales',    align: 'right' },
                { label: 'Transactions',   align: 'right' },
                { label: 'Avg Transaction', align: 'right' },
                'Share',
              ]} />
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((row, index) => {
                  const name       = row.name ?? row.cashierName ?? 'Unknown';
                  const totalSales = Number(row.totalSales ?? row.sales ?? 0);
                  const txns       = Number(row.transactionCount ?? row.transactions ?? 0);
                  const avg        = Number(row.avgTransactionValue ?? row.averageValue ?? 0);
                  const isTop      = index === 0;
                  return (
                    <tr
                      key={row._id ?? `${name}-${index}`}
                      onClick={() => setDrill({
                        title: name,
                        subtitle: 'Transactions by this cashier',
                        params: { from, to, cashier: row.cashierId ?? row._id, outlet: selectedOutlet || undefined },
                      })}
                      className="hover:bg-indigo-50/50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 text-center">
                        <span className={clsx(
                          'inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold tabular-nums',
                          isTop ? 'bg-amber-100 text-amber-700' :
                          index < 3 ? 'bg-indigo-50 text-indigo-700' :
                          'bg-slate-100 text-slate-600'
                        )}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={clsx(
                            'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold',
                            isTop ? 'bg-amber-100 text-amber-700' : 'bg-indigo-50 text-indigo-700'
                          )}>
                            {initials(name)}
                          </div>
                          <span className="font-medium text-gray-900 truncate">{name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 tabular-nums">{fmt(totalSales)}</td>
                      <td className="py-3 px-4 text-right text-gray-700 tabular-nums">{txns}</td>
                      <td className="py-3 px-4 text-right text-gray-600 tabular-nums">{fmt(avg)}</td>
                      <td className="py-3 px-4 w-44">
                        <PctBar
                          pct={maxRevenue ? (totalSales / maxRevenue) * 100 : 0}
                          color={isTop ? 'bg-amber-500' : 'bg-indigo-500'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                  <td />
                  <td className="py-3.5 px-4 font-bold text-slate-700 uppercase tracking-wide text-xs">Totals</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums text-base">{fmt(totalRevenue)}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">{totalTxns}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">{fmt(avgTicket)}</td>
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

export default SalesByCashier;
