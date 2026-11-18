import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { QrCode, X, CheckCircle2, Ban, Clock, Phone, User, RefreshCw, UtensilsCrossed, Receipt } from 'lucide-react';
import { useSelector } from 'react-redux';
import useSession from '../../hooks/useSession';
import { listQrOrders, approveQrOrder, declineQrOrder, acknowledgeQrBillRequest } from '../../api/qrOrderApi';
import { getQrSocket, joinCashierRoom, getPosTenantSlug } from '../../utils/qrSocket';
import Spinner from '../UI/Spinner';
import PreparationChoice from '../UI/PreparationChoice';
import KitchenPrintModal from '../Print/KitchenPrintModal';
import { useReceiptPrint } from '../Print/ReceiptPrintProvider';
import { markHeldOrderPrinted } from '../../api/sessionApi';
import { buildHeldBillPreview } from '../../utils/heldBillPreview';

const fmtPKR = (v) => `Rs. ${Math.round(Number(v || 0)).toLocaleString('en-PK')}`;

const kitchenItemKey = (item) => (
  `${item.menuItem || item.menuItemId || item._id}::${item.variation?.id || item.variationId || ''}`
);

const kitchenQtyMap = (items = []) => items.reduce((map, item) => {
  const key = kitchenItemKey(item);
  map[key] = (map[key] || 0) + Number(item.qty || 0);
  return map;
}, {});

const kitchenDeltaItems = (items = [], alreadyPrinted = {}) => {
  const remainingByKey = {};
  const fullMap = kitchenQtyMap(items);
  Object.entries(fullMap).forEach(([key, qty]) => {
    remainingByKey[key] = Math.max(0, Number(qty) - Number(alreadyPrinted?.[key] || 0));
  });
  return items.reduce((delta, item) => {
    const key = kitchenItemKey(item);
    const qty = Math.min(Number(item.qty || 0), Number(remainingByKey[key] || 0));
    if (qty > 0) delta.push({ ...item, qty, lineTotal: Number(item.unitPrice || 0) * qty });
    remainingByKey[key] = Math.max(0, Number(remainingByKey[key] || 0) - qty);
    return delta;
  }, []);
};

