import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { Pause, X, Play, Trash2, Hash, Clock, ShoppingBag, UtensilsCrossed, Bike, WifiOff, ArrowRightLeft, Minus, Plus, Printer, UserPlus, TabletSmartphone, Store, Phone, Ban, ChevronDown, ChevronUp, Banknote, CreditCard, RefreshCw, NotebookPen, CheckCircle2, Search } from 'lucide-react';
import FloatingSelect from '../../../../../components/UI/FloatingSelect';
import { acknowledgeKdsReady, getHeldOrders, getOrderWastePreview, resumeHeldOrder, cancelHeldOrder, moveHeldOrderItem } from '../../api/sessionApi';
import { buildMenuRateLookup, loadHeldOrder, syncMenuRates } from '../../store/slices/cartSlice';
import {
  setOrderType,
  setFoodPandaOrderNumber,
  setFoodPandaCustomerName,
  setCustomer,
  setDeliveryAddress,
  setTableNumber,
  setResumedFromHoldId,
  setResumedFromOfflineId,
  setResumedItemQtyMap,
  setResumedKitchenPrintedQtyMap,
  setRedeemPoints,
  resetOrder,
} from '../../store/slices/orderSlice';
import { moveOfflineHoldItem } from '../../store/slices/offlineSlice';
import { fetchMenuAvailability } from '../../store/slices/menuSlice';
import useSession from '../../hooks/useSession';
import Spinner from '../UI/Spinner';
import useOfflineQueue from '../../hooks/useOfflineQueue';
import { requiresKitchenCancellation, KDS_CANCELLATION_MESSAGE } from '../../utils/kdsCancellation';
import { useReceiptPrint } from '../Print/ReceiptPrintProvider';
import AssignRiderModal from '../Deliveries/AssignRiderModal';
import { getSupersededServerHoldIds } from '../../utils/offlineQueue';
import {
  getCachedHeldOrders,
  HELD_ORDERS_CACHE_EVENT,
  isHeldOrdersCacheKey,
  removeCachedHeldOrder,
  setCachedHeldOrders,
  upsertCachedHeldOrder,
} from '../../utils/heldOrdersCache';
import { getQrSocket, getPosTenantSlug, joinCashierRoom, joinOrderRoom } from '../../utils/qrSocket';
import { calculateLineCharges } from '../../utils/chargeInclusivePricing';
import { hasEffectivePermission } from '../../../../../config/permissions';
import { buildHeldBillPreview, heldBillRate } from '../../utils/heldBillPreview';
import {
  buildWasteSelection,
  calculateWasteValues,
  preferredWasteValuation,
} from '../../utils/wasteValuation';
import { heldOrderMatchesSearch } from '../../utils/heldOrderSearch';
import { dealSelectionSignature } from '../../utils/dealPricing';
import {
  buildItemQuantityMap,
  kitchenLineKey,
  lineMenuId,
  lineVariationId,
  normalizePrintedQuantityMap,
  transferPrintedQuantity,
} from '../../utils/kitchenPrintedQuantity';

