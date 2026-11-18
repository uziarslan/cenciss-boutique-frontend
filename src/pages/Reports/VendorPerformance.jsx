import { useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { Users, AlertTriangle, ShieldCheck, Receipt, ShoppingCart } from 'lucide-react';
import clsx from 'clsx';
import { useGetVendorPerformanceQuery, useGetOutletsQuery, reportQueryOpts } from '../../store/baseApi';
import { exportToCSV } from '../../utils/exportCSV';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import {
  fmt, StatCard, ReportSkeleton, ReportEmpty,
  ExportButton, ReportCard, ReportSectionHeader, ReportThead,
} from './ReportShared';
import useQueryState from '../../hooks/useQueryState';

// Score chip — emerald <5%, amber 5-15%, rose >15%
const ScoreChip = ({ shortRate }) => {
  const pct = (shortRate ?? 0) * 100;
  const cls = pct < 5
    ? 'bg-emerald-100 text-emerald-700'
    : pct <= 15
      ? 'bg-amber-100 text-amber-700'
      : 'bg-rose-100 text-rose-700';
  return (
    <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-bold tabular-nums', cls)}>
      {pct.toFixed(1)}%
    </span>
  );
};

const VendorPerformance = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useQueryState('from', today);
  const [dateTo, setDateTo] = useQueryState('to', today);
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const [search, setSearch] = useQueryState('search', '');
  const [risk, setRisk] = useQueryState('risk', '');
  const [minOrders, setMinOrders] = useQueryState('minOrders', '');
  const [minCreditValue, setMinCreditValue] = useQueryState('minCreditValue', '');
  const [sort, setSort] = useQueryState('sort', 'riskHigh');
  const { data: outlets = [] } = useGetOutletsQuery();

  useEffect(() => {
    if (outlets.length === 1 && !outlet) setOutlet(outlets[0]._id || '');
  }, [outlets, outlet, setOutlet]);

  const queryParams = useMemo(() => ({
    from: dateFrom || undefined,
    to: dateTo || undefined,
    outlet: outlet || undefined,
  }), [dateFrom, dateTo, outlet]);

  const { data, isLoading: loading } = useGetVendorPerformanceQuery(queryParams, reportQueryOpts);

  const vendors = (data?.vendors ?? []).filter((vendor) => {
    const q = search.trim().toLowerCase();
    const shortRate = Number(vendor.shortRate || 0);
    return (!q || `${vendor.vendorName || ''} ${vendor.vendorCode || ''}`.toLowerCase().includes(q))
      && (!risk || (risk === 'high' ? shortRate > 0.15 : risk === 'medium' ? shortRate >= 0.05 && shortRate <= 0.15 : shortRate < 0.05))
      && (minOrders === '' || Number(vendor.totalOrders || 0) >= Number(minOrders))
      && (minCreditValue === '' || Number(vendor.totalCreditValue || 0) >= Number(minCreditValue));
  }).sort((a, b) => {
    if (sort === 'name') return String(a.vendorName || '').localeCompare(String(b.vendorName || ''));
    if (sort === 'ordersHigh') return Number(b.totalOrders || 0) - Number(a.totalOrders || 0);
    if (sort === 'creditHigh') return Number(b.totalCreditValue || 0) - Number(a.totalCreditValue || 0);
    return Number(b.shortRate || 0) - Number(a.shortRate || 0);
  });

  // Aggregate metrics
  const avgShortRate    = vendors.length
    ? vendors.reduce((s, v) => s + (v.shortRate ?? 0), 0) / vendors.length
    : 0;
  const avgPct          = avgShortRate * 100;
  const highRiskCount   = vendors.filter((v) => (v.shortRate ?? 0) > 0.15).length;
  const lowRiskCount    = vendors.filter((v) => (v.shortRate ?? 0) < 0.05).length;
  const totalCreditValue= vendors.reduce((s, v) => s + (v.totalCreditValue ?? 0), 0);
  const worstVendor     = [...vendors].sort((a, b) => (b.shortRate ?? 0) - (a.shortRate ?? 0))[0] ?? null;

  const handleExport = () => {
    if (!vendors.length) return;
    exportToCSV(
      vendors.map((v) => ({
        Vendor:               v.vendorName,
        Code:                 v.vendorCode ?? '',
        'Total Orders':       v.totalOrders,
        'Total Lines':        v.totalLines,
        'Short Lines':        v.shortLines,
        'Short Rate (%)':     ((v.shortRate ?? 0) * 100).toFixed(2),
        'Credit Count':       v.creditCount,
        'Credit Value (Rs.)': v.totalCreditValue?.toFixed(2) ?? '0.00',
      })),
      `vendor-performance-${dateFrom}-to-${dateTo}`
    );
  };

  const periodLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), 'd MMM yyyy')} – ${format(new Date(dateTo), 'd MMM yyyy')}`
    : 'All time';

  return (
    <div className="space-y-6 pb-8">
      {/* ── Filters ── */}
      <FilterBar>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor or code…" className="min-w-[240px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
            value={outlet}
            onChange={setOutlet}
            searchPlaceholder="Search outlets…"
          />
        </div>
        <div className="min-w-[170px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'All risk levels' }, { value: 'high', label: 'High risk' }, { value: 'medium', label: 'Medium risk' }, { value: 'low', label: 'Low risk' }]} value={risk} onChange={setRisk} /></div>
        <input type="number" min="0" value={minOrders} onChange={(e) => setMinOrders(e.target.value)} placeholder="Minimum orders" className="w-44 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input type="number" min="0" value={minCreditValue} onChange={(e) => setMinCreditValue(e.target.value)} placeholder="Minimum credit value" className="w-48 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'riskHigh', label: 'Highest risk' }, { value: 'ordersHigh', label: 'Most orders' }, { value: 'creditHigh', label: 'Highest credit value' }, { value: 'name', label: 'Vendor name' }]} value={sort} onChange={setSort} /></div>
        <ExportButton onClick={handleExport} disabled={!vendors.length} />
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
              label="Vendors Tracked"
              value={vendors.length}
              sub={`${lowRiskCount} low-risk · ${highRiskCount} high-risk`}
              icon={Users}
              color="indigo"
              highlight
            />
            <StatCard
              label="Avg Short Rate"
              value={`${avgPct.toFixed(1)}%`}
              sub="Across all vendors"
              icon={ShieldCheck}
              color={avgPct < 5 ? 'emerald' : avgPct <= 15 ? 'amber' : 'rose'}
            />
            <StatCard
              label="High-Risk (>15%)"
              value={highRiskCount}
              sub="Need review"
              icon={AlertTriangle}
              color={highRiskCount > 0 ? 'rose' : 'emerald'}
            />
            <StatCard
              label="Credit Value"
              value={`Rs. ${fmt(totalCreditValue)}`}
              sub="Total credits issued"
              icon={Receipt}
              color="cyan"
            />
          </>
        )}
      </div>

      {/* ── Worst-vendor callout (only when there's a high-risk vendor) ── */}
      {!loading && worstVendor && (worstVendor.shortRate ?? 0) > 0.15 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-rose-50 border-rose-100">
          <AlertTriangle size={18} className="text-rose-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-rose-700">
              Highest short rate: {worstVendor.vendorName}
              {worstVendor.vendorCode && <span className="font-normal opacity-70 ml-1">({worstVendor.vendorCode})</span>}
            </p>
            <p className="text-xs text-rose-600 mt-0.5">
              {worstVendor.shortLines} short line{worstVendor.shortLines === 1 ? '' : 's'} of {worstVendor.totalLines} ·
              {' '}{((worstVendor.shortRate ?? 0) * 100).toFixed(1)}% short rate ·
              {' '}{worstVendor.creditCount} credit{worstVendor.creditCount === 1 ? '' : 's'} totalling Rs. {fmt(worstVendor.totalCreditValue)}
            </p>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <ReportSkeleton rows={8} cols={7} />
      ) : !vendors.length ? (
        <ReportEmpty message="No vendor performance data for the selected period." />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={ShoppingCart}
            iconAccent="indigo"
            title="Vendor Scorecard"
            subtitle="Sorted by short rate, highest risk first"
            right={(
              <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                {vendors.length} {vendors.length === 1 ? 'vendor' : 'vendors'}
              </span>
            )}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={[
                'Vendor',
                { label: 'Orders',      align: 'right' },
                { label: 'Lines',       align: 'right' },
                { label: 'Short Lines', align: 'right' },
                { label: 'Short Rate',  align: 'right' },
                { label: 'Credits',     align: 'right' },
                { label: 'Credit (Rs.)', align: 'right' },
              ]} />
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => (
                  <tr key={v._id?.toString()} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{v.vendorName}</p>
                      {v.vendorCode && <p className="text-xs font-mono text-gray-400">{v.vendorCode}</p>}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-600 tabular-nums">{v.totalOrders}</td>
                    <td className="py-3 px-4 text-right text-gray-600 tabular-nums">{v.totalLines}</td>
                    <td className="py-3 px-4 text-right text-gray-600 tabular-nums">{v.shortLines}</td>
                    <td className="py-3 px-4 text-right">
                      <ScoreChip shortRate={v.shortRate} />
                    </td>
                    <td className="py-3 px-4 text-right text-gray-600 tabular-nums">{v.creditCount}</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-700 tabular-nums">
                      {fmt(v.totalCreditValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                  <td className="py-3.5 px-4 font-bold text-slate-700 uppercase tracking-wide text-xs">Totals</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">
                    {vendors.reduce((s, v) => s + (v.totalOrders ?? 0), 0)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">
                    {vendors.reduce((s, v) => s + (v.totalLines ?? 0), 0)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">
                    {vendors.reduce((s, v) => s + (v.shortLines ?? 0), 0)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span className={clsx(
                      'inline-flex px-2 py-0.5 rounded-full text-xs font-bold tabular-nums',
                      avgPct < 5 ? 'bg-emerald-100 text-emerald-700'
                        : avgPct <= 15 ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                    )}>
                      {avgPct.toFixed(1)}% avg
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">
                    {vendors.reduce((s, v) => s + (v.creditCount ?? 0), 0)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">
                    {fmt(totalCreditValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </ReportCard>
      )}
    </div>
  );
};

export default VendorPerformance;
