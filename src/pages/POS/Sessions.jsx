import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Users, ChevronRight, ChevronDown, Receipt, Wallet, Activity, Award, ArrowUpFromLine, ArrowDownToLine, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { getSessionById } from '../../api/sessionApi';
import { useGetOutletsQuery, useGetSessionsQuery, listQueryOpts } from '../../store/baseApi';
import { fmt, ReportCard, ReportThead, StatCard } from '../Reports/ReportShared';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import FilterBar from '../../components/UI/FilterBar';
import PremiumModal from '../../components/UI/PremiumModal';
import { formatInTimeZone, formatTimeInTimeZone } from '../../utils/datetime';
import useQueryState from '../../hooks/useQueryState';

const today = () => new Date().toISOString().slice(0, 10);
const LIVE_REFRESH_MS = 15000;
const cashierName = (session) => session.cashier?.name || session.cashierName || 'Deleted cashier';
const expectedDrawerCash = (session) => (session.openingFloat ?? 0)
  + (session.totals?.netCash ?? 0) - (session.totals?.paidOut ?? 0) + (session.totals?.paidIn ?? 0);

const badge = (status) =>
  status === 'open'
    ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 whitespace-nowrap'
    : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 whitespace-nowrap';

const fmtDate = (d, tz) =>
  d
    ? formatInTimeZone(d, tz, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

const duration = (openedAt, closedAt) => {
  const start = new Date(openedAt);
  const end = closedAt ? new Date(closedAt) : new Date();
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

// ── Session detail modal ───────────────────────────────────────────────────────

export const SessionModal = ({ sessionId, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [openDrawerGroup, setOpenDrawerGroup] = useState(null);
  const refreshRef = useRef(null);
  const refresh = useCallback(() => refreshRef.current?.(), []);

  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let pending = false;
    let timer;
    let latest = null;
    const load = async () => {
      if (disposed || pending) return;
      pending = true;
      clearTimeout(timer);
      setRefreshing(true);
      try {
        const res = await getSessionById(sessionId);
        if (disposed) return;
        latest = res.data?.data ?? null;
        setData(latest);
        setError(!latest);
        setUpdatedAt(new Date());
      } catch {
        if (!disposed) setError(true);
      } finally {
        pending = false;
        if (!disposed) {
          setLoading(false);
          setRefreshing(false);
          if (latest?.status === 'open') timer = setTimeout(load, LIVE_REFRESH_MS);
        }
      }
    };
    setData(null);
    setError(false);
    setUpdatedAt(null);
    setOpenDrawerGroup(null);
    setLoading(true);
    refreshRef.current = load;
    load();
    return () => {
      disposed = true;
      clearTimeout(timer);
      refreshRef.current = null;
    };
  }, [sessionId]);

  const s = data;
  const totals = s?.totals ?? {};
  // Petty-cash drawer movements reduce/increase expected drawer cash.
  const paidOut = totals.paidOut ?? 0;
  const paidIn = totals.paidIn ?? 0;
  const expectedCash = s ? expectedDrawerCash(s) : 0;
  const variance = s && s.status === 'closed' && s.closingFloat != null
    ? s.closingFloat - expectedCash
    : null;
  const drawerMovements = Array.isArray(s?.drawerMovements) ? s.drawerMovements : [];
  const payoutMovements = drawerMovements.filter((movement) => movement.type === 'payout');
  const returnedMovements = drawerMovements.filter((movement) => movement.type === 'cash_in');

  const movementAccordion = (type, label, total, movements, color) => {
    if (!(total > 0)) return null;
    const isOpen = openDrawerGroup === type;
    const isPayout = type === 'payout';
    const Icon = isPayout ? ArrowUpFromLine : ArrowDownToLine;
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpenDrawerGroup(isOpen ? null : type)}
          className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-slate-50"
          aria-expanded={isOpen}
        >
          <span className="flex items-center gap-2 text-gray-600">
            <span className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-lg',
              isPayout ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            )}>
              <Icon size={13} />
            </span>
            <span>{label}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {movements.length}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className={clsx(
              'font-semibold tabular-nums',
              color === 'rose' ? 'text-rose-600' : 'text-emerald-700'
            )}>
              Rs. {fmt(Number(total))}
            </span>
            <ChevronDown size={15} className={clsx('text-slate-400 transition-transform', isOpen && 'rotate-180')} />
          </span>
        </button>
        {isOpen && (
          <div className={clsx(
            'border-t px-5 py-2',
            isPayout ? 'border-rose-100 bg-rose-50/35' : 'border-emerald-100 bg-emerald-50/35'
          )}>
            {movements.length === 0 ? (
              <p className="py-2 text-xs text-slate-400">No movement details were recorded.</p>
            ) : (
              <div className="divide-y divide-slate-200/70">
                {[...movements].reverse().map((movement, index) => (
                  <div key={movement._id || index} className="grid grid-cols-[1fr_auto] gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-700">
                        {movement.reason || (isPayout ? 'Cash payout' : 'Cash returned')}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {fmtDate(movement.at, s.outlet?.timezone)}
                        {' · '}
                        {movement.by?.name || movement.by?.email || 'Unknown user'}
                      </p>
                    </div>
                    <span className={clsx(
                      'text-xs font-bold tabular-nums',
                      isPayout ? 'text-rose-600' : 'text-emerald-700'
                    )}>
                      {isPayout ? '−' : '+'} Rs. {fmt(Number(movement.amount || 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <PremiumModal
      open
      onClose={onClose}
      icon={Activity}
      eyebrow="Session"
      title={loading ? 'Loading…' : (s?.sessionNumber ?? 'Session')}
      subtitle={s ? `${cashierName(s)} · ${s.outlet?.name ?? 'Unknown Outlet'}` : undefined}
      accent={s?.status === 'open' ? 'emerald' : 'indigo'}
      size="xl"
    >
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-gray-400 text-sm animate-pulse">
          Loading session…
        </div>
      ) : !s ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-sm text-gray-400">
          <p>Failed to load session.</p>
          <button type="button" onClick={refresh} disabled={refreshing} className="mt-3 font-semibold text-indigo-600">Try again</button>
        </div>
      ) : (
        <div className="space-y-5">
          {(s.status === 'open' || error) && (
            <div className={clsx('flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs',
              error ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700')}>
              <div role="status">
                <p className="font-semibold">{error ? 'Could not refresh. Showing the last loaded totals.' : 'Live shift totals · Refreshes every 15 seconds'}</p>
                {updatedAt && <p className="mt-1">Updated {formatTimeInTimeZone(updatedAt, s.outlet?.timezone)}</p>}
              </div>
              <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-1.5 font-semibold disabled:opacity-50">
                <RefreshCw size={14} className={clsx(refreshing && 'animate-spin')} /> Refresh
              </button>
            </div>
          )}
          {/* Status + timing */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Status</p>
              <span className={badge(s.status)}>{s.status === 'open' ? '● Open' : '✓ Closed'}</span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Duration</p>
              <p className="text-sm font-semibold text-gray-800">{duration(s.openedAt, s.closedAt)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Opened</p>
              <p className="text-xs text-gray-700">{fmtDate(s.openedAt, s.outlet?.timezone)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Closed</p>
              <p className="text-xs text-gray-700">{fmtDate(s.closedAt, s.outlet?.timezone)}</p>
            </div>
          </div>

          {/* Float reconciliation */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Wallet size={15} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">{s.status === 'open' ? 'Live Cash Drawer' : 'Cash Float Reconciliation'}</h4>
                <p className="text-xs text-gray-400 mt-0.5">Opening + cash sales − cash refunds − paid out + returned</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                ['Opening Float',           s.openingFloat ?? 0,                                                      'gray'],
                ['+ Cash Sales',            totals.cashSales ?? 0,                                                    'emerald'],
                ['− Cash Refunds',          (totals.netCash != null ? (totals.cashSales ?? 0) - totals.netCash : 0),  'rose'],
              ].map(([label, val, color]) => (
                <div key={label} className="flex justify-between items-center px-5 py-2.5 text-sm">
                  <span className="text-gray-600">{label}</span>
                  <span className={clsx(
                    'font-semibold tabular-nums',
                    color === 'emerald' && 'text-emerald-700',
                    color === 'rose'    && 'text-rose-600',
                    color === 'indigo'  && 'text-indigo-700',
                    color === 'gray'    && 'text-gray-800',
                  )}>
                    {val == null ? '—' : `Rs. ${fmt(Number(val))}`}
                  </span>
                </div>
              ))}
              {movementAccordion('payout', '− Cash Paid Out', paidOut, payoutMovements, 'rose')}
              {movementAccordion('cash_in', '+ Cash Returned', paidIn, returnedMovements, 'emerald')}
              {[
                ['= Expected Cash',         expectedCash,           'indigo'],
                ...(s.status === 'closed' ? [['Closing Float (counted)', s.closingFloat ?? null, 'gray']] : []),
              ].map(([label, val, color]) => (
                <div key={label} className="flex justify-between items-center px-5 py-2.5 text-sm">
                  <span className="text-gray-600">{label}</span>
                  <span className={clsx(
                    'font-semibold tabular-nums',
                    color === 'indigo' ? 'text-indigo-700' : 'text-gray-800',
                  )}>
                    {val == null ? '—' : `Rs. ${fmt(Number(val))}`}
                  </span>
                </div>
              ))}
              {variance != null && (
                <div className="flex justify-between items-center px-5 py-2.5 text-sm bg-amber-50 border-t border-amber-100">
                  <span className="font-semibold text-amber-700">Variance</span>
                  <span className={clsx(
                    'font-bold tabular-nums',
                    Math.abs(variance) < 0.01 ? 'text-emerald-700' : 'text-rose-600'
                  )}>
                    Rs. {fmt(variance)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sales totals */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Receipt size={15} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">Sales Summary</h4>
                <p className="text-xs text-gray-400 mt-0.5">All transactions in this shift</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                ['Collected (all methods)', totals.totalSales,        false],
                ['Cash Sales',              totals.cashSales,         false],
                ['Card Sales',              totals.cardSales,         false],
                ['Online Transfer',         totals.onlineTransferSales, false],
                ['Store Credit Sales',      totals.storeCreditSales, false],
                ['Staff Allowance',         totals.allowanceSales,    false],
                ['Charge to Salary',        totals.chargeToSalarySales, false],
                ['Total Refunds',           totals.totalRefunds,      false],
                ['Transactions',            totals.totalTransactions, true],
              ].map(([label, val, isCount]) => (
                <div key={label} className="flex justify-between items-center px-5 py-2.5 text-sm">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-semibold text-gray-800 tabular-nums">
                    {isCount ? (val ?? 0) : `Rs. ${fmt(Number(val ?? 0))}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Membership / Rewards summary — only when this shift moved any points */}
          {((totals.pointsRedeemed ?? 0) > 0 || (totals.pointsEarned ?? 0) > 0) && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-amber-100 flex items-center gap-2.5 bg-amber-50/40">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Award size={15} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Membership Rewards</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Points activity during this shift</p>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="flex justify-between items-center px-5 py-2.5 text-sm">
                  <span className="text-gray-600">Gross sales (before redemption)</span>
                  <span className="font-semibold text-gray-800 tabular-nums">
                    Rs. {fmt(totals.grossSales ?? (totals.totalSales ?? 0) + (totals.pointsRedeemedValue ?? 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center px-5 py-2.5 text-sm">
                  <span className="text-gray-600">Points redeemed</span>
                  <span className="font-semibold tabular-nums text-rose-700">
                    −{totals.pointsRedeemed ?? 0} pts (Rs. {fmt(totals.pointsRedeemedValue ?? 0)})
                  </span>
                </div>
                <div className="flex justify-between items-center px-5 py-2.5 text-sm">
                  <span className="text-gray-600">Points earned</span>
                  <span className="font-semibold tabular-nums text-emerald-700">
                    +{totals.pointsEarned ?? 0} pts
                  </span>
                </div>
                <div className="flex justify-between items-center px-5 py-2.5 text-sm">
                  <span className="text-gray-600">Sales with rewards activity</span>
                  <span className="font-semibold text-gray-800 tabular-nums">
                    {totals.rewardsTransactions ?? 0}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Transactions table */}
          {Array.isArray(s.transactions) && s.transactions.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Activity size={15} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Transactions</h4>
                    <p className="text-xs text-gray-400 mt-0.5">{s.transactions.length} record{s.transactions.length === 1 ? '' : 's'}</p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/80 border-b border-slate-100">
                    <tr>
                      {['#', 'Time', 'Method', 'Amount', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.transactions.map((txn, i) => (
                      <tr key={txn._id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 text-gray-500">{i + 1}</td>
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                          {formatTimeInTimeZone(txn.createdAt, s.outlet?.timezone)}
                        </td>
                        <td className="px-4 py-2.5 capitalize text-gray-700">
                          {txn.paymentMethod}
                          {txn.cardLast4 && <span className="ml-1 text-xs text-gray-400 tabular-nums">****{txn.cardLast4}</span>}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-gray-800 tabular-nums">Rs. {fmt(txn.totalAmount)}</td>
                        <td className="px-4 py-2.5">
                          <span className={clsx(
                            'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize',
                            txn.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            txn.status === 'refunded'  ? 'bg-rose-100 text-rose-700' :
                            'bg-gray-100 text-gray-500'
                          )}>
                            {txn.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {s.notes && (
            <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-700">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Cashier Notes</p>
              {s.notes}
            </div>
          )}
        </div>
      )}
    </PremiumModal>
  );
};

// ── Main Sessions page ─────────────────────────────────────────────────────────

const Sessions = () => {
  const [from, setFrom] = useQueryState('from', () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useQueryState('to', today);
  const { data: outlets = [] } = useGetOutletsQuery();
  const [selectedOutlet, setSelectedOutlet] = useQueryState('outlet', '');
  const [statusFilter, setStatusFilter] = useQueryState('status', '');
  const [page, setPage] = useQueryState('page', 1);
  const [drawerSessionId, setDrawerSessionId] = useState(null);

  const queryParams = useMemo(() => {
    const params = { dateFrom: from, dateTo: to, page, limit: 25 };
    if (selectedOutlet) params.outlet = selectedOutlet;
    if (statusFilter) params.status = statusFilter;
    return params;
  }, [from, to, selectedOutlet, statusFilter, page]);

  const { data: payload, isLoading: loading } = useGetSessionsQuery(queryParams, {
    ...listQueryOpts,
    pollingInterval: LIVE_REFRESH_MS,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
  });
  const sessions = useMemo(() => payload?.data ?? [], [payload]);
  const pagination = useMemo(() => payload?.pagination ?? { total: 0, pages: 1 }, [payload]);

  const openCount  = sessions.filter((s) => s.status === 'open').length;
  const totalSales = sessions
    .filter((s) => s.status === 'closed')
    .reduce((sum, s) => sum + (s.totals?.totalSales ?? 0), 0);
  const totalTxns  = sessions
    .filter((s) => s.status === 'closed')
    .reduce((sum, s) => sum + (s.totals?.totalTransactions ?? 0), 0);

  return (
    <div className="space-y-6 pb-8">
      {drawerSessionId && (
        <SessionModal
          sessionId={drawerSessionId}
          onClose={() => setDrawerSessionId(null)}
        />
      )}

      <HeroBanner
        icon={Clock}
        eyebrow="POS"
        title="POS Sessions"
        subtitle="Cashier shift history, cash reconciliation and transaction totals."
        accent="indigo"
        compact
      />

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Sessions (page)"           value={sessions.length}                                                              icon={Clock} color="indigo" />
        <StatCard label="Sales (closed sessions)"   value={`Rs. ${fmt(totalSales)}`} sub={`${totalTxns} transactions`}                   icon={Users} color="green" />
        <StatCard label="Currently Open"            value={openCount}                                                                    icon={Clock} color={openCount > 0 ? 'amber' : 'gray'} />
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Status</label>
          <SearchableSelect
            options={[
              { value: '',       label: 'All' },
              { value: 'open',   label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ]}
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
          />
        </div>
        {outlets.length > 1 && (
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Outlet</label>
            <SearchableSelect
              options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
              value={selectedOutlet}
              onChange={(v) => { setSelectedOutlet(v); setPage(1); }}
              searchPlaceholder="Search outlets…"
            />
          </div>
        )}
      </FilterBar>

      {/* Sessions table */}
      <ReportCard>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <ReportThead headers={['Session #', 'Cashier', 'Outlet', 'Opened', 'Closed', 'Opening Float', 'Expected Cash', 'Sales', 'Txns', 'Status', '']} />
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: j === 0 ? '80%' : '60%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No sessions found for the selected filters.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr
                    key={s._id}
                    className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                    onClick={() => setDrawerSessionId(s._id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-600 whitespace-nowrap">
                      {s.sessionNumber}
                    </td>
                    <td className="px-4 py-3 text-gray-800 whitespace-nowrap font-medium">{cashierName(s)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.outlet?.code ?? s.outlet?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{fmtDate(s.openedAt)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{fmtDate(s.closedAt)}</td>
                    <td className="px-4 py-3 text-gray-800 tabular-nums">Rs. {fmt(s.openingFloat ?? 0)}</td>
                    <td className="px-4 py-3 font-semibold text-indigo-700 tabular-nums whitespace-nowrap">Rs. {fmt(expectedDrawerCash(s))}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                      <div>Rs. {fmt(s.totals?.totalSales ?? 0)}</div>
                      {(s.totals?.pointsRedeemedValue ?? 0) > 0 && (
                        <div className="text-[10px] font-normal text-amber-600 mt-0.5 inline-flex items-center gap-0.5">
                          <Award size={9} />
                          Gross Rs. {fmt(s.totals?.grossSales ?? (s.totals?.totalSales ?? 0) + (s.totals?.pointsRedeemedValue ?? 0))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-800 tabular-nums whitespace-nowrap">
                      <div>{s.totals?.totalTransactions ?? 0}</div>
                      {(s.totals?.rewardsTransactions ?? 0) > 0 && (
                        <div className="text-[10px] font-normal text-amber-600 mt-0.5">
                          {s.totals.rewardsTransactions} w/ rewards
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={badge(s.status)}>
                        {s.status === 'open' ? '● Open' : '✓ Closed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-sm text-gray-600">
            <span>{pagination.total} total sessions</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition text-xs font-medium"
              >
                Previous
              </button>
              <span className="text-xs">Page {page} of {pagination.pages}</span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition text-xs font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </ReportCard>
    </div>
  );
};

export default Sessions;
