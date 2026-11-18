import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Bike,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChefHat,
  CircleDot,
  ClipboardList,
  Clock3,
  CookingPot,
  MapPin,
  PackageCheck,
  Phone,
  RefreshCw,
  Send,
  ShoppingBag,
  Timer,
  UserRound,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getKdsLifecycleReport } from '../../api/kdsApi';
import { getOutlets } from '../../api/outletApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import useAuth from '../../hooks/useAuth';
import useQueryState from '../../hooks/useQueryState';

const today = () => new Date().toLocaleDateString('en-CA');

const formatDuration = (seconds) => {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
};

const formatDateTime = (value) => value
  ? new Date(value).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  })
  : '—';

const formatClock = (value) => value
  ? new Date(value).toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  })
  : '—';

const money = (value) => `PKR ${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const titleCase = (value = '') => value
  .replaceAll('-', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const STATUS = {
  new: { label: 'Waiting', classes: 'border-amber-200 bg-amber-50 text-amber-700' },
  accepted: { label: 'Accepted', classes: 'border-sky-200 bg-sky-50 text-sky-700' },
  preparing: { label: 'In preparation', classes: 'border-violet-200 bg-violet-50 text-violet-700' },
  dispatched: { label: 'Dispatched', classes: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelled', classes: 'border-rose-200 bg-rose-50 text-rose-700' },
};

const EVENT = {
  punched: { label: 'Order punched', icon: CircleDot, tone: 'slate' },
  sent: { label: 'Sent to kitchen', icon: Send, tone: 'indigo' },
  accepted: { label: 'Kitchen accepted', icon: Check, tone: 'sky' },
  'prep-started': { label: 'Preparation started', icon: CookingPot, tone: 'violet' },
  dispatched: { label: 'Kitchen dispatched', icon: PackageCheck, tone: 'emerald' },
  'cashier-acknowledged': { label: 'Cashier acknowledged', icon: BellRing, tone: 'amber' },
  'rider-assigned': { label: 'Rider assigned', icon: Bike, tone: 'cyan' },
  cancelled: { label: 'Order cancelled', icon: XCircle, tone: 'rose' },
  revised: { label: 'Order revised', icon: RefreshCw, tone: 'orange' },
  relinked: { label: 'Payment completed', icon: CheckCircle2, tone: 'emerald' },
};

const TONES = {
  slate: { dot: 'border-slate-200 bg-slate-50 text-slate-600', line: 'bg-slate-200' },
  indigo: { dot: 'border-indigo-200 bg-indigo-50 text-indigo-600', line: 'bg-indigo-200' },
  sky: { dot: 'border-sky-200 bg-sky-50 text-sky-600', line: 'bg-sky-200' },
  violet: { dot: 'border-violet-200 bg-violet-50 text-violet-600', line: 'bg-violet-200' },
  emerald: { dot: 'border-emerald-200 bg-emerald-50 text-emerald-600', line: 'bg-emerald-200' },
  amber: { dot: 'border-amber-200 bg-amber-50 text-amber-600', line: 'bg-amber-200' },
  cyan: { dot: 'border-cyan-200 bg-cyan-50 text-cyan-600', line: 'bg-cyan-200' },
  rose: { dot: 'border-rose-200 bg-rose-50 text-rose-600', line: 'bg-rose-200' },
  orange: { dot: 'border-orange-200 bg-orange-50 text-orange-600', line: 'bg-orange-200' },
};

const buildTimeline = (order) => {
  const events = [];
  if (order.punchedAt) {
    events.push({
      type: 'punched',
      at: order.punchedAt,
      actorName: order.cashierName || '',
      source: 'pos',
    });
  }
  events.push(...(order.lifecycle || []));
  return events
    .filter((event) => event.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
};

const SummaryCard = ({ label, value, icon: Icon, tone }) => {
  const styles = {
    indigo: 'border-indigo-100 bg-indigo-50/60 text-indigo-700',
    emerald: 'border-emerald-100 bg-emerald-50/60 text-emerald-700',
    rose: 'border-rose-100 bg-rose-50/60 text-rose-700',
    sky: 'border-sky-100 bg-sky-50/60 text-sky-700',
    violet: 'border-violet-100 bg-violet-50/60 text-violet-700',
    amber: 'border-amber-100 bg-amber-50/60 text-amber-700',
  };
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${styles[tone]}`}>
      <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-current opacity-[0.05]" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">{label}</p>
          <p className="mt-0.5 truncate text-xl font-black tabular-nums">{value}</p>
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const config = STATUS[status] || STATUS.new;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${config.classes}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
};

