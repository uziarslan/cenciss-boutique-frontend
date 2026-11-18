import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Plus, AlertTriangle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { addItem } from '../../store/slices/cartSlice';
import { computeItemAvailability } from '../../utils/posAvailability';
import DealChoiceModal from './DealChoiceModal';
import { resolveClientDeal } from '../../utils/dealPricing';

const MenuItemTile = ({ item }) => {
  const dispatch = useDispatch();
  const [showSizes, setShowSizes] = useState(false);
  const [showDealChoices, setShowDealChoices] = useState(false);
  const orderType = useSelector((state) => state.order.orderType || 'dine-in');

  // Sizes (Small/Medium/Large…). When present, a size MUST be chosen before the
  // line can be added — so tapping opens a picker instead of adding directly.
  const variations = Array.isArray(item.variations) ? item.variations : [];
  const hasVariations = variations.length > 0;
  const isDeal = item.itemType === 'deal';
  const effectivePrice = (source) => Number(
    orderType === 'foodpanda' && source?.foodPandaPrice != null
      ? source.foodPandaPrice
      : source?.price ?? 0,
  );
  const variationPrices = variations.map(effectivePrice);
  const minPrice = hasVariations ? Math.min(...variationPrices) : effectivePrice(item);
  const maxPrice = hasVariations ? Math.max(...variationPrices) : effectivePrice(item);

  // Realtime availability — driven by recipe + current stock. Subtract whatever
  // is already in the cart so the cashier sees an honest "left" count without
  // a round-trip on every click. Sum ALL size lines of this item.
  const availabilityMap = useSelector((state) => state.menu.availability);
  const info = availabilityMap?.[item._id] || availabilityMap?.[item.id];
  const cartItems = useSelector((state) => state.cart.items);
  const queuedItems = useSelector((state) => (
    [...(state.offline?.queue || []), ...(state.offline?.holdQueue || [])].flatMap((entry) =>
      (entry.items || []).map((line) => ({
        id: String(line.menuItemId || line.menuItem || line.id || ''),
        variationId: line.variationId ?? line.variation?.id ?? null,
        lineKey: `offline:${entry.clientTransactionId}:${line.menuItemId || line.menuItem || line.id}:${line.variationId || ''}`,
        qty: line.qty || 0,
      }))
    )
  ));
  const resumedMap = useSelector((state) => state.order.resumedItemQtyMap);
  const taxConfig = useSelector((state) => state.taxConfig);

  // Menu-item rates are legacy eligibility flags. The actual percentages are
  // centrally configured per outlet in Tax & PRA and are the same values used
  // by the cart. Never display the stale percentage stored on the menu item.
  const taxRate = item.taxRate > 0 ? Number(taxConfig?.standardRate || 0) : 0;
  const serviceChargeTypes = Array.isArray(taxConfig?.serviceChargeOrderTypes)
    ? taxConfig.serviceChargeOrderTypes
    : ['dine-in'];
  const serviceChargeRate = serviceChargeTypes.includes(orderType)
    ? Number(taxConfig?.serviceChargeRate || 0)
    : 0;

  // Live, cart-aware availability — models the shared ingredient pool across the
  // WHOLE cart so adding any size (or any other item that uses the same stock)
  // lowers this item's counts, and surfaces the limiting ingredient.
  const { itemAvailable, perSize, bottleneck } = computeItemAvailability(
    info,
    [...cartItems, ...queuedItems],
    resumedMap,
    availabilityMap,
    item._id || item.id,
  );
  const isUnlimited = itemAvailable == null;
  const remaining = isUnlimited ? null : itemAvailable; // already accounts for the cart
  const missingRecipe = info?.missingRecipe === true;

  const isUnavailableFlag = item.isAvailable === false;
  // A sized item is only "out" when EVERY size is depleted, so a still-orderable
  // size never disables the whole tile. Single-price items are out at 0.
  const allSizesOut = hasVariations && variations.length > 0 && variations.every((v) => {
    const m = perSize[v._id]?.makeable;
    return m != null && m <= 0;
  });
  const isOut = hasVariations ? allSizesOut : (!isUnlimited && remaining <= 0);
  const disabled = isUnavailableFlag || isOut;

  const handleClick = () => {
    if (isUnavailableFlag) return;
    if (isOut) {
      toast.error(`Out of stock — ${bottleneck || info?.bottleneck || item.name} is depleted`);
      return;
    }
    if (isDeal) {
      if ((item.dealConfig?.choiceGroups || []).length) {
        setShowDealChoices(true);
        return;
      }
      const resolved = resolveClientDeal(item, []);
      if (!resolved.ok) {
        toast.error(resolved.message);
        return;
      }
      dispatch(addItem({
        ...item,
        price: effectivePrice(item) + resolved.priceAdjustment,
        ...resolved,
      }));
      toast.success(`${item.name} added`);
      return;
    }
    if (hasVariations) {
      setShowSizes(true);
      return;
    }
    dispatch(addItem({ ...item, price: effectivePrice(item) }));
  };

  const pickSize = (variation) => {
    dispatch(addItem({ ...item, variation: { ...variation, price: effectivePrice(variation) } }));
    setShowSizes(false);
    toast.success(`${item.name} (${variation.name}) added`);
  };

  const addDeal = (resolved) => {
    dispatch(addItem({
      ...item,
      price: effectivePrice(item) + resolved.priceAdjustment,
      ...resolved,
    }));
    setShowDealChoices(false);
    toast.success(`${item.name} added`);
  };

  // Pick badge tone: red when 0, amber when low (<=5), neutral otherwise
  const badge = (() => {
    if (isUnavailableFlag) return null;
    if (missingRecipe) {
      return { label: 'No recipe', cls: 'bg-amber-100 text-amber-700 ring-amber-200', Icon: AlertTriangle };
    }
    if (isUnlimited) return null;
    if (isOut) return { label: 'Out', cls: 'bg-rose-100 text-rose-700 ring-rose-200' };
    // Best-case count is used up but a size is still orderable — show no count
    // rather than a misleading "Out" while the tile stays clickable.
    if (remaining === 0) return null;
    if (remaining <= 5) return { label: `${remaining} left`, cls: 'bg-amber-100 text-amber-700 ring-amber-200' };
    return { label: `${remaining} left`, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
  })();

  const chipCls = (m) => (m <= 0
    ? 'bg-rose-100 text-rose-700 ring-rose-200'
    : m <= 5
      ? 'bg-amber-100 text-amber-700 ring-amber-200'
      : 'bg-emerald-50 text-emerald-700 ring-emerald-200');

  return (
    <>
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`group relative flex min-h-[110px] flex-col justify-between rounded-2xl border p-4 text-left transition-all duration-200 ${
        disabled
          ? 'cursor-not-allowed border-surface-200 bg-surface-100 opacity-60'
          : 'border-surface-200 bg-white shadow-card hover:border-brand-300 hover:shadow-card-hover active:scale-[0.97]'
      }`}
    >
      {!disabled && (
        <div className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-500 opacity-0 transition-all duration-200 group-hover:opacity-100">
          <Plus size={14} strokeWidth={2.5} />
        </div>
      )}
      {item.imageUrl && (
        <div className="mb-3 overflow-hidden rounded-xl bg-surface-100">
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className="h-24 w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        </div>
      )}
      <div className="pr-8">
        <h3 className="text-sm font-semibold leading-snug text-surface-800">{item.name}</h3>
        {isDeal && <span className="mt-1.5 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200">Deal</span>}
        {/* A single-price item's stock belongs on its card. Sized-item counts are
            rendered beside their respective options in the variation modal. */}
        {!hasVariations && badge && (
          <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${badge.cls}`}>
            {badge.Icon && <badge.Icon size={10} />}
            {badge.label}
          </span>
        )}
      </div>
      <div className="mt-3">
        <span className="block text-base font-bold text-brand-600">
          {hasVariations
            ? (minPrice === maxPrice ? `PKR ${minPrice.toFixed(0)}` : `PKR ${minPrice.toFixed(0)}–${maxPrice.toFixed(0)}`)
            : `PKR ${effectivePrice(item).toFixed(0)}`}
        </span>
        {(taxRate > 0 || serviceChargeRate > 0) && (
          <div className="mt-1 flex items-center gap-3 text-[10px] font-medium text-surface-400">
            {item.priceMode === 'inclusive' ? (
              <span>Tax &amp; service included</span>
            ) : (
              <>
                {taxRate > 0 && <span>+{taxRate}% tax</span>}
                {serviceChargeRate > 0 && <span>+{serviceChargeRate}% svc</span>}
              </>
            )}
          </div>
        )}
      </div>
      {isUnavailableFlag && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70">
          <span className="rounded-full bg-surface-200 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-surface-500">Unavailable</span>
        </div>
      )}
      {isOut && !isUnavailableFlag && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80">
          <span className="rounded-full bg-rose-500 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">Out of stock</span>
        </div>
      )}
    </button>

    {/* Size picker — shown when an item has variations */}
    {showSizes && createPortal(
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-surface-900/50 p-4 sm:items-center animate-fade-in"
        onClick={(e) => { if (e.target === e.currentTarget) setShowSizes(false); }}
      >
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-float animate-slide-up">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-bold text-surface-800">Choose a size — {item.name}</p>
            <button type="button" onClick={() => setShowSizes(false)} className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-2">
            {variations.map((v) => {
              // Live per-size count from the shared pool (already accounts for the
              // cart). null = unlimited (untracked / no recipe).
              const ps = perSize[v._id] || {};
              const sizeMakeable = ps.makeable; // number | null | undefined
              const sizeUnlimited = sizeMakeable == null;
              const sizeOut = !sizeUnlimited && sizeMakeable <= 0;
              return (
                <button
                  key={v._id}
                  type="button"
                  onClick={() => pickSize(v)}
                  disabled={sizeOut}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                    sizeOut
                      ? 'cursor-not-allowed border-surface-200 bg-surface-100 opacity-60'
                      : 'border-surface-200 bg-white hover:border-brand-300 hover:bg-brand-50 active:scale-[0.98]'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-surface-800">{v.name}</span>
                    {!sizeUnlimited && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${chipCls(sizeMakeable)}`}>
                        {sizeOut
                          ? `Out${ps.bottleneck ? ` · ${ps.bottleneck}` : ''}`
                          : `${sizeMakeable} left`}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-bold text-brand-600">PKR {effectivePrice(v).toFixed(0)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>,
      document.body,
    )}
    {showDealChoices && (
      <DealChoiceModal
        item={item}
        basePrice={effectivePrice(item)}
        onClose={() => setShowDealChoices(false)}
        onConfirm={addDeal}
      />
    )}
    </>
  );
};

export default MenuItemTile;
