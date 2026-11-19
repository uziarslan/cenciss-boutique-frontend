import { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import {
  Plus, Minus, ChevronLeft, Search, AlertTriangle, Clock, CheckCircle2, X, Phone,
  User as UserIcon, Loader2, Sparkles, ChefHat, Receipt, Bell, CircleDashed, ArrowRight,
  Lock, Landmark, Copy, CreditCard, Banknote, ShoppingBag, MapPin, ShieldCheck,
  Volume2,
} from 'lucide-react';
import { fetchPublicMenu, placePublicOrder, fetchPublicOrder, requestPublicBill } from './selfOrderApi';
import { getCustomerSocket, joinTableRoom, joinOrderRoom } from './customerSocket';
import {
  isCustomerOrderSoundUnlocked,
  playCustomerOrderAlert,
  subscribeCustomerOrderSound,
  unlockCustomerOrderSound,
} from './customerOrderAlertSound';
import useQueryState from '../../hooks/useQueryState';
import { calculateCartCharges } from '../POSTerminal/_legacy/utils/chargeInclusivePricing';
import DealChoiceModal from '../POSTerminal/_legacy/components/Menu/DealChoiceModal';
import {
  dealSelectionSignature,
  resolveClientDeal,
} from '../POSTerminal/_legacy/utils/dealPricing';

const round2 = (value) => Number((Number(value) || 0).toFixed(2));
const fmtPKR = (value) => `Rs. ${round2(value).toLocaleString('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const fmtPKRRange = (minimum, maximum) => {
  if (round2(minimum) === round2(maximum)) return fmtPKR(minimum);
  return `${fmtPKR(minimum)} – ${round2(maximum).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const cartStorageKey  = (slug, outlet, table) => `selfOrder:${slug}:${outlet}:${table}:cart`;
const ordersStorageKey = (slug, outlet, table) => `selfOrder:${slug}:${outlet}:${table}:orders`;
const cartLineKey = (itemId, variationId = null, dealSelections = []) => {
  const base = `${String(itemId)}::${variationId ? String(variationId) : ''}`;
  const signature = dealSelectionSignature(dealSelections);
  return signature ? `${base}::${signature}` : base;
};

const normalizeStoredCart = (stored) => Object.values(stored || {}).reduce((normalized, item) => {
  const itemId = item?._id || item?.menuItemId || item?.id;
  if (!itemId) return normalized;
  const variationId = item.variationId || item.variation?._id || item.variation?.id || null;
  const dealSelections = item.dealSelections || [];
  const lineKey = cartLineKey(itemId, variationId, dealSelections);
  normalized[lineKey] = {
    ...item,
    _id: itemId,
    lineKey,
    variationId,
    variationName: item.variationName || item.variation?.name || '',
    dealSelections,
  };
  return normalized;
}, {});

const GuestBrand = ({ compact = false }) => (
  <div className="inline-flex items-center gap-2.5">
    <span className={`${compact ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-2xl'} flex items-center justify-center bg-white/15 text-white shadow-inner ring-1 ring-white/25 backdrop-blur-sm`}>
      <ChefHat size={compact ? 17 : 20} strokeWidth={2.4} />
    </span>
    <span>
      <span className="block text-[9px] font-black uppercase tracking-[0.3em] text-white/60">Cenciss</span>
      <span className="block text-xs font-extrabold text-white">Guest ordering</span>
    </span>
  </div>
);

const GuestPageBackground = () => (
  <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
    <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-indigo-200/35 blur-3xl" />
    <div className="absolute -right-24 top-80 h-80 w-80 rounded-full bg-fuchsia-200/25 blur-3xl" />
    <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-cyan-100/35 blur-3xl" />
  </div>
);

const GuestTopBar = ({ restaurant, outlet, table, eyebrow, onBack }) => (
  <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/95 text-white shadow-xl shadow-slate-950/10 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
    <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-3 px-4 sm:px-6">
      {onBack && (
        <button type="button" onClick={onBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15" aria-label="Go back">
          <ChevronLeft size={19} />
        </button>
      )}
      <GuestBrand compact />
      <div className="ml-auto min-w-0 text-right">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300">{eyebrow}</p>
        <p className="truncate text-sm font-extrabold">{restaurant?.name}</p>
        <p className="truncate text-[10px] text-white/55">{outlet?.name ? `${outlet.name} · ` : ''}Table {table?.label}</p>
      </div>
    </div>
  </header>
);

// ─── localStorage helpers — tracked order numbers per table ──────────────────
const readTrackedOrders = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
};
const writeTrackedOrders = (key, list) => {
  try { localStorage.setItem(key, JSON.stringify(Array.from(new Set(list)))); } catch {}
};
const tokenStorageKey = (ordersKey) => `${ordersKey}:accessTokens`;
const readOrderTokens = (ordersKey) => {
  try { return JSON.parse(localStorage.getItem(tokenStorageKey(ordersKey)) || '{}'); } catch { return {}; }
};
const writeOrderToken = (ordersKey, orderNumber, token) => {
  if (!orderNumber || !token) return;
  try {
    localStorage.setItem(tokenStorageKey(ordersKey), JSON.stringify({
      ...readOrderTokens(ordersKey),
      [orderNumber]: token,
    }));
  } catch {}
};

// Active = waiting for the kitchen / being made / staff hasn't settled the bill yet.
// Once the cashier closes out the order it leaves this set.
const isActiveStatus = (s) => s === 'pending-approval' || s === 'held';
const isTrackedStatus = (s) => isActiveStatus(s) || s === 'void' || s === 'cancelled';

const SelfOrderApp = () => {
  const { tenantSlug, outletCode, tableCode } = useParams();

  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('menu'); // 'menu' | 'cart' | 'status'
  const [recentlyPlaced, setRecentlyPlaced] = useState(null);

  // Cart — keyed by table so the same phone at a different table starts fresh.
  const cartKey = cartStorageKey(tenantSlug, outletCode, tableCode);
  const ordersKey = ordersStorageKey(tenantSlug, outletCode, tableCode);
  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem(cartKey);
      return raw ? normalizeStoredCart(JSON.parse(raw)) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch {}
  }, [cart, cartKey]);

  // ── Active orders state (tracks every order the customer has placed at
  //    this table, refreshed by polling). The list survives a page refresh.
  const [activeOrders, setActiveOrders] = useState([]);
  const [billRequestBusy, setBillRequestBusy] = useState(null);

  const refreshTrackedOrders = useCallback(async () => {
    const tracked = readTrackedOrders(ordersKey);
    if (!tracked.length) { setActiveOrders([]); return; }
    const results = await Promise.all(
      tracked.map((num) => fetchPublicOrder(tenantSlug, num).then((r) => r.data).catch(() => null)),
    );
    const receivedAt = Date.now();
    const live = results.filter(Boolean).map((order) => ({ ...order, _receivedAt: receivedAt }));
    // Drop tracked numbers that 404'd or that the server says are settled,
    // so a refresh next time only fetches relevant ones.
    const stillTracked = live.filter((o) => isTrackedStatus(o.status));
    const stillTrackedNums = stillTracked.map((o) => o.orderNumber);
    writeTrackedOrders(ordersKey, stillTrackedNums);
    setActiveOrders(stillTracked);
  }, [tenantSlug, ordersKey]);

  // Initial fetch on mount, then subscribe to socket events so the
  // timeline updates the instant the cashier acts. No polling.
  useEffect(() => {
    refreshTrackedOrders();
    const sock = getCustomerSocket();
    // Re-fetch on reconnect — events that fired while we were disconnected
    // don't replay, so a quick re-seed catches us up.
    const onConnect = () => refreshTrackedOrders();
    sock.on('connect', onConnect);
    return () => { sock.off('connect', onConnect); };
  }, [refreshTrackedOrders]);

  // Subscribe to per-order rooms for every order this device is tracking,
  // and react to status events by patching the activeOrders state in place
  // (so the card animates to the next stage instantly).
  useEffect(() => {
    const tracked = readTrackedOrders(ordersKey);
    if (tracked.length === 0) return;
    const sock = getCustomerSocket();
    const cleanups = tracked.map((num) => joinOrderRoom(tenantSlug, num));

    const onStatus = (payload) => {
      if (!payload?.orderNumber) return;
      const normalizedStatus = payload.status === 'cancelled' ? 'void' : payload.status;
      const normalizedPayload = normalizedStatus === payload.status
        ? payload
        : { ...payload, status: normalizedStatus };
      playCustomerOrderAlert(normalizedStatus === 'void' ? 'cancelled' : 'status');
      // Keep declined orders until the guest has read the reason and chooses
      // to place another order. Settled orders can leave immediately.
      if (normalizedStatus && !isTrackedStatus(normalizedStatus)) {
        setActiveOrders((prev) => {
          const next = prev.filter((o) => o.orderNumber !== payload.orderNumber);
          // Trim localStorage too so a refresh doesn't try to track a dead order.
          const trackedLeft = readTrackedOrders(ordersKey).filter((n) => n !== payload.orderNumber);
          writeTrackedOrders(ordersKey, trackedLeft);
          return next;
        });
        return;
      }
      // Otherwise merge the authoritative server snapshot. Approval can
      // refresh current pricing, and confirmed kitchen printing advances the
      // customer timeline without changing the held sale status.
      setActiveOrders((prev) => prev.map((o) =>
        o.orderNumber === payload.orderNumber ? { ...o, ...normalizedPayload, _receivedAt: Date.now() } : o
      ));
    };

    sock.on('qr-order:status', onStatus);
    return () => {
      cleanups.forEach((fn) => fn());
      sock.off('qr-order:status', onStatus);
    };
    // Re-bind whenever the activeOrders length changes (so newly placed
    // orders get their own per-order subscription).
  }, [tenantSlug, ordersKey, activeOrders.length]);

  // The backend supplies both readyAt and serverNow. Using their difference
  // keeps this timer correct even if the guest's phone clock is inaccurate.
  // A reload or reconnect receives the same authoritative deadline again.
  useEffect(() => {
    const remainingFor = (order) => (
      new Date(order.readyAt).getTime()
      - new Date(order.serverNow).getTime()
      - (Date.now() - Number(order._receivedAt || Date.now()))
    );
    const candidates = activeOrders.filter((order) => (
      order.readyAt && order.serverNow && order.fulfillmentStatus !== 'ready' && order.status === 'held'
    ));
    if (!candidates.length) return undefined;
    const nextDelay = Math.min(...candidates.map(remainingFor));
    const timer = setTimeout(() => {
      playCustomerOrderAlert('ready');
      setActiveOrders((current) => current.map((order) => (
        order.readyAt && order.serverNow && remainingFor(order) <= 500
          ? { ...order, fulfillmentStatus: 'ready' }
          : order
      )));
    }, Math.max(0, nextDelay) + 250);
    return () => clearTimeout(timer);
  }, [activeOrders]);

  const reloadMenu = useCallback(() => {
    setLoading(true);
    fetchPublicMenu(tenantSlug, outletCode, tableCode)
      .then((r) => setMenu(r.data))
      .catch((err) => setError(err.body?.message || err.message || 'Could not load menu'))
      .finally(() => setLoading(false));
  }, [tenantSlug, outletCode, tableCode]);

  useEffect(() => { reloadMenu(); }, [reloadMenu]);

  // Subscribe to the table room so this device learns when:
  //   - the table becomes occupied by another party (qr-table:occupied)
  //   - the table is freed by settlement / decline (qr-table:freed)
  // Both events trigger a menu reload so the occupancy gate re-evaluates.
  const outletId = menu?.outlet?._id;
  useEffect(() => {
    if (!outletId) return;
    const cleanupJoin = joinTableRoom(tenantSlug, outletId, tableCode);
    const sock = getCustomerSocket();
    const onTableEvent = () => reloadMenu();
    sock.on('qr-table:occupied', onTableEvent);
    sock.on('qr-table:freed', onTableEvent);
    return () => {
      cleanupJoin();
      sock.off('qr-table:occupied', onTableEvent);
      sock.off('qr-table:freed', onTableEvent);
    };
  }, [tenantSlug, outletId, tableCode, reloadMenu]);

  const addItem = useCallback((item, selectedVariation = null, resolvedDeal = null) => {
    const variation = selectedVariation || (item.variationId ? {
      _id: item.variationId,
      name: item.variationName,
      price: item.price,
    } : null);
    const variationId = variation?._id || variation?.id || null;
    const deal = resolvedDeal || (item.dealSelections ? {
      dealSelections: item.dealSelections,
      dealComponents: item.dealComponents || [],
      summary: item.dealSummary || [],
      priceAdjustment: item.dealPriceAdjustment || 0,
    } : null);
    const dealSelections = deal?.dealSelections || [];
    const lineKey = cartLineKey(item._id, variationId, dealSelections);
    setCart((prev) => ({
      ...prev,
      [lineKey]: {
        ...item,
        lineKey,
        variationId,
        variationName: variation?.name || '',
        price: variation
          ? Number(variation.price || 0)
          : item.dealSelections
            ? Number(item.price || 0)
            : Number(item.price || 0) + Number(deal?.priceAdjustment || 0),
        dealSelections,
        dealComponents: deal?.dealComponents || [],
        dealSummary: deal?.summary || item.dealSummary || [],
        dealPriceAdjustment: Number(deal?.priceAdjustment || item.dealPriceAdjustment || 0),
        qty: (prev[lineKey]?.qty || 0) + 1,
      },
    }));
  }, []);
  const removeItem = useCallback((lineKey) => {
    setCart((prev) => {
      const next = { ...prev };
      const cur = next[lineKey];
      if (!cur) return prev;
      if (cur.qty <= 1) delete next[lineKey];
      else next[lineKey] = { ...cur, qty: cur.qty - 1 };
      return next;
    });
  }, []);
  const clearCart = useCallback(() => {
    setCart({});
    localStorage.removeItem(cartKey);
  }, [cartKey]);

  const liveMenuItems = useMemo(() => new Map(
    (menu?.categories || []).flatMap((category) => category.items || [])
      .map((item) => [String(item._id), item]),
  ), [menu]);
  // localStorage may contain an older menu snapshot. Always overlay the latest
  // server price/taxability before showing the customer a bill.
  const cartItems = Object.values(cart).flatMap((saved) => {
    const liveItem = liveMenuItems.get(String(saved._id));
    if (!liveItem) return [];
    const liveVariations = Array.isArray(liveItem.variations) ? liveItem.variations : [];
    const variationId = saved.variationId || saved.variation?._id || saved.variation?.id || null;
    const liveVariation = variationId
      ? liveVariations.find((variation) => String(variation._id) === String(variationId))
      : null;
    // A sized item must retain a valid selection. If the menu changed since
    // localStorage was written, hide the stale line instead of silently using
    // the base price or another size.
    if ((liveVariations.length > 0 && !liveVariation) || (liveVariations.length === 0 && variationId)) {
      return [];
    }
    const resolvedDeal = resolveClientDeal(liveItem, saved.dealSelections || []);
    if (!resolvedDeal.ok) return [];
    const lineKey = cartLineKey(saved._id, variationId, resolvedDeal.dealSelections);
    return [{
      ...saved,
      ...liveItem,
      lineKey,
      variationId,
      variationName: liveVariation?.name || '',
      price: (Number(liveVariation ? liveVariation.price : liveItem.price) || 0) + resolvedDeal.priceAdjustment,
      dealSelections: resolvedDeal.dealSelections,
      dealComponents: resolvedDeal.dealComponents,
      dealSummary: resolvedDeal.summary,
      dealPriceAdjustment: resolvedDeal.priceAdjustment,
      qty: saved.qty,
    }];
  });
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cartTaxRate = Number(menu?.pricing?.taxRate || 0);
  const cartServiceChargeRate = Number(menu?.pricing?.serviceChargeRate || 0);
  const cartPricing = calculateCartCharges(cartItems, {
    taxRate: cartTaxRate,
    serviceChargeRate: cartServiceChargeRate,
  });
  const cartSubtotal = cartPricing.subtotal;
  const cartTax = cartPricing.taxAmount;
  const cartServiceCharge = cartPricing.serviceChargeAmount;
  const cartTotal = round2(cartSubtotal + cartTax + cartServiceCharge);

  const handlePlaced = useCallback((order) => {
    // Persist the order number so a refresh restores tracking.
    const tracked = readTrackedOrders(ordersKey);
    writeTrackedOrders(ordersKey, [...tracked, order.orderNumber]);
    writeOrderToken(ordersKey, order.orderNumber, order.accessToken);
    clearCart();
    setRecentlyPlaced(order.orderNumber);
    refreshTrackedOrders();
    setView('status');
    // Clear the "just placed" highlight after a bit.
    setTimeout(() => setRecentlyPlaced(null), 8000);
  }, [ordersKey, clearCart, refreshTrackedOrders]);

  const handleRequestBill = useCallback(async (order, billType) => {
    const accessToken = readOrderTokens(ordersKey)[order.orderNumber];
    if (!accessToken) return;
    setBillRequestBusy(order.orderNumber);
    try {
      const response = await requestPublicBill(tenantSlug, order.orderNumber, accessToken, billType);
      setActiveOrders((current) => current.map((item) => (
        item.orderNumber === order.orderNumber
          ? { ...item, ...response.data, _receivedAt: Date.now(), billRequestError: '' }
          : item
      )));
    } catch (requestError) {
      setActiveOrders((current) => current.map((item) => (
        item.orderNumber === order.orderNumber
          ? { ...item, billRequestError: requestError.body?.message || requestError.message }
          : item
      )));
    } finally {
      setBillRequestBusy(null);
    }
  }, [ordersKey, tenantSlug]);

  const handlePlaceAnother = useCallback(() => {
    const active = activeOrders.filter((order) => isActiveStatus(order.status));
    setActiveOrders(active);
    writeTrackedOrders(ordersKey, active.map((order) => order.orderNumber));
    setRecentlyPlaced(null);
    setView('menu');
  }, [activeOrders, ordersKey]);

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f6fb] px-6">
        <GuestPageBackground />
        <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-8 text-center text-white shadow-2xl shadow-indigo-950/25">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Loader2 className="animate-spin text-indigo-200" size={28} />
          </div>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.28em] text-indigo-300">Cenciss guest ordering</p>
          <h1 className="mt-2 text-xl font-black">Preparing your menu</h1>
          <p className="mt-1 text-xs text-white/55">Fresh prices and availability are loading.</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f6fb] px-6">
        <GuestPageBackground />
        <div className="relative max-w-sm rounded-[2rem] border border-rose-100 bg-white p-7 text-center shadow-2xl shadow-slate-900/10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-1 ring-rose-100">
            <AlertTriangle size={25} />
          </div>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.24em] text-rose-500">Menu unavailable</p>
          <h1 className="mt-2 text-lg font-black text-slate-950">{error}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">Please ask a member of staff for assistance.</p>
        </div>
      </div>
    );
  }

  const activeCount = activeOrders.filter((order) => isActiveStatus(order.status)).length;
  const statusCount = activeOrders.length;
  const orderTokens = readOrderTokens(ordersKey);

  // Table occupancy — if the server says active orders exist on this table
  // and none of them belong to this device's localStorage trail, this
  // visitor is a NEW party who shouldn't be able to place orders until the
  // current party's bill is settled.
  const serverActiveNumbers = menu?.table?.activeOrderNumbers || [];
  const myTrackedNumbers = readTrackedOrders(ordersKey);
  const isOurTable = serverActiveNumbers.length === 0
    || serverActiveNumbers.some((n) => myTrackedNumbers.includes(n));
  const tableOccupied = !isOurTable;

  // Table is busy with another party's orders — block ordering entirely.
  // The other-party's customer has their own device + localStorage and will
  // never see this screen because their tracked orders match the server's
  // list. New visitors hit this screen until the cashier settles the bill.
  if (tableOccupied) {
    return (
      <TableOccupiedView
        restaurant={menu?.restaurant}
        outlet={menu?.outlet}
        table={menu?.table}
        activeSince={menu?.table?.activeSince}
      />
    );
  }

  if (view === 'status') {
    return (
      <StatusView
        restaurant={menu?.restaurant}
        outlet={menu?.outlet}
        table={menu?.table}
        orders={activeOrders}
        recentlyPlaced={recentlyPlaced}
        onBackToMenu={() => setView('menu')}
        onPlaceAnother={handlePlaceAnother}
        onRequestBill={handleRequestBill}
        billRequestBusy={billRequestBusy}
        orderTokens={orderTokens}
      />
    );
  }

  if (view === 'cart') {
    return (
      <CartView
        restaurant={menu?.restaurant}
        outlet={menu?.outlet}
        table={menu?.table}
        cartItems={cartItems}
        cartCount={cartCount}
        cartSubtotal={cartSubtotal}
        cartTax={cartTax}
        cartTaxRate={cartTaxRate}
        cartServiceCharge={cartServiceCharge}
        cartServiceChargeRate={cartServiceChargeRate}
        cartTotal={cartTotal}
        onBack={() => setView('menu')}
        addItem={addItem}
        removeItem={removeItem}
        onPlaced={handlePlaced}
        tenantSlug={tenantSlug}
        outletCode={outletCode}
        tableCode={tableCode}
      />
    );
  }

  return (
    <MenuView
      menu={menu}
      cartItems={cartItems}
      cartCount={cartCount}
      cartTotal={cartTotal}
      addItem={addItem}
      removeItem={removeItem}
      onCart={() => setView('cart')}
      activeCount={activeCount}
      statusCount={statusCount}
      onOpenStatus={() => setView('status')}
    />
  );
};

