import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Package, Trophy, Wallet, Hash, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import { useGetOutletsQuery, useGetSalesByItemQuery, reportQueryOpts } from '../../store/baseApi';
import ReportDrillDrawer from './ReportDrillDrawer';
import { exportToCSV } from '../../utils/exportCSV';
import { resolveBusinessDate } from '../../utils/businessDate';
import {
  fmt, StatCard, PctBar, ReportCard, ReportSectionHeader, ReportThead,
  ExportButton, ReportEmpty, ReportSkeleton,
} from './ReportShared';
import useQueryState from '../../hooks/useQueryState';

const INITIAL_CALENDAR_DATE = format(new Date(), 'yyyy-MM-dd');

const SalesByItem = () => {
  const [from, setFrom] = useQueryState('from', INITIAL_CALENDAR_DATE);
  const [to, setTo] = useQueryState('to', INITIAL_CALENDAR_DATE);
  const { data: outlets = [] } = useGetOutletsQuery();
  const [selectedOutlet, setSelectedOutlet] = useQueryState('outlet', '');
  const [drill, setDrill] = useState(null);
  const [search, setSearch] = useQueryState('search', '');
  const [minSales, setMinSales] = useQueryState('minSales', '');
  const [minQuantity, setMinQuantity] = useQueryState('minQuantity', '');
  const [sort, setSort] = useQueryState('sort', 'salesHigh');

  useEffect(() => {
    if (!outlets.length) return;
    if (outlets.length === 1 && !selectedOutlet) setSelectedOutlet(outlets[0]._id || '');
    const businessToday = resolveBusinessDate(outlets, selectedOutlet);
    setFrom((current) => current === INITIAL_CALENDAR_DATE ? businessToday : current);
    setTo((current) => current === INITIAL_CALENDAR_DATE ? businessToday : current);
  }, [outlets, selectedOutlet, setFrom, setSelectedOutlet, setTo]);

  const queryParams = useMemo(() => {
    const p = { from, to };
    if (selectedOutlet) p.outlet = selectedOutlet;
    return p;
  }, [from, to, selectedOutlet]);

  const { data: payload, isLoading: loading } = useGetSalesByItemQuery(
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
    const name = `${row.name ?? row.itemName ?? row.item ?? ''} ${row.variationName ?? ''}`.toLowerCase();
    return (!search.trim() || name.includes(search.trim().toLowerCase()))
      && (minSales === '' || Number(row.totalSales ?? row.sales ?? 0) >= Number(minSales))
      && (minQuantity === '' || Number(row.quantity ?? row.quantitySold ?? 0) >= Number(minQuantity));
  }).sort((a, b) => {
    if (sort === 'name') return String(a.name ?? a.itemName ?? a.item ?? '').localeCompare(String(b.name ?? b.itemName ?? b.item ?? ''));
    if (sort === 'qtyHigh') return Number(b.quantity ?? b.quantitySold ?? 0) - Number(a.quantity ?? a.quantitySold ?? 0);
    if (sort === 'avgHigh') return Number(b.avgPrice ?? b.averagePrice ?? 0) - Number(a.avgPrice ?? a.averagePrice ?? 0);
    return Number(b.totalSales ?? b.sales ?? 0) - Number(a.totalSales ?? a.sales ?? 0);
  }), [rows, search, minSales, minQuantity, sort]);

  // Aggregate metrics
  const totalRevenue = sortedRows.reduce((s, r) => s + Number(r.totalSales ?? r.sales ?? 0), 0);
  const totalQty     = sortedRows.reduce((s, r) => s + Number(r.quantity ?? r.quantitySold ?? 0), 0);
  const avgPrice     = totalQty > 0 ? totalRevenue / totalQty : 0;
  const topItem = sortedRows.reduce((best, row) => !best || Number(row.totalSales ?? row.sales ?? 0) > Number(best.totalSales ?? best.sales ?? 0) ? row : best, null);
  const maxRevenue = topItem ? Number(topItem.totalSales ?? topItem.sales ?? 0) : 0;

  const handleExport = () => {
    const payload = sortedRows.map((row) => ({
      'Item Name':     row.name ?? row.itemName ?? row.item ?? 'Unknown',
      'Size':          row.variationName ?? '',
      'Quantity Sold': Number(row.quantity ?? row.quantitySold ?? 0),
      'Total Value':   fmt(Number(row.totalSales ?? row.sales ?? 0)),
      'Average Price': fmt(Number(row.avgPrice ?? row.averagePrice ?? 0)),
    }));
    exportToCSV(payload, `sales-by-item-${from}-${to}`);
  };

  const periodLabel = `${from} → ${to}`;

  return (
    <div className="space-y-6 pb-8">
      {/* ── Filters ── */}
      <FilterBar>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item or variation…" className="min-w-[240px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
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
        <input type="number" min="0" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} placeholder="Minimum quantity" className="w-44 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'salesHigh', label: 'Highest sales' }, { value: 'qtyHigh', label: 'Highest quantity' }, { value: 'avgHigh', label: 'Highest average price' }, { value: 'name', label: 'Item name' }]} value={sort} onChange={setSort} /></div>
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
              sub={`${sortedRows.length} item${sortedRows.length === 1 ? '' : 's'} sold`}
              icon={Wallet}
              color="indigo"
              highlight
            />
            <StatCard
              label="Quantity Sold"
              value={totalQty}
              sub="Across all items"
              icon={Hash}
              color="violet"
            />
            <StatCard
              label="Avg Price / Unit"
              value={`Rs. ${fmt(avgPrice)}`}
              sub="Revenue / units sold"
              icon={TrendingUp}
              color="cyan"
            />
            <StatCard
              label="Top Seller"
              value={topItem ? `${topItem.name ?? topItem.itemName ?? topItem.item ?? '—'}${topItem.variationName ? ` (${topItem.variationName})` : ''}` : '—'}
              sub={topItem ? `Rs. ${fmt(Number(topItem.totalSales ?? topItem.sales ?? 0))} revenue` : 'No sales yet'}
              icon={Trophy}
              color="amber"
            />
          </>
        )}
      </div>

      {/* ── Top item callout ── */}
      {!loading && topItem && sortedRows.length > 1 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-amber-50 border-amber-100">
          <Trophy size={18} className="text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-700">
              Best seller: {topItem.name ?? topItem.itemName ?? topItem.item ?? 'Unknown item'}{topItem.variationName ? ` (${topItem.variationName})` : ''}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {Number(topItem.quantity ?? topItem.quantitySold ?? 0)} units sold ·
              {' '}Rs. {fmt(Number(topItem.totalSales ?? topItem.sales ?? 0))} revenue ·
              {' '}{totalRevenue > 0 ? `${((Number(topItem.totalSales ?? topItem.sales ?? 0) / totalRevenue) * 100).toFixed(1)}% of total` : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Items table ── */}
      {loading ? (
        <ReportSkeleton rows={8} cols={5} />
      ) : !sortedRows.length ? (
        <ReportEmpty message="No item sales found for this period." />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={Package}
            iconAccent="indigo"
            title="Item Performance"
            subtitle={`Item popularity and revenue from ${from} to ${to}`}
            right={(
              <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                {sortedRows.length} {sortedRows.length === 1 ? 'item' : 'items'}
              </span>
            )}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={[
                { label: '#',              align: 'center' },
                'Item',
                { label: 'Quantity Sold',  align: 'right' },
                { label: 'Total Value',    align: 'right' },
                { label: 'Avg Price',      align: 'right' },
                'Share',
              ]} />
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((row, index) => {
                  const totalSales = Number(row.totalSales ?? row.sales ?? 0);
                  const qty        = Number(row.quantity ?? row.quantitySold ?? 0);
                  const avg        = Number(row.avgPrice ?? row.averagePrice ?? 0);
                  const isTop      = index === 0;
                  return (
                    <tr
                      key={`${row.id ?? row._id ?? row.name}-${row.variationId ?? ''}-${index}`}
                      onClick={() => setDrill({
                        title: `${row.name ?? row.itemName ?? row.item ?? 'Item'}${row.variationName ? ` (${row.variationName})` : ''}`,
                        subtitle: 'Sales containing this item',
                        params: { from, to, menuItem: row.id ?? row._id, variationId: row.variationId || undefined, outlet: selectedOutlet || undefined },
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
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {row.name ?? row.itemName ?? row.item ?? 'Untitled Item'}
                        {row.variationName && <span className="ml-1.5 text-xs font-semibold text-indigo-600">({row.variationName})</span>}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-700 tabular-nums">{qty}</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 tabular-nums">{fmt(totalSales)}</td>
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
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">{totalQty}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums text-base">{fmt(totalRevenue)}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">{fmt(avgPrice)}</td>
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

export default SalesByItem;
