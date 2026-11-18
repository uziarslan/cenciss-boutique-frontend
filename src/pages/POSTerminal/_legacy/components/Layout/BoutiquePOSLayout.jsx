import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { ChevronDown, Clock3, LayoutDashboard, LogOut, RotateCcw, Wifi, WifiOff } from 'lucide-react';
import { useSelector } from 'react-redux';
import unifiedLogout from '../../utils/unifiedLogout';
import { store } from '../../store';
import { canAccessManagement, firstAccessibleRoute } from '../../../../../utils/managementAccess';

const QUEUE_EVENT = 'boutique-retail-queue-updated';

const BoutiquePOSLayout = ({ children }) => {
  const navigate = useNavigate();
  const cashier = useSelector((state) => state.auth.cashier);
  const session = useSelector((state) => state.session.session);
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [now, setNow] = useState(new Date());
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const outlet = typeof session?.outlet === 'object' ? session.outlet : null;
  const cashierRole = cashier?.role || 'cashier';
  const canSwitchToManagement = canAccessManagement({ role: cashierRole, permissions: cashier?.permissions });
  const roleLabel = ({ owner: 'Owner', financeManager: 'Finance Manager', purchaseManager: 'Purchase Manager', receivingStaff: 'Receiving Staff', cashier: 'Cashier' })[cashierRole] || cashierRole;
  const initials = (cashier?.name || 'Cashier').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const updateQueue = (event) => setPendingCount(Number(event.detail?.count || 0));
    try {
      const queueKey = `boutique_retail_queue_v1:${cashier?.id || cashier?._id || 'unknown'}`;
      setPendingCount(JSON.parse(localStorage.getItem(queueKey) || '[]').length);
    } catch { setPendingCount(0); }
    const clock = setInterval(() => setNow(new Date()), 1000);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.addEventListener(QUEUE_EVENT, updateQueue);
    return () => {
      clearInterval(clock);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.removeEventListener(QUEUE_EVENT, updateQueue);
    };
  }, [cashier?.id, cashier?._id]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
    };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setAccountOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const handleLogout = () => unifiedLogout(store.dispatch);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <button onClick={() => navigate('/terminal/pos')} className="flex min-w-0 items-center gap-2 text-left" aria-label="Boutique POS">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-black text-white">B</span>
            <span className="hidden min-w-0 sm:block"><span className="block truncate text-sm font-bold leading-4">Boutique POS</span><span className="block truncate text-[11px] text-slate-500">{outlet?.name || 'Register'}</span></span>
          </button>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}{online ? 'Online' : 'Offline'}
            </span>
            {pendingCount > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">{pendingCount} queued</span>}
            <span className="hidden items-center gap-1 text-xs text-slate-500 md:inline-flex"><Clock3 size={14} />{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <button onClick={() => navigate('/terminal/session/summary')} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Close shift</button>
            <button onClick={() => navigate('/terminal/returns')} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw size={13} /><span className="hidden sm:inline">Returns</span></button>
            <div className="relative" ref={accountRef}>
              <button type="button" onClick={() => setAccountOpen((open) => !open)} aria-haspopup="menu" aria-expanded={accountOpen} aria-label="Open user menu" className="inline-flex max-w-44 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left hover:bg-slate-50 sm:px-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{initials}</span>
                <span className="hidden min-w-0 sm:block"><span className="block truncate text-xs font-semibold text-slate-800">{cashier?.name || 'Cashier'}</span><span className="block text-[10px] uppercase tracking-wide text-slate-500">{roleLabel}</span></span>
                <ChevronDown size={14} className={`shrink-0 text-slate-500 transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
              </button>
              {accountOpen && <div role="menu" className="absolute right-0 top-full z-[60] mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 px-4 py-4">
                  <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">{initials}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{cashier?.name || 'Cashier'}</p><p className="truncate text-xs text-slate-500">{cashier?.email || ''}</p><span className="mt-1 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">{roleLabel}</span></div></div>
                </div>
                {canSwitchToManagement && <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); navigate(firstAccessibleRoute({ role: cashierRole, permissions: cashier?.permissions })); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-indigo-700 hover:bg-indigo-50"><LayoutDashboard size={16} />Switch to Management</button>}
                <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); handleLogout(); }} className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50"><LogOut size={16} />Sign out</button>
              </div>}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] px-3 pb-5 pt-[calc(3.5rem_+_env(safe-area-inset-top))] sm:px-5">{children || <Outlet />}</main>
    </div>
  );
};

export { QUEUE_EVENT };
export default BoutiquePOSLayout;
