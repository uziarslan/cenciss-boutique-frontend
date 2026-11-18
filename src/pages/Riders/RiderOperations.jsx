import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Battery,
  Bike,
  Clock3,
  MapPinned,
  Navigation,
  RefreshCw,
  Route,
  Save,
  Settings2,
  Trophy,
  WifiOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../components/UI/Button';
import HeroBanner from '../../components/UI/HeroBanner';
import SearchableSelect from '../../components/UI/SearchableSelect';
import StatTile from '../../components/UI/StatTile';
import RiderLiveMap from '../../components/Riders/RiderLiveMap';
import RiderPerformanceReport from '../../components/Riders/RiderPerformanceReport';
import { getOutlets } from '../../api/outletApi';
import {
  getRiderHistory,
  getRiderLive,
  getRiderOrderRoute,
  notifyRiderAssignment,
  updateRiderTrackingConfig,
} from '../../api/riderTrackingApi';
import useFeatures from '../../hooks/useFeatures';
import usePermissions from '../../hooks/usePermissions';
import { getOpsSocket } from '../../utils/opsSocket';

const dateValue = (date) => date.toISOString().slice(0, 10);
const humanStatus = (value) => String(value || 'unknown').replaceAll('_', ' ');
const orderStatus = (assignment) => assignment.status === 'returned_to_restaurant' && assignment.deliveryOutcome
  ? assignment.deliveryOutcome
  : assignment.status;
const metres = (value) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(1)} km` : `${Math.round(Number(value))} m`;
};
const timestamp = (value) => value ? new Date(value).toLocaleString() : '—';

const statusClass = (rider) => {
  if (!rider.onDuty) return 'bg-slate-100 text-slate-600';
  if (['offline', 'interrupted'].includes(rider.trackingState)) return 'bg-red-100 text-red-700';
  if (['delayed', 'gps_unavailable'].includes(rider.trackingState)) return 'bg-amber-100 text-amber-700';
  if (rider.available) return 'bg-emerald-100 text-emerald-700';
  return 'bg-indigo-100 text-indigo-700';
};

const trackingLabel = (rider) => {
  if (!rider.onDuty) return 'Off duty';
  if (rider.trackingState === 'interrupted') return 'Tracking interrupted';
  if (rider.trackingState === 'offline') return 'Tracking offline';
  if (rider.trackingState === 'gps_unavailable') return 'Device online · GPS unavailable';
  if (rider.trackingState === 'delayed') return 'GPS delayed · service online';
  return 'Live tracking';
};

const activeDeliveryRuns = (rider) => {
  const assignments = rider.assignments || (rider.assignment ? [rider.assignment] : []);
  const groups = new Map();
  assignments.forEach((assignment) => {
    const id = assignment.deliveryRunId || `legacy-${assignment._id}`;
    groups.set(id, [...(groups.get(id) || []), assignment]);
  });
  return [...groups.entries()].map(([id, orders]) => ({
    id,
    orders,
    completedStops: orders.filter((assignment) => ['delivered', 'delivery_failed'].includes(assignment.status)).length,
  }));
};

const RiderRunSummary = ({ rider, canRemind, onRemind }) => {
  const runs = activeDeliveryRuns(rider);
  if (!runs.length) return null;
  return <div className="mt-3 space-y-2">{runs.map((run) => <div key={run.id} className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Connected delivery run</p><p className="text-sm font-semibold text-indigo-900">{run.completedStops}/{run.orders.length} customer stops completed</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${run.completedStops === run.orders.length ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-indigo-700'}`}>{run.completedStops === run.orders.length ? 'RETURN READY' : 'IN PROGRESS'}</span></div><div className="mt-2 flex items-center overflow-hidden"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9px] font-black text-white">A</span>{run.orders.map((assignment, index) => <div key={assignment._id} className="flex min-w-0 flex-1 items-center"><span className={`h-1 min-w-2 flex-1 ${['delivered', 'delivery_failed'].includes(orderStatus(assignment)) ? 'bg-emerald-300' : 'bg-indigo-200'}`} /><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white ${['delivered', 'delivery_failed'].includes(orderStatus(assignment)) ? 'bg-emerald-600' : 'bg-indigo-500'}`}>{String.fromCharCode(66 + index)}</span></div>)}</div><div className="mt-2 space-y-1.5">{run.orders.map((assignment, index) => <div key={assignment._id} className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-2.5 py-2"><div className="min-w-0"><p className="truncate text-xs font-bold text-indigo-900">Stop {index + 1} · {assignment.orderNumber}</p><p className="truncate text-[11px] capitalize text-indigo-700">{humanStatus(orderStatus(assignment))} · {humanStatus(assignment.pickupState)} · {assignment.customerName || 'Customer'}</p></div>{canRemind && <button type="button" onClick={() => onRemind(assignment._id)} className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1.5 text-[11px] font-semibold text-indigo-700">Remind</button>}</div>)}</div></div>)}</div>;
};

