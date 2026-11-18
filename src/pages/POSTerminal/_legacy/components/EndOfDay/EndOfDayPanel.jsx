import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Sun,
  X,
  Banknote,
  CreditCard,
  Landmark,
  TrendingUp,
  Clock,
  Hash,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  LogOut,
  LayoutDashboard,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Receipt,
  Award,
  Bike,
} from 'lucide-react';
import { closeSession, clearSession } from '../../store/slices/sessionSlice';
import unifiedLogout from '../../utils/unifiedLogout';
import { canAccessManagement, firstAccessibleRoute } from '../../../../../utils/managementAccess';
import useSession from '../../hooks/useSession';
import useOfflineQueue from '../../hooks/useOfflineQueue';
import Spinner from '../UI/Spinner';
import AmountInput from '../UI/AmountInput';
import ConfirmModal from '../UI/ConfirmModal';
import api from '../../api/axios';

const formatPKR = (value) =>
  `PKR ${Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Tight KPI tile — single row: icon, label-stacked-on-value, no borders
// inside the grid to save vertical space.
const StatTile = ({ icon: Icon, label, value, sub, tone = 'indigo' }) => {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon size={13} />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 leading-tight">{label}</p>
        <p className="mt-0.5 truncate text-sm font-extrabold tabular-nums text-slate-900 leading-tight">{value}</p>
        {sub && <p className="text-[9px] text-slate-500 leading-tight mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
};

// One reconciliation row inside the cash card.
const ReconcileRow = ({ label, value, op = '', muted = false, total = false }) => (
  <div className={`flex items-center justify-between text-xs ${total ? 'pt-1.5 border-t border-dashed border-slate-200' : ''}`}>
    <span className={`${total ? 'font-bold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-600'}`}>
      {op && <span className="text-slate-400 mr-1">{op}</span>}
      {label}
    </span>
    <span className={`tabular-nums ${total ? 'text-sm font-extrabold text-slate-900' : 'font-semibold text-slate-800'}`}>
      {value}
    </span>
  </div>
);

const EndOfDayPanel = ({ isMobile, isOpen, onClose }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { cashier, outletCode, outletName } = useSession();
  // Management-access users (non-cashier roles, or cashiers granted management
  // permissions) can close the shift and jump straight to the management app
  // instead of signing out.
  const canExitToManagement = canAccessManagement({ role: cashier?.role ?? 'cashier', permissions: cashier?.permissions });
  const session = useSelector((state) => state.session.session);
  const isLoading = useSelector((state) => state.session.isLoading);
  const { totalQueueLength, syncAll, isSyncing } = useOfflineQueue();

  const [closingFloat, setClosingFloat] = useState('');
  const [liveTotals, setLiveTotals] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // What to do after the shift closes: 'logout' (default) or 'management'.
  const [closeIntent, setCloseIntent] = useState('logout');

  // Refresh shift summary on open — sales drift mid-service.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setSummaryLoading(true);
    api
      .get('/api/pos/sessions/current/summary')
      .then((res) => { if (!cancelled) setLiveTotals(res.data?.data ?? null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const totals = liveTotals || session?.totals || {};
  const openingFloat = session?.openingFloat ?? 0;
  const cashSales = totals.cashSales ?? 0;
  const cardSales = totals.cardSales ?? 0;
  const onlineTransferSales = totals.onlineTransferSales ?? 0;
  const foodPandaSales = totals.foodPandaSales ?? 0;
  const totalSales = totals.totalSales ?? 0;
  const grossSales = totals.grossSales ?? totalSales;
  const totalTransactions = totals.totalTransactions ?? 0;
  const pointsRedeemed = totals.pointsRedeemed ?? 0;
  const pointsRedeemedValue = totals.pointsRedeemedValue ?? 0;
  const pointsEarned = totals.pointsEarned ?? 0;
  const rewardsTransactions = totals.rewardsTransactions ?? 0;
  const hasRewardsActivity = pointsRedeemed > 0 || pointsEarned > 0;
  // Petty-cash drawer movements during the shift.
  const paidOut = totals.paidOut ?? 0;
  const paidIn = totals.paidIn ?? 0;
  // netCash already nets out cash refunds; fall back to cashSales for older data.
  const netCash = totals.netCash != null ? totals.netCash : cashSales;
  const drawerNetCash = totals.drawerNetCash != null ? totals.drawerNetCash : netCash;
  const cashRefunds = Math.max(0, cashSales - netCash);
  const expectedCash = openingFloat + drawerNetCash - paidOut + paidIn;
  const actualCash = Number(closingFloat) || 0;
  const variance = actualCash - expectedCash;
  const canClose = closingFloat !== '' && !Number.isNaN(Number(closingFloat));
  const balanced = canClose && variance === 0;

  const cashierName = cashier?.name || cashier?.email || '—';
  const initials = cashierName
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const performClose = async (intent = closeIntent) => {
    setConfirmClose(false);
    if (totalQueueLength > 0) {
      toast.error('Resolve or remove the offline activity before closing this shift.');
      onClose();
      window.setTimeout(() => window.dispatchEvent(new Event('pos-open-offline-panel')), 0);
      return;
    }
    try {
      await dispatch(closeSession({ closingFloat: Number(closingFloat), outletCode })).unwrap();
      dispatch(clearSession());
      if (intent === 'management' && canExitToManagement) {
        toast.success('Shift closed — switching to Management');
        navigate(firstAccessibleRoute({ role: cashier?.role ?? 'cashier', permissions: cashier?.permissions }));
      } else {
        toast.success('Shift closed successfully');
        unifiedLogout(dispatch);
      }
    } catch (error) {
      toast.error(typeof error === 'string' ? error : 'Failed to close shift');
    }
  };

  // intent: 'logout' | 'management' — remembered so the confirm-modal path
  // (queue / variance) finishes with the right action.
  const handleClose = (intent = 'logout') => {
    if (!canClose) return;
    setCloseIntent(intent);
    if (totalQueueLength > 0) {
      toast.error('Resolve or remove the offline activity before closing this shift.');
      onClose();
      window.setTimeout(() => window.dispatchEvent(new Event('pos-open-offline-panel')), 0);
      return;
    }
    if (variance !== 0) {
      setConfirmClose(true);
      return;
    }
    performClose(intent);
  };

  const body = (
    <>
      {/* Header — compact gradient strip */}
      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-4 py-2.5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-violet-200/30 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 text-white shadow-sm ring-1 ring-white/40">
              <Sun size={15} />
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-900 leading-tight">End of Day</p>
              <p className="text-[11px] text-slate-500 leading-tight">Reconcile &amp; sign out</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded-lg border border-slate-200 bg-white/70 p-1.5 text-slate-500 hover:bg-white hover:text-slate-900 transition"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body — compact, no scroll on standard heights */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2.5 space-y-2.5 bg-slate-50/50">
        {/* Cashier + session chip */}
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-[11px] font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-900 leading-tight">{cashierName}</p>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5 flex-wrap leading-tight">
              <span className="inline-flex items-center gap-0.5">
                <Hash size={9} /> {session?.sessionNumber || '—'}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-0.5">
                <Clock size={9} />
                {session?.openedAt ? format(new Date(session.openedAt), 'h:mm a') : '—'}
              </span>
              <span className="text-slate-300">·</span>
              <span className="truncate">{outletName || outletCode || ''}</span>
            </div>
          </div>
        </div>

        {/* Offline queue warning — shift close is blocked until it is resolved. */}
        {totalQueueLength > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 flex items-center justify-between gap-2">
            <div className="flex items-start gap-1.5 min-w-0">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-[11px] text-amber-900 leading-snug">
                <span className="font-extrabold">{totalQueueLength}</span> offline record{totalQueueLength !== 1 ? 's' : ''} must be resolved.
              </p>
            </div>
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => syncAll()}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              <RefreshCw size={10} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing…' : 'Sync'}
            </button>
          </div>
        )}

        {summaryLoading && !liveTotals ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Spinner size="md" />
            <span className="mt-2 text-[11px] text-slate-400">Loading shift summary…</span>
          </div>
        ) : (
          <>
            {/* KPI grid (compact horizontal tiles) */}
            <div className="grid grid-cols-2 gap-1.5">
              <StatTile icon={Receipt} label="Transactions" value={totalTransactions} tone="indigo" />
              <StatTile
                icon={TrendingUp}
                label="Collected"
                value={formatPKR(totalSales)}
                sub={pointsRedeemedValue > 0 ? `Gross ${formatPKR(grossSales)} − ${formatPKR(pointsRedeemedValue)} pts` : undefined}
                tone="emerald"
              />
              <StatTile icon={Banknote} label="Cash" value={formatPKR(cashSales)} tone="amber" />
              <StatTile icon={CreditCard} label="Card" value={formatPKR(cardSales)} tone="violet" />
              <StatTile icon={Landmark} label="Online Transfer" value={formatPKR(onlineTransferSales)} tone="indigo" />
              <StatTile icon={Bike} label="Food Panda" value={formatPKR(foodPandaSales)} tone="pink" />
            </div>

            {/* Cash reconciliation */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Cash reconciliation
                </p>
                <Wallet size={12} className="text-slate-400" />
              </div>

              <div className="px-3 py-2 space-y-1">
                <ReconcileRow label="Opening float" value={formatPKR(openingFloat)} muted />
                <ReconcileRow label="Cash sales" value={formatPKR(cashSales)} op="+" muted />
                {cashRefunds > 0 && (
                  <ReconcileRow label="Cash refunds" value={formatPKR(cashRefunds)} op="−" muted />
                )}
                {paidOut > 0 && (
                  <ReconcileRow label="Cash paid out" value={formatPKR(paidOut)} op="−" muted />
                )}
                {paidIn > 0 && (
                  <ReconcileRow label="Cash returned" value={formatPKR(paidIn)} op="+" muted />
                )}
                <ReconcileRow label="Expected cash" value={formatPKR(expectedCash)} total />
              </div>

              <div className="bg-slate-50 px-3 py-2 border-t border-slate-100">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Actual cash in drawer
                </label>
                <div className="relative">
                  <Wallet size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-500/80" />
                  <AmountInput
                    value={closingFloat}
                    onChange={setClosingFloat}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm font-bold tabular-nums text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                  />
                </div>
              </div>

              {canClose && (
                <div
                  className={`flex items-center justify-between border-t px-3 py-2 ${
                    balanced
                      ? 'bg-emerald-50 border-emerald-200'
                      : variance > 0
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-rose-50 border-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {balanced ? (
                      <CheckCircle2 size={13} className="text-emerald-600" />
                    ) : variance > 0 ? (
                      <ArrowUpRight size={13} className="text-amber-600" />
                    ) : (
                      <ArrowDownRight size={13} className="text-rose-600" />
                    )}
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        balanced ? 'text-emerald-700' : variance > 0 ? 'text-amber-700' : 'text-rose-700'
                      }`}
                    >
                      {balanced ? 'Balanced' : variance > 0 ? 'Over' : 'Short'}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-extrabold tabular-nums ${
                      balanced ? 'text-emerald-700' : variance > 0 ? 'text-amber-700' : 'text-rose-700'
                    }`}
                  >
                    {variance > 0 ? '+' : ''}{formatPKR(variance)}
                  </span>
                </div>
              )}
            </div>

            {/* Rewards card — only when this shift moved any points. */}
            {hasRewardsActivity && (
              <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
                <div className="px-3 py-1.5 border-b border-amber-200/70 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                    Membership Rewards
                  </p>
                  <Award size={12} className="text-amber-500" />
                </div>
                <div className="px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Points redeemed</span>
                    <span className="font-bold tabular-nums text-rose-700">
                      −{pointsRedeemed} pts ({formatPKR(pointsRedeemedValue)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Points earned</span>
                    <span className="font-bold tabular-nums text-emerald-700">
                      +{pointsEarned} pts
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-dashed border-amber-200/70">
                    <span>Sales with rewards activity</span>
                    <span className="tabular-nums">{rewardsTransactions}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer — same indigo gradient as Open Shift CTA */}
      <div className="border-t border-slate-200 bg-white px-4 py-2.5 space-y-2">
        {canExitToManagement && (
          <button
            type="button"
            onClick={() => handleClose('management')}
            disabled={!canClose || isLoading || summaryLoading}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 px-6 py-2.5 text-sm font-bold text-white shadow-[0_20px_40px_-15px_rgba(79,70,229,0.6)] ring-1 ring-indigo-700/20 transition-all hover:-translate-y-0.5 hover:shadow-[0_30px_60px_-15px_rgba(79,70,229,0.7)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            <LayoutDashboard size={14} />
            {isLoading ? 'Closing shift…' : 'Close shift & switch to Management'}
          </button>
        )}
        <button
          type="button"
          onClick={() => handleClose('logout')}
          disabled={!canClose || isLoading || summaryLoading}
          className={`group flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-bold transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${
            canExitToManagement
              ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              : 'bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700 text-white shadow-[0_20px_40px_-15px_rgba(79,70,229,0.6)] ring-1 ring-indigo-700/20 hover:shadow-[0_30px_60px_-15px_rgba(79,70,229,0.7)]'
          }`}
        >
          <LogOut size={14} />
          {isLoading ? 'Closing shift…' : 'Close shift & sign out'}
        </button>
      </div>
    </>
  );

  // ── Confirm modal (variance) ──────────────────────────────────────────────
  const confirmModals = (
    <>
      {confirmClose && (
        <ConfirmModal
          title="Close with variance?"
          message={`Cash variance is ${variance >= 0 ? '+' : ''}${formatPKR(variance)}. The shift will close with this difference recorded. Continue?`}
          confirmLabel="Close shift"
          cancelLabel="Cancel"
          variant={Math.abs(variance) > 100 ? 'danger' : 'primary'}
          onConfirm={performClose}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </>
  );

  // ── Mobile: bottom sheet ─────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {isOpen && (
          <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
        )}
        <div
          className={`fixed inset-x-0 bottom-0 z-40 flex max-h-[92vh] flex-col rounded-t-3xl bg-white shadow-float transition-transform duration-300 ease-out ${
            isOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-slate-300" />
          </div>
          {body}
        </div>
        {confirmModals}
      </>
    );
  }

  // ── Desktop: right-side drawer ───────────────────────────────────────────
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
        className={`fixed right-0 top-[calc(3.5rem_+_env(safe-area-inset-top))] bottom-0 z-30 flex w-[440px] flex-col border-l border-slate-200 bg-white shadow-[0_-10px_40px_-10px_rgba(15,23,42,0.15)] transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {body}
      </div>
      {confirmModals}
    </>
  );
};

export default EndOfDayPanel;
