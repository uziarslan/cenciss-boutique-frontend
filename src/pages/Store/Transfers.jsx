import { useState, useMemo } from 'react';
import { Link } from 'react-router';
import { useDispatch } from 'react-redux';
import { ArrowRightLeft, ChevronDown, ChevronRight, Check, X, Plus, Clock } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useGetStockIssuesQuery, useGetOutletsQuery, listQueryOpts, baseApi } from '../../store/baseApi';
import { acceptStockIssue, rejectStockIssue } from '../../api/stockIssueApi';
import usePermissions from '../../hooks/usePermissions';
import useTransferBadges from '../../hooks/useTransferBadges';
import HeroBanner from '../../components/UI/HeroBanner';
import FilterBar from '../../components/UI/FilterBar';
import SearchableSelect from '../../components/UI/SearchableSelect';
import useQueryState from '../../hooks/useQueryState';

const fmt = (n) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TABS = [
  { key: 'storeToKitchen', label: 'Store → Kitchen' },
  { key: 'kitchenToStore', label: 'Kitchen → Store' },
];

const STATUS_META = {
  in_transit: { label: 'In transit', cls: 'bg-amber-100 text-amber-700' },
  accepted:   { label: 'Accepted',   cls: 'bg-emerald-100 text-emerald-700' },
  rejected:   { label: 'Rejected',   cls: 'bg-rose-100 text-rose-700' },
  confirmed:  { label: 'Settled',    cls: 'bg-slate-100 text-slate-600' },
};

// Who may accept/reject a given direction (the RECEIVING area's manager).
const receiverPermFor = (direction) => (direction === 'kitchenToStore' ? 'store.manage' : 'inventory.manage');

