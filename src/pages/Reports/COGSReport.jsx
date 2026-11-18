import { useEffect, useMemo, useState, Fragment } from 'react';
import { ShoppingCart, Trash2, BarChart2, PackagePlus, TrendingUp, ArrowRight, Download, Tag, UtensilsCrossed } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { useGetOutletsQuery, useGetCogsQuery, useGetCogsByItemQuery, reportQueryOpts } from '../../store/baseApi';
import { exportToCSV } from '../../utils/exportCSV';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import Button from '../../components/UI/Button';
import { fmt } from './ReportShared';
import useQueryState from '../../hooks/useQueryState';
import COGSItemCostDrawer from './COGSItemCostDrawer';

// Group flat per-(item,size) COGS rows under their menu item. Groups are ordered
// by total theoretical cost; sized rows sort by cost within the group.
const buildItemGroups = (rows = []) => {
  const map = new Map();
  for (const r of rows) {
    const key = String(r.id ?? r.name);
    if (!map.has(key)) map.set(key, { key, name: r.name, rows: [], total: 0 });
    const g = map.get(key);
    g.rows.push(r);
    g.total += r.theoreticalCost || 0;
  }
  const groups = [...map.values()];
  groups.forEach((g) => g.rows.sort(
    (a, b) => (b.theoreticalCost - a.theoreticalCost) || (a.variationName ?? '').localeCompare(b.variationName ?? '')
  ));
  groups.sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name));
  return groups;
};

// The five numeric cells shared by single-item rows and per-size sub-rows.
const NumericCostCells = ({ row }) => (
  <>
    <td className="py-3.5 px-5 text-right tabular-nums text-gray-600">{row.quantity}</td>
    <td className="py-3.5 px-5 text-right tabular-nums text-gray-600">{fmt(row.recipeCost)}</td>
    <td className="py-3.5 px-5 text-right tabular-nums text-gray-600">{fmt(row.price)}</td>
    <td className="py-3.5 px-5 text-right tabular-nums">
      {row.hasRecipe && row.price > 0 ? (
        <span className={clsx('font-medium', row.foodCostPct > 35 ? 'text-rose-600' : row.foodCostPct > 28 ? 'text-amber-600' : 'text-emerald-600')}>
          {row.foodCostPct.toFixed(1)}%
        </span>
      ) : <span className="text-gray-300">—</span>}
    </td>
    <td className="py-3.5 px-5 text-right tabular-nums font-semibold text-gray-800">{fmt(row.theoreticalCost)}</td>
  </>
);

// ── Stat tile (soft white, tinted icon chip) ─────────────────────────────────
const StatCard = ({ label, value, sub, icon: Icon, color, bg, loading, highlight }) => (
  <div
    className={clsx(
      'rounded-2xl border bg-white shadow-sm p-4 flex items-center gap-3',
      highlight ? 'border-indigo-200 ring-2 ring-indigo-500/20' : 'border-gray-100'
    )}
  >
    <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', bg)}>
      <Icon size={16} className={color} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] text-gray-400 uppercase tracking-widest">{label}</p>
      <p className={clsx('text-xl font-bold leading-tight tabular-nums truncate mt-0.5', color)}>
        {loading ? '…' : value}
      </p>
      {sub && !loading && <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>}
    </div>
  </div>
);

// ── Skeleton ──────────────────────────────────────────────────────────────────
const CardSkeleton = () => (
  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 animate-pulse flex items-center gap-3">
    <div className="h-9 w-9 bg-gray-200 rounded-xl shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-gray-200 rounded w-24" />
      <div className="h-5 bg-gray-200 rounded w-32" />
    </div>
  </div>
);

const TableSkeleton = () => (
  <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-pulse">
    <div className="h-12 bg-gray-50 border-b border-gray-100" />
    {Array.from({ length: 7 }).map((_, i) => (
      <div key={i} className="flex gap-4 px-6 py-4 border-b border-gray-50">
        <div className="h-4 bg-gray-100 rounded flex-1" />
        <div className="h-4 bg-gray-100 rounded w-24" />
        <div className="h-4 bg-gray-100 rounded w-20" />
        <div className="h-4 bg-gray-100 rounded w-24" />
        <div className="h-4 bg-gray-100 rounded w-14" />
        <div className="h-4 bg-gray-100 rounded w-28" />
      </div>
    ))}
  </div>
);

const EmptyState = () => (
  <div className="rounded-2xl border border-gray-100 bg-white flex flex-col items-center justify-center py-20 gap-4">
    <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
      <BarChart2 size={24} className="text-gray-300" />
    </div>
    <div className="text-center">
      <p className="text-sm font-medium text-gray-500">No transactions found</p>
      <p className="text-xs text-gray-400 mt-1">Adjust the date range or outlet filter to see data.</p>
    </div>
  </div>
);

