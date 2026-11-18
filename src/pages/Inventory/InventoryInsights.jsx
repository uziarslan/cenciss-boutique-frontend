import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FlaskConical, AlertTriangle, TrendingUp, TrendingDown,
  RefreshCw, ChevronLeft, ChevronRight,
  BarChart2,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar,
} from 'recharts';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import Portal from '../../components/UI/Portal';
import { format } from 'date-fns';
import { getDetailedIngredients, getIngredientUsageHistory } from '../../api/inventoryApi';
import { useGetStockQuery, listQueryOpts } from '../../store/baseApi';
import useDebounce from '../../hooks/useDebounce';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import Button from '../../components/UI/Button';
import FilterBar from '../../components/UI/FilterBar';
import useQueryState from '../../hooks/useQueryState';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d) => {
  try { return format(new Date(d), 'dd MMM yy'); } catch { return d; }
};

const VarianceBadge = ({ pct, threshold }) => {
  const abs = Math.abs(pct ?? 0);
  const over = abs > (threshold ?? 10);
  if (abs === 0) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
      over ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
    )}>
      {pct > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pct > 0 ? '+' : ''}{pct?.toFixed(1)}%
    </span>
  );
};

/* StockStatusPill removed — inline pills used in table rows */

const Skeleton = ({ className }) => (
  <div className={clsx('animate-pulse bg-gray-100 rounded-lg', className)} />
);

// ── Usage History Side Panel ──────────────────────────────────────────────────

