import { useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { AlertTriangle, Calculator, FlaskConical, Lock, Receipt, X } from 'lucide-react';
import Portal from '../../components/UI/Portal';
import { convertQty } from '../../utils/units';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const quantity = (value) => Number(value || 0).toLocaleString('en-PK', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

const idOf = (value) => String(value?._id ?? value ?? '');

const resolveCost = (product) => {
  if ((Number(product?.currentPrice) || 0) > 0) {
    return {
      unitCost: Number(product.currentPrice),
      source: product.kind === 'prep' ? 'Rolled-up prep recipe cost' : 'Weighted-average purchase cost',
    };
  }
  if ((Number(product?.vendors?.[0]?.currentPrice) || 0) > 0) {
    return { unitCost: Number(product.vendors[0].currentPrice), source: 'Vendor price fallback' };
  }
  if ((Number(product?.defaultPrice) || 0) > 0) {
    return { unitCost: Number(product.defaultPrice), source: 'Catalog price fallback' };
  }
  return { unitCost: 0, source: 'No purchase cost recorded' };
};

const latestPurchaseFor = (product) => {
  const entries = (product?.priceHistory || [])
    .filter((entry) => ['purchase', 'purchaseAdjustment'].includes(entry.source) && Number(entry.price) > 0)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const latest = entries[0];
  if (!latest) return null;
  const vendor = (product?.vendors || []).find((entry) => idOf(entry.vendorId) === idOf(latest.vendorId));
  return {
    date: latest.date,
    unitCost: Number(latest.price) || 0,
    vendorName: latest.vendorId?.name || vendor?.vendorId?.name || '',
    purchaseNumber: latest.purchase?.purchaseNumber || '',
    corrected: latest.source === 'purchaseAdjustment',
  };
};

const SummaryCard = ({ label, value, tone = 'slate' }) => {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  };
  return (
    <div className={clsx('rounded-xl border px-3 py-2.5', tones[tone])}>
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
};

const IngredientRow = ({ ingredient }) => (
  <div className="space-y-2 px-4 py-3.5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-semibold text-slate-800">{ingredient.name}</p>
          {ingredient.kind === 'prep' && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Prep</span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-400">{[ingredient.sku, ingredient.category].filter(Boolean).join(' · ')}</p>
      </div>
      <p className="shrink-0 font-bold tabular-nums text-slate-900">{money(ingredient.cost)}</p>
    </div>

    <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <div className="flex items-center justify-between gap-3">
        <span>Batch quantity</span>
        <span className="font-semibold tabular-nums text-slate-800">{quantity(ingredient.recipeQty)} {ingredient.recipeUnit}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span>Purchase-cost quantity</span>
        <span className="font-semibold tabular-nums text-slate-800">{quantity(ingredient.purchaseQty)} {ingredient.purchaseUnit}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-1">
        <span>Cost used</span>
        <span className="font-semibold tabular-nums text-slate-800">{money(ingredient.unitCost)} / {ingredient.purchaseUnit}</span>
      </div>
    </div>

    <div className="flex items-start gap-2 text-[11px] text-slate-500">
      <Calculator size={12} className="mt-0.5 shrink-0 text-indigo-400" />
      <span>{ingredient.costSource}</span>
    </div>

    {!ingredient.unitsConverted && (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        Batch and purchase units could not be converted, so the cost uses a 1:1 fallback.
      </div>
    )}

    {ingredient.latestPurchase && ingredient.kind !== 'prep' && (
      <div className="flex items-start gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-[11px] text-slate-500">
        <Receipt size={12} className="mt-0.5 shrink-0 text-slate-400" />
        <div>
          <p>
            Latest {ingredient.latestPurchase.corrected ? 'purchase correction' : 'purchase'}
            {ingredient.latestPurchase.purchaseNumber ? ` ${ingredient.latestPurchase.purchaseNumber}` : ''}
            {ingredient.latestPurchase.vendorName ? ` · ${ingredient.latestPurchase.vendorName}` : ''}
          </p>
          <p className="mt-0.5">
            {ingredient.latestPurchase.date ? format(new Date(ingredient.latestPurchase.date), 'dd MMM yyyy') : 'Date unavailable'}
            {' · '}{money(ingredient.latestPurchase.unitCost)} / {ingredient.purchaseUnit}
          </p>
        </div>
      </div>
    )}
  </div>
);

const PrepRecipeCostDrawer = ({ prep, products = [], onClose }) => {
  const open = Boolean(prep);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const ingredients = useMemo(() => {
    const productMap = new Map((products || []).map((product) => [idOf(product), product]));
    return (prep?.ingredients || []).map((entry) => {
      const ingredientProduct = entry.product || {};
      const product = productMap.get(idOf(ingredientProduct)) || ingredientProduct;
      const productUnit = product.unit || entry.unit;
      const converted = convertQty(entry.qty, entry.unit, productUnit);
      const { unitCost, source } = resolveCost(product);
      return {
        productId: idOf(product),
        name: product.name || ingredientProduct.name || 'Ingredient',
        sku: product.sku || ingredientProduct.sku || '',
        category: product.category || '',
        kind: product.kind || ingredientProduct.kind || 'standard',
        recipeQty: Number(entry.qty) || 0,
        recipeUnit: entry.unit,
        purchaseQty: Number(converted.qty) || 0,
        purchaseUnit: productUnit,
        unitsConverted: converted.converted,
        unitCost,
        costSource: source,
        cost: (Number(converted.qty) || 0) * unitCost,
        latestPurchase: latestPurchaseFor(product),
      };
    });
  }, [prep, products]);

  const calculatedBatchCost = ingredients.reduce((sum, ingredient) => sum + ingredient.cost, 0);
  const batchCost = ingredients.length ? calculatedBatchCost : Number(prep?.costPerBatch || 0);
  const costPerUnit = Number(prep?.yieldQty) > 0 ? batchCost / Number(prep.yieldQty) : Number(prep?.costPerUnit || 0);

  return (
    <Portal>
      <div
        onClick={onClose}
        className={clsx('fixed inset-0 z-[60] bg-black/30 transition-opacity duration-300', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Prep recipe ingredient cost breakdown"
        aria-hidden={!open}
        className={clsx(
          'safe-area-drawer fixed right-0 top-0 z-[70] flex h-full w-full max-w-xl flex-col bg-white shadow-2xl',
          'transition-transform duration-300 ease-out will-change-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-600">
              <FlaskConical size={12} /> Prep cost breakdown
            </p>
            <h2 className="mt-0.5 truncate text-lg font-bold text-slate-900">{prep?.name || 'Prep recipe'}</h2>
            <p className="mt-0.5 truncate text-xs text-slate-400">{prep?.category || 'Prep'} · ingredient cost per batch</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close prep recipe cost breakdown"
          >
            <X size={18} />
          </button>
        </header>

        <div className="border-b border-amber-100 bg-amber-50/60 px-5 py-3 text-xs leading-5 text-amber-800">
          Ingredient cost = batch quantity converted to the product unit × current weighted-average purchase cost.
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 px-5 py-4">
          {prep && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryCard label="Batch yield" value={`${quantity(prep.yieldQty)} ${prep.yieldUnit}`} tone="amber" />
                <SummaryCard label="Batch cost" value={money(batchCost)} tone="indigo" />
                <SummaryCard label="Cost / unit" value={`${money(costPerUnit)} / ${prep.yieldUnit}`} />
                <SummaryCard
                  label="On hand"
                  value={`${quantity(prep.qtyOnHand)} ${prep.yieldUnit}`}
                  tone={Number(prep.qtyOnHand || 0) > 0 ? 'emerald' : 'rose'}
                />
              </div>

              {prep.locked && !ingredients.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
                  <Lock size={24} className="mx-auto text-amber-500" />
                  <p className="mt-2 text-sm font-semibold text-amber-800">This prep recipe is password protected.</p>
                </div>
              ) : ingredients.length ? (
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Batch ingredients</p>
                      <p className="mt-0.5 text-xs text-slate-400">{ingredients.length} ingredient{ingredients.length === 1 ? '' : 's'}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-slate-900">{money(batchCost)}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {ingredients.map((ingredient, index) => (
                      <IngredientRow key={`${ingredient.productId || ingredient.name}-${index}`} ingredient={ingredient} />
                    ))}
                    <div className="flex items-center justify-between bg-slate-50 px-4 py-3 text-sm">
                      <span className="font-semibold text-slate-600">Total batch ingredient cost</span>
                      <span className="font-bold tabular-nums text-slate-900">{money(batchCost)}</span>
                    </div>
                  </div>
                </section>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
                  <FlaskConical size={22} className="mx-auto text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-500">No ingredients have been added to this prep recipe.</p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </Portal>
  );
};

export default PrepRecipeCostDrawer;
