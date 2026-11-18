import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { Search, ShoppingCart, CheckCircle, RefreshCw, X, MapPin, Sparkles } from 'lucide-react';
import { fetchMenu, fetchMenuAvailability, invalidateMenuCache } from '../store/slices/menuSlice';
import { fetchCurrentSession } from '../store/slices/sessionSlice';
import {
  buildMenuRateLookup,
  selectCartItemCount,
  selectCartTotal,
  syncMenuRates,
} from '../store/slices/cartSlice';
import useSession from '../hooks/useSession';
import CategoryTabs from '../components/Menu/CategoryTabs';
import MenuGrid from '../components/Menu/MenuGrid';
import CartPanel from '../components/Cart/CartPanel';
import HeldOrdersPanel from '../components/HeldOrders/HeldOrdersPanel';
import QrOrdersPanel from '../components/QrOrders/QrOrdersPanel';
import EndOfDayPanel from '../components/EndOfDay/EndOfDayPanel';
import CashDrawerModal from '../components/CashDrawer/CashDrawerModal';
import OfflineActivityPanel from '../components/OfflineActivity/OfflineActivityPanel';
import PaymentModal from '../components/Payment/PaymentModal';
import POSSidebar, { POSSectionTabs } from '../components/Layout/POSSidebar';
import OrderHistoryView from '../components/OrderHistory/OrderHistoryView';
import RiderDispatchPanel from '../components/Deliveries/RiderDispatchPanel';
import toast from 'react-hot-toast';
import {
  isPosMenuRevisionKey,
  outletCodeFromRevisionKey,
  POS_MENU_UPDATED_EVENT,
} from '../../../../utils/posMenuRefresh';