// ── Formula token ─────────────────────────────────────────────────────────────
const FormulaToken = ({ label, value, color }) => {
  const colors = {
    blue:    'bg-blue-50  border-blue-100  text-blue-700',
    amber:   'bg-amber-50 border-amber-100 text-amber-700',
    rose:    'bg-rose-50  border-rose-100  text-rose-700',
    indigo:  'bg-indigo-600 border-indigo-600 text-white',
  };
  return (
    <div className={clsx('rounded-xl border px-4 py-2.5 flex flex-col min-w-0', colors[color])}>
      <span className={clsx(
        'text-[10px] font-bold uppercase tracking-widest opacity-70 whitespace-nowrap',
        color === 'indigo' ? 'text-indigo-200' : ''
      )}>{label}</span>
      <span className="text-base font-bold leading-tight mt-0.5 whitespace-nowrap tabular-nums">{value}</span>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

const COGSReport = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useQueryState('from', today);
  const [dateTo, setDateTo] = useQueryState('to', today);
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const { data: outlets = [] } = useGetOutletsQuery();
  const [view, setView] = useQueryState('view', 'category'); // 'category' | 'item'
  const [selectedItem, setSelectedItem] = useState(null);

  const queryParams = useMemo(() => ({
    from: dateFrom || undefined,
    to: dateTo || undefined,
    outlet: outlet || undefined,
  }), [dateFrom, dateTo, outlet]);

  // Actual COGS always loads (tiles + variance). The theoretical per-item view
  // loads only when that tab is active. Both are cached + revalidated in the
  // background, so switching tabs / revisiting renders instantly.
  const { data, isLoading: cogsLoading } = useGetCogsQuery(queryParams, reportQueryOpts);
  const { data: itemData, isLoading: itemLoading } = useGetCogsByItemQuery(
    queryParams,
    { skip: view !== 'item', ...reportQueryOpts },
  );
  const loading = cogsLoading || (view === 'item' && itemLoading);

  useEffect(() => {
    if (outlets.length === 1 && !outlet) setOutlet(outlets[0]._id || '');
  }, [outlets, outlet, setOutlet]);

  const handleExport = () => {
    if (view === 'item') {
      if (!itemData?.rows?.length) return;
      exportToCSV(
        itemData.rows.map((r) => ({
          Item:                 r.name,
          Size:                 r.variationName ?? '',
          'Qty Sold':           r.quantity,
          'Recipe Cost / Unit': r.recipeCost.toFixed(2),
          'Price':              r.price.toFixed(2),
          'Food Cost %':        r.foodCostPct.toFixed(1),
          'Theoretical Cost':   r.theoreticalCost.toFixed(2),
          'Has Recipe':         r.hasRecipe ? 'Yes' : 'No',
        })),
        `cogs-by-item-${dateFrom}-to-${dateTo}`
      );
      return;
    }
    if (!data?.breakdown?.length) return;
    exportToCSV(
      data.breakdown.map((r) => ({
        Category:           r.category,
        'Purchases (Rs.)':  r.purchases.toFixed(2),
        'Waste (Rs.)':      r.waste.toFixed(2),
        'Total (Rs.)':      r.amount.toFixed(2),
        '% of COGS':        data.cogs > 0 ? ((r.amount / data.cogs) * 100).toFixed(1) : '0.0',
      })),
      `cogs-report-${dateFrom}-to-${dateTo}`
    );
  };

  const periodLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), 'd MMM yyyy')} – ${format(new Date(dateTo), 'd MMM yyyy')}`
    : 'All time';

  return (
    <div className="space-y-6 pb-8">
      {/* ── Filters ── */}
      <FilterBar>
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code }))]}
            value={outlet}
            onChange={setOutlet}
            searchPlaceholder="Search outlets…"
          />
        </div>

        {/* View toggle — actual cost by category vs theoretical cost by menu item */}
        <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {[
            { value: 'category', label: 'Category', icon: Tag },
            { value: 'item',     label: 'Menu Item', icon: UtensilsCrossed },
          ].map((g) => {
            const active = view === g.value;
            return (
              <button
                key={g.value}
                onClick={() => {
                  setView(g.value);
                  if (g.value !== 'item') setSelectedItem(null);
                }}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                  active ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                )}
              >
                <g.icon size={13} />
                {g.label}
              </button>
            );
          })}
        </div>

        <Button
          variant="secondary"
          icon={Download}
          onClick={handleExport}
          disabled={view === 'item' ? !itemData?.rows?.length : !data?.breakdown?.length}
        >
          Export CSV
        </Button>
        <div className="ml-auto text-xs text-gray-400">{periodLabel}</div>
      </FilterBar>

      {/* ── Metric tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
        ) : data ? (
          <>
            <StatCard
              label="Vendor Purchases"
              value={`Rs. ${fmt(data.grnPurchases ?? data.totalPurchases)}`}
              sub="Posted stock purchases"
              icon={ShoppingCart}
              color="text-blue-600"
              bg="bg-blue-50"
            />
            <StatCard
              label="Manual Additions"
              value={`Rs. ${fmt(data.manualAdditions ?? 0)}`}
              sub="Stock count adjustments"
              icon={PackagePlus}
              color="text-amber-600"
              bg="bg-amber-50"
            />
            <StatCard
              label="Total Purchases"
              value={`Rs. ${fmt(data.totalPurchases)}`}
              sub="Purchases + manual"
              icon={TrendingUp}
              color="text-emerald-600"
              bg="bg-emerald-50"
            />
            <StatCard
              label="Total Waste"
              value={`Rs. ${fmt(data.totalWaste)}`}
              sub={`${data.wasteCount ?? 0} waste entr${(data.wasteCount ?? 0) === 1 ? 'y' : 'ies'}`}
              icon={Trash2}
              color="text-rose-600"
              bg="bg-rose-50"
            />
            <StatCard
              label="Total COGS"
              value={`Rs. ${fmt(data.cogs)}`}
              sub={periodLabel}
              icon={BarChart2}
              color="text-indigo-700"
              bg="bg-indigo-50"
              highlight
            />
          </>
        ) : null}
      </div>

      {/* ── COGS formula ── */}
      {!loading && data && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <BarChart2 size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">COGS Calculation</h2>
              <p className="text-xs text-gray-400 mt-0.5">How total cost of goods sold is composed</p>
            </div>
          </div>
          <div className="px-5 py-5 flex flex-wrap items-center gap-2">
            <FormulaToken label="Vendor Purchases" value={`Rs. ${fmt(data.grnPurchases ?? data.totalPurchases)}`} color="blue" />
            <span className="text-lg font-light text-gray-300 px-1">+</span>
            <FormulaToken label="Manual Additions" value={`Rs. ${fmt(data.manualAdditions ?? 0)}`} color="amber" />
            <span className="text-lg font-light text-gray-300 px-1">+</span>
            <FormulaToken label="Total Waste"      value={`Rs. ${fmt(data.totalWaste)}`}             color="rose" />
            <span className="text-gray-200 px-1"><ArrowRight size={18} /></span>
            <FormulaToken label="Total COGS"       value={`Rs. ${fmt(data.cogs)}`}                   color="indigo" />
          </div>
        </div>
      )}

      {/* ── Category breakdown (actual cost) ── */}
      {view === 'category' && (loading ? (
        <TableSkeleton />
      ) : !data?.breakdown?.length ? (
        <EmptyState />
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                <BarChart2 size={15} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Category Breakdown</h2>
                <p className="text-xs text-gray-400 mt-0.5">Cost distribution by ingredient category</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
              {data.breakdown.length} {data.breakdown.length === 1 ? 'category' : 'categories'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  {['Category', 'Purchases (Rs.)', 'Waste (Rs.)', 'Total (Rs.)', '% of COGS', 'Distribution'].map((h, i) => (
                    <th
                      key={h}
                      className={clsx(
                        'py-3 px-5 text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] whitespace-nowrap',
                        i === 0 || i === 5 ? 'text-left' : 'text-right'
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.breakdown.map((row) => {
                  const pct = data.cogs > 0 ? (row.amount / data.cogs) * 100 : 0;
                  return (
                    <tr key={row.category} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-5">
                        <span className="font-medium text-gray-800">{row.category}</span>
                      </td>
                      <td className="py-3.5 px-5 text-right tabular-nums text-gray-600">
                        {fmt(row.purchases)}
                      </td>
                      <td className="py-3.5 px-5 text-right tabular-nums">
                        {row.waste > 0
                          ? <span className="text-rose-600 font-medium">{fmt(row.waste)}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="py-3.5 px-5 text-right tabular-nums font-semibold text-gray-800">
                        {fmt(row.amount)}
                      </td>
                      <td className="py-3.5 px-5 text-right tabular-nums text-gray-500">
                        {pct.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-5 w-44">
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-9 text-right shrink-0 tabular-nums">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                  <td className="py-4 px-5 font-bold text-slate-700 text-sm uppercase tracking-wide">Totals</td>
                  <td className="py-4 px-5 text-right font-bold text-slate-700 tabular-nums">{fmt(data.totalPurchases)}</td>
                  <td className="py-4 px-5 text-right font-bold text-rose-600 tabular-nums">{fmt(data.totalWaste)}</td>
                  <td className="py-4 px-5 text-right font-bold text-gray-900 tabular-nums text-base">{fmt(data.cogs)}</td>
                  <td className="py-4 px-5 text-right font-bold text-gray-500">100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* ── Menu-item breakdown (theoretical food cost) ── */}
      {view === 'item' && (loading ? (
        <TableSkeleton />
      ) : !itemData?.rows?.length ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {/* Actual vs Theoretical comparison */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <BarChart2 size={15} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Actual vs Theoretical COGS</h2>
                <p className="text-xs text-gray-400 mt-0.5">Theoretical = recipe cost × units sold. Gap usually means waste, over-portioning or shrinkage.</p>
              </div>
            </div>
            <div className="px-5 py-5 flex flex-wrap items-center gap-2">
              <FormulaToken label="Actual COGS" value={`Rs. ${fmt(data?.cogs ?? 0)}`} color="rose" />
              <span className="text-lg font-light text-gray-300 px-1">vs</span>
              <FormulaToken label="Theoretical COGS" value={`Rs. ${fmt(itemData.theoreticalCOGS)}`} color="blue" />
              <span className="text-gray-200 px-1"><ArrowRight size={18} /></span>
              <FormulaToken label="Variance" value={`Rs. ${fmt((data?.cogs ?? 0) - itemData.theoreticalCOGS)}`} color="indigo" />
              <div className="ml-auto text-xs text-gray-400">
                Theoretical food cost: <span className="font-semibold text-gray-600">{itemData.foodCostPct}%</span> of revenue
              </div>
            </div>
          </div>

          {/* Per-item table */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                  <UtensilsCrossed size={15} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Theoretical Food Cost by Menu Item</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Click any item for its ingredient and purchase-cost breakdown</p>
                </div>
              </div>
              {itemData.itemsWithoutRecipe > 0 && (
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-3 py-1">
                  {itemData.itemsWithoutRecipe} without recipe
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    {['Item', 'Qty Sold', 'Recipe Cost / Unit', 'Price', 'Food Cost %', 'Theoretical Cost'].map((h, i) => (
                      <th key={h} className={clsx('py-3 px-5 text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] whitespace-nowrap', i === 0 ? 'text-left' : 'text-right')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {buildItemGroups(itemData.rows).map((g) => {
                    const hasSizes = g.rows.some((r) => r.variationName);
                    if (!hasSizes) {
                      const row = g.rows[0];
                      return (
                        <tr
                          key={g.key}
                          role="button"
                          tabIndex={0}
                          aria-label={`View ingredient cost breakdown for ${row.name}`}
                          onClick={() => setSelectedItem(row)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedItem(row);
                            }
                          }}
                          className="cursor-pointer transition-colors hover:bg-indigo-50/50 focus:bg-indigo-50/50 focus:outline-none"
                        >
                          <td className="py-3.5 px-5">
                            <span className="font-medium text-gray-800">{row.name}</span>
                            {!row.hasRecipe && <span className="ml-2 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">no recipe</span>}
                          </td>
                          <NumericCostCells row={row} />
                        </tr>
                      );
                    }
                    return (
                      <Fragment key={g.key}>
                        {/* Item header — sizes listed beneath, with the item's combined cost */}
                        <tr
                          role="button"
                          tabIndex={0}
                          aria-label={`View ingredient cost breakdown for all sizes of ${g.name}`}
                          onClick={() => setSelectedItem({ id: g.rows[0]?.id, name: g.name })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedItem({ id: g.rows[0]?.id, name: g.name });
                            }
                          }}
                          className="cursor-pointer bg-slate-50/50 transition-colors hover:bg-indigo-50/70 focus:bg-indigo-50/70 focus:outline-none"
                        >
                          <td className="py-2.5 px-5 font-semibold text-gray-800" colSpan={5}>{g.name}</td>
                          <td className="py-2.5 px-5 text-right tabular-nums font-semibold text-gray-700">{fmt(g.total)}</td>
                        </tr>
                        {g.rows.map((row) => (
                          <tr
                            key={row.variationId ?? row.name}
                            role="button"
                            tabIndex={0}
                            aria-label={`View ingredient cost breakdown for ${row.name} ${row.variationName || ''}`.trim()}
                            onClick={() => setSelectedItem(row)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelectedItem(row);
                              }
                            }}
                            className="cursor-pointer transition-colors hover:bg-indigo-50/50 focus:bg-indigo-50/50 focus:outline-none"
                          >
                            <td className="py-3 px-5 pl-10">
                              <span className="text-gray-700">{row.variationName ?? '—'}</span>
                              {!row.hasRecipe && <span className="ml-2 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">no recipe</span>}
                            </td>
                            <NumericCostCells row={row} />
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                    <td className="py-4 px-5 font-bold text-slate-700 text-sm uppercase tracking-wide" colSpan={5}>Theoretical COGS</td>
                    <td className="py-4 px-5 text-right font-bold text-gray-900 tabular-nums text-base">{fmt(itemData.theoreticalCOGS)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      ))}

      <COGSItemCostDrawer
        selection={selectedItem}
        outlet={outlet}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
};

export default COGSReport;
