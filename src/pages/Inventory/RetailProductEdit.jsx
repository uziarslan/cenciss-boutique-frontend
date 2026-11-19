import { useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router';
import { getRetailProduct, updateRetailProduct } from '../../api/shopifyApi';

const fieldClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500';

const RetailProductEdit = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getRetailProduct(productId)
      .then(({ data }) => {
        if (!active) return;
        const value = data?.data || {};
        setProduct(value.product);
        setForm({
          title: value.product?.title || '',
          description: value.product?.description || '',
          productType: value.product?.productType || '',
          vendor: value.product?.vendor || '',
          handle: value.product?.handle || '',
          tags: (value.product?.tags || []).join(', '),
          status: value.product?.status || 'active',
          variants: (value.variants || []).map((variant) => ({
            id: variant._id,
            title: variant.title || 'Default Title',
            sku: variant.sku || '',
            barcode: variant.barcode || '',
            price: String(variant.price ?? ''),
            compareAtPrice: variant.compareAtPrice == null ? '' : String(variant.compareAtPrice),
            unitCost: variant.unitCost == null ? '' : String(variant.unitCost),
            inventoryPolicy: variant.inventoryPolicy || 'DENY',
            tracked: variant.tracked !== false,
            options: (variant.options || []).map((option) => ({ name: option.name || '', value: option.value || '' })),
          })),
        });
      })
      .catch((error) => toast.error(error.response?.data?.message || 'Could not load this product.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId]);

  const updateVariant = (index, field, value) => setForm((current) => ({
    ...current,
    variants: current.variants.map((variant, row) => row === index ? { ...variant, [field]: value } : variant),
  }));

  const updateOption = (index, optionIndex, value) => setForm((current) => ({
    ...current,
    variants: current.variants.map((variant, row) => row === index ? {
      ...variant,
      options: variant.options.map((option, i) => i === optionIndex ? { ...option, value } : option),
    } : variant),
  }));

  const save = async (event) => {
    event.preventDefault();
    if (!form?.title.trim() || !form.variants.length || form.variants.some((variant) => !variant.title.trim() || variant.price === '' || Number(variant.price) < 0)) {
      return toast.error('Enter a product name and valid price for every variant.');
    }
    setSaving(true);
    try {
      await updateRetailProduct(productId, {
        ...form,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        variants: form.variants.map((variant) => ({
          ...variant,
          price: Number(variant.price),
          compareAtPrice: variant.compareAtPrice === '' ? null : Number(variant.compareAtPrice),
          unitCost: variant.unitCost === '' ? null : Number(variant.unitCost),
        })),
      });
      toast.success(product?.shopifyProductId ? 'Product saved. Shopify is updating in the background.' : 'Product saved.');
      navigate('/retail-inventory');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save this product.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-gray-500">Loading product…</div>;
  if (!form || !product) return <div className="space-y-4 py-8"><p className="text-sm text-gray-600">This product could not be found.</p><Link to="/retail-inventory" className="text-sm font-semibold text-indigo-700">Return to Finished Goods</Link></div>;

  return (
    <form id="retail-product-edit" onSubmit={save} className="mx-auto max-w-6xl space-y-5 px-1 py-5 pb-28">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link to="/retail-inventory" className="mt-0.5 rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50" aria-label="Back to Finished Goods"><ArrowLeft size={17} /></Link>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Finished Goods</p><h1 className="mt-1 text-xl font-extrabold text-gray-900">Edit product</h1><p className="mt-1 text-sm text-gray-500">{product.shopifyProductId ? 'Changes save to Shopify and refresh in this catalog.' : 'Changes save to the local catalog.'}</p></div>
        </div>
      </header>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div><h2 className="font-bold text-gray-900">Product details</h2><p className="mt-1 text-xs text-gray-500">Drafts appear in Finished Goods but are not sellable in POS.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-semibold text-gray-600">Product name<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={150} required className={fieldClass} /></label>
          <label className="text-xs font-semibold text-gray-600">Product type<input value={form.productType} onChange={(event) => setForm((current) => ({ ...current, productType: event.target.value }))} maxLength={80} className={fieldClass} /></label>
          <label className="text-xs font-semibold text-gray-600">Vendor / brand<input value={form.vendor} onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))} maxLength={120} className={fieldClass} /></label>
          <label className="text-xs font-semibold text-gray-600">Handle<input value={form.handle} onChange={(event) => setForm((current) => ({ ...current, handle: event.target.value }))} maxLength={255} className={fieldClass} /></label>
          <label className="text-xs font-semibold text-gray-600">Tags, comma separated<input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} className={fieldClass} /></label>
          <label className="text-xs font-semibold text-gray-600">Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={fieldClass}><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
          <label className="text-xs font-semibold text-gray-600 sm:col-span-2 lg:col-span-3">Description<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={5000} rows={4} className={fieldClass} /></label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div><h2 className="font-bold text-gray-900">Variants and barcodes</h2><p className="mt-1 text-xs text-gray-500">Prices and product details sync to Shopify. Stock quantities stay controlled by stock movements.</p></div>
        <div className="space-y-4">
          {form.variants.map((variant, index) => <article key={variant.id} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-gray-600">Variant / title<input value={variant.title} onChange={(event) => updateVariant(index, 'title', event.target.value)} maxLength={100} required className={fieldClass} /></label>
              <label className="text-xs font-semibold text-gray-600">SKU<input value={variant.sku} onChange={(event) => updateVariant(index, 'sku', event.target.value)} maxLength={100} className={fieldClass} /></label>
              <label className="text-xs font-semibold text-gray-600">Barcode<input value={variant.barcode} onChange={(event) => updateVariant(index, 'barcode', event.target.value)} maxLength={80} className={fieldClass} /></label>
              <label className="text-xs font-semibold text-gray-600">Price · PKR<input type="number" min="0" step="0.01" value={variant.price} onChange={(event) => updateVariant(index, 'price', event.target.value)} required className={fieldClass} /></label>
              <label className="text-xs font-semibold text-gray-600">Compare at · PKR<input type="number" min="0" step="0.01" value={variant.compareAtPrice} onChange={(event) => updateVariant(index, 'compareAtPrice', event.target.value)} className={fieldClass} /></label>
              <label className="text-xs font-semibold text-gray-600">Cost · PKR<input type="number" min="0" step="0.01" value={variant.unitCost} onChange={(event) => updateVariant(index, 'unitCost', event.target.value)} className={fieldClass} /></label>
              <label className="text-xs font-semibold text-gray-600">Out of stock selling<select value={variant.inventoryPolicy} onChange={(event) => updateVariant(index, 'inventoryPolicy', event.target.value)} className={fieldClass}><option value="DENY">Stop selling</option><option value="CONTINUE">Continue selling</option></select></label>
              <label className="flex items-center gap-2 self-end rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700"><input type="checkbox" checked={variant.tracked} onChange={(event) => updateVariant(index, 'tracked', event.target.checked)} />Track inventory</label>
            </div>
            {variant.options.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{variant.options.map((option, optionIndex) => <label key={`${option.name}-${optionIndex}`} className="text-xs font-semibold text-gray-600">{option.name || 'Option'}<input value={option.value} onChange={(event) => updateOption(index, optionIndex, event.target.value)} className={fieldClass} /></label>)}</div>}
          </article>)}
        </div>
      </section>
      {product.shopifyProductId && <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">Activating a product may make it available on its selected Shopify sales channels. Shopify edits require product write access.</p>}
      <footer className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] shadow-lg shadow-slate-900/10 backdrop-blur md:left-64 md:px-6">
        <Link to="/retail-inventory" className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</Link>
        <button type="submit" disabled={saving} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Save size={15} />{saving ? 'Saving…' : 'Save'}</button>
      </footer>
    </form>
  );
};

export default RetailProductEdit;
