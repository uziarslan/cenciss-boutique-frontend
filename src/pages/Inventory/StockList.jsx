import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, Boxes, Package, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { useGetStockQuery, listQueryOpts } from '../../store/baseApi';
import useDebounce from '../../hooks/useDebounce';
import usePermissions from '../../hooks/usePermissions';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import StatTile from '../../components/UI/StatTile';
import FilterBar from '../../components/UI/FilterBar';
import useQueryState from '../../hooks/useQueryState';

// ── Status chip for stock level ───────────────────────────────────────────────
const StockStatusChip = ({ item }) => {
  if (!item.parLevel || item.parLevel === 0) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
        No Par
      </span>
    );
  }
  if (item.belowPar) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <AlertTriangle size={10} /> Below Par
      </span>
    );
  }
  if (item.qtyOnHand <= item.parLevel * 1.2) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        Low
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      OK
    </span>
  );
};

// ── StockList ─────────────────────────────────────────────────────────────────
const StockList = () => {
  const navigate = useNavigate();
  const { has } = usePermissions();
  const canSeeBothAreas = has('inventory.view') && has('store.view');

  const [search, setSearch] = useQueryState('search', '');
  const [category, setCategory] = useQueryState('category', '');
  const [stockState, setStockState] = useQueryState('stockState', '');
  const [minQty, setMinQty] = useQueryState('minQty', '');
  const [maxQty, setMaxQty] = useQueryState('maxQty', '');
  const [location, setLocation] = useQueryState('location', '');
  const [sort, setSort] = useQueryState('sort', 'priority');

  const debouncedSearch = useDebounce(search, 300);

  const queryParams = useMemo(() => ({ limit: 200 }), []);
  const { data: payload, isLoading: loading } = useGetStockQuery(queryParams, listQueryOpts);
  const { data: storePayload } = useGetStockQuery(
    { area: 'store', limit: 200 },
    { ...listQueryOpts, skip: !canSeeBothAreas },
  );
  const items = useMemo(() => payload?.items ?? [], [payload]);
  const storeByProductOutlet = useMemo(() => new Map(
    (storePayload?.items ?? []).map((item) => [`${item.product}-${item.outlet?._id ?? item.outlet ?? ''}`, item]),
  ), [storePayload]);
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
    [items]
  );
  const locations = useMemo(
    () => [...new Set(items.map((i) => i.location).filter(Boolean))].sort(),
    [items],
  );

  const filtered = items
    .filter((item) => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch =
        !q ||
        item.productName?.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.location?.toLowerCase().includes(q);
      const matchCat = !category || item.category === category;
      const qty = Number(item.qtyOnHand || 0);
      const matchState = !stockState
        || (stockState === 'out' && qty <= 0)
        || (stockState === 'below-par' && item.belowPar)
        || (stockState === 'in-stock' && qty > 0)
        || (stockState === 'no-par' && !item.parLevel);
      return matchSearch && matchCat && matchState
        && (minQty === '' || qty >= Number(minQty))
        && (maxQty === '' || qty <= Number(maxQty))
        && (!location || item.location === location);
    })
    .sort((a, b) => {
      if (sort === 'name') return (a.productName ?? '').localeCompare(b.productName ?? '');
      if (sort === 'qtyHigh') return Number(b.qtyOnHand || 0) - Number(a.qtyOnHand || 0);
      if (sort === 'qtyLow') return Number(a.qtyOnHand || 0) - Number(b.qtyOnHand || 0);
      if (sort === 'updated') return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      if (a.belowPar && !b.belowPar) return -1;
      if (!a.belowPar && b.belowPar) return 1;
      return (a.productName ?? '').localeCompare(b.productName ?? '');
    });

  const belowParCount = items.filter((i) => i.belowPar).length;

  const totalItems = items.length;
  const inStockCount = items.filter((i) => (i.qtyOnHand || 0) > 0).length;
  const outOfStock = items.filter((i) => (i.qtyOnHand || 0) <= 0).length;

  return (
    <div className="space-y-5">
      <HeroBanner
        icon={Boxes}
        eyebrow="Kitchen"
        title="Stock Levels"
        subtitle="Current on-hand quantities, par levels and reorder needs across your kitchens."
        accent="emerald"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total Items" value={totalItems} icon={Boxes} gradient="emerald" />
        <StatTile label="In Stock" value={inStockCount} icon={CheckCircle2} gradient="cyan" />
        <StatTile label="Below Par" value={belowParCount} icon={AlertTriangle} gradient="amber" />
        <StatTile label="Out of Stock" value={outOfStock} icon={Package} gradient="rose" />
      </div>

      <FilterBar>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, SKU, location…"
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
        <div className="min-w-[180px]"><SearchableSelect options={[{ value: '', label: 'All locations' }, ...locations.map((value) => ({ value, label: value }))]} value={location} onChange={setLocation} /></div>
        <input type="number" min="0" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="Minimum quantity" className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input type="number" min="0" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder="Maximum quantity" className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'priority', label: 'Reorder priority' }, { value: 'name', label: 'Product name' }, { value: 'qtyHigh', label: 'Highest quantity' }, { value: 'qtyLow', label: 'Lowest quantity' }, { value: 'updated', label: 'Recently updated' }]} value={sort} onChange={setSort} /></div>
        {(search || category || stockState || location || minQty || maxQty || sort !== 'priority') && (
          <button
            onClick={() => { setSearch(''); setCategory(''); setStockState(''); setLocation(''); setMinQty(''); setMaxQty(''); setSort('priority'); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            Clear
          </button>
        )}
      </FilterBar>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              No stock items found. Stock is added automatically when stock purchases are posted.
            </div>
          ) : (
            <table className="min-w-[850px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['Product', 'Category', 'Unit', 'Kitchen Qty', ...(canSeeBothAreas ? ['Store Qty'] : []), 'Par Level', 'Location', 'Status', 'Last Updated'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase py-3 px-4 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => {
                  const outletId = typeof item.outlet === 'object' ? item.outlet?._id : item.outlet;
                  return (
                  <tr
                    key={`${item.product}-${outletId ?? ''}`}
                    onClick={() => navigate(`/inventory/stock/${item.product}?outlet=${outletId ?? ''}`)}
                    className={clsx(
                      'hover:bg-gray-50 transition-colors cursor-pointer',
                      item.belowPar && 'bg-red-50 hover:bg-red-100'
                    )}
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-800">{item.productName}</p>
                      {item.sku && <p className="text-xs font-mono text-gray-400">{item.sku}</p>}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{item.category ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-600">{item.unit ?? '—'}</td>
                    <td className="py-3 px-4">
                      <span className={clsx(
                        'font-bold text-base',
                        item.belowPar ? 'text-red-600' : 'text-gray-800'
                      )}>
                        {(item.qtyOnHand ?? 0).toFixed(2)}
                      </span>
                    </td>
                    {canSeeBothAreas && (() => {
                      const storeItem = storeByProductOutlet.get(`${item.product}-${outletId ?? ''}`);
                      return <td className="py-3 px-4"><span className="font-semibold text-indigo-700">{(storeItem?.qtyOnHand ?? 0).toFixed(2)}</span><span className="ml-1 text-xs text-gray-400">{storeItem?.unit ?? item.unit ?? ''}</span></td>;
                    })()}
                    <td className="py-3 px-4 text-gray-600">
                      {item.parLevel > 0 ? item.parLevel.toFixed(2) : '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{item.location ?? '—'}</td>
                    <td className="py-3 px-4">
                      <StockStatusChip item={item} />
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                      {item.updatedAt
                        ? format(new Date(item.updatedAt), 'dd MMM yyyy, HH:mm')
                        : '—'}
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

export default StockList;