// ─── Menu list view ──────────────────────────────────────────────────────────
const VariationPicker = ({ item, cartItems, onSelect, onClose }) => createPortal(
  <div
    className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-4 backdrop-blur-[2px] sm:items-center"
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="variation-picker-title"
      className="w-full max-w-sm rounded-[1.5rem] bg-white p-5 shadow-2xl shadow-slate-950/30"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Select an option</p>
          <h2 id="variation-picker-title" className="mt-1 text-base font-black text-slate-950">Choose a size — {item.name}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200" aria-label="Close size picker">
          <X size={16} />
        </button>
      </div>
      <div className="space-y-2">
        {item.variations.map((variation) => {
          const selectedQty = cartItems.find(
            (line) => String(line._id) === String(item._id)
              && String(line.variationId) === String(variation._id),
          )?.qty || 0;
          return (
            <button
              key={variation._id}
              type="button"
              onClick={() => onSelect(variation)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50 active:scale-[0.98]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-800">{variation.name}</span>
                {selectedQty > 0 && <span className="mt-0.5 block text-[10px] font-bold text-indigo-600">{selectedQty} in order</span>}
              </span>
              <span className="shrink-0 text-sm font-black tabular-nums text-indigo-700">{fmtPKR(variation.price)}</span>
            </button>
          );
        })}
      </div>
    </div>
  </div>,
  document.body,
);

export const MenuView = ({ menu, cartItems, cartCount, cartTotal, addItem, removeItem, onCart, activeCount, statusCount, onOpenStatus }) => {
  const [search, setSearch] = useQueryState('search', '');
  const [requestedCategory, setRequestedCategory] = useQueryState('category', '');
  const activeCat = requestedCategory || menu?.categories?.[0]?.name || '';
  const [variationItem, setVariationItem] = useState(null);
  const [dealItem, setDealItem] = useState(null);

  const filteredCats = useMemo(() => {
    if (!menu?.categories) return [];
    const q = search.trim().toLowerCase();
    if (!q) return menu.categories;
    return menu.categories
      .map((c) => ({
        ...c,
        items: c.items.filter((item) => (
          item.name.toLowerCase().includes(q)
          || (item.variations || []).some((variation) => variation.name?.toLowerCase().includes(q))
        )),
      }))
      .filter((c) => c.items.length > 0);
  }, [menu, search]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#f5f6fb] pb-32 text-slate-950">
      <GuestPageBackground />
      <header className="relative z-20 overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 text-white shadow-2xl shadow-indigo-950/15 pt-[env(safe-area-inset-top)]">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-5 pt-4 sm:px-6 sm:pb-7 sm:pt-5">
          <div className="flex items-center justify-between gap-3">
            <GuestBrand />
            <div className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-right ring-1 ring-white/15 backdrop-blur-md">
              <MapPin size={14} className="text-indigo-300" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/50">Your table</p>
                <p className="text-sm font-black leading-none">{menu?.table?.label}</p>
              </div>
            </div>
          </div>

          <div className="mt-7 max-w-2xl sm:mt-10">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-indigo-300">{menu?.outlet?.name}</p>
            <h1 className="mt-2 text-3xl font-black leading-[1.05] tracking-tight sm:text-5xl">{menu?.restaurant?.name}</h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60 sm:text-base">Choose your favourites and send them directly to the restaurant team.</p>
          </div>

          <div className="relative mt-6 max-w-2xl sm:mt-8">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes, drinks and more…"
              className="h-14 w-full rounded-2xl border border-white/15 bg-white pl-12 pr-4 text-sm font-semibold text-slate-900 shadow-2xl shadow-slate-950/20 outline-none transition placeholder:text-slate-400 focus:ring-4 focus:ring-indigo-400/25"
            />
          </div>

        </div>
      </header>

      {!search.trim() && menu?.categories && menu.categories.length > 1 && (
        <nav
          aria-label="Menu categories"
          className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.45)] backdrop-blur-xl"
        >
          <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3 scrollbar-hide sm:px-6">
            {menu.categories.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => {
                  setRequestedCategory(c.name);
                  document.getElementById(`cat-${c.name}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-extrabold ring-1 transition ${
                  activeCat === c.name
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20 ring-indigo-600'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:ring-indigo-200'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Active orders banner */}
      {statusCount > 0 && (
        <button
          type="button"
          onClick={onOpenStatus}
          className="relative z-10 mx-auto mt-5 block w-full max-w-6xl px-4 sm:px-6"
        >
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/70 bg-white px-4 py-3.5 text-emerald-950 shadow-lg shadow-emerald-900/5">
            <div className="flex items-center gap-2.5 text-left">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25">
                <Bell size={17} />
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500 ring-2 ring-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-extrabold">
                  {activeCount > 0
                    ? `${activeCount} active order${activeCount === 1 ? '' : 's'}`
                    : 'Order update available'}
                </p>
                <p className="text-[11px] text-emerald-700">
                  {activeCount > 0 ? 'Follow live preparation status' : 'View the restaurant’s response'}
                </p>
              </div>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><ArrowRight size={15} /></span>
          </div>
        </button>
      )}

      {/* Categories + items */}
      <main className="relative z-10 mx-auto max-w-6xl space-y-10 px-4 pt-7 sm:px-6 sm:pt-10">
        {filteredCats.map((c) => (
          <section key={c.name} id={`cat-${c.name}`} className="scroll-mt-20">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Explore</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{c.name}</h2>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-extrabold text-slate-500 shadow-sm ring-1 ring-slate-200">{c.items.length} item{c.items.length === 1 ? '' : 's'}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {c.items.map((item) => {
                const variations = Array.isArray(item.variations) ? item.variations : [];
                const hasVariations = variations.length > 0;
                const isDeal = item.itemType === 'deal';
                const itemCartLines = cartItems.filter((line) => String(line._id) === String(item._id));
                const inCart = itemCartLines.reduce((total, line) => total + Number(line.qty || 0), 0);
                const singleLine = itemCartLines.find((line) => !line.variationId);
                const variationPrices = variations.map((variation) => Number(variation.price || 0));
                const minimumPrice = hasVariations ? Math.min(...variationPrices) : Number(item.price || 0);
                const maximumPrice = hasVariations ? Math.max(...variationPrices) : Number(item.price || 0);
                const addDeal = () => {
                  if ((item.dealConfig?.choiceGroups || []).length) {
                    setDealItem(item);
                    return;
                  }
                  const resolved = resolveClientDeal(item, []);
                  if (resolved.ok) addItem(item, null, resolved);
                };
                return (
                  <article key={item._id} className="group flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-white bg-white shadow-[0_12px_35px_-22px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_-24px_rgba(79,70,229,0.38)] hover:ring-indigo-200">
                    <div className="relative h-36 shrink-0 overflow-hidden bg-gradient-to-br from-indigo-100 via-violet-50 to-fuchsia-100 sm:h-40">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/60 text-indigo-500 shadow-xl ring-1 ring-white/80 backdrop-blur-sm"><ChefHat size={27} /></div>
                        </div>
                      )}
                      {inCart > 0 && <span className="absolute right-3 top-3 rounded-full bg-slate-950/85 px-2.5 py-1 text-[10px] font-black text-white shadow-lg backdrop-blur-sm">{inCart} in order</span>}
                      {isDeal && <span className="absolute left-3 top-3 rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg">Deal</span>}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div className="min-h-[58px]">
                        <h3 className="text-base font-black leading-tight text-slate-950">{item.name}</h3>
                        {item.description ? <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{item.description}</p> : <p className="mt-1 text-[11px] text-slate-400">Prepared fresh for your table</p>}
                      </div>
                      {hasVariations ? (
                        <div className="mt-auto pt-4">
                          <div>
                            <div className="min-w-0">
                              <p className="whitespace-nowrap text-[15px] font-black tabular-nums text-indigo-700 sm:text-base">
                                {fmtPKRRange(minimumPrice, maximumPrice)}
                              </p>
                              <p className="mt-0.5 text-[10px] font-bold text-slate-400">Multiple sizes available</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setVariationItem(item)}
                            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-xs font-extrabold text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:shadow-indigo-500/30 active:translate-y-0 active:scale-[0.99]"
                            aria-label={`Choose a size for ${item.name}`}
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                              <Plus size={14} strokeWidth={2.5} />
                            </span>
                            Choose a size
                          </button>
                        </div>
                      ) : (
                        <div className="mt-auto pt-4">
                          <div>
                            <p className="whitespace-nowrap text-[15px] font-black tabular-nums text-indigo-700 sm:text-base">{fmtPKR(minimumPrice)}</p>
                            <p className="mt-0.5 text-[10px] font-bold text-slate-400">{isDeal ? 'Combo deal' : 'Standard item'}</p>
                          </div>
                          {inCart === 0 || isDeal ? (
                            <button
                              type="button"
                              onClick={() => (isDeal ? addDeal() : addItem(item))}
                              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-xs font-extrabold text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:shadow-indigo-500/30 active:translate-y-0 active:scale-[0.99]"
                              aria-label={`Add ${item.name} to order`}
                            >
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                                <Plus size={14} strokeWidth={2.5} />
                              </span>
                              {isDeal && (item.dealConfig?.choiceGroups || []).length ? 'Choose options' : 'Add to order'}
                            </button>
                          ) : (
                            <div className="mt-3 grid h-11 w-full grid-cols-[2.75rem_1fr_2.75rem] items-center overflow-hidden rounded-xl bg-indigo-50 shadow-sm ring-1 ring-indigo-100">
                              <button
                                type="button"
                                onClick={() => removeItem(singleLine?.lineKey || cartLineKey(item._id))}
                                className="inline-flex h-full items-center justify-center bg-white text-indigo-600 transition hover:bg-indigo-50 active:scale-95"
                                aria-label={`Decrease ${item.name}`}
                              >
                                <Minus size={14} strokeWidth={2.5} />
                              </button>
                              <span className="text-center text-xs font-extrabold tabular-nums text-indigo-900">
                                {inCart} in order
                              </span>
                              <button
                                type="button"
                                onClick={() => addItem(item)}
                                className="inline-flex h-full items-center justify-center bg-gradient-to-br from-indigo-600 to-violet-600 text-white transition hover:brightness-110 active:scale-95"
                                aria-label={`Increase ${item.name}`}
                              >
                                <Plus size={14} strokeWidth={2.5} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        {filteredCats.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 py-16 text-center shadow-sm">
            <Search size={28} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-600">No items match “{search}”</p>
            <p className="mt-1 text-xs text-slate-400">Try another dish or category.</p>
          </div>
        )}
      </main>

      {variationItem && (
        <VariationPicker
          item={variationItem}
          cartItems={cartItems}
          onSelect={(variation) => {
            addItem(variationItem, variation);
            setVariationItem(null);
          }}
          onClose={() => setVariationItem(null)}
        />
      )}
      {dealItem && (
        <DealChoiceModal
          item={dealItem}
          basePrice={Number(dealItem.price || 0)}
          onClose={() => setDealItem(null)}
          onConfirm={(resolved) => {
            addItem(dealItem, null, resolved);
            setDealItem(null);
          }}
        />
      )}

      {/* Floating cart button */}
      {cartCount > 0 && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-30 mx-auto max-w-xl">
          <button
            type="button"
            onClick={onCart}
            className="flex w-full items-center justify-between rounded-2xl border border-white/20 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-4 py-3.5 text-white shadow-2xl shadow-indigo-950/30 ring-4 ring-white/70 transition hover:shadow-indigo-500/40 active:scale-[0.99]"
          >
            <span className="inline-flex items-center gap-2">
              <span className="bg-white/20 backdrop-blur-sm rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold">{cartCount}</span>
              <span className="text-sm font-extrabold">Review order</span>
            </span>
            <span className="text-sm font-extrabold tabular-nums">{fmtPKR(cartTotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
};

const CustomerPaymentCard = ({ payment }) => {
  const [copied, setCopied] = useState('');
  const copy = async (label, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('Copy unavailable');
    }
  };
  const normalizedIban = String(payment.iban || '').replace(/\s+/g, '');
  const formattedIban = normalizedIban.replace(/(.{4})/g, '$1 ').trim();

  return (
    <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3">
        <Landmark size={16} className="text-indigo-600" />
        <div>
          <p className="text-sm font-extrabold text-slate-900">Pay by bank transfer</p>
          <p className="text-[10px] text-slate-500">Transfer, then show confirmation to the cashier.</p>
        </div>
      </div>
      <div className="space-y-2.5 p-4 text-xs">
        {payment.bankName && <PaymentRow label="Bank" value={payment.bankName} />}
        {payment.accountTitle && <PaymentRow label="Account title" value={payment.accountTitle} />}
        {payment.accountNumber && (
          <PaymentRow label="Account number" value={payment.accountNumber} onCopy={() => copy('Account number', payment.accountNumber)} />
        )}
        {formattedIban && (
          <PaymentRow label="IBAN" value={formattedIban} onCopy={() => copy('IBAN', normalizedIban)} />
        )}
        {payment.instructions && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">{payment.instructions}</p>}
        {copied && <p className="text-center text-[10px] font-bold text-emerald-600">{copied === 'Copy unavailable' ? copied : `${copied} copied`}</p>}
      </div>
    </div>
  );
};

const PaymentRow = ({ label, value, onCopy }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="break-all font-mono font-bold text-slate-800">{value}</p>
    </div>
    {onCopy && (
      <button type="button" onClick={onCopy} className="shrink-0 rounded-lg bg-indigo-50 p-2 text-indigo-600" aria-label={`Copy ${label}`}>
        <Copy size={13} />
      </button>
    )}
  </div>
);

// ─── Cart view ───────────────────────────────────────────────────────────────
const CartView = ({ restaurant, outlet, table, cartItems, cartCount, cartSubtotal, cartTax, cartTaxRate, cartServiceCharge, cartServiceChargeRate, cartTotal, onBack, addItem, removeItem, onPlaced, tenantSlug, outletCode, tableCode }) => {
  const [phone, setPhone] = useState(() => localStorage.getItem('selfOrder:lastPhone') || '');
  const [name, setName] = useState(() => localStorage.getItem('selfOrder:lastName') || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    // This click is a valid browser user gesture, so unlock status sounds
    // before the network request yields control. Guests who reload can enable
    // them again from the live-status screen.
    void unlockCustomerOrderSound({ confirmation: false });
    if (!phone.trim()) { setErr('Phone number is required.'); return; }
    if (cartItems.length === 0) { setErr('Your cart is empty.'); return; }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await placePublicOrder(tenantSlug, outletCode, tableCode, {
        items: cartItems.map((i) => ({
          menuItemId: i._id,
          variationId: i.variationId || undefined,
          dealSelections: i.dealSelections || [],
          qty: i.qty,
        })),
        customerPhone: phone.trim(),
        customerName: name.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      localStorage.setItem('selfOrder:lastPhone', phone.trim());
      if (name.trim()) localStorage.setItem('selfOrder:lastName', name.trim());
      onPlaced(r.data);
    } catch (e) {
      // Server says someone else's order is still active on this table —
      // refresh the whole page so the user sees the proper "occupied" screen
      // instead of a tiny inline error they might not understand.
      if (e.body?.code === 'TABLE_OCCUPIED') {
        window.location.reload();
        return;
      }
      setErr(e.body?.message || e.message || 'Could not place order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5f6fb] pb-32">
      <GuestPageBackground />
      <GuestTopBar restaurant={restaurant} outlet={outlet} table={table} eyebrow="Review order" onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-3xl space-y-4 px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-5 text-white shadow-xl shadow-indigo-950/15">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-300">Your table order</p>
              <h1 className="mt-1 text-2xl font-black">Almost ready</h1>
              <p className="mt-1 text-xs text-white/55">Review your selections and tell us who to call.</p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-indigo-200 ring-1 ring-white/15"><ShoppingBag size={23} /></div>
          </div>
        </div>
        {/* Items */}
        <div className="divide-y divide-slate-100 overflow-hidden rounded-[1.4rem] border border-white bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.4)] ring-1 ring-slate-200/70">
          {cartItems.length === 0 ? (
            <p className="p-5 text-sm text-slate-400 text-center">Your cart is empty.</p>
          ) : cartItems.map((it) => (
            <div key={it.lineKey} className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-500 ring-1 ring-indigo-100">
                {it.imageUrl ? <img src={it.imageUrl} alt="" className="h-full w-full object-cover" /> : <ChefHat size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate font-extrabold leading-tight text-slate-950">{it.name}</p>
                {it.variationName && <p className="mt-0.5 truncate text-[10px] font-black uppercase tracking-wide text-indigo-600">{it.variationName}</p>}
                {it.dealSummary?.length > 0 && <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-violet-600">{it.dealSummary.join(' · ')}</p>}
                <p className="text-[11px] text-slate-500">{fmtPKR(it.price)} each</p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 p-1 ring-1 ring-indigo-100">
                <button type="button" onClick={() => removeItem(it.lineKey)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm active:scale-95" aria-label={`Decrease ${it.name}${it.variationName ? ` ${it.variationName}` : ''}`}>
                  <Minus size={13} />
                </button>
                <span className="text-sm font-bold text-indigo-800 min-w-[18px] text-center tabular-nums">{it.qty}</span>
                <button type="button" onClick={() => addItem(it)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm active:scale-95" aria-label={`Increase ${it.name}${it.variationName ? ` ${it.variationName}` : ''}`}>
                  <Plus size={13} />
                </button>
              </div>
              <p className="hidden w-24 text-right font-black tabular-nums text-slate-950 sm:block">{fmtPKR(it.qty * it.price)}</p>
            </div>
          ))}
        </div>

        {/* Bill summary */}
        {cartItems.length > 0 && (
          <div className="space-y-2 rounded-[1.4rem] border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/50 p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 border-b border-indigo-100 pb-3">
              <Receipt size={15} className="text-indigo-600" />
              <p className="text-sm font-black text-slate-950">Bill summary</p>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span className="font-semibold tabular-nums">{fmtPKR(cartSubtotal)}</span>
            </div>
            {cartTax > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Tax{cartTaxRate > 0 ? ` (${cartTaxRate}%)` : ''}</span>
                <span className="font-semibold tabular-nums">{fmtPKR(cartTax)}</span>
              </div>
            )}
            {cartServiceChargeRate > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Service Charge ({cartServiceChargeRate}%)</span>
                <span className="font-semibold tabular-nums">{fmtPKR(cartServiceCharge)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-indigo-100 pt-3 text-lg font-black text-slate-950">
              <span>Total</span>
              <span className="tabular-nums">{fmtPKR(cartTotal)}</span>
            </div>
          </div>
        )}

        {/* Customer details */}
        <div className="space-y-4 rounded-[1.4rem] border border-white bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.4)] ring-1 ring-slate-200/70">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Guest details</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">How can we identify your order?</h3>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Phone <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03XX-XXXXXXX"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Name (optional)</label>
            <div className="relative">
              <UserIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergies, special requests, etc."
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            />
          </div>
        </div>

        {/* Approval-first notice */}
        <div className="flex items-start gap-3 rounded-[1.3rem] border border-emerald-100 bg-emerald-50/70 p-4">
          <ShieldCheck size={17} className="mt-0.5 flex-shrink-0 text-emerald-600" />
          <p className="text-[12px] leading-snug text-emerald-900">
            Your order is reviewed by a staff member before preparation. You’ll receive live status and separate preparation timers after confirmation.
          </p>
        </div>

        {err && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700 flex items-start gap-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {err}
          </div>
        )}
      </main>

      {cartItems.length > 0 && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-30 mx-auto max-w-3xl">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex w-full items-center justify-between rounded-2xl border border-white/20 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-4 py-4 text-white shadow-2xl shadow-indigo-950/30 ring-4 ring-white/75 transition hover:shadow-indigo-500/40 active:scale-[0.99] disabled:opacity-60"
          >
            <span className="text-sm font-bold">{submitting ? 'Sending…' : `Place Order · ${cartCount} item${cartCount === 1 ? '' : 's'}`}</span>
            <span className="text-sm font-extrabold tabular-nums">{fmtPKR(cartTotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Table occupied screen — shown to visitors who scan a QR while the
//     previous party's order is still pending/in-kitchen. Auto-refreshes so
//     it unblocks the moment the cashier settles the bill. ─────────────────
const TableOccupiedView = ({ restaurant, outlet, table, activeSince }) => {
  // No timer — the parent SelfOrderApp subscribes to qr-table:freed via
  // socket and reloads the menu the instant the cashier settles or
  // declines the previous party's order. Falling back to a manual
  // "Check again" button covers the rare case of a long disconnect.

  const sinceLabel = (() => {
    if (!activeSince) return null;
    const mins = Math.max(0, Math.round((Date.now() - new Date(activeSince).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 minute ago';
    if (mins < 60) return `${mins} minutes ago`;
    const h = Math.floor(mins / 60);
    return h === 1 ? '1 hour ago' : `${h} hours ago`;
  })();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f6fb] px-5 py-10">
      <GuestPageBackground />
      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200/60">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 px-6 pb-8 pt-6 text-center text-white">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/30 blur-3xl" />
          <div className="relative flex justify-center"><GuestBrand /></div>
          <div className="relative mx-auto mt-7 flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-400 text-slate-950 shadow-2xl shadow-amber-400/25 ring-4 ring-white/10">
            <Lock size={30} />
          </div>
          <p className="relative mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">Table unavailable</p>
          <h1 className="relative mt-2 text-2xl font-black leading-tight">{table?.label || 'This table'} is currently occupied</h1>
          <p className="relative mt-2 text-sm leading-relaxed text-white/60">Another guest has an active order at {restaurant?.name}{outlet?.name ? ` · ${outlet.name}` : ''}.</p>
          {sinceLabel && <p className="relative mt-2 text-[11px] font-semibold text-white/40">Active since {sinceLabel}</p>}
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">What happens next</p>
          <ul className="mt-3 space-y-3 text-[13px] leading-relaxed text-slate-600">
            <li className="flex items-start gap-2">
              <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-emerald-500" />
              <span>Wait until the current party's bill is settled — this page refreshes automatically.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
              <span>Or scan the QR on a different table.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
              <span>Or ask the staff if they can help you order.</span>
            </li>
          </ul>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/20 transition hover:shadow-indigo-500/30">
            <Loader2 size={14} /> Check table again
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Status view — list of all active orders for this table ──────────────────
const STATUS_STAGES = [
  { key: 'sent',      label: 'Sent',      Icon: Receipt },
  { key: 'confirmed', label: 'Confirmed', Icon: CheckCircle2 },
  { key: 'kitchen',   label: 'In Kitchen', Icon: ChefHat },
  { key: 'ready',     label: 'Ready',      Icon: Bell },
];
const stageIndexFor = (status) => {
  if (status === 'pending-approval') return 0;
  if (status === 'held') return 1;
  if (status === 'completed') return 3;
  return 0;
};

const CustomerSoundButton = () => {
  const [enabled, setEnabled] = useState(isCustomerOrderSoundUnlocked);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => subscribeCustomerOrderSound(setEnabled), []);

  const enable = async () => {
    setEnabling(true);
    await unlockCustomerOrderSound();
    setEnabling(false);
  };

  return (
    <button
      type="button"
      onClick={enable}
      disabled={enabled || enabling}
      className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-extrabold transition ${
        enabled
          ? 'cursor-default bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
          : 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-700'
      }`}
      aria-label={enabled ? 'Order sound alerts enabled' : 'Enable order sound alerts'}
    >
      <Volume2 size={13} />
      {enabling ? 'Enabling…' : enabled ? 'Alerts on' : 'Enable alerts'}
    </button>
  );
};

const StatusView = ({ restaurant, outlet, table, orders, recentlyPlaced, onBackToMenu, onPlaceAnother, onRequestBill, billRequestBusy, orderTokens }) => {
  const activeOrderCount = orders.filter((order) => isActiveStatus(order.status)).length;
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5f6fb] pb-24">
      <GuestPageBackground />
      <GuestTopBar restaurant={restaurant} outlet={outlet} table={table} eyebrow="Live order status" onBack={onBackToMenu} />

      <main className="relative z-10 mx-auto max-w-lg space-y-4 px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="rounded-[1.5rem] border border-white bg-white/85 p-4 shadow-lg shadow-slate-900/5 ring-1 ring-slate-200/70 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400 opacity-50" />
              <Bell size={17} className="relative" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">Live from the restaurant</p>
              <p className="text-[11px] text-slate-500">Status and preparation times update automatically.</p>
            </div>
            <CustomerSoundButton />
          </div>
        </div>
        {orders.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
            <CircleDashed size={32} className="mx-auto text-slate-300" />
            <h2 className="mt-3 text-base font-bold text-slate-700">No active orders</h2>
            <p className="mt-1 text-[12px] text-slate-500">Place an order to see its live status here.</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 px-1">
              {activeOrderCount > 0
                ? `${activeOrderCount} active order${activeOrderCount === 1 ? '' : 's'}`
                : `${orders.length} order update${orders.length === 1 ? '' : 's'}`}
            </p>
            {orders.map((order) => (
              <OrderStatusCard
                key={order.orderNumber}
                order={order}
                isNew={order.orderNumber === recentlyPlaced}
                onRequestBill={onRequestBill}
                requestBusy={billRequestBusy === order.orderNumber}
                canRequestBill={Boolean(orderTokens?.[order.orderNumber])}
                payment={outlet?.customerPayment}
              />
            ))}
          </>
        )}

        {/* Place another */}
        <button
          type="button"
          onClick={onPlaceAnother}
          className="w-full mt-2 rounded-2xl border-2 border-dashed border-indigo-200 bg-white py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 transition inline-flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Place another order
        </button>

        <p className="text-[11px] text-center text-slate-400 mt-1 leading-snug">
          Live updates appear automatically as the cashier and kitchen process your order.
        </p>
      </main>
    </div>
  );
};