const ORDER_TYPE = {
  'dine-in': { label: 'Dine-In', Icon: UtensilsCrossed, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  takeaway:  { label: 'Takeaway', Icon: ShoppingBag,    cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  foodpanda: { label: 'Foodpanda', Icon: Store,          cls: 'bg-pink-50 text-pink-700 ring-pink-200' },
  delivery:  { label: 'Delivery', Icon: Bike,           cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
};

const formatPKR = (v) => `PKR ${Number(v || 0).toFixed(0)}`;
const formatWastePKR = (v) => `PKR ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const heldByLabel = (order) => order?.cashier?.name || order?.cashier?.email || 'Unknown cashier';

export const HeldCashierNote = ({ note }) => {
  const normalized = String(note || '').trim();
  if (!normalized) return null;
  return (
    <div
      className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-2.5 py-2"
      aria-label="Cashier note"
    >
      <div className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-indigo-600">
        <NotebookPen size={11} /> Cashier note
        <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[8px] text-indigo-500 ring-1 ring-indigo-100">Private</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs font-semibold leading-4 text-surface-700">
        {normalized}
      </p>
    </div>
  );
};

// A line is identified by item AND size, so two sizes of one item are distinct.
const sameLine = (it, menuItemId, variationId, dealSelections = []) =>
  lineMenuId(it) === String(menuItemId)
  && (lineVariationId(it) ?? null) === (variationId ?? null)
  && dealSelectionSignature(it.dealSelections || []) === dealSelectionSignature(dealSelections);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Resolve the central service-charge rate that applies to a held order, given the
// outlet tax config and the order's type (mirrors the server).
const heldServiceChargeRate = (order, taxConfig) => {
  const types = Array.isArray(taxConfig?.serviceChargeOrderTypes) ? taxConfig.serviceChargeOrderTypes : ['dine-in'];
  return types.includes(order.orderType || 'dine-in') ? Number(taxConfig?.serviceChargeRate || 0) : 0;
};

// Recompute a (server) held order's line + header totals from its stored prices.
// Mirrors the backend recompute so the optimistic local copy matches the server.
const recomputeOrder = (order, taxConfig) => {
  const scRate = heldServiceChargeRate(order, taxConfig);
  const items = (order.items || []).map((it) => {
    const priced = calculateLineCharges({
      listedUnitPrice: it.listedUnitPrice ?? it.unitPrice,
      qty: it.qty,
      priceMode: it.priceMode,
      taxable: order.orderType !== 'foodpanda' && Number(it.taxRate || 0) > 0,
      taxRate: order.orderType === 'foodpanda' ? 0 : Number(it.taxRate || 0),
      serviceChargeRate: scRate,
    });
    return {
      ...it,
      ...priced,
      serviceChargeRate: scRate,
      serviceChargeAmount: priced.serviceChargeAmount,
    };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const tax = round2(items.reduce((s, i) => s + (i.taxAmount || 0), 0));
  const serviceCharge = round2(items.reduce((s, i) => s + (i.serviceChargeAmount || 0), 0));
  const itemDisc = round2(items.reduce((s, i) => s + (i.discountAmount || 0), 0));
  let orderDisc;
  if (order.orderType === 'foodpanda') {
    items.forEach((item) => { item.discountAmount = 0; });
    orderDisc = 0;
  } else if (order.discountMode === 'percent') {
    orderDisc = round2(subtotal * ((order.discountPercent || 0) / 100));
  } else {
    const prev = Math.max(0, round2((order.discountAmount || 0) - itemDisc));
    orderDisc = Math.max(0, Math.min(prev, round2(subtotal + tax + serviceCharge - itemDisc)));
  }
  const combined = order.orderType === 'foodpanda' ? 0 : round2(itemDisc + orderDisc);
  return {
    ...order,
    items,
    subtotal,
    taxAmount: tax,
    serviceChargeAmount: serviceCharge,
    discountAmount: combined,
    discountMode: order.orderType === 'foodpanda' ? 'amount' : order.discountMode,
    discountPercent: order.orderType === 'foodpanda' ? 0 : order.discountPercent,
    pointsRedeemed: order.orderType === 'foodpanda' ? 0 : order.pointsRedeemed,
    totalAmount: round2(Math.max(0, subtotal + tax + serviceCharge - combined)),
  };
};

// Pure: apply a line-item move to the local `orders` array and return the next
// array (with both orders' totals recomputed). An emptied source is dropped.
const applyServerMove = (orders, sourceId, targetId, menuItemId, variationId, dealSelections, qty, taxConfig) => {
  const source = orders.find((o) => o._id === sourceId);
  const target = orders.find((o) => o._id === targetId);
  if (!source || !target) return { next: orders, ok: false };
  const line = (source.items || []).find((it) => sameLine(it, menuItemId, variationId, dealSelections));
  if (!line || qty > line.qty) return { next: orders, ok: false };
  const sourcePrintedBaseline = normalizePrintedQuantityMap(
    source.items,
    source.kitchenPrintedQtyMap,
    { assumeAllPrinted: Boolean(source.kitchenPrintedAt || source.kitchenPrintQueuedAt) },
  );
  const targetPrintedBaseline = normalizePrintedQuantityMap(
    target.items,
    target.kitchenPrintedQtyMap,
    { assumeAllPrinted: Boolean(target.kitchenPrintedAt || target.kitchenPrintQueuedAt) },
  );

  const movedDisc = round2((line.discountAmount || 0) * (qty / line.qty));
  const moved = {
    menuItem: line.menuItem,
    categoryId: line.categoryId,
    categoryName: line.categoryName,
    variation: line.variation,
    name: line.name,
    listedUnitPrice: line.listedUnitPrice ?? line.unitPrice,
    priceMode: line.priceMode || 'exclusive',
    unitPrice: line.unitPrice,
    taxRate: line.taxRate || 0,
    dealSelections: line.dealSelections || [],
    dealComponents: line.dealComponents || [],
  };

  const newSourceItems = (source.items || [])
    .map((it) => (sameLine(it, menuItemId, variationId, dealSelections)
      ? { ...it, qty: it.qty - qty, discountAmount: round2((it.discountAmount || 0) - movedDisc) }
      : it))
    .filter((it) => it.qty > 0);

  const tLine = (target.items || []).find((it) =>
    sameLine(it, menuItemId, variationId, dealSelections) && it.unitPrice === moved.unitPrice && (it.taxRate || 0) === moved.taxRate);
  const newTargetItems = tLine
    ? (target.items || []).map((it) => (it === tLine
        ? { ...it, qty: it.qty + qty, discountAmount: round2((it.discountAmount || 0) + movedDisc) }
        : it))
    : [...(target.items || []), { ...moved, qty, discountAmount: movedDisc, lineTotal: 0, taxAmount: 0, serviceChargeAmount: 0, serviceChargeRate: 0 }];

  const sourceEmptied = newSourceItems.length === 0;
  const printTransfer = transferPrintedQuantity({
    sourceBaseline: sourcePrintedBaseline,
    targetBaseline: targetPrintedBaseline,
    nextSourceItems: newSourceItems,
    nextTargetItems: newTargetItems,
    lineKey: kitchenLineKey(line),
    movedQuantity: qty,
  });
  const newTarget = recomputeOrder({
    ...target,
    items: newTargetItems,
    kitchenPrintedQtyMap: printTransfer.targetPrintedQuantityMap,
  }, taxConfig);
  const newSource = sourceEmptied ? null : recomputeOrder({
    ...source,
    items: newSourceItems,
    kitchenPrintedQtyMap: printTransfer.sourcePrintedQuantityMap,
  }, taxConfig);

  const next = orders
    .filter((o) => !(sourceEmptied && o._id === sourceId))
    .map((o) => {
      if (o._id === targetId) return newTarget;
      if (o._id === sourceId) return newSource;
      return o;
    });
  return { next, ok: true };
};

// ── Held-bill tax choice ────────────────────────────────────────────────────
// This is a receipt quote only. Choosing cash/card never changes or pays the
// held order; checkout remains the only workflow that persists payment data.
const HeldBillTypeDialog = ({ order, taxConfig, onClose, onChoose }) => {
  const cashPreview = buildHeldBillPreview(order, taxConfig, 'cash');
  const cardPreview = buildHeldBillPreview(order, taxConfig, 'card');
  const hasTaxableItems = (order.items || []).some((item) => Number(item.taxRate || 0) > 0);
  const cardRateReady = taxConfig?.loaded === true || !hasTaxableItems;
  const cashRate = heldBillRate(order, taxConfig, 'cash');
  const cardRate = heldBillRate(order, taxConfig, 'card');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-surface-900/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Choose held bill type">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-float animate-scale-in">
        <div className="flex items-start justify-between gap-4 border-b border-surface-100 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-surface-900">Which bill should be printed?</h3>
            <p className="mt-1 text-xs text-surface-500">This only previews the amount due. The held order is not changed.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-surface-400 hover:bg-surface-100" aria-label="Close bill choice">
            <X size={17} />
          </button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChoose('cash')}
            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:border-emerald-400 hover:bg-emerald-100/70 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white"><Banknote size={18} /></span>
            <span className="mt-3 block text-sm font-extrabold text-emerald-900">Cash Bill</span>
            <span className="mt-0.5 block text-xs font-medium text-emerald-700">Tax {cashRate}%</span>
            <span className="mt-3 block text-lg font-black tabular-nums text-emerald-950">{formatPKR(cashPreview.totalAmount)}</span>
          </button>

          <button
            type="button"
            disabled={!cardRateReady}
            onClick={() => onChoose('card')}
            className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-100/70 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><CreditCard size={18} /></span>
            <span className="mt-3 block text-sm font-extrabold text-indigo-900">Card Bill</span>
            <span className="mt-0.5 block text-xs font-medium text-indigo-700">
              {cardRateReady ? `Tax ${cardRate}%` : 'Loading card tax rate…'}
            </span>
            <span className="mt-3 block text-lg font-black tabular-nums text-indigo-950">{formatPKR(cardPreview.totalAmount)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Cancel-held dialog ───────────────────────────────────────────────────────
// Asks the cashier the order's kitchen status, then cancels accordingly:
//   • Not started  → flag it cancelled (no stock, no waste).
//   • Already made → deduct the recipe from stock and log it as waste.
// The order record is kept either way (never hard-deleted).
export const CancelHeldDialog = ({
  order,
  onKeep,
  onChoose,
  getWastePreview = getOrderWastePreview,
  cancellationBlocked = false,
  notPreparedLabel = 'Not started yet',
  notPreparedDescription,
}) => {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [preparedChoice, setPreparedChoice] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewAttempted, setPreviewAttempted] = useState(false);
  const [wasteMode, setWasteMode] = useState('whole');
  const [wasteSel, setWasteSel] = useState({});
  const [valuationMethod, setValuationMethod] = useState('ingredientCost');
  const tbl = order.tableNumber;
  const itemCount = (order.items || []).reduce((s, i) => s + (i.qty || 1), 0);
  const total = order.totalAmount ?? 0;
  const trimmedReason = reason.trim();
  const reasonIsValid = trimmedReason.length >= 3;
  const wasteValues = calculateWasteValues(preview, wasteMode, wasteSel);
  const selectedWasteValue = valuationMethod === 'orderValue'
    ? wasteValues.orderValue
    : wasteValues.ingredientCost;

  const loadPreview = useCallback(async () => {
    setPreviewAttempted(true);
    setPreviewLoading(true);
    setPreview(null);
    try {
      const data = await getWastePreview(order._id);
      setPreview(data);
      setValuationMethod(preferredWasteValuation(data));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not calculate this order’s waste values.');
    } finally {
      setPreviewLoading(false);
    }
  }, [getWastePreview, order._id]);

  useEffect(() => {
    if (preparedChoice && !previewAttempted) loadPreview();
  }, [preparedChoice, previewAttempted, loadPreview]);

  const setWasteLineQty = (index, maximum, value) => {
    const qty = Math.max(0, Math.min(maximum, Math.round(Number(value) || 0)));
    setWasteSel((current) => {
      const next = { ...current };
      if (qty <= 0) delete next[index]; else next[index] = qty;
      return next;
    });
  };
  const toggleWasteLine = (index, maximum) => {
    setWasteSel((current) => {
      const next = { ...current };
      if (next[index] > 0) delete next[index]; else next[index] = maximum;
      return next;
    });
  };

  const choose = async () => {
    if (cancellationBlocked) { toast.error(KDS_CANCELLATION_MESSAGE); return; }
    if (!reasonIsValid) {
      toast.error('Enter a cancellation reason (at least 3 characters).');
      return;
    }
    if (preparedChoice === null) {
      toast.error('Choose whether the kitchen prepared this order.');
      return;
    }
    let selection = null;
    if (preparedChoice) {
      if (previewLoading || !preview) {
        toast.error('Wait for the waste values to finish calculating.');
        return;
      }
      selection = buildWasteSelection(preview, wasteMode, wasteSel);
      if (wasteMode === 'select' && (!selection || selection.length === 0)) {
        toast.error('Select at least one prepared item to waste.');
        return;
      }
      if (selectedWasteValue <= 0) {
        toast.error(
          valuationMethod === 'ingredientCost'
            ? 'Ingredient cost is zero. Choose Order value before cancelling this prepared order.'
            : 'The selected order value is zero and cannot be logged.',
        );
        return;
      }
    }
    setBusy(true);
    try {
      await onChoose(preparedChoice, trimmedReason, {
        selection,
        valuationMethod: preparedChoice ? valuationMethod : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-surface-900/50 backdrop-blur-sm" onClick={busy ? undefined : onKeep} />
      <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-float animate-scale-in">
        <div className="flex items-center gap-2.5 border-b border-surface-100 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white">
            <Ban size={17} />
          </div>
          <h3 className="text-base font-bold text-surface-900">{order.currentStatus || (order.status && order.status !== 'held') ? 'Cancel order?' : 'Cancel held order?'}</h3>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <p className="text-sm text-surface-600">
            {tbl ? `Table ${tbl} · ` : ''}{itemCount} item{itemCount !== 1 ? 's' : ''} · {formatPKR(total)}
          </p>
          {order.pra?.status === 'reported' && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">This order was reported to PRA. Cancelling will submit the required credit invoice.</p>
          )}
          <div className="mt-4">
            <label
              htmlFor="held-order-cancel-reason"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-surface-500"
            >
              Reason <span className="font-normal text-rose-500">(required)</span>
            </label>
            <textarea
              id="held-order-cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
              rows={2}
              maxLength={300}
              placeholder="e.g. customer cancelled, duplicate order"
              className="w-full resize-none rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-rose-400/40 disabled:opacity-60"
            />
            {reason.length > 0 && !reasonIsValid && (
              <p className="mt-1 text-[11px] font-medium text-rose-600">Enter at least 3 characters.</p>
            )}
          </div>
          {cancellationBlocked && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{KDS_CANCELLATION_MESSAGE}</p>}
          <p className="mt-4 text-sm font-medium text-surface-700">Has the kitchen already prepared this order?</p>

          <div className="mt-3 space-y-2.5">
            <button
              type="button"
              aria-pressed={preparedChoice === false}
              disabled={busy || cancellationBlocked}
              onClick={() => setPreparedChoice(false)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 ${
                preparedChoice === false
                  ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200/60'
                  : 'border-surface-200 bg-white hover:border-surface-300 hover:bg-surface-50'
              }`}
            >
              <span className={`block text-sm font-bold ${preparedChoice === false ? 'text-emerald-800' : 'text-surface-900'}`}>{notPreparedLabel}</span>
              <span className={`block text-xs ${preparedChoice === false ? 'text-emerald-700' : 'text-surface-500'}`}>
                {notPreparedDescription || (['completed', 'out-for-delivery'].includes(order.status)
                  ? 'Cancel and restore unprepared ingredients to kitchen stock.'
                  : 'Cancel the order — nothing is deducted or wasted.')}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={preparedChoice === true}
              disabled={busy || cancellationBlocked}
              onClick={() => setPreparedChoice(true)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 ${
                preparedChoice === true
                  ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-200/60'
                  : 'border-surface-200 bg-white hover:border-amber-200 hover:bg-amber-50/50'
              }`}
            >
              <span className={`block text-sm font-bold ${preparedChoice === true ? 'text-amber-800' : 'text-surface-900'}`}>Already prepared</span>
              <span className={`block text-xs ${preparedChoice === true ? 'text-amber-700' : 'text-surface-500'}`}>Cancel and record prepared ingredients as waste.</span>
            </button>
          </div>

          {preparedChoice === true && (
            <div className="mt-4 space-y-4 border-t border-surface-100 pt-4">
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-surface-500">Which items were prepared?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy || previewLoading || !preview}
                    onClick={() => setWasteMode('whole')}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${wasteMode === 'whole' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-surface-200 text-surface-500'}`}
                  >
                    Entire order
                  </button>
                  <button
                    type="button"
                    disabled={busy || previewLoading || !preview}
                    onClick={() => setWasteMode('select')}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${wasteMode === 'select' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-surface-200 text-surface-500'}`}
                  >
                    Select items
                  </button>
                </div>
                {previewLoading && (
                  <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-surface-200 py-5 text-xs font-medium text-surface-500">
                    <RefreshCw size={13} className="animate-spin" /> Calculating waste values…
                  </div>
                )}
                {!previewLoading && !preview && (
                  <button
                    type="button"
                    onClick={loadPreview}
                    className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                  >
                    Could not calculate values · Try again
                  </button>
                )}
                {wasteMode === 'select' && preview && (
                  <div className="mt-2 max-h-44 divide-y divide-surface-100 overflow-y-auto rounded-xl border border-surface-200">
                    {preview.items.map((item) => {
                      const index = Number(item.index);
                      const available = Number(item.remainingQty ?? item.qty) || 0;
                      const selected = Number(wasteSel[index]) || 0;
                      return (
                        <div key={index} className="flex items-center gap-2 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected > 0}
                            onChange={() => toggleWasteLine(index, available)}
                            className="h-4 w-4 shrink-0 rounded border-surface-300 text-amber-600 focus:ring-amber-400"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-surface-800">
                              {item.name}{item.variation?.name ? ` (${item.variation.name})` : ''}
                            </p>
                            <p className="text-[11px] text-surface-400">{available} ordered</p>
                          </div>
                          {selected > 0 && (
                            <div className="flex shrink-0 items-center gap-1">
                              <button type="button" onClick={() => setWasteLineQty(index, available, selected - 1)} className="flex h-6 w-6 items-center justify-center rounded-md border border-surface-200 text-sm font-bold">−</button>
                              <span className="w-5 text-center text-sm font-bold tabular-nums">{selected}</span>
                              <button type="button" disabled={selected >= available} onClick={() => setWasteLineQty(index, available, selected + 1)} className="flex h-6 w-6 items-center justify-center rounded-md border border-surface-200 text-sm font-bold disabled:opacity-40">+</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {preview && (
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-surface-500">Waste valuation</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={valuationMethod === 'ingredientCost'}
                      onClick={() => setValuationMethod('ingredientCost')}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${valuationMethod === 'ingredientCost' ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200' : 'border-surface-200 bg-white'}`}
                    >
                      <span className="block text-sm font-bold text-surface-900">Ingredient cost</span>
                      <span className="mt-0.5 block text-xs text-surface-500">Recipe purchase cost · {formatWastePKR(wasteValues.ingredientCost)}</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={valuationMethod === 'orderValue'}
                      onClick={() => setValuationMethod('orderValue')}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${valuationMethod === 'orderValue' ? 'border-rose-400 bg-rose-50 ring-1 ring-rose-200' : 'border-surface-200 bg-white'}`}
                    >
                      <span className="block text-sm font-bold text-surface-900">Order value</span>
                      <span className="mt-0.5 block text-xs text-surface-500">Final billed value · {formatWastePKR(wasteValues.orderValue)}</span>
                    </button>
                  </div>
                  {valuationMethod === 'ingredientCost' && wasteValues.ingredientCost <= 0 && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-700">
                      Ingredient cost is zero. Choose Order value if purchases were not recorded in the app.
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-50 px-3 py-2 text-xs">
                    <span className="text-surface-500">{wasteValues.units} prepared item{wasteValues.units === 1 ? '' : 's'}</span>
                    <span className="font-bold tabular-nums text-rose-700">{formatWastePKR(selectedWasteValue)}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-surface-400">
                    Only the selected prepared items are deducted from stock. Accounting remains based on ingredient cost.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-surface-100 bg-surface-50/40 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onKeep}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-surface-600 transition hover:bg-surface-100 hover:text-surface-900 disabled:opacity-50"
          >
            Keep Order
          </button>
          <button
            type="button"
            disabled={busy || cancellationBlocked || !reasonIsValid || preparedChoice === null || (preparedChoice === true && (previewLoading || !preview || wasteValues.units <= 0 || selectedWasteValue <= 0))}
            onClick={choose}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
          >
            <Ban size={14} />
            {busy ? 'Cancelling…' : 'Cancel Order'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Move-item modal ─────────────────────────────────────────────────────────
// Lets the cashier move N units of one line item from a source held order to
// another held order of the SAME kind (server↔server or offline↔offline).
const MoveItemModal = ({ source, candidates, onClose, onConfirm }) => {
  const items = (source.items || []).filter((it) => (it.qty || 0) > 0);
  // Select by composite line key so the same item in two sizes is distinguishable.
  const keyOf = (it) => `${lineMenuId(it)}::${lineVariationId(it) ?? ''}::${dealSelectionSignature(it.dealSelections || [])}`;
  const [lineKey, setLineKey] = useState(items[0] ? keyOf(items[0]) : '');
  const [qty, setQty] = useState(1);
  const [targetId, setTargetId] = useState(candidates[0]?.id || '');

  const selected = items.find((it) => keyOf(it) === lineKey);
  const maxQty = selected?.qty || 1;
  const variationName = (it) => it.variation?.name ?? it.variationName ?? null;

  // Keep qty within the selected line's available units.
  useEffect(() => { setQty((q) => Math.min(Math.max(1, q), maxQty)); }, [lineKey, maxQty]);

  const canSubmit = Boolean(selected && targetId && qty >= 1 && qty <= maxQty);

  // The parent applies the move optimistically and closes this modal, so there's
  // no in-flight waiting state here.
  const submit = () => {
    if (!canSubmit) return;
    onConfirm({ menuItemId: lineMenuId(selected), variationId: lineVariationId(selected), dealSelections: selected.dealSelections || [], qty, targetId });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white">
              <ArrowRightLeft size={15} />
            </div>
            <p className="text-sm font-bold text-surface-900">Move item to another order</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-surface-400 hover:bg-surface-100">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {items.length === 0 ? (
            <p className="text-sm text-surface-500">This order has no items to move.</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-surface-500">There's no other held order of the same type to move this item into.</p>
          ) : (
            <>
              {/* Item picker */}
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-surface-500">Item</label>
                <FloatingSelect
                  label="Item"
                  options={items.map((item) => ({ value: keyOf(item), label: `${item.name} (×${item.qty})`, meta: variationName(item) || '' }))}
                  value={lineKey}
                  onChange={setLineKey}
                  className="border-surface-200 text-sm font-semibold text-surface-900"
                />
              </div>

              {/* Quantity stepper */}
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-surface-500">Quantity to move</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 disabled:opacity-40"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-[3rem] text-center text-lg font-bold tabular-nums text-surface-900">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 disabled:opacity-40"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="ml-1 text-xs text-surface-400">of {maxQty}</span>
                </div>
              </div>

              {/* Destination picker */}
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-surface-500">Move to</label>
                <FloatingSelect
                  label="Move to"
                  options={candidates.map((candidate) => ({ value: String(candidate.id), label: candidate.label }))}
                  value={targetId}
                  onChange={setTargetId}
                  searchable={false}
                  className="border-surface-200 text-sm font-semibold text-surface-900"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-100 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-surface-500 hover:bg-surface-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || items.length === 0 || candidates.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            <ArrowRightLeft size={14} />
            Move
          </button>
        </div>
      </div>
    </div>
  );
};

const HeldOrdersPanel = ({ isMobile, isOpen, onClose, initialType = 'dine-in', mode = 'held' }) => {
  const tabletMode = mode === 'tablet';
  const requestReceiptPrint = useReceiptPrint();
  const dispatch = useDispatch();
  const { outletCode, outletName, outletId, session, cashier } = useSession();
  const { syncHoldQueue, isSyncing } = useOfflineQueue();
  const canCancelOrders = hasEffectivePermission(cashier, 'pos.cancelOrder');
  const offlineHolds = useSelector((s) => s.offline.holdQueue);
  const offlineSales = useSelector((s) => s.offline.queue);
  const supersededServerHoldIds = useMemo(
    () => getSupersededServerHoldIds(offlineSales),
    [offlineSales],
  );
  const supersededServerHoldKey = useMemo(
    () => [...supersededServerHoldIds].sort().join('|'),
    [supersededServerHoldIds],
  );
  const previousSupersededKeyRef = useRef(supersededServerHoldKey);
  // Outlet tax config (central service-charge rate + applicability) so held-order
  // previews compute service charge the same way the server does.
  const taxConfig = useSelector((s) => s.taxConfig);
  const menuCategories = useSelector((s) => s.menu.categories);
  // The order currently resumed into the live cart (if any). Its on-screen cart
  // is a copy, so we must not let items be moved out of OR into it from here —
  // the cart wouldn't reflect the change and totals could drift at payment.
  const resumedHoldId = useSelector((s) => s.order.resumedFromHoldId);
  const resumedOfflineId = useSelector((s) => s.order.resumedFromOfflineId);

  const [orders, setOrders] = useState(() => getCachedHeldOrders(outletCode));
  const [activeType, setActiveType] = useState(initialType);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedItemOrders, setExpandedItemOrders] = useState(() => new Set());
  // Confirmation target: { kind: 'server'|'offline', order } | null
  const [confirmTarget, setConfirmTarget] = useState(null);
  // Move-item source: { kind: 'server'|'offline', order } | null
  const [moveSource, setMoveSource] = useState(null);
  // Server moves are optimistic, but source/destination actions stay locked
  // until persistence finishes so resume/update cannot race the move request.
  const [movingOrderIds, setMovingOrderIds] = useState(() => new Set());
  const [assigningRider, setAssigningRider] = useState(null);
  // { order, offline } while the cashier chooses the bill's tax basis.
  const [billPrintTarget, setBillPrintTarget] = useState(null);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!outletCode) return;
    if (!navigator.onLine) {
      setOrders(getCachedHeldOrders(outletCode));
      return;
    }
    setLoading(true);
    try {
      const data = await getHeldOrders(outletCode);
      const next = Array.isArray(data) ? data : [];
      setOrders(next);
      setConfirmTarget((current) => {
        if (current?.kind !== 'server') return current;
        const updated = next.find((order) => order._id === current.order?._id);
        return updated ? { ...current, order: updated } : current;
      });
      setCachedHeldOrders(outletCode, next);
    } catch {
      setOrders(getCachedHeldOrders(outletCode));
      if (!silent) toast.error('Failed to refresh held orders. Showing the last saved list.');
    } finally {
      setLoading(false);
    }
  }, [outletCode]);

  // Hydrate the last confirmed server snapshot immediately. Cache events keep
  // this mounted panel current when another POS workflow creates, pays, syncs,
  // or removes a held order in the same tab.
  useEffect(() => {
    if (!outletCode) {
      setOrders([]);
      return undefined;
    }

    const loadCached = (event) => {
      if (event?.detail?.outletCode && event.detail.outletCode !== String(outletCode)) return;
      setOrders(getCachedHeldOrders(outletCode));
    };
    const loadCrossTab = (event) => {
      if (isHeldOrdersCacheKey(event.key)) loadCached();
    };

    loadCached();
    window.addEventListener(HELD_ORDERS_CACHE_EVENT, loadCached);
    window.addEventListener('storage', loadCrossTab);
    return () => {
      window.removeEventListener(HELD_ORDERS_CACHE_EVENT, loadCached);
      window.removeEventListener('storage', loadCrossTab);
    };
  }, [outletCode]);

  // Keep a fresh snapshot even when the drawer has not been opened yet.
  useEffect(() => {
    if (!tabletMode && outletCode && navigator.onLine) refresh({ silent: true });
  }, [outletCode, refresh, tabletMode]);

  // Refresh on every open so the cashier always sees the current queue.
  useEffect(() => {
    if (isOpen) {
      setActiveType(initialType);
      setSearchQuery('');
      refresh();
    }
  }, [isOpen, initialType, refresh]);

  useEffect(() => {
    const onKdsChange = () => refresh({ silent: true });
    window.addEventListener('pos-kds-ready', onKdsChange);
    window.addEventListener('pos-kds-status-changed', onKdsChange);
    return () => {
      window.removeEventListener('pos-kds-ready', onKdsChange);
      window.removeEventListener('pos-kds-status-changed', onKdsChange);
    };
  }, [refresh]);

  // Tablet orders arrive as ordinary held orders under their selected type.
  // Refresh the shared snapshot immediately so reception sees them without
  // reloading or opening/closing this panel.
  useEffect(() => {
    if (!tabletMode || !outletId) return undefined;
    const socket = getQrSocket();
    const leaveRoom = joinOrderRoom(outletId);
    const onTabletOrder = (event = {}) => {
      refresh({ silent: true });
      const typeLabel = ORDER_TYPE[event.orderType]?.label || 'Order';
      toast.success(
        `${event.waiterName || event.deviceLabel || 'Order tablet'} sent ${typeLabel} ${event.orderNumber || 'order'}`
        + `${event.orderType === 'dine-in' && event.tableNumber ? ` for Table ${event.tableNumber}` : ''}.`,
        { id: `tablet-order:${event.orderId || event.orderNumber || Date.now()}` },
      );
    };
    const onPrintStatus = () => refresh({ silent: true });
    const onReconnect = () => refresh({ silent: true });
    socket.on('tablet-order:new', onTabletOrder);
    socket.on('tablet-order:print-status', onPrintStatus);
    socket.on('connect', onReconnect);
    return () => {
      leaveRoom();
      socket.off('tablet-order:new', onTabletOrder);
      socket.off('tablet-order:print-status', onPrintStatus);
      socket.off('connect', onReconnect);
    };
  }, [outletId, refresh, tabletMode]);

  // A repeat table-QR submission temporarily removes that bill from Held
  // Orders until the cashier approves/declines the add-on. Refresh this drawer
  // on the same real-time events as the QR drawer so a stale bill cannot be
  // resumed or printed during that approval window.
  useEffect(() => {
    if (tabletMode || !outletId) return undefined;
    const tenantSlug = getPosTenantSlug();
    const socket = getQrSocket();
    const leaveRoom = joinCashierRoom(tenantSlug, outletId);
    const onQrChange = () => refresh({ silent: true });
    socket.on('qr-order:new', onQrChange);
    socket.on('qr-order:updated', onQrChange);
    return () => {
      leaveRoom();
      socket.off('qr-order:new', onQrChange);
      socket.off('qr-order:updated', onQrChange);
    };
  }, [outletId, refresh, tabletMode]);

  // Print completion can race the initial tablet-order event by a fraction of
  // a second. Keep the visible Tablet drawer current even if a socket update is
  // missed during reconnect; the cached snapshot still supports offline view.
  useEffect(() => {
    if (!tabletMode || !isOpen || !outletCode || !navigator.onLine) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh({ silent: true });
    }, 30_000);
    return () => clearInterval(timer);
  }, [isOpen, outletCode, refresh, tabletMode]);

  // When a queued payment syncs, refresh before trusting the cached server-hold
  // list again. Offline removal intentionally reveals the hold immediately.
  useEffect(() => {
    if (previousSupersededKeyRef.current === supersededServerHoldKey) return;
    previousSupersededKeyRef.current = supersededServerHoldKey;
    if (isOpen && navigator.onLine) refresh();
  }, [isOpen, refresh, supersededServerHoldKey]);

  const handleResume = async (cachedOrder) => {
    let order = cachedOrder;
    if (navigator.onLine) {
      try {
        const freshOrder = await resumeHeldOrder(order._id);
        if (freshOrder?._id) order = { ...order, ...freshOrder };
      } catch (error) {
        toast.error(error.response?.data?.message || 'This held order changed. Refresh and try again.');
        refresh({ silent: true });
        return;
      }
    }
    // Resume has no server-side mutation (the held record stays until paid).
    // Use the fresh server snapshot, including KDS cancellation authority.
    const items = (order.items || []).map((it) => ({ ...it, taxRate: it.taxRate ?? 0 }));

    dispatch(loadHeldOrder({
      items,
      sourceHeldOrderId: order._id,
      kdsItemCancellationVersion: order.kdsItemCancellationVersion || 0,
      discountAmount: order.discountAmount ?? 0,
      discountMode:   order.discountMode ?? 'amount',
      discountPercent: order.discountPercent ?? 0,
      deliveryChargeAmount: order.deliveryChargeAmount ?? 0,
      notes:          order.notes ?? '',
      cashierNotes:   order.cashierNotes ?? '',
    }));
    // Held orders intentionally preserve their historical snapshot, but the
    // resumed cart must obey the CURRENT menu. This explicit reconciliation is
    // required because loading a hold changes the cart without changing the
    // menu state, so POSScreen's menu-change effect would otherwise not rerun.
    dispatch(syncMenuRates(buildMenuRateLookup(
      menuCategories,
      order.orderType || 'dine-in',
    )));
    dispatch(resetOrder());
    dispatch(setOrderType(order.orderType || 'dine-in'));
    if (order.orderType === 'foodpanda') {
      dispatch(setFoodPandaOrderNumber(order.foodPandaOrderNumber || order.foodPandaReference || ''));
      dispatch(setFoodPandaCustomerName(order.foodPandaCustomerName || ''));
    }
    if (order.orderType !== 'foodpanda' && order.customer) dispatch(setCustomer(order.customer));
    if (order.deliveryAddress) dispatch(setDeliveryAddress(order.deliveryAddress));
    if (order.tableNumber) dispatch(setTableNumber(order.tableNumber));
    dispatch(setResumedFromHoldId({
      id: order._id,
      kds: order.kds,
      kitchenPrintedAt: order.kitchenPrintedAt || order.kitchenPrintQueuedAt || null,
    }));

    // Capture original quantities (keyed by cart line = item + size) so the menu
    // tiles / cart don't subtract these from the shared pool twice — the held
    // record already reserves them server-side. Keying by line lets the per-size
    // pool math exclude exactly the resumed size, not the whole item.
    const qtyMap = buildItemQuantityMap(items);
    dispatch(setResumedItemQtyMap(qtyMap));
    // If a kitchen ticket was already printed, these are the quantities the
    // kitchen has seen. Otherwise start at zero so the first ticket sends all.
    const persistedPrintedMap = normalizePrintedQuantityMap(
      items,
      order.kitchenPrintedQtyMap,
      { assumeAllPrinted: Boolean(order.kitchenPrintedAt || order.kitchenPrintQueuedAt) },
    );
    dispatch(setResumedKitchenPrintedQtyMap(persistedPrintedMap));
    if ((order.pointsRedeemed || 0) > 0) dispatch(setRedeemPoints(order.pointsRedeemed));

    toast.success('Order resumed');
    if (outletCode) dispatch(fetchMenuAvailability(outletCode)); // background refresh
    onClose?.();
    window.dispatchEvent(new Event('pos-open-cart-panel'));

  };

  // Cancel a (server) held order. `prepared` decides the accounting:
  //   false → not started; just flag it cancelled (no stock, no waste).
  //   true  → already made; the recipe is deducted from stock and logged as waste.
  // Optimistic remove with restore-on-failure so the cashier never waits.
  const doCancel = async (order, prepared, voidReason, wasteOptions = {}) => {
    if (!canCancelOrders) {
      toast.error('You do not have permission to cancel orders.');
      return;
    }
    if (!['owner', 'financeManager'].includes(cashier?.role) && order?.isCurrentBusinessDay === false) {
      toast.error('Cashiers cannot cancel held orders after their business day has ended. Ask an owner or finance manager.');
      return;
    }
    const snapshot = orders;
    const next = orders.filter((candidate) => candidate._id !== order._id);
    setOrders(next);
    removeCachedHeldOrder(outletCode, order._id);
    if (outletCode) dispatch(fetchMenuAvailability(outletCode));
    try {
      const res = await cancelHeldOrder(order._id, {
        prepared,
        voidReason,
        selection: wasteOptions.selection ?? null,
        valuationMethod: wasteOptions.valuationMethod,
      });
      if (prepared) {
        const value = Number(res?.wasteValue ?? res?.wasteCost) || 0;
        toast.success(value > 0 ? `Order cancelled — ${formatWastePKR(value)} logged as waste` : 'Order cancelled & logged as waste');
      } else {
        toast.success('Order cancelled');
      }
      return true;
    } catch (err) {
      setOrders(snapshot); // revert
      setCachedHeldOrders(outletCode, snapshot);
      toast.error(err.response?.data?.message || 'Failed to cancel — order restored');
      return false;
    }
  };

  const handleLocalResume = async (hold) => {
    if (navigator.onLine) {
      const result = await syncHoldQueue({ ids: [hold.clientTransactionId], silent: true });
      if (result.orders?.[0]) return handleResume(result.orders[0]);
      toast.error('Could not sync this hold. It has been kept for retry.');
      return;
    }
    dispatch(loadHeldOrder({
      items: hold.items,
      discountAmount: hold.discountAmount ?? 0,
      discountMode:   hold.discountMode ?? 'amount',
      discountPercent: hold.discountPercent ?? 0,
      deliveryChargeAmount: hold.deliveryChargeAmount ?? 0,
      notes:          hold.notes ?? '',
      cashierNotes:   hold.cashierNotes ?? '',
    }));
    dispatch(syncMenuRates(buildMenuRateLookup(
      menuCategories,
      hold.orderType || 'dine-in',
    )));
    dispatch(resetOrder());
    dispatch(setOrderType(hold.orderType || 'dine-in'));
    if (hold.orderType === 'foodpanda') {
      dispatch(setFoodPandaOrderNumber(hold.foodPandaOrderNumber || hold.foodPandaReference || ''));
      dispatch(setFoodPandaCustomerName(hold.foodPandaCustomerName || ''));
    }
    if (hold.orderType !== 'foodpanda' && hold._customer) dispatch(setCustomer(hold._customer));
    if (hold.deliveryAddress) dispatch(setDeliveryAddress(hold.deliveryAddress));
    if (hold.tableNumber) dispatch(setTableNumber(hold.tableNumber));
    dispatch(setResumedFromOfflineId(hold.clientTransactionId));
    dispatch(setResumedItemQtyMap(buildItemQuantityMap(hold.items || [])));
    dispatch(setResumedKitchenPrintedQtyMap(normalizePrintedQuantityMap(
      hold.items,
      hold.kitchenPrintedQtyMap,
      { assumeAllPrinted: Boolean(hold.kitchenPrintedAt || hold.kitchenPrintQueuedAt) },
    )));
    toast.success('Order resumed');
    onClose?.();
    window.dispatchEvent(new Event('pos-open-cart-panel'));
  };

  const requestCancellation = async (order, offline) => {
    if (requiresKitchenCancellation(order.kds)) { toast.error(KDS_CANCELLATION_MESSAGE); return; }
    if (!offline) { setConfirmTarget({ kind: 'server', order }); return; }
    if (!navigator.onLine) {
      toast.error('Reconnect to cancel this saved offline order. It will be kept until its cancellation can be recorded.');
      return;
    }
    const result = await syncHoldQueue({ ids: [order.clientTransactionId], silent: true });
    if (!result.orders?.[0]) {
      toast.error('Could not sync this hold. It has been kept for retry.');
      return;
    }
    setConfirmTarget({ kind: 'server', order: result.orders[0] });
  };

  // Held orders are unpaid customer bills. Mark the printable snapshot as
  // `held` so every printer path omits an undecided payment method.
  const handlePrintBill = async (order, offline = false, taxBasis = 'cash') => {
    if (!offline && navigator.onLine) {
      try {
        // Validation-only: resume has no mutation, but the backend rejects a
        // QR bill while a new add-on is awaiting cashier approval.
        await resumeHeldOrder(order._id);
      } catch (error) {
        toast.error(error.response?.data?.message || 'This held order changed. Refresh and try again.');
        refresh({ silent: true });
        return;
      }
    }
    if (taxBasis === 'card' && taxConfig?.loaded !== true
      && (order.items || []).some((item) => Number(item.taxRate || 0) > 0)) {
      toast.error('Card tax settings are still loading. Try again in a moment.');
      return;
    }
    const billPreview = buildHeldBillPreview(order, taxConfig, taxBasis);
    const printable = {
      ...billPreview,
      status: 'held',
      customer: offline ? (order._customer || null) : order.customer,
      createdAt: offline ? (order.queuedAt || new Date()) : (order.heldAt || order.createdAt),
      timezone: order.timezone || session?.outlet?.timezone,
    };
    // Keep private cashier reminders outside every receipt connector payload.
    delete printable.cashierNotes;
    const cashierName = offline
      ? (cashier?.name || cashier?.email || 'Unknown cashier')
      : heldByLabel(order);
    try {
      await requestReceiptPrint({
        transaction: printable,
        outletName: outletName || outletCode,
        cashierName,
      });
    } catch (error) {
      toast.error(error?.message || 'Bill printing failed');
    }
  };

  // ── Move a line item between two held orders ───────────────────────────────
  // Candidate destinations are the OTHER held orders of the same kind
  // (server↔server or offline↔offline). Mixing the two is not allowed because
  // an offline hold has no server record yet.
  const candidateLabel = (o, idx, offline) => {
    const tbl = o.tableNumber;
    const base = (o.orderType || 'dine-in') === 'dine-in' && tbl ? `Table ${tbl}` : `Order #${idx + 1}`;
    const total = o.totalAmount ?? (o.items || []).reduce((s, i) => s + (i.lineTotal || i.qty * i.unitPrice || 0), 0);
    return `${base}${offline ? ' (Local)' : ''} · ${formatPKR(total)}`;
  };

  const moveCandidates = (() => {
    if (!moveSource) return [];
    if (moveSource.kind === 'offline') {
      return offlineHolds
        // Exclude self and any order currently resumed into the cart.
        .filter((h) => h.clientTransactionId !== moveSource.order.clientTransactionId
          && h.clientTransactionId !== resumedOfflineId)
        .map((h, i) => ({ id: h.clientTransactionId, label: candidateLabel(h, i, true) }));
    }
    return orders
      .filter((o) => !supersededServerHoldIds.has(String(o._id)))
      .filter((o) => !o.readyOnly)
      .filter((o) => tabletMode ? o.source === 'staff-tablet' : o.source !== 'staff-tablet')
      .filter((o) => o._id !== moveSource.order._id
        && o._id !== resumedHoldId
        && !movingOrderIds.has(String(o._id)))
      .map((o, i) => ({ id: o._id, label: candidateLabel(o, i, false) }));
  })();

  const handleMoveConfirm = ({ menuItemId, variationId, dealSelections, qty, targetId }) => {
    if (!moveSource) return;
    const { kind, order } = moveSource;

    // Offline move is already a synchronous local-state update (no network).
    if (kind === 'offline') {
      dispatch(moveOfflineHoldItem({
        sourceId: order.clientTransactionId, targetId, menuItemId, variationId, dealSelections, qty,
        // Service charge is central — pass the outlet rate so the offline holds
        // recompute it (gated by each hold's order type), not the legacy per-item value.
        serviceChargeRate: Number(taxConfig?.serviceChargeRate || 0),
        serviceChargeOrderTypes: taxConfig?.serviceChargeOrderTypes,
      }));
      toast.success('Item moved');
      setMoveSource(null);
      return;
    }

    // Server move: update local state instantly, then sync in the background.
    const snapshot = orders;
    const { next, ok } = applyServerMove(orders, order._id, targetId, menuItemId, variationId, dealSelections, qty, taxConfig);
    if (!ok) {
      toast.error('Could not move that item.');
      return;
    }
    setOrders(next);
    setCachedHeldOrders(outletCode, next);
    setMoveSource(null);
    setMovingOrderIds((previous) => new Set(previous).add(String(order._id)).add(String(targetId)));
    toast.success('Item moved');

    moveHeldOrderItem(order._id, { targetHoldId: targetId, menuItemId, variationId, dealSelections, qty })
      .then(() => {
        // Reservations shifted between orders — refresh availability quietly.
        if (outletCode) dispatch(fetchMenuAvailability(outletCode));
        // Reconcile the optimistic cards/cache with populated authoritative
        // server rows. Until this completes, the optimistic copy already carries
        // the transferred kitchen baseline, so an immediate resume stays safe.
        refresh({ silent: true });
      })
      .catch((err) => {
        setOrders(snapshot); // revert
        setCachedHeldOrders(outletCode, snapshot);
        toast.error(err.response?.data?.message || 'Failed to move item — reverted');
      })
      .finally(() => {
        setMovingOrderIds((previous) => {
          const nextIds = new Set(previous);
          nextIds.delete(String(order._id));
          nextIds.delete(String(targetId));
          return nextIds;
        });
      });
  };

  const handleReadyAcknowledgement = async (order) => {
    const kdsId = order.kds?._id;
    if (!kdsId) return;
    try {
      await acknowledgeKdsReady(kdsId);
      setOrders((current) => {
        const next = order.readyOnly
          ? current.filter((row) => row._id !== order._id)
          : current.map((row) => row._id === order._id
            ? { ...row, kds: { ...row.kds, cashierAcknowledgedAt: new Date().toISOString() } }
            : row);
        setCachedHeldOrders(outletCode, next);
        return next;
      });
      toast.success(`Ready order ${order.transactionNumber || ''} acknowledged.`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not acknowledge this ready order.');
    }
  };

  const availableOrders = orders
    .filter((order) => !supersededServerHoldIds.has(String(order._id)))
    .filter((order) => order.readyOnly
      ? !tabletMode
      : (tabletMode ? order.source === 'staff-tablet' : order.source !== 'staff-tablet'));
  const modeOfflineHolds = tabletMode ? [] : offlineHolds;
  const totalCount = availableOrders.length + modeOfflineHolds.length;
  const activeOfflineHolds = modeOfflineHolds.filter((o) => (o.orderType || 'dine-in') === activeType);
  const activeOrders = availableOrders.filter((o) => (o.orderType || 'dine-in') === activeType);
  const visibleOfflineHolds = activeOfflineHolds.filter((order) => (
    heldOrderMatchesSearch(order, searchQuery, { offline: true })
  ));
  const visibleOrders = activeOrders.filter((order) => heldOrderMatchesSearch(order, searchQuery));
  const activeTypeCount = activeOfflineHolds.length + activeOrders.length;
  const activeTypeReadyOnlyCount = activeOrders.filter((order) => order.readyOnly).length;
  const activeTypeUnpaidCount = activeTypeCount - activeTypeReadyOnlyCount;
  const visibleCount = visibleOfflineHolds.length + visibleOrders.length;
  const typeCounts = Object.fromEntries(Object.keys(ORDER_TYPE).map((type) => [
    type,
    availableOrders.filter((order) => (order.orderType || 'dine-in') === type).length
      + modeOfflineHolds.filter((order) => (order.orderType || 'dine-in') === type).length,
  ]));

  // ── Card renderer ─────────────────────────────────────────────────────────
  const renderCard = (order, { offline = false, idx } = {}) => {
    const items = order.items || [];
    const itemCount = items.reduce((s, i) => s + (i.qty || 1), 0);
    const total = order.totalAmount ?? items.reduce((s, i) => s + (i.lineTotal || i.qty * i.unitPrice || 0), 0);
    const typeKey = order.orderType || 'dine-in';
    const typeCfg = ORDER_TYPE[typeKey] ?? ORDER_TYPE['dine-in'];
    const TypeIcon = typeCfg.Icon;
    const customer = offline ? order._customer : order.customer;
    const customerName = typeKey === 'foodpanda' ? order.foodPandaCustomerName : customer?.name;
    const tbl = order.tableNumber;
    const showTable = typeKey === 'dine-in' && tbl;
    const heldAt = offline ? order.queuedAt : (order.heldAt || order.createdAt);
    const cardKey = offline ? order.clientTransactionId : order._id;
    const expansionKey = String(cardKey);
    const itemsExpanded = expandedItemOrders.has(expansionKey);
    const visibleItems = itemsExpanded ? items : items.slice(0, 3);
    const hiddenItemCount = Math.max(0, items.length - 3);
    const itemListId = `held-order-items-${expansionKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const kotPrinted = order.kitchenPrintStatus === 'printed' || Boolean(order.kitchenPrintedAt);
    // This card is the order currently resumed into the live cart.
    const isResumed = offline
      ? order.clientTransactionId === resumedOfflineId
      : order._id === resumedHoldId;
    const moveBusy = !offline && movingOrderIds.has(String(order._id));
    // Count valid destinations: other held orders of the same kind, excluding
    // this order and the one resumed into the cart (its on-screen copy wouldn't
    // reflect a move). Only show "Move" when the source isn't resumed and at
    // least one valid destination exists.
    const validDestinations = offline
      ? modeOfflineHolds.filter((h) => h.clientTransactionId !== order.clientTransactionId
          && h.clientTransactionId !== resumedOfflineId).length
      : availableOrders.filter((o) => !o.readyOnly && o._id !== order._id
          && o._id !== resumedHoldId
          && !movingOrderIds.has(String(o._id))).length;
    const canMove = !order.readyOnly && items.length > 0 && !isResumed && !moveBusy && validDestinations > 0;
    const pastBusinessDayLocked = !offline
      && !['owner', 'financeManager'].includes(cashier?.role)
      && order.isCurrentBusinessDay === false;
    const kitchenControlsCancellation = requiresKitchenCancellation(order.kds);
    const cancellationLocked = !canCancelOrders || pastBusinessDayLocked || kitchenControlsCancellation;

    return (
      <div
        key={cardKey}
        className={`rounded-xl border shadow-sm ${offline ? 'border-amber-200 bg-amber-50/40' : order.readyOnly ? 'border-emerald-300 bg-emerald-50/30' : 'border-amber-100 bg-white'}`}
      >
        <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
          {showTable ? (
            <div className="flex h-11 min-w-[2.75rem] shrink-0 flex-col items-center justify-center rounded-lg bg-emerald-600 px-1.5 text-white shadow-sm">
              <span className="text-[8px] font-semibold uppercase tracking-wider opacity-90">Table</span>
              <span className="text-sm font-extrabold leading-none">{tbl}</span>
            </div>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 text-xs font-bold">
              #{idx + 1}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-surface-900">{formatPKR(total)}</span>
              {order.readyOnly && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">Order #{order.transactionNumber}</span>}
              <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${typeCfg.cls}`}>
                <TypeIcon size={9} />
                {typeCfg.label}
              </span>
              {offline && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                  <WifiOff size={8} /> Local
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-[11px] text-surface-500">
              {showTable && (
                <span className="inline-flex items-center gap-0.5 font-bold text-emerald-700">
                  <Hash size={9} />T-{tbl}
                </span>
              )}
              <span className="inline-flex items-center gap-0.5">
                <ShoppingBag size={9} />
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </span>
              {heldAt && (
                <span className="inline-flex items-center gap-0.5">
                  <Clock size={9} />
                  {formatDistanceToNow(new Date(heldAt), { addSuffix: true })}
                </span>
              )}
              {customerName && <span className="truncate">· {customerName}</span>}
              {typeKey === 'delivery' && customer?.phone && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-700 ring-1 ring-violet-100">
                  <Phone size={9} /> {customer.phone}
                </span>
              )}
              {typeKey === 'foodpanda' && order.foodPandaOrderNumber && (
                <span className="inline-flex rounded-full bg-pink-50 px-2 py-0.5 font-bold text-pink-700 ring-1 ring-pink-100">
                  FP #{order.foodPandaOrderNumber}
                </span>
              )}
              {!offline && (
                order.source === 'staff-tablet' ? (
                  <>
                    <span className="inline-flex rounded-full bg-cyan-50 px-2 py-0.5 font-bold text-cyan-700 ring-1 ring-cyan-100">
                      Tablet: {order.staffOrder?.deviceLabel || 'Order tablet'}
                    </span>
                    {order.staffOrder?.waiterName && (
                      <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 font-bold text-sky-700 ring-1 ring-sky-100">
                        Waiter: {order.staffOrder.waiterName}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 font-bold text-indigo-700 ring-1 ring-indigo-100">
                    Cashier: {heldByLabel(order)}
                  </span>
                )
              )}
              {!offline && order.source === 'staff-tablet' && (
                <span className={`inline-flex rounded-full px-2 py-0.5 font-bold ring-1 ${
                  order.kitchenPrintStatus === 'failed'
                    ? 'bg-rose-50 text-rose-700 ring-rose-100'
                    : kotPrinted
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                    : 'bg-amber-50 text-amber-700 ring-amber-100'
                }`}>
                  {order.kitchenPrintStatus === 'failed'
                    ? 'Printer retrying'
                    : kotPrinted
                      ? 'KOT printed'
                      : order.kitchenPrintStatus === 'sending'
                        ? 'KOT sending'
                        : 'KOT queued'}
                </span>
              )}
              {!offline && typeKey === 'delivery' && order.assignedRider?.name && (
                <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-700 ring-1 ring-violet-100">
                  Rider: {order.assignedRider.name}
                </span>
              )}
              {!offline && order.kds?.currentStatus && (
                <span className={`inline-flex rounded-full px-2 py-0.5 font-bold ring-1 ${order.kds.currentStatus === 'dispatched' ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-orange-50 text-orange-700 ring-orange-100'}`}>
                  KDS: {order.kds.currentStatus === 'dispatched' ? 'Food ready' : order.kds.currentStatus}
                </span>
              )}
            </div>
            <HeldCashierNote note={order.cashierNotes} />
            {/* Item preview */}
            {items.length > 0 && (
              <div
                className="mt-2 border-t border-surface-100 pt-2"
                aria-label="Order items"
              >
                <div id={itemListId} className="space-y-0.5">
                  {visibleItems.map((it, j) => (
                    <div key={j} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5">
                      <span className="inline-flex min-w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">
                        {it.qty || 1}×
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-xs font-bold leading-5 text-surface-800"
                        title={`${it.name}${(it.variation?.name || it.variationName) ? ` (${it.variation?.name || it.variationName})` : ''}`}
                      >
                        {it.name}{(it.variation?.name || it.variationName) ? ` (${it.variation?.name || it.variationName})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
                {hiddenItemCount > 0 && (
                  <button
                    type="button"
                    aria-expanded={itemsExpanded}
                    aria-controls={itemListId}
                    onClick={() => setExpandedItemOrders((previous) => {
                      const next = new Set(previous);
                      if (next.has(expansionKey)) next.delete(expansionKey);
                      else next.add(expansionKey);
                      return next;
                    })}
                    className="mt-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-[10px] font-bold text-amber-700 transition hover:bg-amber-50 hover:text-amber-800"
                  >
                    {itemsExpanded ? (
                      <>Show fewer items <ChevronUp size={11} /></>
                    ) : (
                      <>+{hiddenItemCount} more item{hiddenItemCount === 1 ? '' : 's'} <ChevronDown size={11} /></>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-1.5 border-t border-surface-100 bg-surface-50/30 px-3 py-2.5">
          {!offline && order.kds?.currentStatus === 'dispatched' && !order.kds?.cashierAcknowledgedAt && (
            <button
              type="button"
              onClick={() => handleReadyAcknowledgement(order)}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <CheckCircle2 size={14} /> Food ready — acknowledge
            </button>
          )}
          {!order.readyOnly && <>
          <div className={`grid gap-1.5 ${!offline && typeKey === 'delivery' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              disabled={moveBusy}
              onClick={() => (offline ? handleLocalResume(order) : handleResume(order))}
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-wait disabled:opacity-50"
            >
              {moveBusy ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
              {moveBusy ? 'Moving…' : 'Resume'}
            </button>
            {!offline && typeKey === 'delivery' && (
              <button
                type="button"
                disabled={moveBusy}
                onClick={() => setAssigningRider(order)}
                className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-2 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-wait disabled:opacity-50"
                title="Assign an outlet employee as rider"
              >
                <UserPlus size={12} className="shrink-0" />
                <span className="truncate">{order.assignedRider?.name ? 'Change Rider' : 'Assign Rider'}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {canMove && (
              <button
                type="button"
                onClick={() => setMoveSource({ kind: offline ? 'offline' : 'server', order })}
                disabled={kitchenControlsCancellation}
                className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-amber-200 bg-white px-2 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-50"
                title={kitchenControlsCancellation ? 'Kitchen has accepted this order; its items cannot be moved from the POS.' : 'Move an item to another order'}
              >
                <ArrowRightLeft size={12} /> Move
              </button>
            )}
            <button
              type="button"
              disabled={moveBusy}
              onClick={() => {
                if (typeKey === 'foodpanda') handlePrintBill(order, offline, 'cash');
                else setBillPrintTarget({ order, offline });
              }}
              className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-surface-200 bg-white px-2 text-[11px] font-semibold text-surface-700 transition-colors hover:bg-surface-50 disabled:cursor-wait disabled:opacity-50"
              title="Print unpaid customer bill"
            >
              <Printer size={12} /> Print Bill
            </button>
            <button
              type="button"
              disabled={cancellationLocked || moveBusy || isSyncing}
              onClick={() => requestCancellation(order, offline)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-surface-200 disabled:hover:bg-white disabled:hover:text-surface-400"
              title={
                kitchenControlsCancellation ? KDS_CANCELLATION_MESSAGE : !canCancelOrders
                  ? 'Cancel Orders permission required'
                  : pastBusinessDayLocked
                    ? 'Past business day — ask an owner or finance manager'
                    : 'Discard order'
              }
              aria-label="Discard order"
            >
              <Trash2 size={13} />
            </button>
          </div>
          </>}
        </div>
      </div>
    );
  };

  // ── Body content (shared between mobile drawer + desktop sidebar) ─────────
  const body = (
    <>
      <div className={`flex items-center justify-between border-b px-4 py-3 ${
        tabletMode ? 'border-cyan-100 bg-cyan-50/70' : 'border-amber-100 bg-amber-50/60'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ${
            tabletMode ? 'bg-cyan-600' : 'bg-amber-500'
          }`}>
            {tabletMode ? <TabletSmartphone size={16} /> : <Pause size={15} />}
          </div>
          <div>
            <p className="text-sm font-bold text-surface-900">
              {tabletMode ? 'Tablet' : `Held ${ORDER_TYPE[activeType]?.label || 'Orders'}`}
            </p>
            <p className="text-xs text-surface-500">
              {tabletMode
                ? searchQuery.trim()
                  ? `${visibleCount} of ${activeTypeCount} ${ORDER_TYPE[activeType]?.label || ''} tablet orders`
                  : `${totalCount} order${totalCount === 1 ? '' : 's'} from linked tablets`
                : searchQuery.trim()
                  ? `${visibleCount} of ${activeTypeCount} orders · ${activeTypeUnpaidCount} unpaid${activeTypeReadyOnlyCount ? ` · ${activeTypeReadyOnlyCount} food ready` : ''}`
                  : `${activeTypeUnpaidCount} unpaid${activeTypeReadyOnlyCount ? ` · ${activeTypeReadyOnlyCount} food ready` : ' · awaiting payment'}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-700"
        >
          <X size={16} />
        </button>
      </div>

      <div className="border-b border-surface-100 bg-white px-3 py-2.5">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search customer, table, item, order…"
            aria-label="Search held orders"
            className="w-full rounded-xl border border-surface-200 bg-surface-50 py-2.5 pl-9 pr-9 text-sm font-medium text-surface-900 placeholder:text-surface-400 focus:border-amber-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-300/30"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear held order search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {tabletMode && (
        <div className="grid grid-cols-4 gap-1 border-b border-surface-100 bg-white p-2">
          {Object.entries(ORDER_TYPE).map(([type, config]) => {
            const Icon = config.Icon;
            const selected = activeType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                className={`relative flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold transition ${
                  selected
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-surface-50 text-surface-600 hover:bg-cyan-50 hover:text-cyan-700'
                }`}
              >
                <Icon size={14} />
                <span className="truncate">{config.label}</span>
                {typeCounts[type] > 0 && (
                  <span className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-black ${
                    selected ? 'bg-white text-cyan-700' : 'bg-cyan-100 text-cyan-700'
                  }`}>
                    {typeCounts[type]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {/* Spinner only on the very first load. On re-open we keep showing the
            previous list and refresh silently in the background. */}
        {loading && totalCount === 0 && (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        )}

        {!loading && visibleCount === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-semibold text-surface-700">
              {searchQuery.trim()
                ? `No ${ORDER_TYPE[activeType]?.label.toLowerCase()} orders match “${searchQuery.trim()}”`
                : `No ${ORDER_TYPE[activeType]?.label.toLowerCase()} ${tabletMode ? 'tablet orders' : 'held orders'}`}
            </p>
            <p className="mt-1 text-xs text-surface-400">
              {searchQuery.trim()
                ? 'Try a customer, phone, table, item, order number, address, or note.'
                : tabletMode ? 'Choose another order type above.' : 'Use the header buttons to open another held-order type.'}
            </p>
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {visibleOfflineHolds.length > 0 && (
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 px-1 pt-1">
            <WifiOff size={10} className="inline mr-1" />
            Saved offline
          </div>
        )}
        {visibleOfflineHolds.map((h, i) => renderCard(h, { offline: true, idx: i }))}

        {visibleOrders.length > 0 && visibleOfflineHolds.length > 0 && (
          <div className="text-[10px] font-bold uppercase tracking-wider text-surface-400 px-1 pt-2">
            Synced
          </div>
        )}
        {visibleOrders.map((o, i) => renderCard(o, { idx: i }))}
      </div>
    </>
  );

  // ── Cancel / discard confirmation ────────────────────────────────────────
  const confirmModal = confirmTarget && (() => {
    const { order } = confirmTarget;
    // Server holds: ask kitchen status, then cancel accordingly.
    return (
      <CancelHeldDialog
        order={order}
        cancellationBlocked={requiresKitchenCancellation(order.kds)}
        onKeep={() => setConfirmTarget(null)}
        onChoose={async (prepared, voidReason, wasteOptions) => {
          const target = order;
          if (await doCancel(target, prepared, voidReason, wasteOptions)) setConfirmTarget(null);
        }}
      />
    );
  })();

  const moveModal = moveSource && (
    <MoveItemModal
      source={moveSource.order}
      candidates={moveCandidates}
      onClose={() => setMoveSource(null)}
      onConfirm={handleMoveConfirm}
    />
  );
  const riderModal = assigningRider && (
    <AssignRiderModal
      order={assigningRider}
      onClose={() => setAssigningRider(null)}
      onAssigned={(updated) => {
        setOrders((prev) => prev.map((order) => order._id === updated._id ? updated : order));
        upsertCachedHeldOrder(outletCode, updated);
        setAssigningRider(null);
      }}
    />
  );
  const billTypeModal = billPrintTarget && (
    <HeldBillTypeDialog
      order={billPrintTarget.order}
      taxConfig={taxConfig}
      onClose={() => setBillPrintTarget(null)}
      onChoose={(taxBasis) => {
        const target = billPrintTarget;
        setBillPrintTarget(null);
        handlePrintBill(target.order, target.offline, taxBasis);
      }}
    />
  );

  // ── Mobile: bottom sheet ─────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {isOpen && (
          <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
        )}
        <div
          className={`fixed inset-x-0 bottom-0 z-40 flex max-h-[85vh] flex-col rounded-t-3xl bg-white shadow-float transition-transform duration-300 ease-out ${
            isOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="flex justify-center py-2">
            <div className="h-1 w-10 rounded-full bg-surface-300" />
          </div>
          {body}
        </div>
        {confirmModal}
        {moveModal}
        {riderModal}
        {billTypeModal}
      </>
    );
  }

  // ── Desktop: right-side drawer (mirrors CartPanel placement) ─────────────
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-[calc(3.5rem_+_env(safe-area-inset-top))] z-[29] hidden md:block"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed right-0 top-[calc(3.5rem_+_env(safe-area-inset-top))] bottom-0 z-30 flex w-[400px] flex-col border-l-2 bg-white shadow-soft transition-transform duration-300 ease-out ${
          tabletMode ? 'border-cyan-300' : 'border-amber-300'
        } ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {body}
      </div>
      {confirmModal}
      {moveModal}
      {riderModal}
      {billTypeModal}
    </>
  );
};

export default HeldOrdersPanel;
