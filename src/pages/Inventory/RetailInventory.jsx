import { memo, useState } from 'react';
import { Barcode, Filter, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router';
import { createManualRetailProduct } from '../../api/shopifyApi';
import FloatingSelect from '../../components/UI/FloatingSelect';
import Pagination from '../../components/UI/Pagination';
import useRetailCatalog from '../../hooks/useRetailCatalog';
import usePermissions from '../../hooks/usePermissions';
import useQueryState, { useQueryFilters } from '../../hooks/useQueryState';

const money = (value) => `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const variantLabel = (variant) => [...new Set([variant.product?.title || 'Product', variant.title && variant.title !== 'Default Title' ? variant.title : '', (variant.options || []).map((option) => option.value).filter((value) => value && value !== 'Default Title').join(' / ')].filter(Boolean))].join(' · ');
const blankProduct = () => ({
  title: '',
  productType: 'Apparel',
  variants: [{ title: '', sku: '', barcode: '', price: '' }],
});
const PAGE_SIZE = 50;

const CatalogRows = memo(function CatalogRows({ variants, canManage }) {
  return <>{variants.map((variant) => {
              const isManual = variant.catalogSource === 'manual' || !variant.shopifyVariantId;
              return <tr key={variant._id} className="hover:bg-gray-50/60">
                <td className="px-4 py-3"><div className="flex items-center gap-3">{variant.product?.imageUrl && <img src={variant.product.imageUrl} alt="" loading="lazy" decoding="async" width="44" height="44" className="h-11 w-11 rounded-lg object-cover" />}<div><p className="font-semibold text-gray-900">{variantLabel(variant)}</p><p className="text-xs text-gray-500">{variant.product?.productType || variant.product?.vendor || 'Boutique product'}</p></div></div></td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${(variant.product?.status || 'active') === 'active' ? 'bg-emerald-100 text-emerald-800' : (variant.product?.status === 'draft' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700')}`}>{variant.product?.status || 'active'}</span></td>
                <td className="px-4 py-3 font-medium text-gray-800">{variant.sku || '—'}</td>
                <td className="px-4 py-3 font-semibold text-indigo-700">{money(variant.price)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(variant.available) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{Number(variant.available || 0)} available</span></td>
                <td className="px-4 py-3"><span className="inline-flex min-w-[120px] items-center gap-1 text-xs text-gray-600"><Barcode size={12} />{variant.barcode || 'No barcode'}</span></td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isManual ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800'}`}>{isManual ? 'Manual' : 'Shopify'}</span></td>
                <td className="px-4 py-3">{canManage && <Link to={`/retail-inventory/${variant.product?._id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"><Pencil size={13} />Edit product</Link>}</td>
              </tr>;
            })}
</>;
});

const RetailInventory = () => {
  const { has } = usePermissions();
  const canManage = has('inventory.manage');
  const [outletId, setOutletId] = useQueryState('outlet', '');
  const [search, setSearch] = useQueryState('search', '');
  const [page, setPage] = useQueryState('page', 1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useQueryFilters({ source: 'all', status: 'all', type: 'all', vendor: 'all', tag: 'all', size: 'all', color: 'all', optionValue: 'all', stock: 'all', tracked: 'all', barcode: 'all', minPrice: '', maxPrice: '', sort: 'name' });
  const [savingProduct, setSavingProduct] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState(blankProduct);

  const { outlets, filterOptions: catalogOptions, optionsReady, optionsLoading, optionsError, result, error, loading, refresh } = useRetailCatalog({ outletId, search, page, filters, setOutletId, setPage });
  const variants = result?.items || [];
  const pageInfo = result || { total: 0, pages: 1, pageSize: PAGE_SIZE };

  const updateFilters = (next) => { setPage(1); setFilters(next); };
  const updateSearch = (value) => { setPage(1); setSearch(value); };
  const updateOutlet = (value) => { setPage(1); setOutletId(value); };

  const activeFilterCount = [filters.source, filters.status, filters.type, filters.vendor, filters.tag, filters.size, filters.color, filters.optionValue, filters.stock, filters.tracked, filters.barcode].filter((value) => value !== 'all').length + [filters.minPrice !== '', filters.maxPrice !== ''].filter(Boolean).length;

  const filtered = variants;

  const updateProductVariant = (index, field, value) => setProductForm((current) => ({
    ...current,
    variants: current.variants.map((variant, row) => row === index ? { ...variant, [field]: value } : variant),
  }));

  const submitProduct = async (event) => {
    event.preventDefault();
    if (!outletId) return toast.error('Select or create an outlet before adding a sellable product.');
    if (!productForm.title.trim() || productForm.variants.some((variant) => !variant.title.trim() || variant.price === '' || Number(variant.price) < 0)) {
      return toast.error('Enter a product name and a name and price for every variant.');
    }
    setSavingProduct(true);
    try {
      await createManualRetailProduct({ ...productForm, outletId, variants: productForm.variants.map((variant) => ({ ...variant, price: Number(variant.price) })) });
      toast.success('Manual product and variant added to the local catalog.');
      setShowProductForm(false);
      setProductForm(blankProduct());
      refresh();
    } catch (error) { toast.error(error.response?.data?.message || 'Could not add this product.'); }
    finally { setSavingProduct(false); }
  };

  const outletOptions = outlets.map((outlet) => ({ value: String(outlet._id), label: outlet.name, meta: outlet.code || '' }));

  return (
    <div className="space-y-5 py-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-extrabold text-gray-900">Finished Goods</h1><p className="mt-1 text-sm text-gray-500">Manage your products, prices and stock. Draft products stay here until they are ready to sell.</p></div>
        <div className="flex gap-2">
          {canManage && <button onClick={() => setShowProductForm((open) => !open)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"><Plus size={15} />Add manual product</button>}
          <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh stock</button>
        </div>
      </header>

      {showProductForm && <form onSubmit={submitProduct} className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-gray-900">Add a local finished product</h2><p className="mt-1 text-sm text-gray-500">Available before Shopify is connected. Variants appear in Manufacturing and the POS. Use the same SKU as Shopify on every variant to link this product during a later catalog sync.</p></div><button type="button" onClick={() => setShowProductForm(false)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close product form"><X size={17} /></button></div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-gray-600">Product name<input className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={productForm.title} onChange={(event) => setProductForm((current) => ({ ...current, title: event.target.value }))} required maxLength={150} /></label>
          <label className="text-xs font-semibold text-gray-600">Product type<input className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={productForm.productType} onChange={(event) => setProductForm((current) => ({ ...current, productType: event.target.value }))} placeholder="e.g. Apparel" maxLength={80} /></label>
        </div>
        <div className="space-y-3">
          {productForm.variants.map((variant, index) => <div key={index} className="grid gap-3 rounded-xl bg-gray-50 p-3 md:grid-cols-[1fr_1fr_1fr_150px_auto] md:items-end">
            <label className="text-xs font-semibold text-gray-600">Variant / size / color<input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={variant.title} onChange={(event) => updateProductVariant(index, 'title', event.target.value)} placeholder="Size M · Navy" required maxLength={100} /></label>
            <label className="text-xs font-semibold text-gray-600">SKU<input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={variant.sku} onChange={(event) => updateProductVariant(index, 'sku', event.target.value)} placeholder="Optional SKU" maxLength={100} /></label>
            <label className="text-xs font-semibold text-gray-600">Barcode<input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={variant.barcode} onChange={(event) => updateProductVariant(index, 'barcode', event.target.value)} placeholder="Optional barcode" maxLength={80} /></label>
            <label className="text-xs font-semibold text-gray-600">Price · PKR<input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" type="number" min="0" step="0.01" value={variant.price} onChange={(event) => updateProductVariant(index, 'price', event.target.value)} required /></label>
            <button type="button" disabled={productForm.variants.length === 1} onClick={() => setProductForm((current) => ({ ...current, variants: current.variants.filter((_, row) => row !== index) }))} className="mb-1 rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="Remove variant"><X size={16} /></button>
          </div>)}
          <button type="button" onClick={() => setProductForm((current) => ({ ...current, variants: [...current.variants, { title: '', sku: '', barcode: '', price: '' }] }))} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"><Plus size={14} />Add another variant</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
          {outlets.length > 1 && <FloatingSelect label="Outlet" options={outletOptions} value={outletId} onChange={updateOutlet} placeholder="Choose an outlet" containerClassName="min-w-[240px]" />}
          {outlets.length <= 1 && <p className="text-xs text-gray-500">Outlet: {outlets[0]?.name || 'No active outlet yet'}</p>}
          <button type="submit" disabled={savingProduct || !outlets.length} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save size={15} />{savingProduct ? 'Saving…' : 'Save product'}</button>
        </div>
      </form>}

      <div className="flex flex-wrap gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        {outlets.length > 1 && <FloatingSelect label="Outlet" options={outletOptions} value={outletId} onChange={updateOutlet} containerClassName="min-w-[220px]" />}
        <label className="relative min-w-[240px] flex-1 text-xs font-semibold text-gray-600">Search products, SKU, barcode, size or color<div className="relative mt-1"><Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-10 text-sm outline-none focus:border-indigo-500" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Search finished goods" autoComplete="off" />{search && <button type="button" onClick={() => updateSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Clear search"><X size={16} /></button>}</div></label>
        <button onClick={() => setFiltersOpen((open) => !open)} className="inline-flex items-center gap-2 self-end rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50" aria-expanded={filtersOpen}><Filter size={15} />Filters{activeFilterCount > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{activeFilterCount}</span>}</button>
      </div>
      {filtersOpen && <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-label="Advanced product filters">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-gray-800">Advanced filters</h2><button onClick={() => { updateFilters({ source: 'all', status: 'all', type: 'all', vendor: 'all', tag: 'all', size: 'all', color: 'all', optionValue: 'all', stock: 'all', tracked: 'all', barcode: 'all', minPrice: '', maxPrice: '', sort: 'name' }); updateSearch(''); }} className="text-xs font-semibold text-indigo-600 hover:underline">Clear all</button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-gray-600">Source<select value={filters.source} onChange={(event) => updateFilters((current) => ({ ...current, source: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All sources</option><option value="shopify">Shopify</option><option value="manual">Manual</option></select></label>
          <label className="text-xs font-semibold text-gray-600">Shopify status<select value={filters.status} onChange={(event) => updateFilters((current) => ({ ...current, status: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
          <label className="text-xs font-semibold text-gray-600">Product type<select value={filters.type} onChange={(event) => updateFilters((current) => ({ ...current, type: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All types</option>{catalogOptions.types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Vendor<select value={filters.vendor} onChange={(event) => updateFilters((current) => ({ ...current, vendor: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All vendors</option>{catalogOptions.vendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Tag<select value={filters.tag} onChange={(event) => updateFilters((current) => ({ ...current, tag: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All tags</option>{catalogOptions.tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Size<select value={filters.size} onChange={(event) => updateFilters((current) => ({ ...current, size: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All sizes</option>{catalogOptions.sizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Color<select value={filters.color} onChange={(event) => updateFilters((current) => ({ ...current, color: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All colors</option>{catalogOptions.colors.map((color) => <option key={color} value={color}>{color}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Size / color / option<select value={filters.optionValue} onChange={(event) => updateFilters((current) => ({ ...current, optionValue: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All options</option>{catalogOptions.optionValues.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Stock status<select value={filters.stock} onChange={(event) => updateFilters((current) => ({ ...current, stock: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">Any stock</option><option value="in">In stock</option><option value="out">Out of stock</option></select></label>
          <label className="text-xs font-semibold text-gray-600">Inventory tracking<select value={filters.tracked} onChange={(event) => updateFilters((current) => ({ ...current, tracked: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">Any tracking</option><option value="yes">Tracked</option><option value="no">Not tracked</option></select></label>
          <label className="text-xs font-semibold text-gray-600">Barcode<select value={filters.barcode} onChange={(event) => updateFilters((current) => ({ ...current, barcode: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">Any barcode</option><option value="has">Has barcode</option><option value="missing">Missing barcode</option></select></label>
          <label className="text-xs font-semibold text-gray-600">Minimum price (PKR)<input type="number" min="0" value={filters.minPrice} onChange={(event) => updateFilters((current) => ({ ...current, minPrice: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" placeholder="No minimum" /></label>
          <label className="text-xs font-semibold text-gray-600">Maximum price (PKR)<input type="number" min="0" value={filters.maxPrice} onChange={(event) => updateFilters((current) => ({ ...current, maxPrice: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" placeholder="No maximum" /></label>
          <label className="text-xs font-semibold text-gray-600">Sort by<select value={filters.sort} onChange={(event) => updateFilters((current) => ({ ...current, sort: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="name">Name (A–Z)</option><option value="priceAsc">Price (low to high)</option><option value="priceDesc">Price (high to low)</option><option value="stockAsc">Stock (low to high)</option><option value="stockDesc">Stock (high to low)</option></select></label>
        </div>
      </section>}
      {optionsReady && !optionsLoading && !optionsError && !outlets.length && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Create an outlet before adding finished products. Shopify is optional for local products.</div>}
      {optionsError && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{optionsError}<button onClick={refresh} className="font-semibold underline">Retry</button></div>}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-busy={loading}>
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <p role="status" className="flex items-center gap-2 text-xs font-medium text-gray-500">{loading ? <><RefreshCw size={13} className="animate-spin text-indigo-600" />{result ? 'Updating results…' : 'Loading products…'}</> : error ? 'Results could not be updated' : `${pageInfo.total.toLocaleString()} variants · 50 per page`}</p>
          {(activeFilterCount > 0 || search || filters.sort !== 'name') && <button onClick={() => { updateFilters({}); updateSearch(''); }} className="text-xs font-semibold text-indigo-600 hover:underline">Clear search & filters</button>}
        </div>
        {error && <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}{result ? ' Previously loaded results are shown below.' : ''}</span><button onClick={refresh} className="shrink-0 font-semibold underline">Retry</button></div>}
        <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Product variant</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Sellable qty</th><th className="px-4 py-3">Barcode</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Action</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {!result && loading && Array.from({ length: 6 }, (_, row) => <tr key={row} aria-hidden="true">{Array.from({ length: 8 }, (_, column) => <td key={column} className="px-4 py-5"><div className="h-5 animate-pulse rounded bg-gray-100" /></td>)}</tr>)}
            <CatalogRows variants={variants} canManage={canManage} />
            {!loading && !error && !filtered.length && <tr><td colSpan="8" className="px-4 py-12 text-center text-gray-500">{pageInfo.total ? 'No finished goods on this page.' : activeFilterCount || search.trim() ? 'No products match these filters. Clear filters to see the full catalog.' : 'No catalog variants were found for this outlet. Check the Shopify location mapping, then refresh stock or sync the catalog.'}</td></tr>}
          </tbody>
        </table></div>
        <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">Stock reflects the latest completed updates. Use Refresh stock to reload.</div>
        <div className="px-4 pb-4" inert={loading || Boolean(error) ? true : undefined}>
          <Pagination
            page={result?.page || page}
            pages={pageInfo.pages}
            total={pageInfo.total}
            pageSize={pageInfo.pageSize}
            hasPrev={page > 1}
            hasNext={page < pageInfo.pages}
            prev={() => setPage(Math.max(1, page - 1))}
            next={() => setPage(Math.min(pageInfo.pages, page + 1))}
            goTo={setPage}
          />
        </div>
      </div>
    </div>
  );
};

export default RetailInventory;
