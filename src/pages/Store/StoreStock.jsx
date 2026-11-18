import { useMemo } from 'react';
import { Warehouse, Boxes, CheckCircle2, Package, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { useGetStockQuery, useGetOutletsQuery, listQueryOpts } from '../../store/baseApi';
import useDebounce from '../../hooks/useDebounce';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import StatTile from '../../components/UI/StatTile';
import FilterBar from '../../components/UI/FilterBar';
import useQueryState from '../../hooks/useQueryState';

const StockStatusChip = ({ item }) => {
  if (!item.parLevel) return <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">No Par</span>;
  if (item.belowPar) return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"><AlertTriangle size={10} /> Below Par</span>;
  if (item.qtyOnHand <= item.parLevel * 1.2) return <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Low</span>;
  return <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">OK</span>;
};

// Raw material quantities held for boutique production.
const StoreStock = () => {
  const { data: outlets = [] } = useGetOutletsQuery();
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const [search, setSearch] = useQueryState('search', '');
  const [category, setCategory] = useQueryState('category', '');
  const [stockState, setStockState] = useQueryState('stockState', '');
  const [minQty, setMinQty] = useQueryState('minQty', '');
  const [maxQty, setMaxQty] = useQueryState('maxQty', '');
  const [sort, setSort] = useQueryState('sort', 'priority');
  const debouncedSearch = useDebounce(search, 300);

  const queryParams = useMemo(
    () => ({ area: 'store', limit: 200, ...(outlet ? { outlet } : {}) }),
    [outlet],
  );
  const { data: payload, isLoading: loading, isError, error } = useGetStockQuery(queryParams, listQueryOpts);
  const items = useMemo(() => payload?.items ?? [], [payload]);
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
    [items],
  );

  const filtered = items
    .filter((item) => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch = !q
        || item.productName?.toLowerCase().includes(q)
        || item.sku?.toLowerCase().includes(q);
      const matchCat = !category || item.category === category;
      const qty = Number(item.qtyOnHand || 0);
      const matchState = !stockState
        || (stockState === 'out' && qty <= 0)
        || (stockState === 'below-par' && item.belowPar)
        || (stockState === 'in-stock' && qty > 0)
        || (stockState === 'no-par' && !item.parLevel);
      return matchSearch && matchCat && matchState
        && (minQty === '' || qty >= Number(minQty))
        && (maxQty === '' || qty <= Number(maxQty));
    })
    .sort((a, b) => {
      if (sort === 'name') return (a.productName ?? '').localeCompare(b.productName ?? '');
      if (sort === 'qtyHigh') return Number(b.qtyOnHand || 0) - Number(a.qtyOnHand || 0);
      if (sort === 'qtyLow') return Number(a.qtyOnHand || 0) - Number(b.qtyOnHand || 0);
      if (sort === 'valueHigh') return (Number(b.qtyOnHand || 0) * Number(b.currentPrice || 0)) - (Number(a.qtyOnHand || 0) * Number(a.currentPrice || 0));
      return (Number(b.belowPar) - Number(a.belowPar)) || (a.productName ?? '').localeCompare(b.productName ?? '');
    });

  const totalItems = items.length;
  const inStockCount = items.filter((i) => (i.qtyOnHand || 0) > 0).length;
  const totalValue = items.reduce((s, i) => s + (i.qtyOnHand || 0) * (i.currentPrice || 0), 0);
  const belowParCount = items.filter((i) => i.belowPar).length;

  return (
    <div className="space-y-5">
      <HeroBanner
        icon={Warehouse}
        eyebrow="Raw Materials"
        title="Raw Material Stock"
        subtitle="Materials purchased for boutique manufacturing. Production orders issue quantities from this stock."
        accent="indigo"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Raw Materials" value={isError ? '—' : totalItems} icon={Boxes} gradient="indigo" />
        <StatTile label="With Stock" value={isError ? '—' : inStockCount} icon={CheckCircle2} gradient="emerald" />
        <StatTile label="Below Par" value={isError ? '—' : belowParCount} icon={AlertTriangle} gradient="amber" />
        <StatTile label="Raw Material Value (PKR)" value={isError ? '—' : totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} icon={Package} gradient="cyan" />
      </div>

      <FilterBar>
        {outlets.length > 1 && (
          <div className="min-w-[200px]">
            <SearchableSelect
              options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
              value={outlet}
              onChange={setOutlet}
              placeholder="All outlets"
            />
          </div>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, SKU…"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
        />
        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]}
            value={category}
            onChange={setCategory}
          />
        </div>
        <div className="min-w-[180px]"><SearchableSelect options={[{ value: '', label: 'All stock states' }, { value: 'in-stock', label: 'In stock' }, { value: 'out', label: 'Out of stock' }, { value: 'below-par', label: 'Below par' }, { value: 'no-par', label: 'No par level' }]} value={stockState} onChange={setStockState} /></div>
        <input type="number" min="0" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="Minimum quantity" className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input type="number" min="0" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder="Maximum quantity" className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'priority', label: 'Reorder priority' }, { value: 'name', label: 'Product name' }, { value: 'qtyHigh', label: 'Highest quantity' }, { value: 'qtyLow', label: 'Lowest quantity' }, { value: 'valueHigh', label: 'Highest stock value' }]} value={sort} onChange={setSort} /></div>
        {(search || category || outlet || stockState || minQty || maxQty || sort !== 'priority') && (
          <button
            onClick={() => { setSearch(''); setCategory(''); setOutlet(''); setStockState(''); setMinQty(''); setMaxQty(''); setSort('priority'); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            Clear
          </button>
        )}
      </FilterBar>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isError ? (
            <div role="alert" className="px-6 py-12 text-center text-sm text-rose-700">
              Could not load raw-material stock. {error?.data?.message || 'Check your access and connection, then refresh.'}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              No raw materials received yet. Post a stock purchase to add materials here.
            </div>
          ) : (
            <table className="min-w-[800px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['Raw material', 'Category', 'Unit', 'Stock Qty', 'Par Level', 'Status', 'Last Updated'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase py-3 px-4 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => {
                  return (
                    <tr key={`${item.product}-${item.outlet?._id ?? ''}`} className={clsx('hover:bg-gray-50 transition-colors', item.belowPar && 'bg-red-50 hover:bg-red-100')}>
                      <td className="py-3 px-4">
                        <p className="font-medium text-gray-800">{item.productName}</p>
                        {item.sku && <p className="text-xs font-mono text-gray-400">{item.sku}</p>}
                      </td>
                      <td className="py-3 px-4 text-gray-600">{item.category ?? '—'}</td>
                      <td className="py-3 px-4 text-gray-600">{item.unit ?? '—'}</td>
                      <td className="py-3 px-4">
                        <span className={clsx('font-bold text-base', item.belowPar ? 'text-red-600' : (item.qtyOnHand || 0) > 0 ? 'text-gray-800' : 'text-gray-400')}>
                          {(item.qtyOnHand ?? 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{item.parLevel > 0 ? item.parLevel.toFixed(2) : '—'}</td>
                      <td className="py-3 px-4"><StockStatusChip item={item} /></td>
                      <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                        {item.updatedAt ? format(new Date(item.updatedAt), 'dd MMM yyyy, HH:mm') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default StoreStock;
