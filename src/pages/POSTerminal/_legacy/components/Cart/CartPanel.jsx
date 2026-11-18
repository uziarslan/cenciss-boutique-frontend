import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { ShoppingBag, Trash2, Pause, CreditCard, GripVertical, X, StickyNote, NotebookPen, UtensilsCrossed, ShoppingBag as TakeawayIcon, Bike, Send, Save, Printer } from 'lucide-react';
import { clearCart, clearHeldItemCancellationReasons, selectCartItemCount, selectCartPricing, selectCartSubtotal, selectCartTax, selectCartServiceCharge, selectCartTotal, setDiscount, setDiscountMode, setDiscountPercent, setDeliveryCharge, setNote, setCashierNote } from '../../store/slices/cartSlice';
import {
  setFoodPandaCustomerName,
  setFoodPandaOrderNumber,
  setOrderType,
  setTableNumber,
  setResumedItemQtyMap,
  setResumedKds,
  setResumedKitchenPrintedQtyMap,
  resetOrder,
} from '../../store/slices/orderSlice';
import { addToOfflineHoldQueue, updateQueuedOfflineHold } from '../../store/slices/offlineSlice';
import { holdOrder, updateHeldOrder } from '../../api/saleApi';
import { markHeldOrderPrinted, resumeHeldOrder, cancelHeldOrder } from '../../api/sessionApi';
import { CancelHeldDialog } from '../HeldOrders/HeldOrdersPanel';
import { hasEffectivePermission } from '../../../../../config/permissions';
import { markResumedKitchenPrinted } from '../../store/slices/orderSlice';
import { fetchMenuAvailability } from '../../store/slices/menuSlice';
import KitchenPrintModal from '../Print/KitchenPrintModal';
import CartItem from './CartItem';
import { requiresKitchenCancellation, KDS_CANCELLATION_MESSAGE } from '../../utils/kdsCancellation';
import CartTotals from './CartTotals';
import CustomerPanel from '../Customer/CustomerPanel';
import { useLoyalty } from '../../hooks/useLoyalty';
import toast from 'react-hot-toast';
import AmountInput from '../UI/AmountInput';
import { useReceiptPrint } from '../Print/ReceiptPrintProvider';
import {
  removeCachedHeldOrder,
  updateCachedHeldOrder,
  upsertCachedHeldOrder,
} from '../../utils/heldOrdersCache';
import {
  buildItemQuantityMap,
  getKitchenDeltaItems,
  normalizePrintedQuantityMap,
} from '../../utils/kitchenPrintedQuantity';