const formatTimeLeft = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const OrderStatusCard = ({ order, isNew, onRequestBill, requestBusy, canRequestBill, payment }) => {
  const status = order.status || 'pending-approval';
  const addOnPending = Boolean(order.addOnPendingApproval);
  const fulfillment = order.fulfillmentStatus;
  const [clockNow, setClockNow] = useState(Date.now());
  const [receivedFallback] = useState(Date.now());
  const [selectedAction, setSelectedAction] = useState('');
  const receivedAt = Number(order._receivedAt || receivedFallback);
  const preparationCategories = Array.isArray(order.preparationCategories) && order.preparationCategories.length > 0
    ? order.preparationCategories
    : order.readyAt
      ? [{ key: 'default', name: 'Kitchen', readyAt: order.readyAt, status: fulfillment === 'ready' ? 'ready' : 'in-kitchen' }]
      : [];
  const preparationNames = preparationCategories.map((category) => category.name).filter(Boolean);
  const preparationLabel = preparationNames.length > 0 ? preparationNames.join(', ') : 'Kitchen';
  const timeLeftFor = (category) => category.readyAt && order.serverNow
    ? new Date(category.readyAt).getTime()
      - new Date(order.serverNow).getTime()
      - (clockNow - receivedAt)
    : 0;

  useEffect(() => {
    if (fulfillment !== 'in-kitchen' || !order.serverNow) return undefined;
    setClockNow(Date.now());
    const interval = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [fulfillment, order.serverNow]);
  const stageIdx = addOnPending ? 0
    : fulfillment === 'ready' ? 3
      : fulfillment === 'in-kitchen' ? 2
        : fulfillment === 'confirmed' ? 1
          : stageIndexFor(status);
  const isVoid = status === 'void';
  const isCompleted = status === 'completed';
  const kitchenActionsAvailable = status === 'held'
    && !addOnPending
    && ['in-kitchen', 'ready'].includes(fulfillment);
  const onlinePaymentEnabled = Boolean(payment?.enabled);
  const requestedBillLabel = order.billRequest?.billType === 'card'
    ? 'Card Bill'
    : order.billRequest?.billType === 'cash'
      ? 'Cash Bill'
      : 'bill';

  const statusBlock = isVoid
    ? {
        gradient: 'from-rose-500 via-red-500 to-rose-600',
        ring: 'ring-rose-200',
        title: 'Declined',
        sub: order.declineReason || 'Order not accepted.',
        Icon: X,
      }
    : isCompleted
      ? {
          gradient: 'from-slate-500 to-slate-700',
          ring: 'ring-slate-200',
          title: 'Settled',
          sub: 'Thanks for visiting!',
          Icon: CheckCircle2,
        }
      : addOnPending
        ? {
            gradient: 'from-amber-400 via-orange-500 to-amber-500',
            ring: 'ring-amber-200',
            title: 'Add-on awaiting confirmation',
            sub: 'Your new items were added to the same bill and are being reviewed by staff.',
            Icon: Clock,
          }
      : status === 'pending-approval'
        ? {
            gradient: 'from-amber-400 via-orange-500 to-amber-500',
            ring: 'ring-amber-200',
            title: 'Awaiting confirmation',
            sub: 'Staff is reviewing your order.',
            Icon: Clock,
          }
        : status === 'held' && !order.kitchenPrintedAt
          ? {
              gradient: 'from-indigo-500 via-violet-500 to-purple-600',
              ring: 'ring-indigo-200',
              title: 'Confirmed',
              sub: 'Staff is sending your order to the kitchen.',
              Icon: CheckCircle2,
            }
          : fulfillment === 'ready'
            ? {
                gradient: 'from-emerald-500 via-green-500 to-teal-600',
                ring: 'ring-emerald-200',
                title: 'Ready',
                sub: 'Your order should be ready. Please ask a staff member if you need help.',
                Icon: Bell,
              }
            : {
                gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
                ring: 'ring-emerald-200',
                title: `Confirmed — in ${preparationLabel}`,
                sub: 'Your order is being prepared.',
                Icon: ChefHat,
              };

  return (
    <div className={`rounded-3xl bg-white shadow-lg ${statusBlock.ring} ring-1 overflow-hidden`}>
      {/* Hero */}
      <div className={`relative overflow-hidden bg-gradient-to-br ${statusBlock.gradient} text-white p-5`}>
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-32 h-32 rounded-full bg-white/15 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">Order #{order.orderNumber.replace(/^TXN-/, '')}</p>
            <h2 className="mt-1 text-xl font-extrabold leading-tight">{statusBlock.title}</h2>
            <p className="text-[12px] text-white/90 mt-0.5">{statusBlock.sub}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/30 flex items-center justify-center shrink-0 shadow-inner">
            <statusBlock.Icon size={22} />
          </div>
        </div>

        {fulfillment === 'in-kitchen' && preparationCategories.length > 0 && (
          <div className="relative mt-4 grid gap-2">
            {preparationCategories.map((category) => {
              const timeLeftMs = timeLeftFor(category);
              const categoryReady = category.status === 'ready' || timeLeftMs <= 0;
              return (
                <div
                  key={category.key || category.name}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white/15 px-3.5 py-3 ring-1 ring-white/25 backdrop-blur-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-extrabold text-white">{category.name || 'Kitchen'}</p>
                    <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/70">
                      {categoryReady ? 'Preparation complete' : 'Estimated time left'}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-xl font-black tabular-nums">
                    {categoryReady ? 'Ready' : formatTimeLeft(timeLeftMs)}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {isNew && !isVoid && (
          <div className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/30 px-2.5 py-1 text-[11px] font-bold">
            <Sparkles size={11} /> Just placed!
          </div>
        )}
      </div>

      {isVoid && (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">Cancellation reason</p>
          <p className="mt-1 text-sm font-bold leading-relaxed text-rose-950">
            {order.declineReason || 'The restaurant could not accept this order.'}
          </p>
          <p className="mt-1 text-[11px] text-rose-700">Please speak to a staff member if you need help.</p>
        </div>
      )}

      {order.addOnDeclineReason && !order.addOnPendingApproval && (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700">Latest add-on declined</p>
          <p className="mt-0.5 text-xs text-rose-900">{order.addOnDeclineReason}</p>
          <p className="mt-1 text-[10px] text-rose-600">Your original order and bill are still active.</p>
        </div>
      )}

      {/* Stage timeline — hidden when void */}
      {!isVoid && (
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="relative">
            {/* Connector line sits BEHIND the icons. Inset by half-icon-width
                on each side so it terminates at the first/last icon centres
                instead of running past them. The icons' opaque backgrounds
                visually break the line where they sit. */}
            <div className="absolute top-[14px] left-[18px] right-[18px] h-1.5 bg-slate-100 rounded-full overflow-hidden z-0">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-700"
                style={{ width: `${(Math.max(0, Math.min(stageIdx, STATUS_STAGES.length - 1)) / (STATUS_STAGES.length - 1)) * 100}%` }}
              />
            </div>
            {/* Icons + labels overlay */}
            <div className="relative z-10 flex items-start justify-between gap-1">
              {STATUS_STAGES.map((stage, i) => {
                const reached = i <= stageIdx;
                const isCurrent = i === stageIdx && !isCompleted;
                return (
                  <div key={stage.key} className="flex-1 flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                        reached
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/30'
                          : 'bg-slate-100 text-slate-400 ring-4 ring-white'
                      } ${isCurrent ? 'ring-4 ring-emerald-100' : ''}`}
                    >
                      <stage.Icon size={14} />
                    </div>
                    <p className={`mt-1.5 text-[10px] font-semibold ${reached ? 'text-slate-700' : 'text-slate-400'}`}>{stage.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Items + total */}
      {Array.isArray(order.items) && order.items.length > 0 && (
        <div className="divide-y divide-slate-100">
          {order.items.map((it, i) => (
            <div key={i} className="px-5 py-2.5 flex items-center justify-between text-sm">
              <span className="text-slate-700">
                <span className="font-bold text-slate-900 mr-1.5">{it.qty}×</span>
                {it.name}{it.variationName ? ` (${it.variationName})` : ''}
              </span>
              <span className="font-semibold tabular-nums text-slate-700">{fmtPKR(it.lineTotal)}</span>
            </div>
          ))}
          <div className="px-5 py-3 space-y-1.5 bg-slate-50/60">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Subtotal</span>
              <span className="font-semibold tabular-nums">{fmtPKR(order.subtotal)}</span>
            </div>
            {Number(order.taxAmount || 0) > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Tax{Number(order.effectiveTaxRate || 0) > 0 ? ` (${order.effectiveTaxRate}%)` : ''}</span>
                <span className="font-semibold tabular-nums">{fmtPKR(order.taxAmount)}</span>
              </div>
            )}
            {Number(order.serviceChargeAmount || 0) > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Service Charge{Number(order.serviceChargeRate || 0) > 0 ? ` (${order.serviceChargeRate}%)` : ''}</span>
                <span className="font-semibold tabular-nums">{fmtPKR(order.serviceChargeAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
            <span className="text-sm font-bold text-slate-900">Total</span>
            <span className="text-base font-extrabold text-slate-900 tabular-nums">{fmtPKR(order.totalAmount)}</span>
            </div>
          </div>
        </div>
      )}

      {!isVoid && !isCompleted && kitchenActionsAvailable && (canRequestBill || onlinePaymentEnabled) && (
        <div className="border-t border-slate-100 p-4">
          {order.billRequest?.status === 'pending' ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-center text-xs font-bold text-amber-800">
              {requestedBillLabel === 'bill' ? 'Bill' : requestedBillLabel} requested — the cashier has been notified.
            </div>
          ) : order.billRequest?.status === 'acknowledged' ? (
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-center text-xs font-bold text-emerald-800">
              Cashier printed your {requestedBillLabel}.
            </div>
          ) : (
            <div className={`grid gap-2 ${canRequestBill && onlinePaymentEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {canRequestBill && (
                <button
                  type="button"
                  onClick={() => setSelectedAction((current) => current === 'bill' ? '' : 'bill')}
                  disabled={requestBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-sm font-extrabold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                >
                  <Receipt size={15} /> Request Bill
                </button>
              )}
              {onlinePaymentEnabled && (
                <button
                  type="button"
                  onClick={() => setSelectedAction((current) => current === 'payment' ? '' : 'payment')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/20"
                >
                  <CreditCard size={15} /> Pay Online
                </button>
              )}
            </div>
          )}
          {selectedAction === 'bill' && order.billRequest?.status !== 'pending' && order.billRequest?.status !== 'acknowledged' && (
            <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3">
              <p className="text-center text-xs font-extrabold text-indigo-950">Which bill should the cashier print?</p>
              <p className="mt-0.5 text-center text-[10px] text-indigo-600">The selected bill will use its corresponding tax rate.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onRequestBill(order, 'cash')}
                  disabled={requestBusy}
                  className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-white px-2 py-3 text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {requestBusy ? <Loader2 size={17} className="animate-spin" /> : <Banknote size={17} />}
                  <span className="text-xs font-extrabold">Cash Bill</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRequestBill(order, 'card')}
                  disabled={requestBusy}
                  className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-indigo-200 bg-white px-2 py-3 text-indigo-800 hover:bg-indigo-100/70 disabled:opacity-50"
                >
                  {requestBusy ? <Loader2 size={17} className="animate-spin" /> : <CreditCard size={17} />}
                  <span className="text-xs font-extrabold">Card Bill</span>
                </button>
              </div>
            </div>
          )}
          {selectedAction === 'payment' && onlinePaymentEnabled && order.billRequest?.status !== 'pending' && (
            <div className="mt-3">
              <CustomerPaymentCard payment={payment} />
            </div>
          )}
          {order.billRequestError && <p className="mt-2 text-center text-[11px] text-rose-600">{order.billRequestError}</p>}
        </div>
      )}
    </div>
  );
};

export default SelfOrderApp;
