import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Clock3, ChevronDown, RefreshCw, PauseCircle, Sun, Wifi, WifiOff, CalendarCheck, MapPin, LayoutDashboard, QrCode, Banknote, Bike, UtensilsCrossed, ShoppingBag, CloudOff, TabletSmartphone, Volume2 } from 'lucide-react';
import logo from '../../../../../assets/logo.png';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import useSession from '../../hooks/useSession';
import unifiedLogout from '../../utils/unifiedLogout';
import useOfflineQueue from '../../hooks/useOfflineQueue';
import useOnlineStatus from '../../hooks/useOnlineStatus';
import useQrPendingCount from '../../hooks/useQrPendingCount';
import useKdsReadyCount from '../../hooks/useKdsReadyCount';
import { canAccessManagement, firstAccessibleRoute } from '../../../../../utils/managementAccess';
import { getQrSocket, joinOrderRoom } from '../../utils/qrSocket';
import { isOrderSoundUnlocked, playOrderAlert, subscribeOrderSound, unlockOrderSound } from '../../utils/orderAlertSound';

const POSHeader = () => {
  const { cashier, session, outletCode, outletId, outletName: outletNameFromSession } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const menuRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isSyncing, totalQueueLength } = useOfflineQueue();
  // Reachability-based — pings the backend so a no-internet Wi-Fi shows Offline.
  const online = useOnlineStatus();
  // QR self-ordering is an opt-in feature (off by default; admin can enable it).
  // The POS store keeps the logged-in user under `auth.cashier` (not `auth.user`),
  // so we read the tenant feature flags from there. qrOrdering is strict → shown
  // only when explicitly true. Only show the QR entry — and only run its
  // socket/seed — when it's turned on.
  const tenantEntitlements = useSelector((state) => state.auth.cashier?.tenant);
  const sessionOutletId = session?.outlet?._id || session?.outlet || null;
  const tenantFeatures = (
    sessionOutletId
      ? tenantEntitlements?.outletFeatures?.[String(sessionOutletId)]
      : null
  ) || tenantEntitlements?.features;
  const qrEnabled = tenantFeatures?.qrOrdering === true;
  const kdsEnabled = tenantFeatures?.kds === true;
  const qrPendingCount = useQrPendingCount(qrEnabled);
  const { total: kdsReadyTotal, byType: kdsReadyByType } = useKdsReadyCount(kdsEnabled);
  const tabletUnreadStorageKey = outletId
    ? `cenciss_pos_tablet_unread:${String(outletId)}`
    : null;
  const [tabletUnreadCount, setTabletUnreadCount] = useState(0);
  const [orderSoundEnabled, setOrderSoundEnabled] = useState(isOrderSoundUnlocked);
  const [soundUnlocking, setSoundUnlocking] = useState(false);

  useEffect(() => subscribeOrderSound(setOrderSoundEnabled), []);

  const enableOrderSound = async () => {
    setSoundUnlocking(true);
    const enabled = await unlockOrderSound();
    setSoundUnlocking(false);
    if (enabled) toast.success('Order alerts enabled on this terminal');
    else toast.error('This browser could not enable speaker audio');
  };

  const clearTabletUnread = useCallback(() => {
    setTabletUnreadCount(0);
    if (tabletUnreadStorageKey) localStorage.removeItem(tabletUnreadStorageKey);
  }, [tabletUnreadStorageKey]);

  useEffect(() => {
    if (!tabletUnreadStorageKey) {
      setTabletUnreadCount(0);
      return undefined;
    }
    const stored = Math.max(0, Number(localStorage.getItem(tabletUnreadStorageKey)) || 0);
    setTabletUnreadCount(stored);
    const syncAcrossTabs = (event) => {
      if (event.key !== tabletUnreadStorageKey) return;
      setTabletUnreadCount(Math.max(0, Number(event.newValue) || 0));
    };
    window.addEventListener('storage', syncAcrossTabs);
    return () => window.removeEventListener('storage', syncAcrossTabs);
  }, [tabletUnreadStorageKey]);

  // The badge counts only orders received after the drawer was last opened.
  // It is deliberately independent of the drawer's total order count.
  useEffect(() => {
    if (!outletId || !tabletUnreadStorageKey) return undefined;
    const socket = getQrSocket();
    const leaveRoom = joinOrderRoom(outletId);
    const onTabletOrder = () => {
      playOrderAlert('tablet');
      setTabletUnreadCount((current) => {
        const next = Math.min(999, current + 1);
        localStorage.setItem(tabletUnreadStorageKey, String(next));
        return next;
      });
    };
    socket.on('tablet-order:new', onTabletOrder);
    return () => {
      leaveRoom();
      socket.off('tablet-order:new', onTabletOrder);
    };
  }, [outletId, tabletUnreadStorageKey]);

  useEffect(() => {
    window.addEventListener('pos-tablet-panel-opened', clearTabletUnread);
    return () => window.removeEventListener('pos-tablet-panel-opened', clearTabletUnread);
  }, [clearTabletUnread]);

  // Held orders are now a drawer rendered by POSScreen — open it via a window
  // event. If the user is not on the POS screen we navigate there with a
  // ?held=1 hint so the screen mounts and pops the drawer on its own.
  const openHeldPanel = (type = 'dine-in') => {
    setMenuOpen(false);
    if (location.pathname === '/terminal/pos') {
      window.dispatchEvent(new CustomEvent('pos-open-held-panel', { detail: { type } }));
    } else {
      navigate(`/terminal/pos?held=${encodeURIComponent(type)}`);
    }
  };

  // End of Day is now a drawer mounted by POSScreen. Open it via a window
  // event; if the user is elsewhere, route to /pos?eod=1 so the screen
  // mounts and pops the drawer on its own.
  const openEodPanel = () => {
    setMenuOpen(false);
    if (location.pathname === '/terminal/pos') {
      window.dispatchEvent(new Event('pos-open-eod-panel'));
    } else {
      navigate('/terminal/pos?eod=1');
    }
  };

  // QR Orders drawer — same pattern as Held / EOD.
  const openQrPanel = () => {
    setMenuOpen(false);
    if (location.pathname === '/terminal/pos') {
      window.dispatchEvent(new Event('pos-open-qr-panel'));
    } else {
      navigate('/terminal/pos?qr=1');
    }
  };

  // Orders submitted by linked staff tablets live in their own drawer.
  const openTabletPanel = () => {
    setMenuOpen(false);
    clearTabletUnread();
    if (location.pathname === '/terminal/pos') {
      window.dispatchEvent(new Event('pos-open-tablet-panel'));
    } else {
      navigate('/terminal/pos?tablet=1');
    }
  };

  // Cash drawer (petty-cash payout / return) — same pattern.
  const openDrawerPanel = () => {
    setMenuOpen(false);
    if (location.pathname === '/terminal/pos') {
      window.dispatchEvent(new Event('pos-open-drawer-panel'));
    } else {
      navigate('/terminal/pos?drawer=1');
    }
  };

  const openOfflinePanel = () => {
    setMenuOpen(false);
    if (location.pathname === '/terminal/pos') {
      window.dispatchEvent(new Event('pos-open-offline-panel'));
    } else {
      navigate('/terminal/pos?offline=1');
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);


  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const outletName = outletNameFromSession || outletCode || 'POS Terminal';
  const status = session?.status === 'open' ? 'OPEN' : 'CLOSED';
  const cashierName = cashier?.name ?? cashier?.email ?? 'Cashier';
  const cashierInitial = cashierName.charAt(0).toUpperCase();
  const cashierRole = cashier?.role ?? 'cashier';
  const drawerPermissions = cashier?.permissions || {};
  const hasDrawerAddOverride = Object.prototype.hasOwnProperty.call(drawerPermissions, 'pos.drawerAdd');
  const canAddDrawer = cashierRole === 'owner'
    || (hasDrawerAddOverride ? drawerPermissions['pos.drawerAdd'] === true : cashierRole === 'cashier');
  const canAdjustDrawer = cashierRole === 'owner'
    || canAddDrawer
    || cashier?.permissions?.['pos.drawerEdit'] === true
    || cashier?.permissions?.['pos.drawerDelete'] === true;
  // A non-cashier role, or a cashier granted management-side permissions, may
  // switch into the restaurant-management app.
  const canExitToManagement = canAccessManagement({ role: cashierRole, permissions: cashier?.permissions });

  const handleLogout = () => {
    toast.success('Logged out');
    unifiedLogout(dispatch);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-20 border-b border-slate-200 bg-white/95 shadow-[0_1px_12px_rgba(15,23,42,0.05)] backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 items-center justify-between gap-3 px-3 sm:px-5 lg:grid lg:grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)] lg:gap-5 lg:px-6">
        {/* ── Brand + outlet ────────────────────────────────────────────── */}
        <div className="flex min-w-0 items-center gap-2.5 lg:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 shadow-[0_8px_18px_-6px_rgba(79,70,229,0.55)] ring-1 ring-white/40 lg:h-10 lg:w-10">
            <img src={logo} alt="Cenciss" className="h-6 w-6 object-contain" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 lg:text-xs">Cenciss · POS</p>
            <div className="flex items-center gap-1.5 truncate text-sm font-extrabold text-slate-900 lg:text-base">
              <MapPin size={13} className="shrink-0 text-indigo-500" />
              <span className="truncate">{outletName}</span>
            </div>
          </div>
        </div>

        {/* ── Live terminal status ──────────────────────────────────────── */}
        <div className="flex min-w-0 items-center justify-center gap-2 lg:gap-2.5">
          <button
            type="button"
            onClick={enableOrderSound}
            disabled={soundUnlocking || orderSoundEnabled}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-extrabold shadow-sm transition lg:h-9 lg:px-3 lg:text-xs ${
              orderSoundEnabled
                ? 'cursor-default bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'animate-pulse bg-indigo-600 text-white ring-2 ring-indigo-200 hover:bg-indigo-700'
            }`}
            title={orderSoundEnabled ? 'Order sounds are enabled' : 'Click once to allow QR, tablet, and kitchen-ready sounds'}
          >
            <Volume2 size={12} />
            <span className="hidden sm:inline">{soundUnlocking ? 'Enabling…' : orderSoundEnabled ? 'Sound on' : 'Enable order sound'}</span>
            <span className="sm:hidden">{orderSoundEnabled ? 'On' : 'Sound'}</span>
          </button>
          <span
            className={`hidden h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold md:inline-flex lg:h-9 lg:text-xs ${
              status === 'OPEN'
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
            }`}
            title={status === 'OPEN' ? 'Shift is open' : 'No open shift'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            {status === 'OPEN' ? 'Shift open' : 'Shift closed'}
          </span>

          <span
            className={`hidden h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold md:inline-flex lg:h-9 lg:text-xs ${
              online
                ? 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'
                : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
            }`}
            title={online ? 'Connected' : 'Working offline'}
          >
            {online ? <Wifi size={11} /> : <WifiOff size={11} />}
            {online ? 'Online' : 'Offline'}
          </span>

          {isSyncing && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-indigo-50 px-3 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200 lg:h-9 lg:text-xs">
              <RefreshCw size={12} className="animate-spin" />
              Syncing
            </span>
          )}
          {totalQueueLength > 0 && (
            <button
              type="button"
              onClick={openOfflinePanel}
              title={`${totalQueueLength} offline record${totalQueueLength === 1 ? '' : 's'} waiting for manual sync`}
              className="relative inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3 text-[11px] font-bold text-rose-700 shadow-sm ring-2 ring-rose-200/60 transition hover:bg-rose-100 lg:h-9 lg:text-xs"
            >
              <CloudOff size={12} />
              <span>Offline Queue</span>
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold tabular-nums text-white shadow-sm">
                {totalQueueLength > 99 ? '99+' : totalQueueLength}
              </span>
            </button>
          )}

          <span className="hidden h-9 items-center gap-1.5 rounded-full bg-slate-50 px-3 text-xs font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200 lg:inline-flex">
            <Clock3 size={13} className="text-slate-400" />
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* ── Cashier menu ──────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-self-end">
          <div ref={menuRef} className="relative z-30">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="relative inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-1.5 pr-2 transition hover:border-slate-300 hover:bg-slate-50 lg:gap-2.5 lg:px-2 lg:pr-3"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-[11px] font-bold text-white shadow-sm lg:h-8 lg:w-8 lg:text-xs">
                {cashierInitial}
              </div>
              <div className="hidden pr-1 text-left leading-tight sm:block">
                <p className="max-w-[150px] truncate text-xs font-bold text-slate-800 lg:text-sm">{cashierName}</p>
                <p className="text-[10px] text-slate-400 lg:text-[11px]">{canExitToManagement ? 'POS Mode' : 'Cashier'}</p>
              </div>
              <ChevronDown
                size={13}
                className={`text-slate-400 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
              />
              {(tabletUnreadCount + kdsReadyTotal) > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-extrabold tabular-nums text-white shadow-sm ring-2 ring-white lg:hidden"
                  title={`${kdsReadyTotal} kitchen order${kdsReadyTotal === 1 ? '' : 's'} ready`}
                >
                  {(tabletUnreadCount + kdsReadyTotal) > 99 ? '99+' : tabletUnreadCount + kdsReadyTotal}
                </span>
              )}
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_25px_60px_-15px_rgba(15,23,42,0.25)] animate-fade-in"
                role="menu"
              >
                {/* Header card */}
                <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-4 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-bold text-white shadow-sm ring-1 ring-white">
                    {cashierInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-900">{cashierName}</p>
                    <p className="text-[11px] text-slate-500">
                      Session {session?.sessionNumber || '—'}
                    </p>
                  </div>
                </div>

                {/* Mobile-only inline status (md and below) */}
                <div className="flex md:hidden flex-wrap gap-1.5 px-4 py-2 border-b border-slate-100">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      status === 'OPEN'
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                    }`}
                  >
                    <span className={`h-1 w-1 rounded-full ${status === 'OPEN' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {status === 'OPEN' ? 'Open' : 'Closed'}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      online ? 'bg-slate-50 text-slate-600 ring-1 ring-slate-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                    }`}
                  >
                    {online ? <Wifi size={10} /> : <WifiOff size={10} />}
                    {online ? 'Online' : 'Offline'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200 tabular-nums">
                    <Clock3 size={10} />
                    {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="py-1">
                  {canExitToManagement && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        // Land on the first tab this user can actually open (a
                        // cashier with limited grants may not have /dashboard).
                        navigate(firstAccessibleRoute({ role: cashierRole, permissions: cashier?.permissions }));
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold text-indigo-700 hover:bg-indigo-50 transition"
                    >
                      <LayoutDashboard size={15} className="text-indigo-500" />
                      Switch to Management
                    </button>
                  )}
                  {status !== 'OPEN' && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); navigate('/terminal/session/open'); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition"
                    >
                      <PauseCircle size={15} />
                      Open shift
                    </button>
                  )}
                  {[
                    { type: 'dine-in', label: 'Held · Dine In', Icon: UtensilsCrossed },
                    { type: 'takeaway', label: 'Held · Take Away', Icon: ShoppingBag },
                    { type: 'delivery', label: 'Held · Delivery', Icon: Bike },
                    { type: 'foodpanda', label: 'Held · Foodpanda', Icon: Bike },
                  ].map(({ type, label, Icon }) => (
                    <button
                      key={type}
                      type="button"
                      role="menuitem"
                      onClick={() => openHeldPanel(type)}
                      className="flex min-h-12 w-full items-center gap-3.5 px-5 py-3.5 text-left text-base font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      <Icon size={18} className="text-amber-500" />
                      {label}
                      {Number(kdsReadyByType?.[type] || 0) > 0 && (
                        <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-extrabold tabular-nums text-white shadow-sm" title="Food ready">
                          {kdsReadyByType[type] > 99 ? '99+' : kdsReadyByType[type]}
                        </span>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openTabletPanel}
                    className="flex min-h-12 w-full items-center gap-3.5 px-5 py-3.5 text-left text-base font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <TabletSmartphone size={18} className="text-cyan-600" />
                    Tablet
                    {tabletUnreadCount > 0 && (
                      <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-extrabold tabular-nums text-white shadow-sm">
                        {tabletUnreadCount > 99 ? '99+' : tabletUnreadCount}
                      </span>
                    )}
                  </button>
                  {canAdjustDrawer && <button
                    type="button"
                    role="menuitem"
                    onClick={openDrawerPanel}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Banknote size={15} className="text-rose-500" />
                    Cash drawer
                  </button>}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openEodPanel}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    <CalendarCheck size={15} className="text-violet-500" />
                    End of day
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openOfflinePanel}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-bold transition ${
                      totalQueueLength > 0
                        ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100'
                        : 'text-amber-700 hover:bg-amber-50'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <CloudOff size={15} />
                      Offline activity
                    </span>
                    {totalQueueLength > 0 && (
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-extrabold tabular-nums text-white shadow-sm">
                        {totalQueueLength > 99 ? '99+' : totalQueueLength}
                      </span>
                    )}
                  </button>
                </div>

                <div className="border-t border-slate-100">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold text-rose-600 hover:bg-rose-50 transition"
                  >
                    <LogOut size={15} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop action rail ─────────────────────────────────────────── */}
      <nav
        aria-label="POS quick actions"
        className="hidden h-14 items-center border-t border-slate-200/80 bg-slate-50/80 px-5 lg:flex lg:px-6"
      >
        <div className="grid w-full grid-flow-col auto-cols-fr gap-1.5">
          {qrEnabled && (
            <button
              type="button"
              onClick={openQrPanel}
              className={`relative inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-bold shadow-sm transition ${
                qrPendingCount > 0
                  ? 'border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-200/60 hover:bg-rose-100'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
              title={qrPendingCount > 0
                ? `${qrPendingCount} QR action${qrPendingCount === 1 ? '' : 's'} waiting`
                : 'Customer QR orders and bill requests'}
            >
              <QrCode size={16} className="shrink-0" />
              <span className="truncate">QR Orders</span>
              {qrPendingCount > 0 && (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold tabular-nums text-white shadow-sm">
                  {qrPendingCount > 99 ? '99+' : qrPendingCount}
                </span>
              )}
            </button>
          )}
          {[
            { type: 'dine-in', label: 'Dine In', Icon: UtensilsCrossed },
            { type: 'takeaway', label: 'Take Away', Icon: ShoppingBag },
            { type: 'delivery', label: 'Delivery', Icon: Bike },
            { type: 'foodpanda', label: 'Foodpanda', Icon: Bike },
          ].map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => openHeldPanel(type)}
              className={`inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-bold shadow-sm transition ${Number(kdsReadyByType?.[type] || 0) > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200/60 hover:bg-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100'}`}
              title={Number(kdsReadyByType?.[type] || 0) > 0 ? `${kdsReadyByType[type]} ${label.toLowerCase()} order${kdsReadyByType[type] === 1 ? '' : 's'} ready` : `Open held ${label.toLowerCase()} orders`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
              {Number(kdsReadyByType?.[type] || 0) > 0 && (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-extrabold tabular-nums text-white shadow-sm">
                  {kdsReadyByType[type] > 99 ? '99+' : kdsReadyByType[type]}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={openTabletPanel}
            className={`relative inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-bold shadow-sm transition ${
              tabletUnreadCount > 0
                ? 'border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-200/60 hover:bg-rose-100'
                : 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:border-cyan-300 hover:bg-cyan-100'
            }`}
            title={tabletUnreadCount > 0
              ? `${tabletUnreadCount} new tablet order${tabletUnreadCount === 1 ? '' : 's'}`
              : 'Orders received from linked staff tablets'}
          >
            <TabletSmartphone size={16} className="shrink-0" />
            <span className="truncate">Tablet</span>
            {tabletUnreadCount > 0 && (
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold tabular-nums text-white shadow-sm">
                {tabletUnreadCount > 99 ? '99+' : tabletUnreadCount}
              </span>
            )}
          </button>
          {canAdjustDrawer && (
            <button
              type="button"
              onClick={openDrawerPanel}
              className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              title="Cash drawer — pay out or return cash"
            >
              <Banknote size={16} className="shrink-0" />
              <span className="truncate">Drawer</span>
            </button>
          )}
          <button
            type="button"
            onClick={openEodPanel}
            className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Sun size={16} className="shrink-0" />
            <span className="truncate">End Day</span>
          </button>
        </div>
      </nav>
    </header>
  );
};

export default POSHeader;