const CartPanel = ({ isMobile, onCharge }) => {
  const dispatch = useDispatch();
  const requestReceiptPrint = useReceiptPrint();
  const items = useSelector((state) => state.cart.items);
  const pricedItems = useSelector(selectCartPricing).items;
  const count = useSelector(selectCartItemCount);
  const session = useSelector((state) => state.session.session);
  const cashier = useSelector((state) => state.auth.cashier);
  // Owners/managers have no fixed outlet — fall back to the open session's
  // outlet so availability refreshes target the right outlet (see useSession).
  const authOutletCode = useSelector((state) => state.auth.outletCode);
  const outletCode = authOutletCode || session?.outlet?.code || '';
  const subtotal = useSelector(selectCartSubtotal);
  const taxAmount = useSelector(selectCartTax);
  const serviceChargeAmount = useSelector(selectCartServiceCharge);
  const taxConfig = useSelector((state) => state.taxConfig);
  const total = useSelector(selectCartTotal);
  const reduxDiscount = useSelector((state) => state.cart.discount);
  const discountMode = useSelector((state) => state.cart.discountMode);
  const discountPercent = useSelector((state) => state.cart.discountPercent);
  const reduxNote = useSelector((state) => state.cart.note);
  const reduxCashierNote = useSelector((state) => state.cart.cashierNote || '');
  const kdsItemCancellationVersion = useSelector((state) => state.cart.kdsItemCancellationVersion) || 0;
  const heldItemCancellationDetails = useSelector((state) => state.cart.heldItemCancellationDetails) || {};
  const heldItemCancellationReasons = useSelector((state) => state.cart.heldItemCancellationReasons) || {};
  const reduxDeliveryCharge = useSelector((state) => state.cart.deliveryCharge);
  const receiptTaxRate = taxAmount > 0 ? Number(taxConfig?.standardRate || 0) : 0;
  const receiptServiceChargeRate = serviceChargeAmount > 0
    ? Number(taxConfig?.serviceChargeRate || 0)
    : 0;

  // Order type & customer
  const orderType = useSelector((state) => state.order.orderType);
  const deliveryAddress = useSelector((state) => state.order.deliveryAddress);
  const orderCustomer = useSelector((state) => state.order.customer);
  const tableNumber = useSelector((state) => state.order.tableNumber);
  const foodPandaOrderNumber = useSelector((state) => state.order.foodPandaOrderNumber || '');
  const foodPandaCustomerName = useSelector((state) => state.order.foodPandaCustomerName || '');
  const redeemPoints = useSelector((state) => state.order.redeemPoints || 0);
  const { config: loyaltyConfig } = useLoyalty();
  const redeemValue = orderCustomer && redeemPoints > 0 && loyaltyConfig?.redemptionValue
    ? Math.round(redeemPoints * loyaltyConfig.redemptionValue)
    : 0;
  const effectiveTotal = Math.max(0, total - redeemValue);
  const resumedFromHoldId = useSelector((state) => state.order.resumedFromHoldId);
  const cartSourceHeldOrderId = useSelector((state) => state.cart.sourceHeldOrderId);
  const activeHeldOrderId = resumedFromHoldId || cartSourceHeldOrderId;
  const resumedFromOfflineId = useSelector((state) => state.order.resumedFromOfflineId);
  // Persisted Redux sessions created before kitchen delta tracking do not have
  // these fields. Default them here so upgrading a live terminal cannot crash.
  const resumedSavedQtyMap = useSelector((state) => state.order.resumedItemQtyMap) || {};
  const resumedKitchenPrintedQtyMap = useSelector((state) => state.order.resumedKitchenPrintedQtyMap) || {};
  const resumedKds = useSelector((state) => state.order.resumedKds);
  const kitchenControlsCancellation = requiresKitchenCancellation(resumedKds);
  const isResumed = Boolean(activeHeldOrderId || resumedFromOfflineId);
  const currentQtyMap = buildItemQuantityMap(items);
  // Compare the live cart with what the kitchen has already received. This
  // makes Send to Kitchen appear immediately after an item/quantity is added.
  // Its handler saves the hold before opening the delta ticket.
  const resumedKitchenDeltaItems = getKitchenDeltaItems(items, resumedKitchenPrintedQtyMap);
  const resumedNeedsKitchenPrint = isResumed && resumedKitchenDeltaItems.length > 0;

  // Print modal state. `printContext` tells the modal whether we just held a
  // fresh order ('hold') or are reprinting a resumed unprinted one ('reprint').
  const [cancelLastOrder, setCancelLastOrder] = useState(null);
  const [printModal, setPrintModal] = useState(null); // { context, order, heldId } | null

  const [manualClose, setManualClose] = useState(false);
  const [holdLoading, setHoldLoading] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const canDiscount = !!cashier?.permissions?.['pos.discount'];
  const configuredDiscountLimit = Number(cashier?.posDiscountLimitPercent);
  const discountLimitPercent = Math.min(
    100,
    Math.max(0, Number.isFinite(configuredDiscountLimit) ? configuredDiscountLimit : 100)
  );
  const itemDiscountTotal = items.reduce(
    (sum, item) => sum + Math.max(0, Number(item.discountAmount) || 0),
    0
  );
  const maximumManualDiscount = Math.max(0, subtotal * (discountLimitPercent / 100));
  const maximumOrderDiscount = Math.max(0, maximumManualDiscount - itemDiscountTotal);
  const maximumOrderPercent = subtotal > 0
    ? Math.max(0, (maximumOrderDiscount / subtotal) * 100)
    : 0;
  const prevCountRef = useRef(count);
  const orderMutationInFlightRef = useRef(false);
  const skipSyncRef = useRef(false);
  const discountModeRef = useRef(discountMode);
  const discountPercentRef = useRef(discountPercent);
  useEffect(() => { discountModeRef.current = discountMode; }, [discountMode]);
  useEffect(() => { discountPercentRef.current = discountPercent; }, [discountPercent]);
  useEffect(() => {
    if (orderType !== 'foodpanda') return;
    if (reduxDiscount !== 0) dispatch(setDiscount(0));
    if (discountMode !== 'amount') dispatch(setDiscountMode('amount'));
    if (discountPercent !== 0) dispatch(setDiscountPercent(0));
    setDiscountInput('');
  }, [orderType, reduxDiscount, discountMode, discountPercent, dispatch]);

  useEffect(() => {
    if (canDiscount) return;
    if (reduxDiscount !== 0) dispatch(setDiscount(0));
    if (discountPercent !== 0) dispatch(setDiscountPercent(0));
    setDiscountInput('');
  }, [canDiscount, reduxDiscount, discountPercent, dispatch]);

  // Refresh only kitchen authority while editing; never replace unsaved cart
  // quantities in response to a kitchen status event.
  useEffect(() => {
    if (!activeHeldOrderId) return undefined;
    let disposed = false;
    let generation = 0;
    const refreshKitchenStatus = async () => {
      const current = ++generation;
      if (!navigator.onLine) return;
      try {
        const order = await resumeHeldOrder(activeHeldOrderId);
        if (!disposed && current === generation && order?._id) dispatch(setResumedKds(order.kds));
      } catch { /* The mutation endpoints independently enforce the live KDS state. */ }
    };
    refreshKitchenStatus();
    const events = ['pos-kds-status-changed', 'pos-kds-ready', 'focus', 'online'];
    events.forEach((event) => window.addEventListener(event, refreshKitchenStatus));
    return () => {
      disposed = true;
      events.forEach((event) => window.removeEventListener(event, refreshKitchenStatus));
    };
  }, [activeHeldOrderId, dispatch]);

  const ORDER_TYPES = [
    { id: 'dine-in',  label: 'Dine-In',  Icon: UtensilsCrossed },
    { id: 'takeaway', label: 'Takeaway', Icon: TakeawayIcon },
    { id: 'delivery', label: 'Delivery', Icon: Bike },
    { id: 'foodpanda', label: 'Foodpanda', Icon: Bike },
  ];

  const foodPandaDetailsValid = () => {
    if (orderType !== 'foodpanda') return true;
    if (!foodPandaOrderNumber.trim()) {
      toast.error('Enter the Foodpanda order number.');
      return false;
    }
    return true;
  };

  const handleCharge = () => {
    if (orderType === 'delivery' && !deliveryAddress) {
      toast.error('Select a delivery address before charging.');
      return;
    }
    if (!foodPandaDetailsValid()) return;
    onCharge();
  };

  // Send to Kitchen on a resumed unprinted order — reuses the print modal
  // but doesn't create a new hold (the order is already in the DB).
  const handleResumedKitchenPrint = async () => {
    // A server hold must contain the additions before the kitchen receives
    // them. Local holds are updated in place while their cart stays open. This
    // also keeps recovery/resume accurate if printing is cancelled.
    if (activeHeldOrderId || resumedFromOfflineId) {
      const updated = await handleUpdateHeld({ keepOfflineCart: true });
      if (!updated) return;
    }
    setPrintModal({
      context: 'reprint',
      heldId: activeHeldOrderId,
      offlineHoldId: resumedFromOfflineId,
      savedQtyMap: currentQtyMap,
      order: {
        items: resumedKitchenDeltaItems.map((it) => ({
          menuItemId: it.id, variationId: it.variationId, variationName: it.variationName,
          dealSelections: it.dealSelections, dealComponents: it.dealComponents,
          categoryId: it.categoryId, categoryName: it.categoryName,
          name: it.name, qty: it.qty,
          unitPrice: it.unitPrice, taxRate: it.taxRate,
        })),
        orderType,
        tableNumber,
        customer: orderCustomer,
        foodPandaOrderNumber,
        foodPandaCustomerName,
        notes: reduxNote,
      },
    });
  };

  const handleUpdateHeld = async (options = {}) => {
    const keepOfflineCart = options?.keepOfflineCart === true;
    const nextItems = options?.items || items;
    const cancellationDetails = options?.cancellationDetails || heldItemCancellationDetails;
    if ((!activeHeldOrderId && !resumedFromOfflineId) || !nextItems.length || orderMutationInFlightRef.current) return false;
    if (!foodPandaDetailsValid()) return false;
    orderMutationInFlightRef.current = true;
    setHoldLoading(true);
    try {
      if (resumedFromOfflineId) {
        dispatch(updateQueuedOfflineHold({
          id: resumedFromOfflineId,
          changes: {
            outletCode,
            sessionId: session?._id ?? session?.id ?? null,
            cashierId: cashier?._id ?? cashier?.id ?? null,
            items: pricedItems.map((item) => ({
              menuItemId: item.id,
              variationId: item.variationId,
              variationName: item.variationName,
              dealSelections: item.dealSelections,
              dealComponents: item.dealComponents,
              categoryId: item.categoryId,
              categoryName: item.categoryName,
              name: item.name,
              qty: item.qty,
              listedUnitPrice: item.listedUnitPrice,
              priceMode: item.priceMode,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate,
              serviceCharge: item.serviceCharge,
              discountAmount: item.discountAmount || 0,
              lineTotal: item.lineTotal,
            })),
            subtotal,
            taxAmount,
            serviceChargeAmount,
            discountAmount: orderType === 'foodpanda' ? 0 : reduxDiscount,
            discountMode: orderType === 'foodpanda' ? 'amount' : discountMode,
            discountPercent: orderType === 'foodpanda' ? 0 : discountPercent,
            totalAmount: total,
            notes: reduxNote,
            cashierNotes: reduxCashierNote,
            orderType,
            tableNumber: orderType === 'dine-in' ? tableNumber : '',
            customerId: orderCustomer?._id || null,
            _customer: orderCustomer || null,
            deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
            deliveryChargeAmount: orderType === 'delivery' ? reduxDeliveryCharge : 0,
            foodPandaOrderNumber: orderType === 'foodpanda' ? foodPandaOrderNumber.trim() : '',
            foodPandaCustomerName: orderType === 'foodpanda' ? foodPandaCustomerName.trim() : '',
            redeemPoints: orderCustomer && redeemPoints > 0 ? redeemPoints : 0,
          },
        }));
        dispatch(setResumedItemQtyMap(buildItemQuantityMap(items)));
        dispatch(setResumedKitchenPrintedQtyMap(normalizePrintedQuantityMap(
          items,
          resumedKitchenPrintedQtyMap,
        )));
        if (!keepOfflineCart) {
          // Park the locally updated order again. This also releases its resume
          // lock so the existing manual-sync flow can upload it safely.
          dispatch(clearCart());
          dispatch(resetOrder());
          toast.success('Changes saved offline — ready to sync');
        }
        return true;
      }

      const updatedHeld = await updateHeldOrder(activeHeldOrderId, {
        items: nextItems.map((item) => ({
          menuItemId: item.id, variationId: item.variationId, dealSelections: item.dealSelections, qty: item.qty,
          discountAmount: item.discountAmount || 0,
        })),
        discountAmount: orderType === 'foodpanda' ? 0 : reduxDiscount,
        discountMode: orderType === 'foodpanda' ? 'amount' : discountMode,
        discountPercent: orderType === 'foodpanda' ? 0 : discountPercent,
        deliveryChargeAmount: reduxDeliveryCharge, notes: reduxNote,
        cashierNotes: reduxCashierNote, orderType,
        tableNumber, customerId: orderCustomer?._id, deliveryAddress,
        foodPandaOrderNumber, foodPandaCustomerName,
        redeemPoints,
        heldItemCancellationReasons,
        heldItemCancellationDetails: cancellationDetails,
        kdsItemCancellationVersion,
      });
      upsertCachedHeldOrder(outletCode, {
        ...updatedHeld,
        customer: orderCustomer || updatedHeld?.customer || null,
        cashier: typeof updatedHeld?.cashier === 'object'
          ? updatedHeld.cashier
          : {
              _id: cashier?._id || cashier?.id,
              name: cashier?.name,
              email: cashier?.email,
            },
      });
      dispatch(setResumedKds(updatedHeld?.kds));
      const qtyMap = buildItemQuantityMap(nextItems);
      const responsePrintedMap = updatedHeld?.kitchenPrintedQtyMap || {};
      const responseHasBaseline = responsePrintedMap instanceof Map
        ? responsePrintedMap.size > 0
        : Object.keys(responsePrintedMap).length > 0;
      const nextPrintedBaseline = responseHasBaseline
        ? responsePrintedMap
        : resumedKitchenPrintedQtyMap;
      dispatch(setResumedItemQtyMap(qtyMap));
      dispatch(setResumedKitchenPrintedQtyMap(normalizePrintedQuantityMap(
        updatedHeld?.items || nextItems,
        nextPrintedBaseline,
        {
          assumeAllPrinted: Boolean(updatedHeld?.kitchenPrintedAt || updatedHeld?.kitchenPrintQueuedAt)
            && Object.keys(nextPrintedBaseline || {}).length === 0,
        },
      )));
      dispatch(clearHeldItemCancellationReasons());
      if (outletCode) dispatch(fetchMenuAvailability(outletCode));
      toast.success('Held order updated');
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update held order');
      return false;
    } finally {
      orderMutationInFlightRef.current = false;
      setHoldLoading(false);
    }
  };

  // Save the resumed cart first, then print the updated customer bill directly
  // from the cart. This removes the old update → reopen Held → print detour.
  const handlePrintUpdatedBill = async () => {
    if (!isResumed || !items.length) return;
    if (activeHeldOrderId) {
      const updated = await handleUpdateHeld();
      if (!updated) return;
    }
    try {
      const printed = await requestReceiptPrint({
        transaction: {
          status: 'held',
          items: pricedItems.map((item) => ({
            ...item,
            lineTotal: item.lineTotal,
          })),
          subtotal,
          taxAmount,
          effectiveTaxRate: receiptTaxRate,
          serviceChargeAmount,
          serviceChargeRate: receiptServiceChargeRate,
          deliveryChargeAmount: reduxDeliveryCharge,
          discountAmount: orderType === 'foodpanda' ? 0 : reduxDiscount,
          discountMode: orderType === 'foodpanda' ? 'amount' : discountMode,
          discountPercent: orderType === 'foodpanda' ? 0 : discountPercent,
          totalAmount: effectiveTotal,
          orderType,
          tableNumber,
          customer: orderCustomer,
          foodPandaOrderNumber,
          foodPandaCustomerName,
          deliveryAddress,
          notes: reduxNote,
          createdAt: new Date(),
          timezone: session?.outlet?.timezone,
        },
        outletName: session?.outlet?.name || outletCode,
        cashierName: cashier?.name || cashier?.email || 'Cashier',
      });
      if (printed) toast.success('Updated bill printed');
    } catch (err) {
      toast.error(err?.message || 'Bill printing failed');
    }
  };

  // eslint-disable-next-line no-unused-vars
  const closePrintModal = () => setPrintModal(null);

  // The kitchen print transfer completed successfully.
  const handlePrintConfirmed = async () => {
    if (!printModal) return;
    const { context, heldId, offlineHoldId } = printModal;
    const printedQtyMap = context === 'reprint'
      ? (printModal.savedQtyMap || resumedSavedQtyMap)
      : buildItemQuantityMap(printModal.order?.items || []);
    if (heldId) {
      try {
        const printed = await markHeldOrderPrinted(heldId, printedQtyMap);
        updateCachedHeldOrder(outletCode, heldId, {
          kitchenPrintedAt: printed?.kitchenPrintedAt || new Date().toISOString(),
          kitchenPrintedQtyMap: printed?.kitchenPrintedQtyMap || printedQtyMap,
        });
      } catch {
        toast.error('Saved print succeeded, but failed to update server flag');
      }
    }
    if (offlineHoldId) {
      dispatch(updateQueuedOfflineHold({
        id: offlineHoldId,
        changes: {
          kitchenPrintedAt: new Date().toISOString(),
          kitchenPrintedQtyMap: printedQtyMap,
        },
      }));
    }
    if (context === 'hold') {
      // Fresh hold: leave the cart panel via clear + reset.
      dispatch(clearCart());
      dispatch(resetOrder());
      toast.success('Sent to kitchen');
    } else if (context === 'reprint') {
      // The kitchen has now received every quantity in the last saved hold.
      // Keep the cart, advance the printed baseline, and hide the delta action.
      dispatch(setResumedKitchenPrintedQtyMap(printModal.savedQtyMap || resumedSavedQtyMap));
      dispatch(markResumedKitchenPrinted());
      toast.success('Kitchen ticket printed');
    }
    setPrintModal(null);
  };

  const handlePrintCancelled = () => {
    if (!printModal) return;
    if (printModal.context === 'hold') {
      // Cashier dismissed the print step but the hold is already saved.
      // Clear the cart so the screen returns to a fresh order — they can
      // reprint from the Held Orders panel later.
      dispatch(clearCart());
      dispatch(resetOrder());
      toast('Order held without kitchen ticket. Send to kitchen later from Held Orders.', { icon: '📋', duration: 5000 });
    }
    setPrintModal(null);
  };

  // Sync input from Redux — fires on mount (held-order restore) and on external clears
  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    if (reduxDiscount === 0 && discountPercent === 0) {
      setDiscountInput('');
    } else if (discountMode === 'percent' && discountPercent > 0) {
      setDiscountInput(String(discountPercent));
    } else if (discountMode === 'amount' && reduxDiscount > 0) {
      setDiscountInput(String(reduxDiscount));
    }
  }, [reduxDiscount, discountMode, discountPercent]);

  // Recalculate PKR discount when subtotal changes while in % mode (qty change fix)
  useEffect(() => {
    if (discountModeRef.current === 'percent' && discountPercentRef.current > 0) {
      const safePercent = Math.min(discountPercentRef.current, maximumOrderPercent);
      if (safePercent !== discountPercentRef.current) {
        dispatch(setDiscountPercent(safePercent));
        setDiscountInput(String(Number(safePercent.toFixed(2))));
      }
      dispatch(setDiscount(parseFloat(((subtotal * safePercent) / 100).toFixed(2))));
    }
  }, [subtotal, maximumOrderPercent, dispatch]);

  const handleDiscountChange = (val) => {
    skipSyncRef.current = true;
    const num = Number(val) || 0;
    if (discountMode === 'percent') {
      const safe = Math.min(num, maximumOrderPercent);
      if (num > maximumOrderPercent + 0.001) {
        toast.error(`Maximum allowed discount is ${discountLimitPercent}%.`, { id: 'cashier-discount-limit' });
      }
      setDiscountInput(val === '' ? '' : String(Number(safe.toFixed(2))));
      dispatch(setDiscountPercent(safe));
      dispatch(setDiscount(parseFloat(((subtotal * safe) / 100).toFixed(2))));
    } else {
      const safe = Math.min(num, maximumOrderDiscount);
      if (num > maximumOrderDiscount + 0.001) {
        toast.error(`Maximum allowed discount is PKR ${maximumOrderDiscount.toFixed(2)} (${discountLimitPercent}%).`, { id: 'cashier-discount-limit' });
      }
      setDiscountInput(val === '' ? '' : String(Number(safe.toFixed(2))));
      dispatch(setDiscountPercent(0));
      dispatch(setDiscount(safe));
    }
  };

  const handleDiscountModeToggle = (mode) => {
    dispatch(setDiscountMode(mode));
    dispatch(setDiscountPercent(0));
    dispatch(setDiscount(0));
    setDiscountInput('');
  };

  // Auto-show when items are added
  useEffect(() => {
    if (count > prevCountRef.current && count > 0) {
      setManualClose(false);
    }
    prevCountRef.current = count;
  }, [count]);

  useEffect(() => {
    const open = () => setManualClose(false);
    const close = () => setManualClose(true);
    window.addEventListener('pos-open-cart-panel', open);
    // When any sibling drawer opens (held / EOD), hide the cart so they
    // don't overlap on the right edge of the screen.
    window.addEventListener('pos-open-held-panel', close);
    window.addEventListener('pos-open-eod-panel', close);
    window.addEventListener('pos-open-tablet-panel', close);
    window.addEventListener('pos-open-offline-panel', close);
    return () => {
      window.removeEventListener('pos-open-cart-panel', open);
      window.removeEventListener('pos-open-held-panel', close);
      window.removeEventListener('pos-open-eod-panel', close);
      window.removeEventListener('pos-open-tablet-panel', close);
      window.removeEventListener('pos-open-offline-panel', close);
    };
  }, []);

  const hasItems = items.length > 0;
  const isVisible = hasItems && !manualClose;
  const foodPandaFields = orderType === 'foodpanda' ? (
    <div className="space-y-2 rounded-xl border border-pink-200 bg-pink-50/60 px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-pink-700">
        Foodpanda order details
      </p>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-surface-600">Order number *</span>
        <input
          type="text"
          value={foodPandaOrderNumber}
          onChange={(event) => dispatch(setFoodPandaOrderNumber(event.target.value))}
          placeholder="e.g. FP-123456"
          maxLength={100}
          className="w-full rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm font-semibold text-surface-900 focus:outline-none focus:ring-2 focus:ring-pink-400/30"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-surface-600">Customer name (optional)</span>
        <input
          type="text"
          value={foodPandaCustomerName}
          onChange={(event) => dispatch(setFoodPandaCustomerName(event.target.value))}
          placeholder="Name shown on Foodpanda, if available"
          maxLength={150}
          className="w-full rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm font-semibold text-surface-900 focus:outline-none focus:ring-2 focus:ring-pink-400/30"
        />
      </label>
      <p className="text-[10px] font-medium text-pink-700">GST is not charged on Foodpanda orders.</p>
    </div>
  ) : null;

  // sendToKitchen=true → park the order AND fire the kitchen ticket (print modal).
  // sendToKitchen=false → "Hold": park quietly to free the till for the next
  // customer; the cashier can print from Held Orders later.
  const handleHold = async ({ sendToKitchen = true } = {}) => {
    if (!items.length || orderMutationInFlightRef.current) return;
    if (!foodPandaDetailsValid()) return;
    if (!session || session.status !== 'open') {
      toast.error('No open session. Please open a shift first.');
      return;
    }
    orderMutationInFlightRef.current = true;
    setHoldLoading(true);

    const holdPayload = {
      clientTransactionId: window.crypto?.randomUUID?.() ?? `txn_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      outletCode,
      sessionId: session?._id ?? session?.id ?? null,
      cashierId: cashier?._id ?? cashier?.id ?? null,
      items: pricedItems.map((item) => ({
        menuItemId: item.id, variationId: item.variationId, variationName: item.variationName,
        dealSelections: item.dealSelections, dealComponents: item.dealComponents,
        categoryId: item.categoryId, categoryName: item.categoryName,
        name: item.name, qty: item.qty,
        listedUnitPrice: item.listedUnitPrice, priceMode: item.priceMode,
        unitPrice: item.unitPrice, taxRate: item.taxRate, serviceCharge: item.serviceCharge,
        lineTotal: item.lineTotal,
      })),
      subtotal, taxAmount, serviceChargeAmount,
      discountAmount: orderType === 'foodpanda' ? 0 : reduxDiscount,
      discountMode: orderType === 'foodpanda' ? 'amount' : discountMode,
      discountPercent: orderType === 'foodpanda' ? 0 : discountPercent,
      totalAmount: total,
      notes: reduxNote, cashierNotes: reduxCashierNote,
      paymentMethod: 'cash', cashTendered: 0, changeGiven: 0,
      orderType,
      ...(orderType === 'foodpanda' && {
        foodPandaOrderNumber: foodPandaOrderNumber.trim(),
        foodPandaCustomerName: foodPandaCustomerName.trim(),
      }),
      ...(orderType === 'dine-in' && tableNumber && { tableNumber }),
      ...(orderCustomer && { customerId: orderCustomer._id }),
      ...(orderCustomer && redeemPoints > 0 && { redeemPoints }),
      ...(orderType === 'delivery' && deliveryAddress && { deliveryAddress }),
      ...(orderType === 'delivery' && reduxDeliveryCharge > 0 && { deliveryChargeAmount: reduxDeliveryCharge }),
    };
    // Kitchen printers receive only operational kitchen instructions. The
    // cashier's private reminder stays in the held-order payload/database.
    const kitchenOrder = { ...holdPayload };
    delete kitchenOrder.cashierNotes;

    try {
      const heldDoc = await holdOrder(holdPayload);
      upsertCachedHeldOrder(outletCode, {
        ...heldDoc,
        customer: orderCustomer || heldDoc?.customer || null,
        cashier: typeof heldDoc?.cashier === 'object'
          ? heldDoc.cashier
          : {
              _id: cashier?._id || cashier?.id,
              name: cashier?.name,
              email: cashier?.email,
            },
        isCurrentBusinessDay: true,
      });
      // The held order reserves ingredients — refresh availability so other
      // open carts / tiles see the reduced counts immediately.
      if (outletCode) dispatch(fetchMenuAvailability(outletCode));
      if (sendToKitchen) {
        toast.success(tableNumber ? `Order held — Table ${tableNumber}` : 'Order held in queue');
        // Open the kitchen-print modal *before* clearing the cart so the user
        // sees the same items they punched. The cart only resets after the
        // modal closes (whether the print succeeded or was cancelled).
        setPrintModal({
          context: 'hold',
          heldId: heldDoc?._id || null,
          order: {
            ...kitchenOrder,
            customer: orderCustomer,
            tableNumber,
            transactionNumber: heldDoc?.transactionNumber,
          },
        });
      } else {
        // Quiet hold — no kitchen ticket. Free the till for the next customer;
        // the cashier can print/resume from Held Orders when they return.
        dispatch(clearCart());
        dispatch(resetOrder());
        toast(tableNumber ? `Order held — Table ${tableNumber}` : 'Order held', { icon: '📋', duration: 4000 });
      }
    } catch (err) {
      const isNetwork = !err.response || (axios.isAxiosError(err) && err.code === 'ERR_NETWORK');
      if (isNetwork) {
        // Save locally with full customer snapshot for later restoration
        try {
          dispatch(addToOfflineHoldQueue({
            ...holdPayload,
            _customer: orderCustomer || null,
          }));
        } catch {
          toast.error('Could not save this hold offline. The current order was kept open.');
          return;
        }
        toast('No connection — order held locally, will sync when online.', { icon: '📴', duration: 5000 });
        if (sendToKitchen) {
          setPrintModal({
            context: 'hold',
            heldId: null, // offline: no server record to flag-as-printed
            offlineHoldId: holdPayload.clientTransactionId,
            order: { ...kitchenOrder, customer: orderCustomer, tableNumber },
          });
        } else {
          dispatch(clearCart());
          dispatch(resetOrder());
        }
      } else {
        toast.error(err.response?.data?.message || 'Failed to hold order');
      }
    } finally {
      orderMutationInFlightRef.current = false;
      setHoldLoading(false);
    }
  };

  // One stable action layout is shared by mobile and desktop. The primary
  // payment action never moves; operational actions stay in a predictable row
  // and the kitchen action remains visible (disabled) when already up to date.
  const renderCartActions = () => (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-surface-400">
            {isResumed ? 'Resumed order' : 'New order'}
          </p>
          <p className="text-xs font-semibold text-surface-700">
            {isResumed ? 'Save, route and print without leaving the cart' : 'Take payment or save the order for later'}
          </p>
        </div>
        <span className="shrink-0 text-sm font-black tabular-nums text-surface-900">
          PKR {effectiveTotal.toFixed(0)}
        </span>
      </div>

      <button
        type="button"
        onClick={handleCharge}
        disabled={!hasItems || holdLoading}
        className="btn-primary w-full gap-2 py-3.5 text-sm shadow-sm"
      >
        <CreditCard size={16} />
        Take Payment
      </button>

      {isResumed ? (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleUpdateHeld}
            disabled={!hasItems || holdLoading || (!activeHeldOrderId && !resumedFromOfflineId)}
            className="inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-1.5 py-2.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
            title="Save the current changes back to this held order"
          >
            <Save size={14} />
            <span className="truncate">{holdLoading ? 'Saving…' : 'Save changes'}</span>
          </button>
          <button
            type="button"
            onClick={handleResumedKitchenPrint}
            disabled={!hasItems || holdLoading || !resumedNeedsKitchenPrint}
            className="inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-1.5 py-2.5 text-[11px] font-bold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
            title={resumedNeedsKitchenPrint ? 'Save and print only the new kitchen quantities' : 'Kitchen already has the latest quantities'}
          >
            <Send size={14} />
            <span className="truncate">{resumedNeedsKitchenPrint ? 'Send changes' : 'Kitchen sent'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrintUpdatedBill}
            disabled={!hasItems || holdLoading}
            className="inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-surface-200 bg-white px-1.5 py-2.5 text-[11px] font-bold text-surface-700 transition hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-45"
            title="Save changes and print the latest customer bill"
          >
            <Printer size={14} />
            <span className="truncate">Print bill</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleHold({ sendToKitchen: false })}
            disabled={!hasItems || holdLoading}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
            title="Save this order without printing a kitchen ticket"
          >
            <Pause size={14} /> Save Order
          </button>
          <button
            type="button"
            onClick={() => handleHold({ sendToKitchen: true })}
            disabled={!hasItems || holdLoading}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-bold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
            title="Save this order and print its kitchen ticket"
          >
            <Send size={14} /> Send Kitchen
          </button>
        </div>
      )}

    </div>
  );

  const handleItemCancellation = async ({ lineKey, nextQty, reason, prepared }) => {
    if (kitchenControlsCancellation) { toast.error(KDS_CANCELLATION_MESSAGE); return false; }
    const nextItems = items.flatMap((line) => line.lineKey !== lineKey ? [line]
      : nextQty > 0 ? [{ ...line, qty: nextQty }] : []);
    return handleUpdateHeld({
      items: nextItems,
      cancellationDetails: { ...heldItemCancellationDetails, [lineKey]: { reason, prepared } },
    });
  };

  const openLastItemCancellation = async () => {
    if (kitchenControlsCancellation) { toast.error(KDS_CANCELLATION_MESSAGE); return; }
    if (!hasEffectivePermission(cashier, 'pos.cancelOrder')) {
      toast.error('Cancel Orders permission is required to cancel the final item.');
      return;
    }
    if (orderMutationInFlightRef.current) return;
    orderMutationInFlightRef.current = true;
    setHoldLoading(true);
    try {
      const response = await resumeHeldOrder(activeHeldOrderId);
      const order = response?.data?.data ?? response?.data ?? response;
      if (!order?._id) throw new Error('Could not load the saved order.');
      dispatch(setResumedKds(order.kds));
      if (requiresKitchenCancellation(order.kds)) { toast.error(KDS_CANCELLATION_MESSAGE); return; }
      setCancelLastOrder(order);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load the saved order.');
    } finally {
      orderMutationInFlightRef.current = false;
      setHoldLoading(false);
    }
  };

  const lastItemCancellationDialog = cancelLastOrder && (
    <CancelHeldDialog
      order={cancelLastOrder}
      cancellationBlocked={kitchenControlsCancellation || requiresKitchenCancellation(cancelLastOrder.kds)}
      onKeep={() => setCancelLastOrder(null)}
      onChoose={async (prepared, voidReason, wasteOptions) => {
        try {
          await cancelHeldOrder(cancelLastOrder._id, { prepared, voidReason, ...wasteOptions });
          removeCachedHeldOrder(outletCode, cancelLastOrder._id);
          dispatch(clearCart());
          dispatch(resetOrder());
          setCancelLastOrder(null);
          if (outletCode) dispatch(fetchMenuAvailability(outletCode));
          toast.success('Order cancelled.');
        } catch (error) {
          toast.error(error.response?.data?.message || 'Could not cancel the order.');
        }
      }}
    />
  );

  const handleClearCart = () => {
    dispatch(clearCart());
    dispatch(resetOrder());
    setDiscountInput('');
    if (isResumed) {
      toast('Resumed cart closed. The saved order remains in Held Orders.', { icon: '📋' });
    }
  };

  /* ── Mobile: slide-up drawer ── */
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {isVisible && (
          <div
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm animate-fade-in"
            onClick={() => setManualClose(true)}
          />
        )}
        {/* Drawer */}
        <div
          className={`fixed inset-x-0 bottom-0 z-40 flex max-h-[85vh] flex-col rounded-t-3xl bg-white shadow-float transition-transform duration-300 ease-out ${
            isVisible ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          {/* Handle bar */}
          <div className="flex justify-center py-2">
            <div className="h-1 w-10 rounded-full bg-surface-300" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-2.5">
              <ShoppingBag size={16} className="text-brand-600" />
              <p className="text-sm font-bold text-surface-900">Order</p>
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                {count}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setManualClose(true)}
              className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100"
            >
              <X size={16} />
            </button>
          </div>

          {/* Scrollable area: items + order configuration + totals */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 space-y-3">
            <div className="space-y-2">
              {kitchenControlsCancellation && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">{KDS_CANCELLATION_MESSAGE}</p>}
              {items.map((item) => <CartItem key={item.lineKey} item={item} busy={holdLoading} onCancel={handleItemCancellation} onCancelLast={openLastItemCancellation} />)}
            </div>
            {/* Order type selector */}
            <div className="grid grid-cols-2 rounded-xl border border-surface-200 overflow-hidden">
              {ORDER_TYPES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => dispatch(setOrderType(id))}
                  className={`flex flex-1 items-center justify-center gap-1 py-2 text-[11px] font-semibold transition-colors ${
                    orderType === id
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-surface-500 hover:bg-surface-50'
                  }`}
                >
                  <Icon size={11} />
                  {label}
                </button>
              ))}
            </div>

            {/* Table number — dine-in only */}
            {orderType === 'dine-in' && (
              <div className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-surface-500">Table</span>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => dispatch(setTableNumber(e.target.value))}
                  placeholder="e.g. 12"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-surface-900 focus:outline-none"
                  maxLength={20}
                />
              </div>
            )}

            {foodPandaFields}

            {/* Customer lookup */}
            {orderType !== 'foodpanda' && <CustomerPanel />}

            {/* Delivery charge — delivery orders only */}
            {orderType === 'delivery' && hasItems && (
              <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/50 px-3 py-2 space-y-2">
                <span className="text-xs font-semibold text-brand-600">Delivery Charge</span>
                <AmountInput
                  value={reduxDeliveryCharge || ''}
                  onChange={(v) => dispatch(setDeliveryCharge(v))}
                  placeholder="0.00"
                  className="min-w-0 w-full rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs text-right font-semibold text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                />
              </div>
            )}

            {canDiscount && hasItems && orderType !== 'foodpanda' && (
              <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/50 px-3 py-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-600">Discount</span>
                  <div className="flex rounded-lg border border-rose-200 overflow-hidden text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => handleDiscountModeToggle('amount')}
                      className={`px-2 py-0.5 transition-colors ${
                        discountMode === 'amount' ? 'bg-rose-600 text-white' : 'bg-white text-rose-500 hover:bg-rose-50'
                      }`}
                    >PKR</button>
                    <button
                      type="button"
                      onClick={() => handleDiscountModeToggle('percent')}
                      className={`px-2 py-0.5 transition-colors ${
                        discountMode === 'percent' ? 'bg-rose-600 text-white' : 'bg-white text-rose-500 hover:bg-rose-50'
                      }`}
                    >%</button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <AmountInput
                    value={discountInput}
                    onChange={handleDiscountChange}
                    placeholder={discountMode === 'percent' ? '0 %' : '0.00'}
                    className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs text-right font-semibold text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
                  />
                  {reduxDiscount > 0 && discountMode === 'percent' && (
                    <span className="text-[11px] text-rose-500 shrink-0">-PKR {reduxDiscount.toFixed(0)}</span>
                  )}
                </div>
                <p className="text-[10px] text-rose-500">
                  Discount limit: {discountLimitPercent}% · up to PKR {maximumOrderDiscount.toFixed(2)} on this order
                </p>
              </div>
            )}
            {hasItems && (
              <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <StickyNote size={12} className="text-surface-400" />
                  <span className="text-xs font-semibold text-surface-500">Order Note</span>
                </div>
                <textarea
                  rows={2}
                  value={reduxNote}
                  onChange={(e) => dispatch(setNote(e.target.value))}
                  placeholder="Special instructions…"
                  maxLength={500}
                  className="w-full resize-none rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-xs text-surface-700 placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                />
                <div className="border-t border-surface-200/80 pt-2">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <NotebookPen size={12} className="text-indigo-500" />
                    <span className="text-xs font-semibold text-surface-600">Cashier Notes</span>
                    <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-600">Private</span>
                  </div>
                  <textarea
                    rows={2}
                    value={reduxCashierNote}
                    onChange={(e) => dispatch(setCashierNote(e.target.value))}
                    placeholder="Reminder for this held order…"
                    maxLength={500}
                    className="w-full resize-none rounded-lg border border-indigo-100 bg-white px-2 py-1.5 text-xs text-surface-700 placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                  />
                  <p className="mt-1 text-[9px] font-medium text-surface-400">Shown only on held orders — never printed.</p>
                </div>
              </div>
            )}
            <CartTotals />
          </div>

          {/* Pinned footer: action buttons stay visible regardless of cart height */}
          <div className="shrink-0 border-t border-surface-100 bg-white p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.05)]">
            {renderCartActions()}
          </div>
        </div>
        {lastItemCancellationDialog}
        {printModal && (
          <KitchenPrintModal
            order={printModal.order}
            outletName={outletCode}
            onPrinted={handlePrintConfirmed}
            onCancel={handlePrintCancelled}
          />
        )}
      </>
    );
  }

  /* ── Desktop: sliding sidebar drawer ── */
  return (
    <>
      {/* Invisible click-outside layer covers the menu area while cart is open */}
      {isVisible && (
        <div
          className="fixed inset-x-0 bottom-0 top-[calc(3.5rem_+_env(safe-area-inset-top))] z-[29] hidden md:block"
          onClick={() => setManualClose(true)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed right-0 top-[calc(3.5rem_+_env(safe-area-inset-top))] bottom-0 z-30 flex w-[360px] flex-col border-l border-surface-200 bg-white shadow-soft transition-transform duration-300 ease-out ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
      {/* Handle / toggle tab (visible when hidden) */}
      {!isVisible && hasItems && (
        <button
          type="button"
          onClick={() => setManualClose(false)}
          className="absolute -left-10 top-1/2 -translate-y-1/2 flex h-20 w-10 items-center justify-center rounded-l-xl bg-brand-600 text-white shadow-card hover:bg-brand-700 transition-colors"
        >
          <GripVertical size={16} />
        </button>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
            <ShoppingBag size={16} className="text-brand-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-surface-900">Current Order</p>
            <p className="text-xs text-surface-400">{count} item{count !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {hasItems && (
            <button
              type="button"
              onClick={handleClearCart}
              disabled={holdLoading}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-500 transition-colors hover:bg-rose-50"
              title={isResumed ? 'Close this cart without changing the held order' : 'Clear this new order'}
            >
              <Trash2 size={12} />
              {isResumed ? 'Close' : 'Clear'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setManualClose(true)}
            className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 transition-colors"
            title="Hide cart"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable area: items + order configuration + totals.
          min-h-0 lets this flex child actually shrink so it scrolls instead of
          pushing the pinned action footer below the panel. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {!hasItems ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-200 bg-surface-50/50 py-12 text-center">
            <ShoppingBag size={32} className="text-surface-300" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-surface-400">No items yet</p>
            <p className="mt-1 text-xs text-surface-300">Tap menu items to add them</p>
          </div>
        ) : (
          <div className="space-y-2">
            {kitchenControlsCancellation && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">{KDS_CANCELLATION_MESSAGE}</p>}
              {items.map((item) => <CartItem key={item.lineKey} item={item} busy={holdLoading} onCancel={handleItemCancellation} onCancelLast={openLastItemCancellation} />)}
          </div>
        )}

        {/* Order type selector */}
        <div className="grid grid-cols-2 rounded-xl border border-surface-200 overflow-hidden">
          {ORDER_TYPES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => dispatch(setOrderType(id))}
              className={`flex flex-1 items-center justify-center gap-1 py-2 text-[11px] font-semibold transition-colors ${
                orderType === id
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-surface-500 hover:bg-surface-50'
              }`}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>

        {/* Table number — dine-in only */}
        {orderType === 'dine-in' && (
          <div className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-surface-500">Table</span>
            <input
              type="text"
              value={tableNumber}
              onChange={(e) => dispatch(setTableNumber(e.target.value))}
              placeholder="e.g. 12"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-surface-900 focus:outline-none"
              maxLength={20}
            />
          </div>
        )}

        {foodPandaFields}

        {/* Customer lookup */}
        {orderType !== 'foodpanda' && <CustomerPanel />}

        {/* Delivery charge — delivery orders only */}
        {orderType === 'delivery' && hasItems && (
          <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/50 px-3 py-2 space-y-2">
            <span className="text-xs font-semibold text-brand-600">Delivery Charge</span>
            <AmountInput
              value={reduxDeliveryCharge || ''}
              onChange={(v) => dispatch(setDeliveryCharge(v))}
              placeholder="0.00"
              className="min-w-0 w-full rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs text-right font-semibold text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            />
          </div>
        )}

        {canDiscount && hasItems && orderType !== 'foodpanda' && (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/50 px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-600">Discount</span>
              <div className="flex rounded-lg border border-rose-200 overflow-hidden text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => handleDiscountModeToggle('amount')}
                  className={`px-2 py-0.5 transition-colors ${
                    discountMode === 'amount' ? 'bg-rose-600 text-white' : 'bg-white text-rose-500 hover:bg-rose-50'
                  }`}
                >PKR</button>
                <button
                  type="button"
                  onClick={() => handleDiscountModeToggle('percent')}
                  className={`px-2 py-0.5 transition-colors ${
                    discountMode === 'percent' ? 'bg-rose-600 text-white' : 'bg-white text-rose-500 hover:bg-rose-50'
                  }`}
                >%</button>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <AmountInput
                value={discountInput}
                onChange={handleDiscountChange}
                placeholder={discountMode === 'percent' ? '0 %' : '0.00'}
                className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs text-right font-semibold text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
              />
              {reduxDiscount > 0 && discountMode === 'percent' && (
                <span className="text-[11px] text-rose-500 shrink-0">-PKR {reduxDiscount.toFixed(0)}</span>
              )}
            </div>
            <p className="text-[10px] text-rose-500">
              Discount limit: {discountLimitPercent}% · up to PKR {maximumOrderDiscount.toFixed(2)} on this order
            </p>
          </div>
        )}
        {hasItems && (
          <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <StickyNote size={12} className="text-surface-400" />
              <span className="text-xs font-semibold text-surface-500">Order Note</span>
            </div>
            <textarea
              rows={2}
              value={reduxNote}
              onChange={(e) => dispatch(setNote(e.target.value))}
              placeholder="Special instructions…"
              maxLength={500}
              className="w-full resize-none rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-xs text-surface-700 placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            />
            <div className="border-t border-surface-200/80 pt-2">
              <div className="mb-1.5 flex items-center gap-1.5">
                <NotebookPen size={12} className="text-indigo-500" />
                <span className="text-xs font-semibold text-surface-600">Cashier Notes</span>
                <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-600">Private</span>
              </div>
              <textarea
                rows={2}
                value={reduxCashierNote}
                onChange={(e) => dispatch(setCashierNote(e.target.value))}
                placeholder="Reminder for this held order…"
                maxLength={500}
                className="w-full resize-none rounded-lg border border-indigo-100 bg-white px-2 py-1.5 text-xs text-surface-700 placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
              />
              <p className="mt-1 text-[9px] font-medium text-surface-400">Shown only on held orders — never printed.</p>
            </div>
          </div>
        )}

        <CartTotals />
      </div>

      {/* Pinned footer: action buttons stay visible regardless of cart height */}
      <div className="shrink-0 border-t border-surface-100 bg-white p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.05)]">
        {renderCartActions()}
      </div>
    </div>
    {lastItemCancellationDialog}
    {printModal && (
      <KitchenPrintModal
        order={printModal.order}
        outletName={outletCode}
        onPrinted={handlePrintConfirmed}
        onCancel={handlePrintCancelled}
      />
    )}
    </>
  );
};

export default CartPanel;
