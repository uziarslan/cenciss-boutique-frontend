import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { AlertTriangle, Calculator, Lock, Receipt, UtensilsCrossed, X } from 'lucide-react';
import Portal from '../../components/UI/Portal';
import { reportQueryOpts, useGetCogsItemDetailQuery } from '../../store/baseApi';
import { fmt } from './ReportShared';

const quantity = (value) => Number(value || 0).toLocaleString('en-PK', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

const costSourceLabel = {
  weightedAveragePurchase: 'Weighted-average purchase cost',
  prepRecipe: 'Rolled-up prep recipe cost',
  vendorFallback: 'Vendor price fallback',
  catalogFallback: 'Catalog price fallback',
  missing: 'No purchase cost recorded',
};

const SummaryCard = ({ label, value, tone = 'slate' }) => {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  };
  return (
    <div className={clsx('rounded-xl border px-3 py-2.5', tones[tone])}>
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
};

const IngredientRow = ({ ingredient }) => {
  const purchase = ingredient.latestPurchase;
  return (
    <div className="space-y-2 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold text-slate-800">{ingredient.name}</p>
            {ingredient.kind === 'prep' && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Prep</span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {[ingredient.sku, ingredient.category].filter(Boolean).join(' · ')}
          </p>
        </div>
        <p className="shrink-0 font-bold tabular-nums text-slate-900">Rs. {fmt(ingredient.cost)}</p>
      </div>

      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <div className="flex items-center justify-between gap-3">
          <span>Recipe quantity</span>
          <span className="font-semibold tabular-nums text-slate-800">{quantity(ingredient.recipeQty)} {ingredient.recipeUnit}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span>Purchase-cost quantity</span>
          <span className="font-semibold tabular-nums text-slate-800">{quantity(ingredient.purchaseQty)} {ingredient.purchaseUnit}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-1">
          <span>Cost used</span>
          <span className="font-semibold tabular-nums text-slate-800">Rs. {fmt(ingredient.unitCost)} / {ingredient.purchaseUnit}</span>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-slate-500">
        <Calculator size={12} className="mt-0.5 shrink-0 text-indigo-400" />
        <span>{costSourceLabel[ingredient.costSource] || 'Current ingredient cost'}</span>
      </div>

      {!ingredient.unitsConverted && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Recipe and purchase units could not be converted, so the report used a 1:1 fallback.
        </div>
      )}

      {purchase && ingredient.kind !== 'prep' && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-[11px] text-slate-500">
          <Receipt size={12} className="mt-0.5 shrink-0 text-slate-400" />
          <div>
            <p>
              Latest purchase <span className="font-semibold text-slate-700">{purchase.purchaseNumber || 'Purchase'}</span>
              {purchase.vendorName ? ` · ${purchase.vendorName}` : ''}
            </p>
            <p className="mt-0.5">
              {purchase.purchaseDate ? format(new Date(purchase.purchaseDate), 'dd MMM yyyy') : 'Date unavailable'}
              {' · '}Rs. {fmt(purchase.unitCost)} / {ingredient.purchaseUnit}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const RecipeSection = ({ recipe, showSize }) => {
  const foodCostTone = recipe.foodCostPct > 35 ? 'rose' : recipe.foodCostPct > 28 ? 'amber' : 'emerald';
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">
              {showSize ? 'Size recipe' : 'Recipe cost per serving'}
            </p>
            {showSize && <h3 className="mt-0.5 font-bold text-slate-900">{recipe.variationName || 'Standard'}</h3>}
          </div>
          <span className="text-sm font-bold tabular-nums text-slate-900">Rs. {fmt(recipe.recipeCost)}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <SummaryCard label="Recipe cost" value={`Rs. ${fmt(recipe.recipeCost)}`} tone="indigo" />
          <SummaryCard label="Menu price" value={`Rs. ${fmt(recipe.price)}`} />
          <SummaryCard label="Food cost" value={recipe.price > 0 && recipe.hasRecipe ? `${Number(recipe.foodCostPct || 0).toFixed(1)}%` : '—'} tone={foodCostTone} />
        </div>
      </div>

      {recipe.ingredients?.length ? (
        <div className="divide-y divide-slate-100">
          {recipe.ingredients.map((ingredient, index) => (
            <IngredientRow key={`${ingredient.productId || ingredient.name}-${index}`} ingredient={ingredient} />
          ))}
          <div className="flex items-center justify-between bg-slate-50 px-4 py-3 text-sm">
            <span className="font-semibold text-slate-600">Total ingredient cost</span>
            <span className="font-bold tabular-nums text-slate-900">Rs. {fmt(recipe.recipeCost)}</span>
          </div>
        </div>
      ) : (
        <div className="px-4 py-10 text-center">
          <UtensilsCrossed size={22} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">No recipe has been added for this item.</p>
        </div>
      )}
    </section>
  );
};

const COGSItemCostDrawer = ({ selection, outlet, onClose }) => {
  const open = Boolean(selection);
  const [lastSelection, setLastSelection] = useState(selection);

  useEffect(() => {
    if (selection) setLastSelection(selection);
  }, [selection]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const activeSelection = selection || lastSelection;
  const params = useMemo(() => activeSelection ? {
    itemId: activeSelection.id,
    variationId: activeSelection.variationId || undefined,
    outlet: outlet || undefined,
  } : null, [activeSelection, outlet]);

  const { data, isLoading, isError, error } = useGetCogsItemDetailQuery(params, {
    skip: !params,
    ...reportQueryOpts,
  });

  const subtitle = activeSelection?.variationName
    ? `${activeSelection.variationName} · purchase-based recipe costing`
    : 'Purchase-based recipe costing';

  return (
    <Portal>
      <div
        onClick={onClose}
        className={clsx(
          'fixed inset-0 z-[60] bg-black/30 transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu item ingredient cost breakdown"
        aria-hidden={!open}
        className={clsx(
          'safe-area-drawer fixed right-0 top-0 z-[70] flex h-full w-full max-w-xl flex-col bg-white shadow-2xl',
          'transition-transform duration-300 ease-out will-change-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-500">
              <UtensilsCrossed size={12} /> Ingredient cost breakdown
            </p>
            <h2 className="mt-0.5 truncate text-lg font-bold text-slate-900">{activeSelection?.name || 'Menu item'}</h2>
            <p className="mt-0.5 truncate text-xs text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close ingredient cost breakdown"
          >
            <X size={18} />
          </button>
        </header>

        <div className="border-b border-indigo-100 bg-indigo-50/60 px-5 py-3 text-xs leading-5 text-indigo-700">
          Ingredient cost = recipe quantity converted to the product unit × current weighted-average purchase cost.
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 px-5 py-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)
          ) : isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-center">
              <AlertTriangle size={22} className="mx-auto text-rose-400" />
              <p className="mt-2 text-sm font-semibold text-rose-700">Could not load this cost breakdown.</p>
              <p className="mt-1 text-xs text-rose-500">{error?.data?.message || 'Please close the drawer and try again.'}</p>
            </div>
          ) : data?.recipeLocked ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
              <Lock size={24} className="mx-auto text-amber-500" />
              <p className="mt-2 text-sm font-semibold text-amber-800">This recipe is password protected.</p>
              <p className="mt-1 text-xs leading-5 text-amber-600">Unlock it from Menu Management before viewing its ingredient composition.</p>
            </div>
          ) : data?.recipes?.length ? (
            data.recipes.map((recipe, index) => (
              <RecipeSection
                key={recipe.variationId || index}
                recipe={recipe}
                showSize={data.recipes.length > 1 || Boolean(recipe.variationName)}
              />
            ))
          ) : (
            <div className="py-16 text-center text-sm text-slate-400">No recipe cost information is available.</div>
          )}
        </div>
      </aside>
    </Portal>
  );
};

export default COGSItemCostDrawer;
