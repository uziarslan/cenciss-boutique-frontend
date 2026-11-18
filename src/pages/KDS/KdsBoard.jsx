import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Bike, ChefHat, Clock3, RefreshCw, Store, UtensilsCrossed } from 'lucide-react';
import toast from 'react-hot-toast';
import { getOutlets } from '../../api/outletApi';
import {
  cancelKdsOrder,
  cancelKdsOrderItem,
  getKdsOrders,
  getKdsWastePreview,
  transitionKdsOrder,
} from '../../api/kdsApi';
import CancelKdsItemDialog from './CancelKdsItemDialog';
import SearchableSelect from '../../components/UI/SearchableSelect';
import useAuth from '../../hooks/useAuth';
import useQueryState from '../../hooks/useQueryState';
import { hasEffectivePermission } from '../../config/permissions';
import { joinKdsRoom, getKdsSocket } from '../../utils/kdsSocket';
import { reconcileKdsOrders, removeKdsOrder } from './kdsBoardState';
import { playOrderAlert } from '../POSTerminal/_legacy/utils/orderAlertSound';
import { CancelHeldDialog } from '../POSTerminal/_legacy/components/HeldOrders/HeldOrdersPanel';

const COLUMNS = [
  { key: 'new', title: 'New', tone: 'border-sky-200 bg-sky-50/60', action: 'accept', actionLabel: 'Accept order' },
  { key: 'accepted', title: 'Accepted', tone: 'border-violet-200 bg-violet-50/60', action: 'start-prep', actionLabel: 'Start preparation' },
  { key: 'preparing', title: 'Preparing', tone: 'border-amber-200 bg-amber-50/60', action: 'dispatch', actionLabel: 'Ready & dispatch' },
  { key: 'dispatched', title: 'Recently dispatched', tone: 'border-emerald-200 bg-emerald-50/60' },
];

const orderTypeLabel = (value) => ({
  'dine-in': 'Dine in', takeaway: 'Takeaway', delivery: 'Delivery', foodpanda: 'Foodpanda',
}[value] || value || 'Order');