const RiderOperations = () => {
  const { has } = usePermissions();
  const { hasFeature } = useFeatures();
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState('');
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('live');
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [from, setFrom] = useState(dateValue(new Date(Date.now() - (7 * 86_400_000))));
  const [to, setTo] = useState(dateValue(new Date()));
  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const configDirty = useRef(false);
  const [config, setConfig] = useState({ latitude: '', longitude: '', geofenceRadiusMeters: '150', locationRetentionDays: '90', staleAfterSeconds: '120', performanceEnabled: false });

  useEffect(() => {
    let active = true;
    getOutlets({ limit: 100 })
      .then(({ data }) => {
        if (!active) return;
        const rows = (data?.data || []).filter((outlet) => hasFeature('riderTracking', outlet._id));
        setOutlets(rows);
        setOutletId((current) => current || String(rows[0]?._id || ''));
      })
      .catch(() => toast.error('Could not load outlets.'));
    return () => { active = false; };
  }, [hasFeature]);

  useEffect(() => {
    configDirty.current = false;
  }, [outletId]);

  const loadLive = useCallback(async ({ quiet = false } = {}) => {
    if (!outletId) return;
    if (!quiet) setLoading(true);
    try {
      const { data } = await getRiderLive(outletId);
      const next = data?.data || null;
      setLive(next);
      const tracking = next?.outlet?.riderTracking || {};
      const coordinates = tracking.location?.coordinates || [];
      if (!configDirty.current) {
        setConfig({
          latitude: coordinates[1] ?? '',
          longitude: coordinates[0] ?? '',
          geofenceRadiusMeters: String(tracking.geofenceRadiusMeters ?? 150),
          locationRetentionDays: String(tracking.locationRetentionDays ?? 90),
          staleAfterSeconds: String(tracking.staleAfterSeconds ?? 120),
          performanceEnabled: tracking.performanceEnabled === true,
        });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not load rider activity.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    loadLive();
    if (!outletId) return undefined;
    const interval = window.setInterval(() => loadLive({ quiet: true }), 15_000);
    const socket = getOpsSocket();
    const join = () => socket.emit('rider-dispatch:join', { outletId });
    const refresh = () => loadLive({ quiet: true });
    const events = [
      'rider-location:updated',
      'rider:heartbeat',
      'rider-shift:started',
      'rider-shift:ended',
      'rider-assignment:new',
      'rider-assignment:reassigned',
      'rider-assignment:updated',
      'rider-run:updated',
      'rider-tracking:disabled',
    ];
    if (socket.connected) join();
    socket.on('connect', join);
    events.forEach((event) => socket.on(event, refresh));
    return () => {
      window.clearInterval(interval);
      socket.off('connect', join);
      events.forEach((event) => socket.off(event, refresh));
      socket.emit('rider-dispatch:leave', { outletId });
    };
  }, [loadLive, outletId]);

  const loadHistory = useCallback(async () => {
    if (!outletId) return;
    setHistoryLoading(true);
    try {
      const { data } = await getRiderHistory({ outletId, from: `${from}T00:00:00`, to: `${to}T23:59:59.999`, limit: 200 });
      setHistory(data?.data || null);
      setRouteData(null);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not load rider history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [from, outletId, to]);

  useEffect(() => {
    if (tab === 'history' && has('riderTracking.history')) loadHistory();
  }, [has, loadHistory, tab]);

  const openRoute = async (orderId) => {
    setRouteLoading(orderId);
    try {
      const { data } = await getRiderOrderRoute(orderId);
      setRouteData(data?.data || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not load this route.');
    } finally {
      setRouteLoading('');
    }
  };

  const saveConfig = async () => {
    const numericConfig = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'performanceEnabled'));
    if (Object.values(numericConfig).some((value) => String(value).trim() === '')) {
      toast.error('Outlet latitude, longitude, and all tracking settings are required.');
      return;
    }
    const payload = {
      ...Object.fromEntries(Object.entries(numericConfig).map(([key, value]) => [key, Number(value)])),
      performanceEnabled: config.performanceEnabled === true,
    };
    if (Object.entries(payload).some(([key, value]) => key !== 'performanceEnabled' && !Number.isFinite(value))) {
      toast.error('Enter valid numbers for all tracking settings.');
      return;
    }
    setSavingConfig(true);
    try {
      await updateRiderTrackingConfig(outletId, payload);
      configDirty.current = false;
      toast.success('Rider tracking settings saved.');
      await loadLive({ quiet: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not save tracking settings.');
    } finally {
      setSavingConfig(false);
    }
  };

  const remind = async (assignmentId) => {
    try {
      await notifyRiderAssignment(assignmentId);
      toast.success('Reminder sent to the rider.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not send reminder.');
    }
  };

  const riders = live?.riders || [];
  const counts = useMemo(() => ({
    onDuty: riders.filter((rider) => rider.onDuty).length,
    available: riders.filter((rider) => rider.available).length,
    active: riders.reduce((sum, rider) => sum + Number(rider.activeAssignmentCount || rider.assignments?.length || (rider.assignment ? 1 : 0)), 0),
  }), [riders]);

  return (
    <div className="space-y-6 pb-10">
      <HeroBanner
        icon={Bike}
        eyebrow="Live Delivery Fleet"
        title="Rider Operations"
        subtitle="Monitor rider duty, live location, delivery work, route history, and outlet geofence health."
        accent="indigo"
        compact
        actions={(
          <div className="flex items-center gap-2">
            {outlets.length > 1 && (
              <div className="min-w-[220px]">
                <SearchableSelect options={outlets.map((outlet) => ({ value: outlet._id, label: outlet.name, meta: outlet.code }))} value={outletId} onChange={setOutletId} />
              </div>
            )}
            <Button variant="secondary" icon={RefreshCw} onClick={() => loadLive()} disabled={loading}>Refresh</Button>
          </div>
        )}
      />

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {[
          ['live', 'Live Fleet', MapPinned, true],
          ['history', 'History & Routes', Route, has('riderTracking.history')],
          ['performance', 'Performance & Charges', Trophy, live?.outlet?.riderTracking?.performanceEnabled === true && (has('riderTracking.live') || has('riderTracking.history'))],
          ['settings', 'Tracking Settings', Settings2, has('riderTracking.manage')],
        ].filter(([, , , visible]) => visible).map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === value ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {!outletId ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">No rider-enabled outlet is available to this account.</div>
      ) : tab === 'live' ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Registered Riders" value={riders.length} icon={Bike} gradient="indigo" />
            <StatTile label="On Duty" value={counts.onDuty} icon={Navigation} gradient="cyan" />
            <StatTile label="Assignable" value={counts.available} icon={MapPinned} gradient="emerald" />
            <StatTile label="Active Orders" value={counts.active} icon={Route} gradient="violet" />
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.8fr)]">
            <RiderLiveMap riders={riders} outlet={live?.outlet} className="h-[560px]" />
            <div className="space-y-3 xl:max-h-[560px] xl:overflow-y-auto xl:pr-1">
              {loading && riders.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading live rider activity…</div>
              ) : riders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No rider users have been created for this outlet.</div>
              ) : riders.map((rider, index) => (
                <article key={rider._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-700">{index + 1}</div>
                      <div className="min-w-0"><h3 className="truncate font-semibold text-slate-900">{rider.name}</h3><p className="truncate text-xs text-slate-500">{rider.email}</p></div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${statusClass(rider)}`}>{humanStatus(rider.status)}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2.5"><span className="block text-slate-400">From outlet</span><strong className="text-slate-700">{metres(rider.distanceFromOutletMeters)}</strong></div>
                    <div className="rounded-xl bg-slate-50 p-2.5"><span className="block text-slate-400">GPS position</span><strong className={rider.locationDelayed || rider.stale ? 'text-amber-700' : 'text-slate-700'}>{rider.locationAgeSeconds == null ? 'No position' : `${rider.locationAgeSeconds}s ago`}</strong></div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Battery size={13} /> {rider.batteryLevel == null ? '—' : `${Math.round(rider.batteryLevel)}%`}</span>
                    <span className={`inline-flex items-center gap-1 ${['offline', 'interrupted'].includes(rider.trackingState) ? 'text-red-700' : ['delayed', 'gps_unavailable'].includes(rider.trackingState) ? 'text-amber-700' : rider.onDuty ? 'text-emerald-700' : ''}`}><WifiOff size={13} /> {trackingLabel(rider)}</span>
                    {rider.onDuty && rider.signalAgeSeconds != null && <span>Service signal {rider.signalAgeSeconds}s ago</span>}
                    {rider.inOutletGeofence != null && <span>{rider.inOutletGeofence ? 'Inside outlet geofence' : 'Outside outlet geofence'}</span>}
                  </div>
                  {rider.device?.lastTrackingError && <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700"><strong>Device report:</strong> {rider.device.lastTrackingError}</div>}
                  {rider.device?.batteryOptimizationEnabled && <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700"><strong>Battery restricted:</strong> the rider must allow Cenciss Delivery to ignore battery optimization.</div>}
                  {rider.device?.lowPowerMode && <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">Battery Saver is enabled on the rider phone and may delay GPS.</div>}
                  {rider.device?.locationQueueDepth > 0 && <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{rider.device.locationQueueDepth} GPS point{rider.device.locationQueueDepth === 1 ? '' : 's'} waiting to upload.</div>}
                  {rider.device && !rider.device.pushRegistered && <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800"><strong>Push not connected:</strong> {rider.device.pushRegistrationError || 'Open the installed rider app while online to register notifications.'}</div>}
                  <RiderRunSummary rider={rider} canRemind={has('riderTracking.assign')} onRemind={remind} />
                </article>
              ))}
            </div>
          </div>
        </>
      ) : tab === 'history' ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-xs font-semibold text-slate-600">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-600">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            <Button variant="secondary" icon={RefreshCw} onClick={loadHistory} disabled={historyLoading}>{historyLoading ? 'Loading…' : 'Apply'}</Button>
          </div>
          {routeData && (
            <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-500">Delivery order route</p>
                  <h2 className="font-bold text-slate-900">{routeData.order?.orderNumber || 'Delivery'}</h2>
                  <p className="text-xs text-slate-500">{routeData.order?.customerName || 'Customer'} · {timestamp(routeData.order?.assignedAt)} → {routeData.order?.completedAt ? timestamp(routeData.order.completedAt) : 'Active'}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{metres(routeData.distanceMeters)} · {routeData.pointCount || 0} order GPS points</p>
                </div>
                <button type="button" onClick={() => setRouteData(null)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Close route</button>
              </div>
              {(routeData.segments || []).length > 1 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {routeData.segments.map((segment, index) => (
                    <span key={segment.assignment?._id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      <span className={`h-2 w-2 rounded-full ${['bg-indigo-600', 'bg-cyan-600', 'bg-pink-600', 'bg-orange-600', 'bg-green-600'][index % 5]}`} />
                      Stop {segment.routeSequence || index + 1} · {segment.assignment?.orderNumber || 'Order'} · {metres(segment.distanceMeters)}
                    </span>
                  ))}
                </div>
              )}
              {routeData.pointCount > 0
                ? <RiderLiveMap routeSegments={routeData.segments || []} outlet={live?.outlet} className="h-[480px]" />
                : <div className="flex h-48 items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">No GPS points were recorded while this order was assigned.</div>}
            </div>
          )}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Delivery order history</h2><p className="text-xs text-slate-500">Each order keeps its own route leg. Connected run stops continue from the prior customer's location.</p></div>
            <div className="divide-y divide-slate-100">
              {(history?.orders || []).map((order) => (
                <article key={order._id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-800">{order.orderNumber}</p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold capitalize text-slate-600">{humanStatus(order.status)}</span>
                      {order.deliveryRunId && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">Run stop {order.routeSequence || 'pending'}</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{order.customerName || 'Customer'} · {(order.assignments || []).map((assignment) => assignment.rider?.name || 'Rider').join(' → ')}</p>
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400"><Clock3 size={12} /> {timestamp(order.assignedAt)} → {order.completedAt ? timestamp(order.completedAt) : 'Active'} · {order.routePointCount || 0} GPS points</p>
                  </div>
                  <button type="button" onClick={() => openRoute(order._id)} disabled={Boolean(routeLoading)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:cursor-wait disabled:opacity-50"><Route size={13} /> {routeLoading === order._id ? 'Loading…' : 'Order Route'}</button>
                </article>
              ))}
              {!historyLoading && !(history?.orders || []).length && <p className="px-5 py-10 text-center text-sm text-slate-500">No delivery orders in this period.</p>}
            </div>
          </section>
        </div>
      ) : tab === 'performance' ? (
        <RiderPerformanceReport outletId={outletId} canEdit={has('riderTracking.assign') || has('riderTracking.history')} />
      ) : (
        <div className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5"><h2 className="text-lg font-bold text-slate-900">Outlet tracking configuration</h2><p className="mt-1 text-sm text-slate-500">Set the restaurant pin, duty geofence, route retention, and GPS delay warning. A rider is marked offline only when both GPS uploads and device signals stop.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['latitude', 'Outlet latitude', '-90 to 90'],
              ['longitude', 'Outlet longitude', '-180 to 180'],
              ['geofenceRadiusMeters', 'Geofence radius (metres)', '50 to 2,000'],
              ['locationRetentionDays', 'Route retention (days)', '7 to 730'],
              ['staleAfterSeconds', 'GPS delay warning (seconds)', '30 to 900; offline timeout is calculated automatically'],
            ].map(([key, label, hint]) => <label key={key} className="text-sm font-semibold text-slate-700">{label}<input type="number" value={config[key]} onChange={(event) => { configDirty.current = true; setConfig((current) => ({ ...current, [key]: event.target.value })); }} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /><span className="mt-1 block text-[11px] font-normal text-slate-400">{hint}</span></label>)}
          </div>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <input type="checkbox" checked={config.performanceEnabled} onChange={(event) => { configDirty.current = true; setConfig((current) => ({ ...current, performanceEnabled: event.target.checked })); }} className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <span><strong className="block text-sm text-slate-800">Rider ratings and manual charge reporting</strong><span className="mt-1 block text-xs font-normal text-slate-500">Adds optional behavior stars, informational rider/fuel charges, date-range rankings, and Rider of the Week. No accounting entries are created.</span></span>
          </label>
          <div className="mt-6"><Button variant="primary" icon={Save} onClick={saveConfig} disabled={savingConfig}>{savingConfig ? 'Saving…' : 'Save tracking settings'}</Button></div>
        </div>
      )}
    </div>
  );
};

export default RiderOperations;