// `area` ('store' | 'kitchen') sets the default tab (the incoming direction for
// that area) and where "New transfer" links. The panel itself lists both
// directions; Accept/Reject show only on in-transit rows the user may receive.
const Transfers = ({ area = 'store' }) => {
  const dispatch = useDispatch();
  const { has } = usePermissions();
  // Live per-side pending counts (also keeps this list refetching via socket).
  const { storePending, kitchenPending } = useTransferBadges();
  // You only ACCEPT transfers arriving INTO the area you're viewing. So the
  // "awaiting acceptance" badge/banner here reflects THIS area's incoming only:
  //   store  ← kitchen→store   |   kitchen ← store→kitchen
  const incomingDir = area === 'store' ? 'kitchenToStore' : 'storeToKitchen';
  const areaPending = area === 'store' ? storePending : kitchenPending;
  const pendingForMe = areaPending;
  const tabBadge = { [incomingDir]: areaPending };

  const { data: outlets = [] } = useGetOutletsQuery();
  const [outlet, setOutlet] = useQueryState('outlet', '');
  // Land on the direction INCOMING to this area (what the user can accept), so a
  // pending-acceptance banner/badge always points at the tab you're already on.
  const [tab, setTab] = useQueryState('tab', incomingDir);
  const [expanded, setExpanded] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // issue awaiting a reject reason
  const [reason, setReason] = useState('');

  const queryParams = useMemo(
    () => ({ direction: tab, limit: 50, ...(outlet ? { outlet } : {}) }),
    [tab, outlet],
  );
  const { data: payload, isFetching } = useGetStockIssuesQuery(queryParams, listQueryOpts);

  // Surface pending transfers first, then most-recent.
  const rows = useMemo(() => {
    const list = payload?.issues ?? [];
    return [...list].sort((a, b) => (a.status === 'in_transit' ? 0 : 1) - (b.status === 'in_transit' ? 0 : 1));
  }, [payload]);

  const sendPath = area === 'store' ? '/store/issue' : '/inventory/transfer';
  const senderPerm = area === 'store' ? 'store.manage' : 'inventory.manage';

  const refresh = () => dispatch(baseApi.util.invalidateTags(['Stock', 'StockIssue', 'Report', 'Accounting']));

  // Accept/Reject is available only when this transfer is arriving INTO the area
  // you're currently in — so the Store never accepts a Store→Kitchen transfer
  // (only the Kitchen does), even for a user who holds both permissions.
  const canAct = (iss) => {
    if (iss.status !== 'in_transit') return false;
    const destArea = iss.direction === 'kitchenToStore' ? 'store' : 'kitchen';
    if (destArea !== area) return false;
    return has(receiverPermFor(iss.direction));
  };

  const doAccept = async (iss) => {
    setActingId(iss._id);
    try {
      await acceptStockIssue(iss._id);
      toast.success(`Accepted ${iss.issueNumber}.`);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Could not accept the transfer.');
    } finally {
      setActingId(null);
    }
  };

  const doReject = async () => {
    if (!rejecting) return;
    setActingId(rejecting._id);
    try {
      await rejectStockIssue(rejecting._id, reason.trim() || undefined);
      toast.success(`Rejected ${rejecting.issueNumber} — stock returned to sender.`);
      setRejecting(null);
      setReason('');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Could not reject the transfer.');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <HeroBanner
        icon={ArrowRightLeft}
        eyebrow={area === 'store' ? 'Store' : 'Kitchen'}
        title="Transfers"
        subtitle="Stock moving between the store and kitchen. Issued stock is held in transit until the receiving side accepts it."
        accent="indigo"
        actions={
          has(senderPerm) ? (
            <Link
              to={sendPath}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
            >
              <Plus size={15} /> New transfer
            </Link>
          ) : null
        }
      />

      {pendingForMe > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <Clock size={15} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{pendingForMe}</span> transfer{pendingForMe > 1 ? 's' : ''} awaiting your acceptance.
          </p>
        </div>
      )}

      {/* Direction tabs */}
      <div className="-mx-4 overflow-x-auto border-b border-gray-200 px-4 overscroll-x-contain sm:mx-0 sm:px-0">
        <div className="flex min-w-max items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setExpanded(null); }}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
            )}
          >
            {t.label}
            {tabBadge[t.key] > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {tabBadge[t.key] > 99 ? '99+' : tabBadge[t.key]}
              </span>
            )}
          </button>
        ))}
        </div>
      </div>

      {outlets.length > 1 && (
        <FilterBar>
          <div className="min-w-[200px]">
            <SearchableSelect
              options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
              value={outlet}
              onChange={setOutlet}
              placeholder="All outlets"
            />
          </div>
        </FilterBar>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {isFetching && rows.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No transfers in this direction yet.</div>
          ) : (
            <table className="min-w-[920px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['', 'Ref #', 'Date', 'Status', 'Lines', 'Value (Rs.)', 'Issued By', 'Received By', ''].map((h, i) => (
                    <th key={i} className="text-left text-xs font-semibold text-gray-500 uppercase py-3 px-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((iss) => {
                  const open = expanded === iss._id;
                  const sm = STATUS_META[iss.status] ?? STATUS_META.confirmed;
                  const busy = actingId === iss._id;
                  return [
                    <tr key={iss._id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 text-gray-400 cursor-pointer" onClick={() => setExpanded(open ? null : iss._id)}>
                        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600 whitespace-nowrap">{iss.issueNumber}</td>
                      <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{iss.createdAt ? format(new Date(iss.createdAt), 'dd MMM yyyy, HH:mm') : '—'}</td>
                      <td className="py-3 px-4">
                        <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap', sm.cls)}>{sm.label}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{iss.lines?.length ?? 0}</td>
                      <td className="py-3 px-4 text-gray-700 tabular-nums">{fmt(iss.totalValue)}</td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{iss.issuedBy?.name ?? iss.issuedBy?.email ?? '—'}</td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{iss.receivedBy?.name ?? iss.receivedBy?.email ?? '—'}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {canAct(iss) && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => doAccept(iss)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50"
                            >
                              <Check size={13} /> Accept
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => { setRejecting(iss); setReason(''); }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 border border-rose-200 hover:bg-rose-50 rounded-lg transition disabled:opacity-50"
                            >
                              <X size={13} /> Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>,
                    open && (
                      <tr key={`${iss._id}-detail`} className="bg-slate-50/60">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="rounded-lg border border-gray-200 overflow-hidden">
                            <table className="min-w-full text-xs">
                              <thead className="bg-white border-b border-gray-100">
                                <tr>
                                  {['Product', 'Qty', 'Unit', 'Unit Cost', 'Value'].map((h) => (
                                    <th key={h} className="text-left font-semibold text-gray-500 uppercase py-2 px-3">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {(iss.lines ?? []).map((l, idx) => (
                                  <tr key={idx}>
                                    <td className="py-2 px-3 text-gray-800">{l.product?.name ?? '—'}</td>
                                    <td className="py-2 px-3 tabular-nums">
                                      {fmt(l.qty)}
                                      {l.enteredUnit && l.enteredUnit !== l.unit && (
                                        <span className="block text-[10px] text-gray-400">sent {fmt(l.enteredQty)} {l.enteredUnit}</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-gray-500">{l.unit ?? '—'}</td>
                                    <td className="py-2 px-3 tabular-nums text-gray-600">{fmt(l.unitCost)}</td>
                                    <td className="py-2 px-3 tabular-nums text-gray-700">{fmt(l.lineValue)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {iss.notes && <p className="text-xs text-gray-500 mt-2 italic">Note: {iss.notes}</p>}
                          {iss.status === 'rejected' && (
                            <p className="text-xs text-rose-600 mt-2">
                              Rejected{iss.receivedBy ? ` by ${iss.receivedBy.name ?? iss.receivedBy.email}` : ''}
                              {iss.rejectReason ? ` — "${iss.rejectReason}"` : ''}. Stock was returned to the sender.
                            </p>
                          )}
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Reject reason modal */}
      {rejecting && (
        <div
          className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && actingId !== rejecting._id) setRejecting(null); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white"><X size={16} /></div>
              <p className="text-sm font-bold text-gray-900">Reject transfer {rejecting.issueNumber}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500">
                The stock will be returned to the sender ({rejecting.direction === 'kitchenToStore' ? 'Kitchen' : 'Store'}). Add a reason so they know what was wrong.
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="e.g. quantity doesn't match what we requested"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                disabled={actingId === rejecting._id}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doReject}
                disabled={actingId === rejecting._id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                <X size={14} /> {actingId === rejecting._id ? 'Rejecting…' : 'Reject & return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transfers;