const POSScreen = () => {
  const dispatch = useDispatch();
  const { outletCode, outletName, outletId, cashier, session } = useSession();
  const { categories, isLoading } = useSelector((state) => state.menu);
  const itemCount = useSelector(selectCartItemCount);
  const total = useSelector(selectCartTotal);
  const cartItems = useSelector((state) => state.cart.items);
  const discount = useSelector((state) => state.cart.discount);
  const discountMode = useSelector((state) => state.cart.discountMode);
  const discountPercent = useSelector((state) => state.cart.discountPercent);
  const note = useSelector((state) => state.cart.note);
  const cashierNote = useSelector((state) => state.cart.cashierNote || '');
  const orderType = useSelector((state) => state.order.orderType || 'dine-in');
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [successFlash, setSuccessFlash] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldType, setHeldType] = useState('dine-in');
  const [qrOpen, setQrOpen] = useState(false);
  const [eodOpen, setEodOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tabletOpen, setTabletOpen] = useState(false);
  const [offlineActivityOpen, setOfflineActivityOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('pos_sidebar_collapsed') === '1'; } catch { return false; }
  });

  // Derive payment modal open state from URL ?checkout param.
  // NOTE: do NOT gate on cartItems.length here — the cart is cleared on sale
  // success (before ReceiptModal renders), so gating would unmount the modal
  // too early and hide the receipt. Instead we guard at the handleCharge call
  // site and clean up stale ?checkout params on mount below.
  const [searchParams, setSearchParams] = useSearchParams();
  // Keep the rendered terminal section in the URL. This makes Order History
  // directly addressable and restores the correct section on refresh/back.
  const tenantEntitlements = cashier?.tenant;
  const riderTrackingFeatures = (outletId ? tenantEntitlements?.outletFeatures?.[String(outletId)] : null) || tenantEntitlements?.features;
  const riderPermissionOverrides = cashier?.permissions || {};
  const riderLiveAllowed = cashier?.role === 'owner'
    || (Object.prototype.hasOwnProperty.call(riderPermissionOverrides, 'riderTracking.live')
      ? riderPermissionOverrides['riderTracking.live'] === true
      : cashier?.role === 'cashier');
  const riderAssignAllowed = cashier?.role === 'owner'
    || (Object.prototype.hasOwnProperty.call(riderPermissionOverrides, 'riderTracking.assign')
      ? riderPermissionOverrides['riderTracking.assign'] === true
      : cashier?.role === 'cashier');
  const riderDispatchEnabled = Boolean(outletId && riderTrackingFeatures?.riderTracking === true && (riderLiveAllowed || riderAssignAllowed));
  const requestedSection = searchParams.get('view');
  const section = requestedSection === 'history' ? 'history' : requestedSection === 'dispatch' && riderDispatchEnabled ? 'dispatch' : 'order';
  const setSection = useCallback((nextSection) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (nextSection === 'history') next.set('view', 'history');
      else if (nextSection === 'dispatch' && riderDispatchEnabled) next.set('view', 'dispatch');
      else next.delete('view');
      return next;
    }, { replace: true });
  }, [riderDispatchEnabled, setSearchParams]);
  const paymentOpen = searchParams.has('checkout');
  const isOwner = cashier?.role === 'owner';
  const drawerPermissions = cashier?.permissions || {};
  const hasDrawerAddOverride = Object.prototype.hasOwnProperty.call(drawerPermissions, 'pos.drawerAdd');
  const canAddDrawer = isOwner || (hasDrawerAddOverride ? drawerPermissions['pos.drawerAdd'] === true : cashier?.role === 'cashier');
  const canEditDrawer = isOwner || cashier?.permissions?.['pos.drawerEdit'] === true;
  const canDeleteDrawer = isOwner || cashier?.permissions?.['pos.drawerDelete'] === true;
  const canAdjustDrawer = canAddDrawer || canEditDrawer || canDeleteDrawer;

  const handleOpenPayment = useCallback(() => {
    setSearchParams((prev) => { prev.set('checkout', ''); return prev; });
  }, [setSearchParams]);

  const handleClosePayment = useCallback(() => {
    setSearchParams((prev) => { prev.delete('checkout'); return prev; });
  }, [setSearchParams]);

  // On mount: if the URL has ?checkout but there are no cart items (e.g. the
  // user typed the URL manually or cleared the cart then refreshed), remove
  // the stale param so the modal doesn't open on an empty cart.
  useEffect(() => {
    if (searchParams.has('checkout') && cartItems.length === 0) {
      handleClosePayment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs only on mount

  const handleRefreshMenu = useCallback(async () => {
    setRefreshing(true);
    dispatch(invalidateMenuCache());
    await Promise.all([
      dispatch(fetchMenu(outletCode)),
      dispatch(fetchMenuAvailability(outletCode)),
    ]);
    setRefreshing(false);
    toast.success('Menu refreshed');
  }, [dispatch, outletCode]);

  useEffect(() => {
    if (!outletCode) return;
    // Entering the terminal after a management edit must never reuse the prior
    // in-memory menu snapshot. The cached categories remain visible while this
    // one fresh request completes, preserving the fast/offline-first UX.
    dispatch(invalidateMenuCache());
    dispatch(fetchMenu(outletCode));
    dispatch(fetchMenuAvailability(outletCode));
    dispatch(fetchCurrentSession());
  }, [dispatch, outletCode]);

  // Menu management broadcasts successful changes within this browser. Refresh
  // immediately in the same tab and across tabs, while unrelated outlets stay
  // untouched.
  useEffect(() => {
    if (!outletCode) return undefined;
    const refreshChangedMenu = (changedOutletCode) => {
      if (String(changedOutletCode || '') !== String(outletCode)) return;
      dispatch(invalidateMenuCache());
      dispatch(fetchMenu(outletCode));
    };
    const handleLocalUpdate = (event) => refreshChangedMenu(event?.detail?.outletCode);
    const handleCrossTabUpdate = (event) => {
      if (isPosMenuRevisionKey(event.key)) {
        refreshChangedMenu(outletCodeFromRevisionKey(event.key));
      }
    };
    window.addEventListener(POS_MENU_UPDATED_EVENT, handleLocalUpdate);
    window.addEventListener('storage', handleCrossTabUpdate);
    return () => {
      window.removeEventListener(POS_MENU_UPDATED_EVENT, handleLocalUpdate);
      window.removeEventListener('storage', handleCrossTabUpdate);
    };
  }, [dispatch, outletCode]);

  // A terminal can remain open for an entire shift. Re-check once a minute;
  // fetchMenu's five-minute TTL means this creates at most one menu request per
  // terminal every five minutes, and keeps the last menu available offline.
  useEffect(() => {
    if (!outletCode) return undefined;
    const checkForMenuChanges = () => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        dispatch(fetchMenu(outletCode));
      }
    };
    const timer = window.setInterval(checkForMenuChanges, 60_000);
    window.addEventListener('focus', checkForMenuChanges);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkForMenuChanges);
    };
  }, [dispatch, outletCode]);

  // Keep cart line tax/service-charge rates and prices in lockstep with the
  // current menu (the same source the server recomputes from at checkout), so a
  // stale line — e.g. added before a rate was set, or rehydrated from
  // localStorage — can't make the cart total diverge from the server total.
  const liveMenuRates = useMemo(
    () => buildMenuRateLookup(categories, orderType),
    [categories, orderType],
  );

  useEffect(() => {
    if (!categories?.length) return;
    dispatch(syncMenuRates(liveMenuRates));
  }, [categories, dispatch, liveMenuRates]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Side drawers: opened via window events fired by POSHeader. Each drawer
  // closes the others so they never overlap.
  useEffect(() => {
    const openHeld    = (event) => { setEodOpen(false); setQrOpen(false); setTabletOpen(false); setOfflineActivityOpen(false); setHeldType(event?.detail?.type || 'dine-in'); setHeldOpen(true); };
    const openEod     = () => { setHeldOpen(false); setQrOpen(false); setTabletOpen(false); setOfflineActivityOpen(false); setEodOpen(true); };
    const openQr      = () => { setHeldOpen(false); setEodOpen(false); setTabletOpen(false); setOfflineActivityOpen(false); setQrOpen(true); };
    const openTablet  = () => { setHeldOpen(false); setEodOpen(false); setQrOpen(false); setOfflineActivityOpen(false); setTabletOpen(true); };
    const openOffline = () => { setHeldOpen(false); setEodOpen(false); setQrOpen(false); setTabletOpen(false); setOfflineActivityOpen(true); };
    const openDrawer     = () => { if (canAdjustDrawer) setDrawerOpen(true); };
    window.addEventListener('pos-open-held-panel', openHeld);
    window.addEventListener('pos-open-eod-panel', openEod);
    window.addEventListener('pos-open-qr-panel', openQr);
    window.addEventListener('pos-open-tablet-panel', openTablet);
    window.addEventListener('pos-open-drawer-panel', openDrawer);
    window.addEventListener('pos-open-offline-panel', openOffline);
    return () => {
      window.removeEventListener('pos-open-held-panel', openHeld);
      window.removeEventListener('pos-open-eod-panel', openEod);
      window.removeEventListener('pos-open-qr-panel', openQr);
      window.removeEventListener('pos-open-tablet-panel', openTablet);
      window.removeEventListener('pos-open-drawer-panel', openDrawer);
      window.removeEventListener('pos-open-offline-panel', openOffline);
    };
  }, [canAdjustDrawer]);

  useEffect(() => {
    if (tabletOpen) window.dispatchEvent(new Event('pos-tablet-panel-opened'));
  }, [tabletOpen]);

  useEffect(() => {
    // Legacy /held and /end-of-day URLs redirect here with a flag — pop the
    // matching drawer and strip the flag so a refresh isn't sticky.
    let dirty = false;
    if (searchParams.get('held')) {
      const requestedType = searchParams.get('held');
      setHeldType(['dine-in', 'takeaway', 'delivery', 'foodpanda'].includes(requestedType) ? requestedType : 'dine-in');
      setHeldOpen(true);
      dirty = true;
    }
    if (searchParams.get('eod') === '1')    { setEodOpen(true);    dirty = true; }
    if (searchParams.get('qr') === '1')     { setQrOpen(true);     dirty = true; }
    if (searchParams.get('drawer') === '1') { if (canAdjustDrawer) setDrawerOpen(true); dirty = true; }
    if (searchParams.get('tablet') === '1') { setTabletOpen(true); dirty = true; }
    if (searchParams.get('offline') === '1') { setOfflineActivityOpen(true); dirty = true; }
    if (dirty) {
      setSearchParams((prev) => { prev.delete('held'); prev.delete('eod'); prev.delete('qr'); prev.delete('drawer'); prev.delete('tablet'); prev.delete('offline'); return prev; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryList = useMemo(() => categories || [], [categories]);

  const handleSaleComplete = () => {
    setSuccessFlash(true);
    window.setTimeout(() => setSuccessFlash(false), 1500);
    // Pull a fresh availability snapshot now that stock has moved.
    if (outletCode) dispatch(fetchMenuAvailability(outletCode));
  };

  const handleCharge = () => {
    if (!session || session.status !== 'open') {
      toast.error('No open session. Please open a shift first.');
      return;
    }
    // A held-order restore can replace cart lines without changing categories,
    // so the menu-sync effect above would not naturally rerun. Reconcile once
    // more at the checkout boundary to guarantee the amounts shown to the
    // cashier use the current menu tax toggle and prices.
    dispatch(syncMenuRates(liveMenuRates));
    handleOpenPayment();
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('pos_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <>
      <div className="flex h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-7rem)]">
        {/* Left sidebar — desktop only; mobile uses bottom tabs */}
        <POSSidebar
          active={section}
          onChange={setSection}
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          showRiderDispatch={riderDispatchEnabled}
        />

        <div className="flex flex-1 flex-col md:flex-row min-w-0">
        {/* Order History view replaces the menu/cart area when active */}
        {section === 'history' ? (
          <section className="flex-1 overflow-y-auto pb-16 md:pb-0">
            <OrderHistoryView />
          </section>
        ) : section === 'dispatch' ? (
          <RiderDispatchPanel outletId={outletId} canAssign={riderAssignAllowed} />
        ) : (
        <>
        {/* Menu section */}
        <section className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/60 via-white to-white">
          <div className="mx-auto w-full max-w-[1920px] px-4 py-4 md:px-6 md:py-5">
            {/* Context strip — outlet, shift status, cart-at-a-glance */}
            <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
                  <MapPin size={12} className="text-indigo-500" />
                  {outletName || outletCode || 'Outlet'}
                </span>
                {session?.status === 'open' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Shift open
                  </span>
                )}
              </div>
              {itemCount > 0 && (
                <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
                  <ShoppingCart size={12} />
                  {itemCount} item{itemCount !== 1 ? 's' : ''}
                  <span className="text-indigo-300">·</span>
                  <span className="tabular-nums">PKR {total.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</span>
                </span>
              )}
            </div>

            {/* Search bar + refresh */}
            <div className="relative mb-4 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search menu items by name…"
                  className="w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-10 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleRefreshMenu}
                disabled={refreshing}
                title="Refresh menu"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Category tabs */}
            <CategoryTabs
              categories={categoryList}
              activeCategoryId={activeCategoryId}
              onSelect={(id) => { setActiveCategoryId(id); setSearchQuery(''); }}
            />

            {/* Search-results banner */}
            {searchQuery.trim() && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
                <Sparkles size={12} />
                Showing matches for <span className="font-mono">"{searchQuery.trim()}"</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="ml-1 rounded-full p-0.5 hover:bg-indigo-100"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Menu grid */}
            <div className="mt-5">
              <MenuGrid
                categories={categoryList}
                activeCategoryId={activeCategoryId}
                isLoading={isLoading}
                searchQuery={searchQuery}
              />
            </div>
          </div>
        </section>

        {/* Cart drawer (self-positioned) */}
        <CartPanel isMobile={isMobile} onCharge={handleCharge} />
        </>
        )}
        </div>

        {/* Held-orders drawer — opened by header pill / dropdown item */}
        <HeldOrdersPanel
          isMobile={isMobile}
          isOpen={heldOpen}
          initialType={heldType}
          onClose={() => setHeldOpen(false)}
        />

        {/* Tablet drawer — linked-device orders, separated from cashier holds */}
        <HeldOrdersPanel
          isMobile={isMobile}
          isOpen={tabletOpen}
          initialType="dine-in"
          mode="tablet"
          onClose={() => setTabletOpen(false)}
        />

        {/* End-of-Day drawer — opened by header End Day button / dropdown item */}
        <EndOfDayPanel
          isMobile={isMobile}
          isOpen={eodOpen}
          onClose={() => setEodOpen(false)}
        />

        {/* QR Orders drawer — fed by the public table-QR order endpoint */}
        <QrOrdersPanel
          isMobile={isMobile}
          isOpen={qrOpen}
          onClose={() => setQrOpen(false)}
        />

        <OfflineActivityPanel
          isMobile={isMobile}
          isOpen={offlineActivityOpen}
          onClose={() => setOfflineActivityOpen(false)}
        />

        {/* Cash Drawer (petty-cash) modal — pay out / return cash */}
        {canAdjustDrawer && <CashDrawerModal
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          canAdd={canAddDrawer}
          canEdit={canEditDrawer}
          canDelete={canDeleteDrawer}
        />}
      </div>

      {/* Mobile section tabs (shows New Order / History switch) */}
      <POSSectionTabs active={section} onChange={setSection} showRiderDispatch={riderDispatchEnabled} />

      {/* Mobile floating charge button — only on the New Order section */}
      {isMobile && section === 'order' && itemCount > 0 && (
        <div className="fixed bottom-5 left-1/2 z-20 w-[calc(100%-2.5rem)] -translate-x-1/2 md:hidden animate-slide-up">
          <button
            type="button"
            onClick={handleCharge}
            className="btn-primary w-full py-4 text-base shadow-float"
          >
            <ShoppingCart size={18} />
            Charge ({itemCount}) · PKR {total.toFixed(2)}
          </button>
        </div>
      )}

      {/* Payment modal */}
      {paymentOpen && (
        <PaymentModal
          isOpen={paymentOpen}
          onClose={handleClosePayment}
          total={total}
          cartItems={cartItems}
          session={session}
          cashier={cashier}
          outletCode={outletCode}
          outletName={outletName}
          onSaleComplete={handleSaleComplete}
          discount={discount}
          discountMode={discountMode}
          discountPercent={discountPercent}
          note={note}
          cashierNote={cashierNote}
        />
      )}

      {/* Success flash */}
      {successFlash && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center animate-fade-in">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-900/90 px-8 py-5 text-white shadow-float backdrop-blur-sm animate-scale-in">
            <CheckCircle size={24} className="text-emerald-400" />
            <p className="text-lg font-bold">Sale Complete</p>
          </div>
        </div>
      )}
    </>
  );
};

export default POSScreen;
