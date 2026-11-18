import { useCallback, useEffect, useMemo, useState } from 'react';
import { Battery, Bike, MapPin, Navigation, RefreshCw, Route, ShieldCheck, UserPlus, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '../../../../../components/UI/ConfirmModal';
import RiderLiveMap from '../../../../../components/Riders/RiderLiveMap';
import RiderPerformanceReport from '../../../../../components/Riders/RiderPerformanceReport';
import {
  assignDeliveryRider,
  getRiderDispatchLive,
  getRiderPerformance,
  overrideRiderReturn,
  saveRiderDeliveryReview,
} from '../../api/saleApi';
import { getQrSocket } from '../../utils/qrSocket';

const distance = (value) => {
  if (value == null) return 'Unknown distance';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km away` : `${Math.round(value)} m away`;
};
const status = (value) => String(value || 'unknown').replaceAll('_', ' ');
const orderStatus = (assignment) => assignment.status === 'returned_to_restaurant' && assignment.deliveryOutcome
  ? assignment.deliveryOutcome
  : assignment.status;
const trackingLabel = (rider) => {
  if (!rider.onDuty) return 'Off duty';
  if (rider.trackingState === 'interrupted') return 'Tracking interrupted';
  if (rider.trackingState === 'offline') return 'Tracking offline';
  if (rider.trackingState === 'gps_unavailable') return 'Device online · GPS unavailable';
  if (rider.trackingState === 'delayed') return 'GPS delayed · online';
  return 'Live tracking';
};
const address = (value) => {
  if (!value) return 'No delivery address recorded';
  if (typeof value === 'string') return value;
  return [value.label, value.street, value.area, value.city].filter(Boolean).join(', ')
    || 'No delivery address recorded';
};

const RiderDispatchPanel = ({ outletId, canAssign = false }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [assigningRiderId, setAssigningRiderId] = useState('');
  const [confirmingReturnId, setConfirmingReturnId] = useState('');
  const [returnCandidate, setReturnCandidate] = useState(null);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!outletId) return;
    if (!quiet) setLoading(true);
    try {
      setData(await getRiderDispatchLive(outletId));
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not load Rider Dispatch.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    refresh();
    if (!outletId) return undefined;
    const timer = window.setInterval(() => refresh({ quiet: true }), 15_000);
    const socket = getQrSocket();
    const join = () => socket.emit('rider-dispatch:join', { outletId });
    const onChange = () => refresh({ quiet: true });
    const events = ['rider-location:updated', 'rider:heartbeat', 'rider-shift:started', 'rider-shift:ended', 'rider-assignment:new', 'rider-assignment:reassigned', 'rider-assignment:updated', 'rider-run:updated', 'rider-tracking:disabled'];
    if (socket.connected) join();
    socket.on('connect', join);
    events.forEach((event) => socket.on(event, onChange));
    return () => {
      window.clearInterval(timer);
      socket.off('connect', join);
      events.forEach((event) => socket.off(event, onChange));
      socket.emit('rider-dispatch:leave', { outletId });
    };
  }, [outletId, refresh]);

  const riders = data?.riders || [];
  const orders = data?.unassignedOrders || [];
  const selectedOrder = orders.find((order) => order._id === selectedOrderId) || null;
  const availableRiders = useMemo(() => riders.filter((rider) => rider.available), [riders]);

  useEffect(() => {
    if (selectedOrderId && !orders.some((order) => order._id === selectedOrderId)) setSelectedOrderId('');
  }, [orders, selectedOrderId]);

  const assign = async (rider) => {
    if (!canAssign) {
      toast.error('You do not have permission to assign riders.');
      return;
    }
    if (!selectedOrder) {
      toast.error('Select an unassigned delivery first.');
      return;
    }
    setAssigningRiderId(rider._id);
    try {
      await assignDeliveryRider(selectedOrder._id, rider._id);
      toast.success(`${selectedOrder.transactionNumber} assigned to ${rider.name}.`);
      setSelectedOrderId('');
      await refresh({ quiet: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not assign this rider.');
    } finally {
      setAssigningRiderId('');
    }
  };

  const confirmReturn = async () => {
    const rider = returnCandidate?.rider;
    const assignment = returnCandidate?.assignment;
    if (!rider || !assignment?._id) return;
    setConfirmingReturnId(assignment._id);
    try {
      await overrideRiderReturn(assignment._id, {
        action: 'confirm',
        reason: 'Cashier confirmed the rider return after checking the live map.',
      });
      toast.success(`${rider.name}'s ${returnCandidate.orderCount || 1}-order delivery run was confirmed returned.`);
      await refresh({ quiet: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not confirm the rider return.');
    } finally {
      setConfirmingReturnId('');
      setReturnCandidate(null);
    }
  };

  if (!outletId) {
    return <div className="flex h-full items-center justify-center bg-slate-50 p-8 text-sm text-slate-500">Open a cashier shift to use Rider Dispatch.</div>;
  }

  return (
    <>
    <section className="h-full flex-1 overflow-y-auto bg-slate-50 pb-20 md:pb-8">
      <div className="mx-auto max-w-[1800px] space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">Live delivery fleet</p><h1 className="text-2xl font-black text-slate-900">Rider Dispatch</h1><p className="mt-1 text-sm text-slate-500">Choose a delivery, compare the nearest tracked riders, and add orders to the same rider run when needed.</p></div>
          <button type="button" onClick={() => refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Riders', riders.length, Bike, 'text-indigo-700 bg-indigo-50'],
            ['On duty', riders.filter((rider) => rider.onDuty).length, Navigation, 'text-cyan-700 bg-cyan-50'],
            ['Assignable', availableRiders.length, MapPin, 'text-emerald-700 bg-emerald-50'],
            ['Waiting orders', orders.length, Route, 'text-violet-700 bg-violet-50'],
          ].map(([label, value, Icon, classes]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${classes}`}><Icon size={17} /></div><p className="text-2xl font-black text-slate-900">{value}</p><p className="text-xs font-semibold text-slate-500">{label}</p></div>)}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
          <RiderLiveMap riders={riders} outlet={data?.outlet} className="h-[520px]" />

          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3"><h2 className="font-extrabold text-slate-900">1. Select a waiting delivery</h2><p className="text-xs text-slate-500">Oldest orders appear first.</p></div>
              <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto">
                {orders.map((order) => <button key={order._id} type="button" onClick={() => setSelectedOrderId(order._id)} className={`w-full px-4 py-3 text-left transition ${selectedOrderId === order._id ? 'bg-violet-50 ring-1 ring-inset ring-violet-200' : 'hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-bold text-slate-900">{order.transactionNumber}</p><p className="text-xs font-semibold text-slate-600">{order.customerName || 'Walk-in delivery'} {order.customerPhone ? `· ${order.customerPhone}` : ''}</p></div><span className="text-xs font-bold text-slate-700">PKR {Number(order.totalAmount || 0).toLocaleString('en-PK')}</span></div><p className="mt-1 line-clamp-2 text-xs text-slate-500">{address(order.deliveryAddress)}</p></button>)}
                {!loading && orders.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No unassigned delivery orders.</p>}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3"><h2 className="font-extrabold text-slate-900">2. Assign the nearest rider</h2><p className="text-xs text-slate-500">Tracked riders are ranked by distance and may carry several orders in one run.</p></div>
              <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                {riders.map((rider, index) => {
                  const activeAssignments = rider.assignments || rider.activeAssignments || (rider.assignment ? [rider.assignment] : []);
                  const runMap = new Map();
                  activeAssignments.forEach((assignment) => {
                    const runId = assignment.deliveryRunId || `legacy-${assignment._id}`;
                    runMap.set(runId, [...(runMap.get(runId) || []), assignment]);
                  });
                  const deliveryRuns = [...runMap.entries()].map(([runId, runOrders]) => ({
                    runId,
                    orders: runOrders,
                    completedStops: runOrders.filter((assignment) => ['delivered', 'delivery_failed'].includes(assignment.status)).length,
                    returnable: runOrders.length > 0 && runOrders.every((assignment) => ['delivered', 'delivery_failed'].includes(assignment.status)),
                  }));
                  return (
                  <div key={rider._id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${rider.available ? 'bg-emerald-100 text-emerald-700' : ['offline', 'interrupted'].includes(rider.trackingState) ? 'bg-red-100 text-red-700' : ['delayed', 'gps_unavailable'].includes(rider.trackingState) ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{rider.name}</p><p className="truncate text-xs capitalize text-slate-500">{rider.available ? distance(rider.distanceFromOutletMeters) : status(rider.status)}</p></div>
                      {canAssign && <button type="button" disabled={!selectedOrder || !rider.available || assigningRiderId === rider._id} onClick={() => assign(rider)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><UserPlus size={13} /> {assigningRiderId === rider._id ? 'Assigning…' : activeAssignments.length ? 'Add order' : 'Assign'}</button>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 pl-12 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><Battery size={11} /> {rider.batteryLevel == null ? '—' : `${Math.round(rider.batteryLevel)}%`}</span><span className={`inline-flex items-center gap-1 ${['offline', 'interrupted'].includes(rider.trackingState) ? 'text-red-700' : ['delayed', 'gps_unavailable'].includes(rider.trackingState) ? 'text-amber-700' : rider.onDuty ? 'text-emerald-700' : ''}`}><WifiOff size={11} /> {trackingLabel(rider)}</span>{rider.signalAgeSeconds != null && rider.onDuty && <span>Signal {rider.signalAgeSeconds}s ago</span>}{rider.device?.batteryOptimizationEnabled && <span className="font-semibold text-red-600">Battery restricted</span>}{rider.device?.lowPowerMode && <span className="font-semibold text-amber-600">Battery Saver on</span>}<span className="font-semibold text-indigo-600">{activeAssignments.length} active order{activeAssignments.length === 1 ? '' : 's'}</span></div>
                    {deliveryRuns.map((run) => <div key={run.runId} className="ml-12 mt-2 rounded-xl border border-indigo-100 bg-indigo-50/70 p-2.5"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Connected run · {run.completedStops}/{run.orders.length} stops</p>{run.returnable ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">RETURN READY</span> : <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-indigo-600">IN PROGRESS</span>}</div><div className="mt-2 flex flex-wrap gap-1.5">{run.orders.map((assignment, stopIndex) => <span key={assignment._id} className={`rounded-full px-2 py-1 text-[10px] font-bold ${['delivered', 'delivery_failed'].includes(orderStatus(assignment)) ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-indigo-700'}`}>{String.fromCharCode(65 + stopIndex)}→{String.fromCharCode(66 + stopIndex)} · {assignment.orderNumber} · {status(orderStatus(assignment))}</span>)}</div>{!run.returnable && run.completedStops > 0 && <p className="mt-2 text-[10px] font-semibold text-indigo-600">Restaurant return stays locked until the remaining {run.orders.length - run.completedStops} stop{run.orders.length - run.completedStops === 1 ? '' : 's'} are completed.</p>}{canAssign && run.returnable && <button type="button" disabled={confirmingReturnId === run.orders[0]._id} onClick={() => setReturnCandidate({ rider, assignment: run.orders[0], orderCount: run.orders.length })} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm disabled:opacity-50"><ShieldCheck size={12} /> {confirmingReturnId === run.orders[0]._id ? 'Confirming…' : `Confirm run returned (${run.orders.length})`}</button>}</div>)}
                  </div>
                  );
                })}
                {!loading && riders.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No rider users exist for this outlet.</p>}
              </div>
            </div>
          </div>
        </div>

        {data?.outlet?.riderTracking?.performanceEnabled === true && (
          <RiderPerformanceReport
            outletId={outletId}
            canEdit={canAssign}
            socketFactory={getQrSocket}
            loadPerformance={getRiderPerformance}
            saveReview={saveRiderDeliveryReview}
            overrideReturn={overrideRiderReturn}
          />
        )}
      </div>
    </section>
    <ConfirmModal
      isOpen={Boolean(returnCandidate)}
      title="Confirm restaurant return?"
      message={returnCandidate ? `Confirm that ${returnCandidate.rider.name} has physically returned after completing all ${returnCandidate.orderCount || 1} orders in this connected delivery run.` : ''}
      confirmLabel="Confirm Return"
      variant="default"
      isLoading={Boolean(confirmingReturnId)}
      onConfirm={confirmReturn}
      onCancel={() => setReturnCandidate(null)}
    />
    </>
  );
};

export default RiderDispatchPanel;
