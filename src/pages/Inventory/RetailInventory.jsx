import { useCallback, useEffect, useMemo, useState } from 'react';
import { Barcode, Check, Filter, Plus, RefreshCw, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { createManualRetailProduct, updateRetailBarcode } from '../../api/shopifyApi';
import FloatingSelect from '../../components/UI/FloatingSelect';
import usePermissions from '../../hooks/usePermissions';

const money = (value) => `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const variantLabel = (variant) => [...new Set([variant.product?.title || 'Product', variant.title && variant.title !== 'Default Title' ? variant.title : '', (variant.options || []).map((option) => option.value).filter((value) => value && value !== 'Default Title').join(' / ')].filter(Boolean))].join(' · ');
const blankProduct = () => ({
  title: '',
  productType: 'Apparel',
  variants: [{ title: '', sku: '', barcode: '', price: '' }],
});

const RetailInventory = () => {
  const { has } = usePermissions();
  const canManage = has('inventory.manage');
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState('');
  const [variants, setVariants] = useState([]);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ source: 'all', type: 'all', vendor: 'all', stock: 'all', barcode: 'all', minPrice: '', maxPrice: '', sort: 'name' });
  const [loading, setLoading] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState(blankProduct);
  const [barcodeEditId, setBarcodeEditId] = useState('');
  const [barcodeDraft, setBarcodeDraft] = useState('');

  const refresh = useCallback(async (selectedOutlet = outletId) => {
    setLoading(true);
    try {
      const setupResponse = await api.get('/api/production/setup', { params: selectedOutlet ? { outletId: selectedOutlet } : {} });
      const setup = setupResponse.data?.data || {};
      const availableOutlets = setup.outlets || [];
      setOutlets(availableOutlets);
      const effectiveOutlet = selectedOutlet || setup.outletId || '';
      if (!selectedOutlet && effectiveOutlet) setOutletId(String(effectiveOutlet));
      const firstResponse = await api.get('/api/shopify/catalog', { params: { outletId: effectiveOutlet || undefined, limit: 250, page: 1 } });
      const firstData = firstResponse.data?.data || {};
      const items = Array.isArray(firstData) ? firstData : [...(firstData.items || [])];
      const pages = Array.isArray(firstData) ? 1 : Number(firstData.totalPages || 1);
      for (let page = 2; page <= pages; page += 1) {
        const next = await api.get('/api/shopify/catalog', { params: { outletId: effectiveOutlet || undefined, limit: 250, page } });
        items.push(...(next.data?.data?.items || []));
      }
      setVariants(items);
    } catch (error) { toast.error(error.response?.data?.message || 'Could not load finished inventory.'); }
    finally { setLoading(false); }
  }, [outletId]);

  useEffect(() => { refresh(''); }, []);

  const filterOptions = useMemo(() => ({
    types: [...new Set(variants.map((variant) => variant.product?.productType).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    vendors: [...new Set(variants.map((variant) => variant.product?.vendor).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  }), [variants]);

  const activeFilterCount = [filters.source !== 'all', filters.type !== 'all', filters.vendor !== 'all', filters.stock !== 'all', filters.barcode !== 'all', filters.minPrice !== '', filters.maxPrice !== ''].filter(Boolean).length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = variants.filter((variant) => {
      const isManual = variant.catalogSource === 'manual' || !variant.shopifyVariantId;
      const available = Number(variant.available || 0);
      const price = Number(variant.price || 0);
      const searchText = `${variant.product?.title || ''} ${variant.title || ''} ${variant.sku || ''} ${variant.barcode || ''} ${variant.product?.productType || ''} ${variant.product?.vendor || ''} ${(variant.options || []).map((option) => option.value).join(' ')}`.toLowerCase();
      if (query && !searchText.includes(query)) return false;
      if (filters.source === 'shopify' && isManual) return false;
      if (filters.source === 'manual' && !isManual) return false;
      if (filters.type !== 'all' && variant.product?.productType !== filters.type) return false;
      if (filters.vendor !== 'all' && variant.product?.vendor !== filters.vendor) return false;
      if (filters.stock === 'in' && available <= 0) return false;
      if (filters.stock === 'out' && available > 0) return false;
      if (filters.barcode === 'has' && !variant.barcode) return false;
      if (filters.barcode === 'missing' && variant.barcode) return false;
      if (filters.minPrice !== '' && price < Number(filters.minPrice)) return false;
      if (filters.maxPrice !== '' && price > Number(filters.maxPrice)) return false;
      return true;
    });
    const sorters = {
      name: (a, b) => variantLabel(a).localeCompare(variantLabel(b)),
      priceAsc: (a, b) => Number(a.price || 0) - Number(b.price || 0),
      priceDesc: (a, b) => Number(b.price || 0) - Number(a.price || 0),
      stockAsc: (a, b) => Number(a.available || 0) - Number(b.available || 0),
      stockDesc: (a, b) => Number(b.available || 0) - Number(a.available || 0),
    };
    return matches.sort(sorters[filters.sort] || sorters.name);
  }, [variants, search, filters]);

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
      await refresh(outletId);
    } catch (error) { toast.error(error.response?.data?.message || 'Could not add this product.'); }
    finally { setSavingProduct(false); }
  };

  const saveBarcode = async (variantId) => {
    try {
      await updateRetailBarcode(variantId, barcodeDraft);
      toast.success('Barcode saved to the local catalog.');
      setBarcodeEditId('');
      await refresh(outletId);
    } catch (error) { toast.error(error.response?.data?.message || 'Could not save this barcode.'); }
  };

  const outletOptions = outlets.map((outlet) => ({ value: String(outlet._id), label: outlet.name, meta: outlet.code || '' }));

  return (
    <div className="space-y-5 py-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-extrabold text-gray-900">Finished Goods</h1><p className="mt-1 text-sm text-gray-500">Local and Shopify-linked variants share the catalog used by Manufacturing and the boutique POS.</p></div>
        <div className="flex gap-2">
          {canManage && <button onClick={() => setShowProductForm((open) => !open)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"><Plus size={15} />Add manual product</button>}
          <button onClick={() => refresh(outletId)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh stock</button>
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
          {outlets.length > 1 && <FloatingSelect label="Outlet" options={outletOptions} value={outletId} onChange={setOutletId} placeholder="Choose an outlet" containerClassName="min-w-[240px]" />}
          {outlets.length <= 1 && <p className="text-xs text-gray-500">Outlet: {outlets[0]?.name || 'No active outlet yet'}</p>}
          <button type="submit" disabled={savingProduct || !outlets.length} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save size={15} />{savingProduct ? 'Saving…' : 'Save product'}</button>
        </div>
      </form>}

      <div className="flex flex-wrap gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        {outlets.length > 1 && <FloatingSelect label="Outlet" options={outletOptions} value={outletId} onChange={(value) => { setOutletId(value); refresh(value); }} containerClassName="min-w-[220px]" />}
        <label className="relative min-w-[240px] flex-1 text-xs font-semibold text-gray-600">Search products, SKU, barcode, size or color<div className="relative mt-1"><Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search finished goods" /></div></label>
        <button onClick={() => setFiltersOpen((open) => !open)} className="inline-flex items-center gap-2 self-end rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50" aria-expanded={filtersOpen}><Filter size={15} />Filters{activeFilterCount > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{activeFilterCount}</span>}</button>
      </div>
      {filtersOpen && <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-label="Advanced product filters">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-gray-800">Advanced filters</h2><button onClick={() => { setFilters({ source: 'all', type: 'all', vendor: 'all', stock: 'all', barcode: 'all', minPrice: '', maxPrice: '', sort: 'name' }); setSearch(''); }} className="text-xs font-semibold text-indigo-600 hover:underline">Clear all</button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-gray-600">Source<select value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All sources</option><option value="shopify">Shopify</option><option value="manual">Manual</option></select></label>
          <label className="text-xs font-semibold text-gray-600">Product type<select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All types</option>{filterOptions.types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Vendor<select value={filters.vendor} onChange={(event) => setFilters((current) => ({ ...current, vendor: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">All vendors</option>{filterOptions.vendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Stock status<select value={filters.stock} onChange={(event) => setFilters((current) => ({ ...current, stock: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">Any stock</option><option value="in">In stock</option><option value="out">Out of stock</option></select></label>
          <label className="text-xs font-semibold text-gray-600">Barcode<select value={filters.barcode} onChange={(event) => setFilters((current) => ({ ...current, barcode: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="all">Any barcode</option><option value="has">Has barcode</option><option value="missing">Missing barcode</option></select></label>
          <label className="text-xs font-semibold text-gray-600">Minimum price (PKR)<input type="number" min="0" value={filters.minPrice} onChange={(event) => setFilters((current) => ({ ...current, minPrice: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" placeholder="No minimum" /></label>
          <label className="text-xs font-semibold text-gray-600">Maximum price (PKR)<input type="number" min="0" value={filters.maxPrice} onChange={(event) => setFilters((current) => ({ ...current, maxPrice: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" placeholder="No maximum" /></label>
          <label className="text-xs font-semibold text-gray-600">Sort by<select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"><option value="name">Name (A–Z)</option><option value="priceAsc">Price (low to high)</option><option value="priceDesc">Price (high to low)</option><option value="stockAsc">Stock (low to high)</option><option value="stockDesc">Stock (high to low)</option></select></label>
        </div>
      </section>}
      {!outlets.length && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Create an outlet before adding finished products. Shopify is optional for local products.</div>}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Product variant</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Sellable qty</th><th className="px-4 py-3">Barcode</th><th className="px-4 py-3">Source</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((variant) => {
              const isManual = variant.catalogSource === 'manual' || !variant.shopifyVariantId;
              return <tr key={variant._id}>
                <td className="px-4 py-3"><div className="flex items-center gap-3">{variant.product?.imageUrl && <img src={variant.product.imageUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />}<div><p className="font-semibold text-gray-900">{variantLabel(variant)}</p><p className="text-xs text-gray-500">{variant.product?.productType || variant.product?.vendor || 'Boutique product'}</p></div></div></td>
                <td className="px-4 py-3 font-medium text-gray-800">{variant.sku || '—'}</td>
                <td className="px-4 py-3 font-semibold text-indigo-700">{money(variant.price)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(variant.available) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{Number(variant.available || 0)} available</span></td>
                <td className="px-4 py-3">{barcodeEditId === variant._id ? <div className="flex min-w-[210px] items-center gap-1"><input autoFocus className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs" value={barcodeDraft} onChange={(event) => setBarcodeDraft(event.target.value)} placeholder="Enter barcode" /><button onClick={() => saveBarcode(variant._id)} className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50" aria-label="Save barcode"><Check size={15} /></button><button onClick={() => setBarcodeEditId('')} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Cancel barcode edit"><X size={15} /></button></div> : <div className="flex min-w-[210px] items-center justify-between gap-2"><span className="inline-flex items-center gap-1 text-xs text-gray-600"><Barcode size={12} />{variant.barcode || 'No barcode'}</span>{canManage && <button onClick={() => { setBarcodeEditId(variant._id); setBarcodeDraft(variant.barcode || ''); }} className="text-xs font-semibold text-indigo-600 hover:underline">Edit</button>}</div>}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isManual ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800'}`}>{isManual ? 'Manual' : 'Shopify'}</span></td>
              </tr>;
            })}
            {!loading && !filtered.length && <tr><td colSpan="6" className="px-4 py-12 text-center text-gray-500">{variants.length ? 'No variants match this search.' : 'No finished products yet. Add a manual product here, or connect Shopify and sync its catalog.'}</td></tr>}
          </tbody>
        </table></div>
        <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">Showing {filtered.length} variants{filtered.length !== variants.length ? ` of ${variants.length}` : ''}. Local stock updates through manufacturing and POS; Shopify-linked stock follows Shopify sync.</div>
      </div>
    </div>
  );
};

export default RetailInventory;