const QrOrdersPanel = ({ isMobile, isOpen, onClose }) => {
  const { outletName, outletCode, cashier } = useSession();
  const requestReceiptPrint = useReceiptPrint();
  const session = useSelector((s) => s.session.session);
  const taxConfig = useSelector((s) => s.taxConfig);
  const outletId = session?.outlet?._id || session?.outlet || null;
  const tenantSlug = getPosTenantSlug();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declinePrepared, setDeclinePrepared] = useState(null);
  const [kitchenPrintOrder, setKitchenPrintOrder] = useState(null);

  // One REST seed when the drawer opens; thereafter updates flow via
  // socket events. Manual Refresh button still calls this for paranoia.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listQrOrders(outletId);
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      // Silent — surface only what manual refresh shows.
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  // Socket-driven incremental updates. We mutate the local list rather than
  // re-fetching: prepend new pending orders, recompute on status updates.
  useEffect(() => {
    if (!isOpen) return;
    refresh();

    const sock = getQrSocket();
    const cleanupJoin = joinCashierRoom(tenantSlug, outletId);

    const onNew = (payload) => {
      // Re-fetch on a brand-new order so we have the full doc shape the
      // card renderer expects (items, qrOrder fields, etc.). Cheap — only
      // on actual events, not on a timer.
      refresh();
    };
    const onUpdated = (payload) => {
      if (!payload?.orderNumber) return;
      // Approval/decline can clear a nested pending add-on while leaving the
      // transaction itself held. Re-seed so every terminal drops that nested
      // pending state instead of retaining a stale card/count.
      refresh();
    };
    const onBillAttention = () => refresh();
    // After a long disconnect we may have missed events — re-seed.
    const onConnect = () => refresh();

    sock.on('qr-order:new', onNew);
    sock.on('qr-order:updated', onUpdated);
    sock.on('qr-order:bill-requested', onBillAttention);
    sock.on('qr-order:bill-acknowledged', onBillAttention);
    sock.on('connect', onConnect);

    return () => {
      cleanupJoin();
      sock.off('qr-order:new', onNew);
      sock.off('qr-order:updated', onUpdated);
      sock.off('qr-order:bill-requested', onBillAttention);
      sock.off('qr-order:bill-acknowledged', onBillAttention);
      sock.off('connect', onConnect);
    };
  }, [isOpen, refresh, tenantSlug, outletId]);

  const handleApprove = async (order) => {
    setActingId(order._id);
    try {
      const approved = await approveQrOrder(order._id);
      toast.success(`Approved · ${order.qrOrder?.tableLabel || ''}`);
      window.dispatchEvent(new CustomEvent('pos-qr-pending-resolved', {
        detail: { orderNumber: order.transactionNumber },
      }));

      const fullQtyMap = kitchenQtyMap(approved.items || []);
      // New backends return the exact accepted add-on lines. Keep the quantity
      // map calculation only as compatibility for an older backend response.
      const deltaItems = Array.isArray(approved.kitchenPrintItems)
        ? approved.kitchenPrintItems
        : kitchenDeltaItems(
          approved.items || [],
          approved.kitchenPrintedQtyMap || {},
        );

      // Approval opens the same in-app kitchen confirmation used by manually
      // held orders. For a table add-on, only quantities not printed on the
      // original ticket are sent, while the full quantity map remains durable.
      setKitchenPrintOrder({
        _id: approved._id,
        transactionNumber: approved.transactionNumber,
        items: deltaItems,
        fullQtyMap,
        orderType: 'dine-in',
        tableNumber: approved.qrOrder?.tableLabel || approved.tableNumber || '',
        customer: {
          name: approved.qrOrder?.customerName || order.qrOrder?.customerName || order.customer?.name || '',
          phone: approved.qrOrder?.customerPhone || order.qrOrder?.customerPhone || order.customer?.phone || '',
        },
        notes: approved.kitchenPrintNotes || approved.notes || '',
        createdAt: approved.createdAt,
      });

      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve');
    } finally {
      setActingId(null);
    }
  };

  const handleDecline = async () => {
    if (!declineTarget || declineReason.trim().length < 3 || typeof declinePrepared !== 'boolean') return;
    setActingId(declineTarget._id);
    try {
      await declineQrOrder(declineTarget._id, declineReason.trim(), declinePrepared);
      toast.success('Declined');
      window.dispatchEvent(new CustomEvent('pos-qr-pending-resolved', {
        detail: { orderNumber: declineTarget.transactionNumber },
      }));
      setDeclineTarget(null);
      setDeclineReason('');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to decline');
    } finally {
      setActingId(null);
    }
  };

  const handlePrintRequestedBill = async (order) => {
    const billType = order.qrOrder?.billRequest?.billType;
    if (!['cash', 'card'].includes(billType)) {
      toast.error('This request does not specify Cash Bill or Card Bill. Ask the customer to request it again.');
      return;
    }
    if (billType === 'card' && taxConfig?.loaded !== true
      && (order.items || []).some((item) => Number(item.taxRate || 0) > 0)) {
      toast.error('Card tax settings are still loading. Try again in a moment.');
      return;
    }
    setActingId(order._id);
    try {
      const billPreview = buildHeldBillPreview(order, taxConfig, billType);
      const printable = {
        ...billPreview,
        status: 'held',
        customer: order.customer,
        createdAt: order.heldAt || order.createdAt,
        timezone: order.timezone || session?.outlet?.timezone,
      };
      delete printable.cashierNotes;
      const printed = await requestReceiptPrint({
        transaction: printable,
        outletName: outletName || outletCode,
        cashierName: order.cashier?.name || cashier?.name || cashier?.email || 'Cashier',
      });
      // Closing the receipt preview is not an acknowledgement. Keep the
      // customer's request pending until the connector confirms printing.
      if (!printed) return;
      try {
        await acknowledgeQrBillRequest(order._id);
      } catch (ackError) {
        toast.error(ackError.response?.data?.message || 'Bill printed, but the request could not be cleared. Refresh before printing again.');
        refresh();
        return;
      }
      toast.success(`${billType === 'card' ? 'Card' : 'Cash'} Bill printed · ${order.qrOrder?.tableLabel || ''}`);
      window.dispatchEvent(new CustomEvent('pos-qr-pending-resolved', {
        detail: { orderNumber: order.transactionNumber, type: 'bill' },
      }));
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not print the requested bill');
    } finally {
      setActingId(null);
    }
  };

  const pendingCount = orders.filter((order) => (
    order.status === 'pending-approval'
    || (order.qrOrder?.pendingAddOn?.items || []).length > 0
  )).length;
  const billRequestCount = orders.filter((order) => order.qrOrder?.billRequest?.status === 'pending').length;
  const attentionCount = pendingCount + billRequestCount;
  const tableGroups = Object.values(orders.reduce((groups, order) => {
    const tableKey = `${String(order.outlet || outletId || '')}::${String(order.qrOrder?.tableCode || order.tableNumber || '')}`;
    if (!groups[tableKey]) groups[tableKey] = { key: tableKey, orders: [] };
    groups[tableKey].orders.push(order);
    return groups;
  }, {}))
    .map((group) => ({
      ...group,
      orders: group.orders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    }))
    .sort((a, b) => {
      const aPending = a.orders.some((order) => (
        order.status === 'pending-approval' || (order.qrOrder?.pendingAddOn?.items || []).length > 0
      ));
      const bPending = b.orders.some((order) => (
        order.status === 'pending-approval' || (order.qrOrder?.pendingAddOn?.items || []).length > 0
      ));
      if (aPending !== bPending) return aPending ? -1 : 1;
      const aLatest = Math.max(...a.orders.map((order) => new Date(order.createdAt).getTime()));
      const bLatest = Math.max(...b.orders.map((order) => new Date(order.createdAt).getTime()));
      return bLatest - aLatest;
    });

  const body = (
    <>
      <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between bg-gradient-to-br from-indigo-50 to-violet-50">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-sm">
            <QrCode size={16} />
          </div>
          <div>
            <p className="text-sm font-extrabold text-slate-900 leading-tight">QR Orders</p>
            <p className="text-[11px] text-slate-500 leading-tight">
              {attentionCount > 0
                ? `${attentionCount} action${attentionCount === 1 ? '' : 's'} waiting · ${tableGroups.length} active table${tableGroups.length === 1 ? '' : 's'}`
                : `${tableGroups.length || 'No'} active table${tableGroups.length === 1 ? '' : 's'} · auto-refresh`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/70 hover:text-slate-900" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/70 hover:text-slate-900">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5 bg-slate-50/50">
        {loading && tableGroups.length === 0 ? (
          <div className="flex items-center justify-center py-10"><Spinner size="md" /></div>
        ) : tableGroups.length === 0 ? (
          <div className="text-center py-10 px-4">
            <QrCode size={28} className="mx-auto text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-600">All caught up</p>
            <p className="mt-1 text-[11px] text-slate-400">QR self-orders will appear here when customers place them.</p>
          </div>
        ) : (
          tableGroups.map((group) => (
            <TableOrderCard
              key={group.key}
              orders={group.orders}
              actingId={actingId}
              onApprove={handleApprove}
              onDecline={(order) => { setDeclineReason(''); setDeclinePrepared(null); setDeclineTarget(order); }}
              onPrintRequestedBill={handlePrintRequestedBill}
            />
          ))
        )}
      </div>

      {/* Decline modal */}
      {declineTarget && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => { if (!actingId) setDeclineTarget(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Ban size={16} className="text-rose-600" />
              <h3 className="text-sm font-bold text-slate-900">
                {declineTarget._declineIsAddOn ? 'Decline add-on for' : 'Decline order'} #{declineTarget.transactionNumber}
              </h3>
            </div>
            <p className="text-xs text-slate-500">Reason will be shown to the customer on their tracking page.</p>
            <textarea
              autoFocus
              rows={3}
              maxLength={300}
              disabled={Boolean(actingId)}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="e.g. Item is sold out, kitchen is closing, duplicate order…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:outline-none focus:border-rose-400"
            />
            <PreparationChoice value={declinePrepared} onChange={setDeclinePrepared} subject={declineTarget._declineIsAddOn ? 'add-on' : 'order'} disabled={Boolean(actingId)} />
            <div className="flex gap-2 justify-end">
              <button
                disabled={Boolean(actingId)}
                onClick={() => { setDeclineTarget(null); setDeclineReason(''); }}
                className="px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDecline}
                disabled={declineReason.trim().length < 3 || declinePrepared === null || actingId === declineTarget._id}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
              >
                {actingId === declineTarget._id ? 'Declining…' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Mobile bottom sheet
  if (isMobile) {
    return (
      <>
        {isOpen && <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />}
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
        {kitchenPrintOrder && (
          <KitchenPrintModal
            order={kitchenPrintOrder}
            outletName={outletName}
            onPrinted={async () => {
              await markHeldOrderPrinted(kitchenPrintOrder._id, kitchenPrintOrder.fullQtyMap || {});
              setKitchenPrintOrder(null);
              toast.success('Kitchen ticket printed');
              refresh();
            }}
            onCancel={() => setKitchenPrintOrder(null)}
          />
        )}
      </>
    );
  }

  // Desktop right drawer
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
      {kitchenPrintOrder && (
        <KitchenPrintModal
          order={kitchenPrintOrder}
          outletName={outletName}
          onPrinted={async () => {
            await markHeldOrderPrinted(kitchenPrintOrder._id, kitchenPrintOrder.fullQtyMap || {});
            setKitchenPrintOrder(null);
            toast.success('Kitchen ticket printed');
            refresh();
          }}
          onCancel={() => setKitchenPrintOrder(null)}
        />
      )}
    </>
  );
};

const TableOrderCard = ({ orders, actingId, onApprove, onDecline, onPrintRequestedBill }) => {
  const latest = orders[orders.length - 1];
  const tableLabel = latest?.qrOrder?.tableLabel || latest?.tableNumber || '—';
  const customerName = latest?.qrOrder?.customerName || latest?.customer?.name;
  const customerPhone = latest?.qrOrder?.customerPhone || latest?.customer?.phone;
  const pendingOrders = orders.filter((order) => (
    order.status === 'pending-approval'
    || (order.qrOrder?.pendingAddOn?.items || []).length > 0
  ));
  const heldOrders = orders.filter((order) => order.status === 'held');
  const billRequestOrder = orders.find((order) => order.qrOrder?.billRequest?.status === 'pending');
  const requestedBillType = billRequestOrder?.qrOrder?.billRequest?.billType;
  const requestedBillLabel = requestedBillType === 'card' ? 'Card Bill' : requestedBillType === 'cash' ? 'Cash Bill' : 'Bill';
  const totalAmount = orders.reduce(
    (sum, order) => sum + Number(order.qrDisplay?.totalAmount ?? order.totalAmount ?? 0),
    0,
  );
  const itemCount = orders.reduce(
    (sum, order) => sum + (order.qrDisplay?.items || order.items || [])
      .reduce((itemSum, item) => itemSum + Number(item.qty || 0), 0),
    0,
  );
  const allHeldTicketsPrinted = heldOrders.length > 0
    && pendingOrders.length === 0
    && heldOrders.every((order) => Boolean(order.kitchenPrintedAt));
  const submissions = orders.flatMap((order, orderIndex) => {
    const pendingAddOn = order.qrOrder?.pendingAddOn;
    const baseLabel = Number(order.qrOrder?.addOnCount || 0) > 0
      ? 'Combined order'
      : (orderIndex === 0 ? 'Original order' : `Previous order ${orderIndex + 1}`);
    const rows = [{
      key: `${order._id}:base`,
      order,
      items: order.items || [],
      notes: order.notes || '',
      totalAmount: order.totalAmount,
      pending: order.status === 'pending-approval',
      label: baseLabel,
      placedAt: order.createdAt,
      isAddOn: false,
    }];
    if ((pendingAddOn?.items || []).length > 0) {
      rows.push({
        key: `${order._id}:pending-add-on`,
        order,
        items: pendingAddOn.items,
        notes: pendingAddOn.notes || '',
        totalAmount: pendingAddOn.totalAmount,
        pending: true,
        label: 'New add-on',
        placedAt: pendingAddOn.submittedAt,
        isAddOn: true,
      });
    }
    return rows;
  });

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
      pendingOrders.length > 0 ? 'border-amber-300' : 'border-slate-200'
    }`}>
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-white px-3.5 py-3">
        <div className="inline-flex min-w-0 items-center gap-2.5 rounded-xl bg-emerald-600 px-3 py-2 text-white shadow-sm ring-1 ring-emerald-700/10">
          <UtensilsCrossed size={18} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase leading-none tracking-[0.18em] text-emerald-100">Table</p>
            <p className="mt-1 truncate text-2xl font-black leading-none">{tableLabel}</p>
          </div>
        </div>
        <div className="text-right">
          {pendingOrders.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
              <Clock size={9} /> {pendingOrders.length} awaiting
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
              allHeldTicketsPrinted
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-indigo-100 text-indigo-700'
            }`}>
              <CheckCircle2 size={9} /> {allHeldTicketsPrinted ? 'In kitchen' : 'Confirmed'}
            </span>
          )}
          <p className="mt-1 text-lg font-black tabular-nums text-slate-900">{fmtPKR(totalAmount)}</p>
          <p className="text-[10px] font-semibold text-slate-400">
            {orders.length} order{orders.length === 1 ? '' : 's'} · {itemCount} item{itemCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {(customerName || customerPhone) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-slate-100 bg-slate-50/60 px-3.5 py-2 text-[11px] text-slate-600">
          {customerName && (
            <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
              <User size={11} className="shrink-0 text-slate-400" />
              <span className="truncate">{customerName}</span>
            </span>
          )}
          {customerPhone && (
            <span className="inline-flex items-center gap-1.5 font-mono">
              <Phone size={10} className="text-slate-400" /> {customerPhone}
            </span>
          )}
        </div>
      )}

      {billRequestOrder && (
        <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                <Receipt size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-indigo-950">Customer requested a {requestedBillLabel}</p>
                <p className="truncate text-[10px] text-indigo-700">Table {tableLabel} · #{billRequestOrder.transactionNumber}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onPrintRequestedBill(billRequestOrder)}
              disabled={actingId === billRequestOrder._id}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {actingId === billRequestOrder._id ? 'Printing…' : `Print ${requestedBillLabel}`}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2.5 bg-slate-50/40 p-3">
        {submissions.map((submission) => {
          const { order, items, notes, totalAmount: submissionTotal, pending, label, placedAt, isAddOn } = submission;
          const busy = actingId === order._id;
          const placed = placedAt
            ? formatDistanceToNow(new Date(placedAt), { addSuffix: true })
            : '';
          const submissionItemCount = items.reduce(
            (sum, item) => sum + Number(item.qty || 0),
            0,
          );

          return (
            <div
              key={submission.key}
              className={`overflow-hidden rounded-xl border bg-white ${pending ? 'border-amber-200' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                      !isAddOn
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {label}
                    </span>
                    {pending ? (
                      <span className="text-[9px] font-bold uppercase text-amber-700">Pending</span>
                    ) : (
                      <span className={`text-[9px] font-bold uppercase ${
                        order.kitchenPrintedAt ? 'text-emerald-700' : 'text-indigo-700'
                      }`}>
                        {order.kitchenPrintedAt ? 'In kitchen' : 'Confirmed'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] font-bold text-slate-500">#{order.transactionNumber}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock size={9} /> {placed} · {submissionItemCount} item{submissionItemCount === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-extrabold tabular-nums text-slate-900">{fmtPKR(submissionTotal)}</p>
              </div>

              <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 space-y-1">
                {items.slice(0, 6).map((item, itemIndex) => (
                  <div key={itemIndex} className="flex justify-between gap-2 text-[11px] text-slate-700">
                    <span className="min-w-0 truncate">
                      <span className="mr-1.5 font-bold text-slate-900">{item.qty}×</span>
                      {item.name}{(item.variation?.name || item.variationName) ? ` (${item.variation?.name || item.variationName})` : ''}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-500">{fmtPKR(item.lineTotal)}</span>
                  </div>
                ))}
                {items.length > 6 && (
                  <p className="text-[10px] italic text-slate-400">+{items.length - 6} more…</p>
                )}
              </div>

              {notes && (
                <div className="border-t border-amber-100 bg-amber-50/70 px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700">Customer note</p>
                  <p className="mt-0.5 text-[10px] italic leading-snug text-amber-900">{notes}</p>
                </div>
              )}

              {pending && (
                <div className="grid grid-cols-[1fr_1.5fr] gap-2 border-t border-slate-100 p-2.5">
                  <button
                    onClick={() => onDecline({ ...order, _declineIsAddOn: isAddOn })}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 bg-white px-2 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Ban size={11} /> Decline
                  </button>
                  <button
                    onClick={() => onApprove(order)}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 size={11} className="shrink-0" />
                    <span className="truncate">{busy ? 'Approving…' : isAddOn ? 'Approve add-on & send' : 'Approve & send'}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QrOrdersPanel;