const KdsBoard = () => {
  const { user } = useAuth();
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useQueryState('outlet', '');
  const [outlet, setOutlet] = useState(null);
  const [orders, setOrders] = useState([]);
  const [businessDate, setBusinessDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelItemTarget, setCancelItemTarget] = useState(null);
  const canOperate = hasEffectivePermission(user, 'kds.operate');
  const canCancel = hasEffectivePermission(user, 'kds.cancel');

  useEffect(() => {
    getOutlets({ limit: 100 })
      .then(({ data }) => {
        const rows = data?.data || [];
        const assignedId = String(user?.outletRef?._id || user?.outletRef || '');
        const assignedCode = String(user?.outletCode || user?.outlet || '');
        const permittedRows = user?.role === 'owner'
          ? rows
          : rows.filter((row) => String(row._id) === assignedId || String(row.code) === assignedCode);
        setOutlets(permittedRows);
        setOutletId((current) => permittedRows.some((row) => String(row._id) === String(current))
          ? current
          : permittedRows[0]?._id || '');
      })
      .catch(() => toast.error('Could not load outlets.'));
  }, [setOutletId, user?.outlet, user?.outletCode, user?.outletRef, user?.role]);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!outletId) return;
    if (!quiet) setLoading(true);
    try {
      const data = await getKdsOrders(outletId);
      setOrders(data.orders || []);
      setOutlet(data.outlet || null);
      setBusinessDate(data.businessDate || '');
    } catch (error) {
      setOrders([]);
      setBusinessDate('');
      if (error.response?.data?.code === 'KDS_DISABLED') {
        setOutlet(error.response?.data?.data?.outlet || null);
      } else {
        setOutlet(null);
        toast.error(error.response?.data?.message || 'Could not load the kitchen board.');
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [outletId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!outletId) return undefined;
    const socket = getKdsSocket();
    const leave = joinKdsRoom(outletId);
    const onChange = (incoming) => {
      if (!businessDate || String(incoming?.outlet) !== String(outletId)) return;
      setOrders((current) => reconcileKdsOrders(current, incoming, businessDate));
    };
    const onCheckedOut = (incoming) => {
      if (String(incoming?.outlet) !== String(outletId)) return;
      setOrders((current) => removeKdsOrder(current, incoming));
    };
    const onNew = (incoming) => {
      if (!businessDate || incoming?.businessDate !== businessDate
        || String(incoming?.outlet) !== String(outletId)) return;
      playOrderAlert('qr');
      onChange(incoming);
      toast.success(`New kitchen order ${incoming.ticketNumber || ''}`);
    };
    socket.on('kds-order:new', onNew);
    socket.on('kds-order:updated', onChange);
    socket.on('kds-order:revision', onChange);
    socket.on('kds-order:cancelled', onChange);
    socket.on('kds-order:checked-out', onCheckedOut);
    socket.on('connect', refresh);
    return () => {
      leave();
      socket.off('kds-order:new', onNew);
      socket.off('kds-order:updated', onChange);
      socket.off('kds-order:revision', onChange);
      socket.off('kds-order:cancelled', onChange);
      socket.off('kds-order:checked-out', onCheckedOut);
      socket.off('connect', refresh);
    };
  }, [outletId, refresh, businessDate]);

  useEffect(() => {
    const refreshVisibleBoard = () => {
      if (document.visibilityState === 'visible') refresh({ quiet: true });
    };
    const timer = setInterval(refreshVisibleBoard, 30_000);
    document.addEventListener('visibilitychange', refreshVisibleBoard);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisibleBoard);
    };
  }, [refresh]);

  const byStatus = useMemo(() => Object.fromEntries(COLUMNS.map((column) => {
    const rows = orders.filter((order) => businessDate && order.businessDate === businessDate
      && order.currentStatus === column.key);
    if (column.key === 'new') {
      rows.sort((left, right) => new Date(right.sentToKitchenAt) - new Date(left.sentToKitchenAt));
    }
    return [column.key, rows];
  })), [orders, businessDate]);

  const transition = async (order, action) => {
    setBusyId(order._id);
    try {
      const updated = await transitionKdsOrder(order._id, action);
      setOrders((current) => reconcileKdsOrders(current, updated, businessDate));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update this order.');
      refresh({ quiet: true });
    } finally {
      setBusyId('');
    }
  };

  const ageTone = (order) => {
    const minutes = (Date.now() - new Date(order.sentToKitchenAt).getTime()) / 60000;
    const warning = Number(outlet?.kds?.warningMinutes || 15);
    const critical = Number(outlet?.kds?.criticalMinutes || 25);
    if (minutes >= critical) return 'border-rose-400 ring-2 ring-rose-200';
    if (minutes >= warning) return 'border-amber-400 ring-2 ring-amber-100';
    return 'border-slate-200';
  };

  if (!loading && outlet && outlet.kds?.enabled !== true) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <AlertTriangle className="mx-auto text-amber-600" size={34} />
        <h2 className="mt-3 text-lg font-bold text-amber-950">KDS is off for {outlet.name}</h2>
        <p className="mt-1 text-sm text-amber-800">An owner can enable it from Settings → KDS.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-orange-100 p-2.5 text-orange-700"><ChefHat size={22} /></span>
          <div><h1 className="text-xl font-bold text-slate-900">Kitchen Display</h1><p className="text-xs text-slate-500">Live preparation queue and complete timing trail</p></div>
        </div>
        <div className="flex min-w-[250px] items-center gap-2">
          <Store size={16} className="text-slate-400" />
          <div className="min-w-0 flex-1"><SearchableSelect options={outlets.map((row) => ({ value: row._id, label: row.name, meta: row.code }))} value={outletId} onChange={setOutletId} /></div>
          <button type="button" onClick={() => refresh()} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Refresh KDS"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      <div className="grid min-h-[60vh] gap-4 xl:grid-cols-4 md:grid-cols-2">
        {COLUMNS.map((column) => (
          <section key={column.key} className={`rounded-2xl border p-3 ${column.tone}`}>
            <header className="mb-3 flex items-center justify-between px-1"><h2 className="font-bold text-slate-800">{column.title}</h2><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm">{byStatus[column.key]?.length || 0}</span></header>
            <div className="space-y-3">
              {(byStatus[column.key] || []).map((order) => (
                <article key={order._id} className={`rounded-xl border bg-white p-4 shadow-sm ${ageTone(order)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-lg font-black text-slate-900">#{order.ticketNumber}</p><p className="text-xs font-semibold text-slate-500">{orderTypeLabel(order.orderType)}{order.tableNumber ? ` · Table ${order.tableNumber}` : ''}{order.revisions?.length > 1 ? ` · Revision ${order.revisions.length}` : ''}</p></div>
                    <span className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600"><Clock3 size={11} />{formatDistanceToNow(new Date(order.sentToKitchenAt))}</span>
                  </div>
                  {(order.customerName || order.customerPhone || order.notes || order.deliveryAddress) && <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">{order.customerName && <p className="font-semibold">{order.customerName}</p>}{order.customerPhone && <p>{order.customerPhone}</p>}{order.deliveryAddress && <p>{[order.deliveryAddress.street, order.deliveryAddress.area, order.deliveryAddress.city].filter(Boolean).join(', ')}</p>}{order.notes && <p className="mt-1 font-semibold text-rose-600">Note: {order.notes}</p>}</div>}
                  {order.finalSaleTransaction && <p className="mt-2 rounded-lg bg-slate-100 px-2.5 py-2 text-xs text-slate-600"><span className="font-bold">Checked out</span>{canCancel && ' · Individual item cancellation requires a billing adjustment.'}</p>}
                  <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
                    {(order.items || []).map((item, index) => (
                      <li key={`${item.menuItem || item.name}-${index}`} className="flex gap-2 py-2 text-sm"><span className="font-black text-orange-700">{item.qty}×</span><span className="min-w-0 flex-1 font-semibold text-slate-800">{item.name}{item.variation?.name ? <span className="block text-xs font-normal text-slate-500">{item.variation.name}</span> : null}{item.notes ? <span className="block text-xs font-medium text-rose-600">Note: {item.notes}</span> : null}</span>{canCancel && !order.finalSaleTransaction && <button type="button" disabled={busyId === order._id} onClick={() => setCancelItemTarget({ order, itemIndex: index })} aria-label={`Cancel ${item.name}`} className="self-start rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Cancel item</button>}</li>
                    ))}
                  </ul>
                  {order.orderType === 'delivery' && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-slate-600"><Bike size={13} />{order.assignedRiderName || 'Rider not assigned'}</p>}
                  {column.action && canOperate && <button type="button" disabled={busyId === order._id} onClick={() => transition(order, column.action)} className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">{busyId === order._id ? 'Updating…' : column.actionLabel}</button>}
                  {canCancel && <button type="button" disabled={busyId === order._id} onClick={() => setCancelTarget(order)} className="mt-2 w-full rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">Cancel order</button>}
                </article>
              ))}
              {!loading && (byStatus[column.key] || []).length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white/50 py-10 text-center text-xs font-medium text-slate-400"><UtensilsCrossed className="mx-auto mb-2" size={20} />No orders</div>}
            </div>
          </section>
        ))}
      </div>

      {cancelItemTarget && (
        <CancelKdsItemDialog
          order={cancelItemTarget.order}
          itemIndex={cancelItemTarget.itemIndex}
          onKeep={() => setCancelItemTarget(null)}
          onCancelOrder={() => { setCancelTarget(cancelItemTarget.order); setCancelItemTarget(null); }}
          onConfirm={async (payload) => {
            const { order, itemIndex } = cancelItemTarget;
            setBusyId(order._id);
            try {
              const updated = await cancelKdsOrderItem(order._id, itemIndex, payload);
              setOrders((current) => reconcileKdsOrders(current, updated, businessDate));
              setCancelItemTarget(null);
              toast.success(payload.prepared ? 'Item cancelled and waste recorded.' : 'Item cancelled.');
            } catch (error) {
              refresh({ quiet: true });
              throw error;
            } finally {
              setBusyId('');
            }
          }}
        />
      )}

      {cancelTarget && (
        <CancelHeldDialog
          order={cancelTarget}
          getWastePreview={getKdsWastePreview}
          notPreparedLabel="Not prepared"
          notPreparedDescription={cancelTarget.finalSaleTransaction ? 'Cancel the order and restore unprepared ingredients to kitchen stock.' : 'Cancel the order and record that it was not prepared.'}
          onKeep={() => setCancelTarget(null)}
          onChoose={async (prepared, voidReason, wasteOptions) => {
            const target = cancelTarget;
            setBusyId(target._id);
            try {
              await cancelKdsOrder(target._id, {
                prepared,
                voidReason,
                selection: wasteOptions.selection ?? null,
                valuationMethod: wasteOptions.valuationMethod,
              });
              setOrders((current) => current.filter((row) => row._id !== target._id));
              setCancelTarget(null);
              toast.success(prepared ? 'Order cancelled and waste recorded.' : 'Order cancelled.');
            } catch (error) {
              toast.error(error.response?.data?.message || 'Could not cancel this order.');
              throw error;
            } finally {
              setBusyId('');
            }
          }}
        />
      )}
    </div>
  );
};

export default KdsBoard;