const UsageHistoryPanel = ({ productId, productName, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    getIngredientUsageHistory(productId, { days: 30 })
      .then((r) => setData(r.data?.data ?? null))
      .catch(() => toast.error('Failed to load usage history.'))
      .finally(() => setLoading(false));
  }, [productId]);

  // Slide-in after the portal paints the closed state (double rAF), slide-out
  // before unmount — mirrors the other drawers.
  const [show, setShow] = useState(false);
  useEffect(() => {
    let r2;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShow(true)); });
    return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2); };
  }, []);
  const animateClose = (cb) => { setShow(false); setTimeout(() => cb?.(), 300); };
  const requestClose = () => animateClose(onClose);

  const logs = data?.logs ?? [];
  const chartData = logs.map((l) => ({
    date: l.date?.slice(0, 10) ?? '',
    expected: l.expectedUsage,
    actual: l.actualUsage,
    variancePct: l.variancePct,
    movingAvg: l.movingAvgVariance,
  }));

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={requestClose}
        className={clsx('fixed inset-0 bg-black/20 z-[60] transition-opacity duration-300', show ? 'opacity-100' : 'opacity-0 pointer-events-none')}
      />
      <div
        className={clsx(
          'safe-area-drawer fixed inset-y-0 right-0 z-[70] w-full max-w-xl bg-white shadow-2xl border-l border-gray-100 flex flex-col',
          'transition-transform duration-300 ease-out will-change-transform',
          show ? 'translate-x-0' : 'translate-x-full',
        )}
      >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Usage History</h3>
          <p className="text-xs text-gray-400">{productName} — last 30 days</p>
        </div>
        <button onClick={requestClose} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600" aria-label="Close usage history">
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center">
            <BarChart2 size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No usage logs yet for this ingredient.</p>
            <p className="text-xs text-gray-300 mt-1">Record usage via the menu recipe endpoint.</p>
          </div>
        ) : (
          <>
            {/* Usage chart */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-600 mb-3">Expected vs Actual Usage</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                    tickFormatter={(d) => d?.slice(5)} />
                  <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-gray-900 text-white rounded-xl px-3 py-2 text-xs space-y-1">
                          <p className="font-semibold">{label}</p>
                          {payload.map((p) => (
                            <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value?.toFixed(3)}</p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="expected" name="Expected" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="actual" name="Actual" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Variance chart */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-600 mb-3">Variance % &amp; Moving Average</p>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                    tickFormatter={(d) => d?.slice(5)} />
                  <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={32}
                    tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-gray-900 text-white rounded-xl px-3 py-2 text-xs space-y-1">
                          <p className="font-semibold">{label}</p>
                          {payload.map((p) => (
                            <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value?.toFixed(2)}%</p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={0} stroke="#d1d5db" />
                  <Bar dataKey="variancePct" name="Variance %" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="movingAvg" name="Moving Avg" stroke="#6366f1" strokeWidth={1.5} dot={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 uppercase tracking-wide text-[10px]">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Expected</th>
                    <th className="px-4 py-2.5">Actual</th>
                    <th className="px-4 py-2.5">Variance %</th>
                    <th className="px-4 py-2.5">Moving Avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.slice().reverse().map((log) => (
                    <tr key={log._id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600">{fmtDate(log.date)}</td>
                      <td className="px-4 py-2.5 text-gray-700">{log.expectedUsage?.toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-gray-700">{log.actualUsage?.toFixed(3)}</td>
                      <td className="px-4 py-2.5">
                        <VarianceBadge pct={log.variancePct} threshold={15} />
                      </td>
                      <td className="px-4 py-2.5 text-indigo-600 font-medium">{log.movingAvgVariance?.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recipe links */}
            {data?.recipes?.length > 0 && (
              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                <p className="text-xs font-semibold text-violet-700 mb-2 flex items-center gap-1.5">
                  <FlaskConical size={12} /> Used in Recipes
                </p>
                <div className="space-y-1.5">
                  {data.recipes.map((r) => (
                    <div key={r._id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700">{r.menuItem?.name ?? 'Unknown Item'}</span>
                      <span className="text-violet-600 font-medium">{r.qty} {r.unit} / serving</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const PATTERNS = [
  { value: '', label: 'All patterns' },
  { value: 'highVariance', label: 'High Variance (>10%)' },
  { value: 'overConsumption', label: 'Over-consumed' },
  { value: 'underConsumption', label: 'Under-consumed' },
];

const InventoryInsights = () => {

  const [logs,        setLogs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [pagination,  setPagination]  = useState({ total: 0, page: 1, pages: 1 });

  // Filters
  const [ingredientFilter, setIngredientFilter] = useQueryState('ingredient', '');
  const [dateFrom, setDateFrom] = useQueryState('from', '');
  const [dateTo, setDateTo] = useQueryState('to', '');
  const [pattern, setPattern] = useQueryState('pattern', '');
  const [page,              setPage]              = useState(1);

  const [selectedItem, setSelectedItem] = useState(null);

  const debouncedIngredient = useDebounce(ingredientFilter, 300);

  // Load all stock once for ingredient filter dropdown
  const stockParams = useMemo(() => ({ limit: 200 }), []);
  const { data: stockPayload } = useGetStockQuery(stockParams, listQueryOpts);
  const allStock = useMemo(() => stockPayload?.items ?? [], [stockPayload]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 30,
        ...(debouncedIngredient && { ingredient: debouncedIngredient }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
        ...(pattern && { pattern }),
      };
      const { data } = await getDetailedIngredients(params);
      setLogs(data.data?.logs ?? []);
      setPagination(data.data?.pagination ?? { total: 0, page: 1, pages: 1 });
    } catch {
      toast.error('Failed to load inventory insights.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedIngredient, dateFrom, dateTo, pattern]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleReset = () => {
    setIngredientFilter('');
    setDateFrom('');
    setDateTo('');
    setPattern('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Side panel */}
      {selectedItem && (
        <Portal>
          <UsageHistoryPanel
            productId={selectedItem._id}
            productName={selectedItem.productName}
            onClose={() => setSelectedItem(null)}
          />
        </Portal>
      )}

      {/* Header */}
      <HeroBanner
        icon={FlaskConical}
        eyebrow="Kitchen"
        title="Detailed Kitchen Insights"
        subtitle="Filter by ingredient, date range, and usage pattern."
        accent="indigo"
        compact
        actions={(
          <Button variant="secondary" icon={RefreshCw} onClick={fetchLogs}>
            Refresh
          </Button>
        )}
      />

      {/* Filters */}
      <FilterBar>
        <div className="grid w-full grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Ingredient */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ingredient</label>
            <SearchableSelect
              options={[{ value: '', label: 'All ingredients' }, ...allStock.map((s) => ({ value: s._id, label: s.productName, meta: s.sku }))]}
              value={ingredientFilter}
              onChange={(v) => { setIngredientFilter(v); setPage(1); }}
              searchPlaceholder="Search ingredients…"
            />
          </div>

          {/* Date from */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800"
            />
          </div>

          {/* Date to */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800"
            />
          </div>

          {/* Pattern */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pattern</label>
            <SearchableSelect
              options={PATTERNS.map((p) => ({ value: p.value, label: p.label }))}
              value={pattern}
              onChange={(v) => { setPattern(v); setPage(1); }}
            />
          </div>
        </div>

        {(ingredientFilter || dateFrom || dateTo || pattern) && (
          <div className="flex w-full items-center justify-between">
            <p className="text-xs text-gray-400">{pagination.total} result{pagination.total !== 1 ? 's' : ''} found</p>
            <button onClick={handleReset} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
              Clear filters
            </button>
          </div>
        )}
      </FilterBar>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <FlaskConical size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400 font-medium">No usage records found</p>
            <p className="text-xs text-gray-300 mt-1">Try adjusting filters or recording ingredient usage via the menu recipe API.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead>
                  <tr className="bg-gray-50/80 text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-5 py-3">Ingredient</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Expected</th>
                    <th className="px-5 py-3">Actual</th>
                    <th className="px-5 py-3">Variance</th>
                    <th className="px-5 py-3">Variance %</th>
                    <th className="px-5 py-3">Moving Avg</th>
                    <th className="px-5 py-3">Par Level</th>
                    <th className="px-5 py-3">Adapt. Var.</th>
                    <th className="px-5 py-3">Stock Status</th>
                    <th className="px-5 py-3">History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map((log) => {
                    const recipe = log.recipe;
                    const parLevelBreach = recipe?.parLevel > 0;
                    return (
                      <tr key={log._id} className="hover:bg-indigo-50/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <div>
                            <p className="font-semibold text-gray-800 text-xs">{log.product?.name ?? '—'}</p>
                            <p className="text-gray-400 text-[10px]">{log.product?.sku} · {log.product?.category}</p>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-600">{fmtDate(log.date)}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-700">{log.expectedUsage?.toFixed(3)} <span className="text-gray-400">{log.unit}</span></td>
                        <td className="px-5 py-3.5 text-xs text-gray-700">{log.actualUsage?.toFixed(3)} <span className="text-gray-400">{log.unit}</span></td>
                        <td className="px-5 py-3.5 text-xs">
                          <span className={clsx('font-medium', log.variance > 0 ? 'text-red-600' : log.variance < 0 ? 'text-blue-600' : 'text-gray-400')}>
                            {log.variance > 0 ? '+' : ''}{log.variance?.toFixed(3)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <VarianceBadge pct={log.variancePct} threshold={recipe?.adaptiveVariance ?? 10} />
                        </td>
                        <td className="px-5 py-3.5 text-xs text-indigo-600 font-medium">
                          {log.movingAvgVariance?.toFixed(2)}%
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-600">
                          {recipe?.parLevel ? `${recipe.parLevel} ${log.unit}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-xs font-semibold text-violet-600">
                          {recipe?.adaptiveVariance?.toFixed(1) ?? '—'}%
                        </td>
                        <td className="px-5 py-3.5">
                          {parLevelBreach
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100"><AlertTriangle size={9} /> Alert</span>
                            : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">OK</span>
                          }
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => setSelectedItem({ _id: log.product?._id, productName: log.product?.name })}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  Page {pagination.page} of {pagination.pages} · {pagination.total} total
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft size={13} /> Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                    disabled={page >= pagination.pages}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Next <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default InventoryInsights;