const OrderTimeline = ({ order }) => {
  const events = buildTimeline(order);
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max px-1 pt-1">
        {events.map((event, index) => {
          const config = EVENT[event.type] || {
            label: titleCase(event.type), icon: CircleDot, tone: 'slate',
          };
          const tone = TONES[config.tone] || TONES.slate;
          const Icon = config.icon;
          const previous = events[index - 1];
          const elapsed = previous
            ? Math.max(0, Math.round((new Date(event.at) - new Date(previous.at)) / 1000))
            : null;
          return (
            <div key={event._id || `${event.type}-${event.at}-${index}`} className="relative w-44 shrink-0 pr-5">
              {index < events.length - 1 && (
                <div className={`absolute left-10 right-0 top-5 h-0.5 ${tone.line}`} />
              )}
              <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white shadow-sm ${tone.dot}`}>
                <Icon size={17} strokeWidth={2.2} />
              </div>
              <p className="mt-3 text-xs font-bold text-slate-800">{config.label}</p>
              <p className="mt-1 text-xs font-semibold tabular-nums text-slate-500">{formatClock(event.at)}</p>
              <p className="mt-0.5 max-w-[150px] truncate text-[11px] text-slate-400">
                {event.actorName || titleCase(event.source) || 'System'}
              </p>
              {elapsed != null && (
                <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  +{formatDuration(elapsed)}
                </span>
              )}
              {event.reason && <p className="mt-2 max-w-[150px] text-[11px] leading-4 text-rose-600">{event.reason}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TimingBreakdown = ({ order }) => {
  const timings = [
    ['Punch → kitchen', order.durations?.punchToSendSeconds, Send],
    ['Waiting acceptance', order.durations?.sendToAcceptSeconds, Clock3],
    ['Accepted → prep', order.durations?.acceptToPrepSeconds, ChefHat],
    ['Preparation', order.durations?.prepToDispatchSeconds, CookingPot],
    ['Total kitchen time', order.durations?.totalKitchenSeconds, Timer],
    ['Cashier response', order.durations?.cashierResponseSeconds, BellRing],
  ];
  if (order.orderType === 'delivery') {
    timings.push(['Rider assignment', order.durations?.riderAssignmentSeconds, Bike]);
  }
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {timings.map(([label, value, Icon]) => (
        <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <Icon size={15} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-0.5 text-sm font-black tabular-nums text-slate-800">{formatDuration(value)}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

const OrderDetails = ({ order }) => {
  const address = [
    order.deliveryAddress?.street,
    order.deliveryAddress?.area,
    order.deliveryAddress?.city,
  ].filter(Boolean).join(', ');
  return (
    <div className="border-t border-slate-200 bg-gradient-to-b from-slate-50/80 to-white px-4 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">Complete audit trail</p>
          <h3 className="mt-1 font-bold text-slate-900">Order journey</h3>
        </div>
        <p className="hidden text-xs text-slate-400 sm:block">Every action is timestamped and attributed</p>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <OrderTimeline order={order} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Timing breakdown</p>
          <TimingBreakdown order={order} />
        </div>

        <div className="space-y-3 xl:col-span-2">
          {order.orderType === 'delivery' ? (
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
              <div className="flex items-center gap-2 text-cyan-800">
                <Bike size={17} />
                <h4 className="text-sm font-bold">Delivery handoff</h4>
              </div>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                <p className="flex items-start gap-2"><UserRound size={14} className="mt-0.5 shrink-0 text-cyan-600" /><span><b className="text-slate-800">Customer:</b> {order.customerName || 'Not provided'}</span></p>
                {order.customerPhone && <p className="flex items-center gap-2"><Phone size={14} className="shrink-0 text-cyan-600" />{order.customerPhone}</p>}
                {address && <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-cyan-600" />{address}</p>}
                <p className="flex items-start gap-2"><Bike size={14} className="mt-0.5 shrink-0 text-cyan-600" /><span><b className="text-slate-800">Rider:</b> {order.assignedRiderName || 'Not assigned'}</span></p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-700">
                <ShoppingBag size={17} />
                <h4 className="text-sm font-bold">Fulfilment</h4>
              </div>
              <p className="mt-2 text-xs text-slate-500">{titleCase(order.orderType)} order · Rider assignment not required</p>
            </div>
          )}

          {order.currentStatus === 'cancelled' && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
              <div className="flex items-center gap-2">
                <AlertTriangle size={17} />
                <h4 className="text-sm font-bold">Cancellation record</h4>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div><dt className="text-rose-500">Cancelled by</dt><dd className="font-bold">{order.cancelledByName || '—'}</dd></div>
                <div><dt className="text-rose-500">Stage</dt><dd className="font-bold">{titleCase(order.statusAtCancellation) || '—'}</dd></div>
                <div><dt className="text-rose-500">Prepared</dt><dd className="font-bold">{order.preparedAtCancellation == null ? '—' : order.preparedAtCancellation ? 'Yes' : 'No'}</dd></div>
                <div><dt className="text-rose-500">Waste value</dt><dd className="font-bold">{money(order.wasteValue)}</dd></div>
              </dl>
              {order.cancellationReason && <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs"><b>Reason:</b> {order.cancellationReason}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const OrderLifecycle = () => {
  const { user } = useAuth();
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useQueryState('outlet', '');
  const [from, setFrom] = useQueryState('from', today);
  const [to, setTo] = useQueryState('to', today);
  const [report, setReport] = useState({ summary: {}, orders: [] });
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    getOutlets({ limit: 100 }).then(({ data }) => {
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
    }).catch(() => toast.error('Could not load outlets.'));
  }, [setOutletId, user?.outlet, user?.outletCode, user?.outletRef, user?.role]);

  useEffect(() => {
    if (!outletId) return;
    setLoading(true);
    getKdsLifecycleReport({ outletId, from, to })
      .then(setReport)
      .catch((error) => toast.error(error.response?.data?.message || 'Could not load order lifecycle report.'))
      .finally(() => setLoading(false));
  }, [outletId, from, to, refreshKey]);

  const cards = useMemo(() => [
    { label: 'Orders sent', value: report.summary.totalOrders || 0, icon: ClipboardList, tone: 'indigo' },
    { label: 'Dispatched', value: report.summary.dispatchedOrders || 0, icon: PackageCheck, tone: 'emerald' },
    { label: 'Cancelled', value: report.summary.cancelledOrders || 0, icon: XCircle, tone: 'rose' },
    { label: 'Avg. acceptance', value: formatDuration(report.summary.averageAcceptSeconds), icon: Clock3, tone: 'sky' },
    { label: 'Avg. kitchen time', value: formatDuration(report.summary.averageKitchenSeconds), icon: CookingPot, tone: 'violet' },
    { label: 'Avg. cashier response', value: formatDuration(report.summary.averageCashierResponseSeconds), icon: BellRing, tone: 'amber' },
  ], [report.summary]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Outlet</label>
          <SearchableSelect options={outlets.map((row) => ({ value: row._id, label: row.name, meta: row.code }))} value={outletId} onChange={setOutletId} />
        </div>
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-slate-500">From</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-slate-500">To</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <button
          type="button"
          disabled={loading || !outletId}
          onClick={() => setRefreshKey((value) => value + 1)}
          className="mt-5 flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map((card) => <SummaryCard key={card.label} {...card} />)}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><CalendarDays size={17} /></span>
            <div>
              <h2 className="font-bold text-slate-900">Order lifecycle audit</h2>
              <p className="text-xs text-slate-500">Open an order to see every timestamp, handoff and responsible person.</p>
            </div>
          </div>
          {loading && <RefreshCw size={17} className="animate-spin text-indigo-600" />}
        </div>

        <div className="divide-y divide-slate-100">
          {(report.orders || []).map((order) => {
            const isExpanded = expanded === order._id;
            const isDelivery = order.orderType === 'delivery';
            return (
              <Fragment key={order._id}>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded((current) => current === order._id ? '' : order._id)}
                  className={`group grid w-full gap-4 px-4 py-4 text-left transition hover:bg-slate-50/80 sm:px-5 lg:grid-cols-[minmax(230px,1.5fr)_minmax(130px,.8fr)_minmax(145px,.9fr)_minmax(150px,.9fr)_36px] lg:items-center ${isExpanded ? 'bg-indigo-50/40' : 'bg-white'}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-slate-900">#{order.finalTransactionNumber || order.ticketNumber}</p>
                      <StatusBadge status={order.currentStatus} />
                    </div>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock3 size={12} />{formatDateTime(order.sentToKitchenAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      {isDelivery ? <Bike size={15} /> : <ShoppingBag size={15} />}
                    </span>
                    <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Order type</p><p className="text-sm font-bold text-slate-700">{titleCase(order.orderType)}</p></div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Kitchen responsibility</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-700"><UserRound size={13} className="text-violet-500" />{order.acceptedByName || 'Not accepted'}</p>
                    <p className="mt-1 text-xs text-slate-400">Total {formatDuration(order.durations?.totalKitchenSeconds)} · Prep {formatDuration(order.durations?.prepToDispatchSeconds)}</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{isDelivery ? 'Delivery rider' : 'Cashier response'}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
                      {isDelivery ? <Bike size={13} className="text-cyan-500" /> : <BellRing size={13} className="text-amber-500" />}
                      {isDelivery ? order.assignedRiderName || 'Not assigned' : formatDuration(order.durations?.cashierResponseSeconds)}
                    </p>
                  </div>

                  <span className={`hidden h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition lg:flex ${isExpanded ? 'rotate-180 border-indigo-200 text-indigo-600' : 'group-hover:border-slate-300'}`}>
                    <ChevronDown size={16} />
                  </span>
                </button>
                {isExpanded && <OrderDetails order={order} />}
              </Fragment>
            );
          })}

          {!loading && !(report.orders || []).length && (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><ClipboardList size={24} /></span>
              <h3 className="mt-4 text-sm font-bold text-slate-700">No lifecycle records found</h3>
              <p className="mt-1 text-xs text-slate-400">Try another outlet or date range.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default OrderLifecycle;
