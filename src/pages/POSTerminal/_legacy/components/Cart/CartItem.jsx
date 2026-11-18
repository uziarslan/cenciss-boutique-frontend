import { useState } from 'react';
import { LockKeyhole, Minus, Plus, Trash2, X } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  decrementQty,
  incrementQty,
  recordHeldItemCancellation,
  removeItem,
  setItemQty,
} from '../../store/slices/cartSlice';
import { computeItemAvailability } from '../../utils/posAvailability';
import NumPad from '../UI/NumPad';
import PreparationChoice from '../UI/PreparationChoice';
import { requiresKitchenCancellation, KDS_CANCELLATION_MESSAGE } from '../../utils/kdsCancellation';

const CartItem = ({ item, onCancel, onCancelLast, busy = false }) => {
  const dispatch = useDispatch();
  const [showQtyPad, setShowQtyPad] = useState(false);
  const [padValue, setPadValue] = useState('');
  const [pendingCancellation, setPendingCancellation] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [prepared, setPrepared] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const availabilityMap = useSelector((state) => state.menu.availability);
  const availability = availabilityMap?.[item.id];
  const cartItems = useSelector((state) => state.cart.items);
  const resumedMap = useSelector((state) => state.order.resumedItemQtyMap);
  const printedMap = useSelector((state) => state.order.resumedKitchenPrintedQtyMap) || {};
  const cashier = useSelector((state) => state.auth.cashier);
  const offlineHoldId = useSelector((state) => state.order.resumedFromOfflineId);
  const kds = useSelector((state) => state.order.resumedKds);
  const kitchenControlsCancellation = requiresKitchenCancellation(kds);
  const savedQty = Math.max(Number(resumedMap?.[item.lineKey]) || 0, Number(printedMap[item.lineKey]) || 0);
  const printedQty = Math.max(0, Number(printedMap[item.lineKey]) || 0);
  const canCancelSentItems = cashier?.role === 'owner'
    || cashier?.permissions?.['pos.cancelSentItem'] === true;
  const removeNeedsCancellation = printedQty > 0;
  const decrementNeedsCancellation = item.qty - 1 < printedQty;

  // Live shared-pool availability — how many MORE of THIS size can be added given
  // the WHOLE cart's consumption of the shared ingredients (across items too).
  const { perSize, itemAvailable, bottleneck } = computeItemAvailability(availability, cartItems, resumedMap, availabilityMap, item.id);
  const lineMakeable = item.variationId ? perSize[item.variationId]?.makeable : itemAvailable;
  const isUnlimited = lineMakeable == null;
  const remaining = isUnlimited ? Infinity : Math.max(0, lineMakeable); // how many MORE may be added
  const maxForLine = isUnlimited ? Infinity : item.qty + lineMakeable;  // largest total this line may hold
  const lineBottleneck = (item.variationId ? perSize[item.variationId]?.bottleneck : bottleneck) || availability?.bottleneck;

  const handleIncrement = () => {
    if (remaining <= 0) {
      toast.error(`Out of stock — ${lineBottleneck || item.name} is depleted`);
      return;
    }
    dispatch(incrementQty(item.lineKey));
  };

  const handleConfirmQty = () => {
    const parsed = parseInt(padValue, 10);
    if (!parsed || parsed <= 0) {
      setShowQtyPad(false);
      return;
    }
    if (!isUnlimited && parsed > maxForLine) {
      toast.error(`Only ${maxForLine} available`);
      return;
    }
    if (parsed < savedQty && kitchenControlsCancellation) {
      toast.error(KDS_CANCELLATION_MESSAGE);
      return;
    }
    if (parsed < printedQty && !canCancelSentItems) {
      toast.error('Cancel Kitchen-Sent Items permission is required to reduce items already sent to the kitchen.');
      return;
    }
    if (parsed < savedQty) {
      if (offlineHoldId) { toast.error('Sync this offline hold before cancelling saved items.'); return; }
      setPrepared(null);
      setShowQtyPad(false);
      setCancellationReason('');
      setPendingCancellation({ action: 'set', nextQty: parsed });
      return;
    }
    dispatch(setItemQty({ lineKey: item.lineKey, qty: parsed }));
    setShowQtyPad(false);
  };

  const handleRemove = () => {
    if (savedQty > 0 && kitchenControlsCancellation) { toast.error(KDS_CANCELLATION_MESSAGE); return; }
    if (removeNeedsCancellation && !canCancelSentItems) {
      toast.error('Cancel Kitchen-Sent Items permission is required to remove an item already sent to the kitchen.');
      return;
    }
    if (savedQty > 0) {
      if (offlineHoldId) { toast.error('Sync this offline hold before cancelling saved items.'); return; }
      if (cartItems.length === 1 && onCancelLast) { onCancelLast(); return; }
      setPrepared(null);
      setCancellationReason('');
      setPendingCancellation({ action: 'remove', nextQty: 0 });
      return;
    }
    dispatch(removeItem(item.lineKey));
  };

  const handleDecrement = () => {
    if (item.qty <= 1) return;
    if (item.qty - 1 < savedQty && kitchenControlsCancellation) { toast.error(KDS_CANCELLATION_MESSAGE); return; }
    if (decrementNeedsCancellation && !canCancelSentItems) {
      toast.error('Cancel Kitchen-Sent Items permission is required to reduce items already sent to the kitchen.');
      return;
    }
    if (item.qty - 1 < savedQty) {
      if (offlineHoldId) { toast.error('Sync this offline hold before cancelling saved items.'); return; }
      setPrepared(null);
      setCancellationReason('');
      setPendingCancellation({ action: 'decrement', nextQty: item.qty - 1 });
      return;
    }
    dispatch(decrementQty(item.lineKey));
  };

  const closeCancellation = () => {
    if (cancelling) return;
    setPrepared(null);
    setPendingCancellation(null);
    setCancellationReason('');
  };

  const confirmCancellation = async () => {
    const reason = cancellationReason.trim();
    if (reason.length < 3 || typeof prepared !== 'boolean' || !pendingCancellation || cancelling) return;
    if (kitchenControlsCancellation) { toast.error(KDS_CANCELLATION_MESSAGE); return; }
    setCancelling(true);
    try {
      const details = { lineKey: item.lineKey, reason, prepared };
      if (onCancel && !await onCancel({ ...details, nextQty: pendingCancellation.nextQty })) return;
      // The parent persists server holds before changing the visible cart.
      // Retain metadata for other callers and offline checkout recovery.
      if (!onCancel) dispatch(recordHeldItemCancellation(details));
      if (pendingCancellation.action === 'remove') dispatch(removeItem(item.lineKey));
      else dispatch(setItemQty({ lineKey: item.lineKey, qty: pendingCancellation.nextQty }));
      setPendingCancellation(null);
      setCancellationReason('');
      setPrepared(null);
    } finally {
      setCancelling(false);
    }
  };

  const openQtyPad = () => {
    setPadValue(String(item.qty));
    setShowQtyPad(true);
  };

  const confirmQty = handleConfirmQty;

  return (
    <div className="group rounded-xl border border-surface-100 bg-white p-3 transition-all duration-150 hover:shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-surface-800">
            {item.name}
            {item.variationName && (
              <span className="ml-1.5 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600 align-middle">{item.variationName}</span>
            )}
          </p>
          {item.dealSummary?.length > 0 && (
            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-violet-600">
              {item.dealSummary.join(' · ')}
            </p>
          )}
          <p className="mt-0.5 text-xs text-surface-400">PKR {item.unitPrice.toFixed(0)} each</p>
          {printedQty > 0 && (
            <p className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${canCancelSentItems ? 'text-rose-500' : 'text-amber-600'}`}>
              {canCancelSentItems ? 'Kitchen sent · cancellation controlled' : 'Kitchen sent · locked'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy || cancelling || (savedQty > 0 && kitchenControlsCancellation)}
          aria-disabled={removeNeedsCancellation && !canCancelSentItems}
          title={savedQty > 0 && kitchenControlsCancellation ? KDS_CANCELLATION_MESSAGE : removeNeedsCancellation
            ? (canCancelSentItems ? 'Cancel this sent item' : 'Cancel Kitchen-Sent Items permission required')
            : 'Remove item'}
          aria-label={removeNeedsCancellation ? `Cancel ${item.name}` : `Remove ${item.name}`}
          className={`rounded-lg p-1.5 transition-colors ${removeNeedsCancellation && !canCancelSentItems
            ? 'cursor-not-allowed text-surface-200'
            : 'text-surface-300 hover:bg-rose-50 hover:text-rose-500'}`}
        >
          {removeNeedsCancellation && !canCancelSentItems
            ? <LockKeyhole size={14} />
            : <Trash2 size={14} />}
        </button>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-lg border border-surface-200 bg-surface-50 p-0.5">
          <button
            type="button"
            onClick={handleDecrement}
            disabled={item.qty <= 1 || busy || cancelling || (item.qty - 1 < savedQty && kitchenControlsCancellation)}
            aria-disabled={decrementNeedsCancellation && !canCancelSentItems}
            title={item.qty - 1 < savedQty && kitchenControlsCancellation ? KDS_CANCELLATION_MESSAGE : decrementNeedsCancellation && !canCancelSentItems
              ? 'Cancel Kitchen-Sent Items permission required'
              : 'Decrease quantity'}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${decrementNeedsCancellation && !canCancelSentItems
              ? 'cursor-not-allowed text-surface-300'
              : 'text-surface-500 hover:bg-surface-200'}`}
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            onClick={openQtyPad}
            disabled={busy || cancelling}
            className="min-w-[36px] rounded-md bg-white px-2 py-1 text-sm font-bold text-surface-900 shadow-sm"
          >
            {item.qty}
          </button>
          <button
            type="button"
            onClick={handleIncrement}
            disabled={remaining <= 0 || busy || cancelling}
            className="flex h-7 w-7 items-center justify-center rounded-md text-surface-500 transition-colors hover:bg-surface-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={13} />
          </button>
        </div>
        <p className="text-sm font-bold text-brand-600">PKR {(item.qty * item.unitPrice).toFixed(0)}</p>
      </div>

      {showQtyPad && (
        <div className="fixed inset-0 z-50 flex items-end bg-surface-900/50 p-4 animate-fade-in">
          <div className="w-full rounded-2xl bg-white p-5 shadow-float animate-slide-up">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-surface-800">Set quantity — {item.name}</p>
              <button type="button" onClick={() => setShowQtyPad(false)} className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600">
                <X size={16} />
              </button>
            </div>

            {/* Current value display */}
            <div className="mb-4 flex items-center justify-center rounded-xl border border-surface-200 bg-surface-50 py-3">
              <span className="text-4xl font-bold tracking-widest text-surface-900">
                {padValue || '0'}
              </span>
            </div>

            <NumPad
              value={padValue}
              onChange={setPadValue}
              onConfirm={confirmQty}
              mode="qty"
              withKeyboard
            />
          </div>
        </div>
      )}

      {pendingCancellation && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`cancel-item-title-${item.lineKey}`}
        >
          <button
            type="button"
            aria-label="Close cancellation"
            className="absolute inset-0 bg-surface-900/55 backdrop-blur-sm"
            onClick={closeCancellation}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-float">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-rose-600">
              Saved item cancellation
            </p>
            <h3 id={`cancel-item-title-${item.lineKey}`} className="mt-1 text-base font-bold text-surface-900">
              Cancel {savedQty - pendingCancellation.nextQty}× {item.name}?
            </h3>
            <p className="mt-2 text-sm leading-5 text-surface-600">
              This quantity belongs to a saved order. The cancellation, preparation status and reason will be recorded against this order and your user account.
            </p>
            <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-surface-500" htmlFor={`cancel-item-reason-${item.lineKey}`}>
              Cancellation reason
            </label>
            <textarea
              id={`cancel-item-reason-${item.lineKey}`}
              autoFocus
              rows={3}
              maxLength={300}
              value={cancellationReason}
              disabled={cancelling}
              onChange={(event) => setCancellationReason(event.target.value)}
              placeholder="e.g. Customer changed the order"
              className="mt-1.5 w-full resize-none rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-surface-900 placeholder:text-surface-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
            />
            {kitchenControlsCancellation && <p className="mt-3 text-sm font-semibold text-amber-700">{KDS_CANCELLATION_MESSAGE}</p>}
            <PreparationChoice value={prepared} onChange={setPrepared} disabled={cancelling || kitchenControlsCancellation} />
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={closeCancellation} disabled={cancelling} className="btn-secondary flex-1 py-2.5">
                Keep item
              </button>
              <button
                type="button"
                onClick={confirmCancellation}
                disabled={cancelling || kitchenControlsCancellation || cancellationReason.trim().length < 3 || prepared === null}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Confirm cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartItem;
