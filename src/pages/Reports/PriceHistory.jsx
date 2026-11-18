import { useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { Tag, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { useGetVendorsQuery, useGetOutletsQuery, useGetPriceChangesQuery, reportQueryOpts } from '../../store/baseApi';
import { exportToCSV } from '../../utils/exportCSV';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import {
  fmt, StatCard, ReportSkeleton, ReportEmpty,
  ExportButton, ReportCard, ReportSectionHeader, ReportThead,
} from './ReportShared';
import useQueryState from '../../hooks/useQueryState';

const PriceHistory = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useQueryState('from', today);
  const [dateTo, setDateTo] = useQueryState('to', today);
  const [vendorId, setVendorId] = useQueryState('vendor', '');
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const [search, setSearch] = useQueryState('search', '');
  const [direction, setDirection] = useQueryState('direction', '');
  const [minChange, setMinChange] = useQueryState('minChange', '');
  const [minPrice, setMinPrice] = useQueryState('minPrice', '');
  const [sort, setSort] = useQueryState('sort', 'changeHigh');
  const { data: vendors = [] } = useGetVendorsQuery();
  const { data: outlets = [] } = useGetOutletsQuery();

  useEffect(() => {
    if (outlets.length === 1 && !outlet) setOutlet(outlets[0]._id || '');
  }, [outlets, outlet, setOutlet]);

  const queryParams = useMemo(() => ({
    from: dateFrom || undefined,
    to: dateTo || undefined,
    vendorId: vendorId || undefined,
    outlet: outlet || undefined,
  }), [dateFrom, dateTo, vendorId, outlet]);

  const { data, isLoading: loading } = useGetPriceChangesQuery(queryParams, reportQueryOpts);

  // Sort by absolute change % descending
  const sorted = data?.changes
    ? data.changes.filter((row) => {
      const q = search.trim().toLowerCase();
      const change = Number(row.changePercent || 0);
      return (!q || `${row.productName || ''} ${row.sku || ''} ${row.vendorName || ''}`.toLowerCase().includes(q))
        && (!direction || (direction === 'increase' ? change > 0 : change < 0))
        && (minChange === '' || Math.abs(change) >= Number(minChange))
        && (minPrice === '' || Number(row.currentPrice || 0) >= Number(minPrice));
    }).sort((a, b) => {
      if (sort === 'newest') return new Date(b.date || 0) - new Date(a.date || 0);
      if (sort === 'priceHigh') return Number(b.currentPrice || 0) - Number(a.currentPrice || 0);
      if (sort === 'product') return String(a.productName || '').localeCompare(String(b.productName || ''));
      return Math.abs(Number(b.changePercent || 0)) - Math.abs(Number(a.changePercent || 0));
    })
    : [];

  // Aggregate metrics
  const increases    = sorted.filter((r) => (r.changePercent ?? 0) > 0);
  const decreases    = sorted.filter((r) => (r.changePercent ?? 0) < 0);
  const avgChangePct = sorted.length > 0
    ? sorted.reduce((s, r) => s + (r.changePercent ?? 0), 0) / sorted.length
    : 0;
  const biggestIncrease = increases[0] ?? null;

  const handleExport = () => {
    if (!sorted.length) return;
    exportToCSV(
      sorted.map((r) => ({
        Product:           r.productName,
        SKU:               r.sku ?? '',
        Vendor:            r.vendorName,
        Date:              r.date ? format(new Date(r.date), 'yyyy-MM-dd') : '',
        'Old Price (Rs.)': r.oldPrice?.toFixed(2) ?? '',
        'New Price (Rs.)': r.currentPrice?.toFixed(2) ?? '',
        'Change (%)':      r.changePercent?.toFixed(2) ?? '',
      })),
      `price-history-${dateFrom}-to-${dateTo}`
    );
  };

  const periodLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), 'd MMM yyyy')} – ${format(new Date(dateTo), 'd MMM yyyy')}`
    : 'All time';

  return (
    <div className="space-y-6 pb-8">
      {/* ── Filters ── */}
      <FilterBar>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU, or vendor…" className="min-w-[250px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
            value={outlet}
            onChange={setOutlet}
            searchPlaceholder="Search outlets…"
          />
        </div>

        <div className="min-w-[170px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'All directions' }, { value: 'increase', label: 'Price increases' }, { value: 'decrease', label: 'Price decreases' }]} value={direction} onChange={setDirection} /></div>
        <input type="number" min="0" value={minChange} onChange={(e) => setMinChange(e.target.value)} placeholder="Minimum change %" className="w-44 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Minimum new price" className="w-44 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'changeHigh', label: 'Largest change' }, { value: 'newest', label: 'Newest first' }, { value: 'priceHigh', label: 'Highest new price' }, { value: 'product', label: 'Product name' }]} value={sort} onChange={setSort} /></div>

        <div className="min-w-[200px]">
          <SearchableSelect
            options={[{ value: '', label: 'All vendors' }, ...vendors.map((v) => ({ value: v._id, label: v.name, meta: v.code || '' }))]}
            value={vendorId}
            onChange={setVendorId}
            searchPlaceholder="Search vendors…"
          />
        </div>

        <ExportButton onClick={handleExport} disabled={!sorted.length} />

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
              label="Total Changes"
              value={sorted.length}
              sub="Price moves recorded"
              icon={Tag}
              color="indigo"
              highlight
            />
            <StatCard
              label="Increases"
              value={increases.length}
              sub={increases.length ? `Up to +${(increases[0]?.changePercent ?? 0).toFixed(1)}%` : 'No price hikes'}
              icon={TrendingUp}
              color="rose"
            />
            <StatCard
              label="Decreases"
              value={decreases.length}
              sub={decreases.length ? `Down to ${(decreases[0]?.changePercent ?? 0).toFixed(1)}%` : 'No price drops'}
              icon={TrendingDown}
              color="emerald"
            />
            <StatCard
              label="Avg Change"
              value={`${avgChangePct >= 0 ? '+' : ''}${avgChangePct.toFixed(2)}%`}
              sub={`Across ${sorted.length} change${sorted.length === 1 ? '' : 's'}`}
              icon={ArrowRight}
              color={avgChangePct > 0 ? 'rose' : avgChangePct < 0 ? 'emerald' : 'slate'}
            />
          </>
        )}
      </div>

      {/* ── Biggest increase callout (only when there are price hikes) ── */}
      {!loading && biggestIncrease && (biggestIncrease.changePercent ?? 0) > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-rose-50 border-rose-100">
          <TrendingUp size={18} className="text-rose-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-rose-700">
              Biggest hike: {biggestIncrease.productName} from {biggestIncrease.vendorName}
            </p>
            <p className="text-xs text-rose-600 mt-0.5 truncate">
              Rs. {fmt(biggestIncrease.oldPrice)} → Rs. {fmt(biggestIncrease.currentPrice)} (+{(biggestIncrease.changePercent ?? 0).toFixed(2)}%)
              {biggestIncrease.date && ` · ${format(new Date(biggestIncrease.date), 'dd MMM yyyy')}`}
            </p>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <ReportSkeleton rows={8} cols={7} />
      ) : !sorted.length ? (
        <ReportEmpty message="No price changes found for the selected period." />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={Tag}
            iconAccent="indigo"
            title="Price Changes"
            subtitle="Sorted by absolute change, biggest first"
            right={(
              <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                {sorted.length} {sorted.length === 1 ? 'change' : 'changes'}
              </span>
            )}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={[
                'Product', 'SKU', 'Vendor',
                { label: 'Date',            align: 'right' },
                { label: 'Old Price (Rs.)', align: 'right' },
                { label: 'New Price (Rs.)', align: 'right' },
                { label: 'Change (%)',      align: 'right' },
              ]} />
              <tbody className="divide-y divide-slate-100">
                {sorted.map((row, idx) => {
                  const pct = row.changePercent ?? 0;
                  const up = pct > 0;
                  const dn = pct < 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">{row.productName}</td>
                      <td className="py-3 px-4 font-mono text-xs text-gray-500">{row.sku ?? '—'}</td>
                      <td className="py-3 px-4 text-gray-700">
                        <span>{row.vendorName}</span>
                        {row.vendorCode && (
                          <span className="text-xs text-gray-400 ml-1">({row.vendorCode})</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-500 whitespace-nowrap">
                        {row.date ? format(new Date(row.date), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600 tabular-nums">Rs. {fmt(row.oldPrice)}</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-800 tabular-nums">Rs. {fmt(row.currentPrice)}</td>
                      <td className="py-3 px-4 text-right font-bold tabular-nums">
                        <span className={clsx(
                          'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs',
                          up ? 'bg-rose-50 text-rose-700' : dn ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        )}>
                          {up && <TrendingUp size={10} />}
                          {dn && <TrendingDown size={10} />}
                          {up ? '+' : ''}{pct.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ReportCard>
      )}
    </div>
  );
};

export default PriceHistory;
