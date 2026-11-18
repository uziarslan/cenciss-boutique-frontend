import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bike,
  Clock3,
  FilePenLine,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Star,
  Trophy,
  WalletCards,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '../UI/ConfirmModal';
import {
  getRiderPerformance,
  overrideRiderReturn as overrideRiderReturnApi,
  saveRiderDeliveryReview,
} from '../../api/riderTrackingApi';
import { getOpsSocket } from '../../utils/opsSocket';

const dateValue = (date) => date.toISOString().slice(0, 10);
const money = (value) => `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const duration = (seconds) => {
  if (seconds == null || !Number.isFinite(Number(seconds))) return 'Not recorded';
  const total = Math.max(0, Math.round(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};
const timestamp = (value) => value ? new Date(value).toLocaleString() : '—';

const RatingStars = ({ value, onChange, disabled = false }) => (
  <div className="flex items-center gap-1" aria-label="Behavior rating">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        disabled={disabled}
        onClick={() => onChange?.(star)}
        aria-label={`${star} star${star === 1 ? '' : 's'}`}
        className="rounded p-0.5 disabled:cursor-default"
      >
        <Star size={20} className={star <= Number(value || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
      </button>
    ))}
  </div>
);

const ReviewDialog = ({ order, onClose, onSaved, saveReview, overrideReturn }) => {
  const [rating, setRating] = useState(order.review?.behaviorRating ?? '');
  const [charge, setCharge] = useState(order.review?.riderChargeAmount ?? '');
  const [notes, setNotes] = useState(order.review?.notes || '');
  const [saving, setSaving] = useState(false);
  const [returnBusy, setReturnBusy] = useState('');
  const [returnConfirmation, setReturnConfirmation] = useState('');

  const changeReturn = async (action) => {
    setReturnBusy(action);
    try {
      await overrideReturn(order.assignmentId, {
        action,
        reason: action === 'reopen'
          ? 'Cashier disputed an early restaurant return after checking the live map.'
          : 'Cashier corrected the restaurant return time after checking the live map.',
      });
      toast.success(action === 'reopen' ? 'Return disputed. Rider tracking resumed.' : 'Restaurant return time corrected.');
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not update the restaurant return.');
    } finally {
      setReturnBusy('');
      setReturnConfirmation('');
    }
  };

  const save = async () => {
    if (charge !== '' && (!Number.isFinite(Number(charge)) || Number(charge) < 0)) {
      toast.error('Enter a valid non-negative rider charge.');
      return;
    }
    setSaving(true);
    try {
      await saveReview(order._id, {
        behaviorRating: rating === '' ? null : Number(rating),
        riderChargeAmount: charge === '' ? null : Number(charge),
        notes,
      });
      toast.success('Rider performance details saved. No accounting entry was posted.');
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not save rider performance details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label={`Review ${order.orderNumber}`}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-500">{order.orderNumber}</p><h2 className="text-lg font-extrabold text-slate-900">Rider rating & charge</h2><p className="text-xs text-slate-500">{order.rider?.name} · Returned in {duration(order.deliveryDurationSeconds)}</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-900">Restaurant return verification</p>
            <p className="mt-1 text-xs text-amber-700">Returned {timestamp(order.returnedAt)}. If the rider marked this early, resume tracking or correct the time after checking the live map.</p>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={Boolean(returnBusy)} onClick={() => setReturnConfirmation('reopen')} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50"><RotateCcw size={13} /> {returnBusy === 'reopen' ? 'Reopening…' : 'Dispute & resume tracking'}</button><button type="button" disabled={Boolean(returnBusy)} onClick={() => setReturnConfirmation('confirm')} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><ShieldCheck size={13} /> {returnBusy === 'confirm' ? 'Correcting…' : 'Correct return to now'}</button></div>
          </div>
          <div>
            <label className="text-sm font-bold text-slate-700">Behavior with customer and restaurant staff</label>
            <div className="mt-2 flex items-center gap-3"><RatingStars value={rating} onChange={setRating} />{rating !== '' && <button type="button" onClick={() => setRating('')} className="text-xs font-semibold text-slate-400 hover:text-slate-700">Clear</button>}</div>
            <p className="mt-1 text-xs text-slate-400">Optional cashier/accountant rating.</p>
          </div>
          <label className="block text-sm font-bold text-slate-700">
            Rider delivery / fuel charge (PKR)
            <input type="number" min="0" step="0.01" value={charge} onChange={(event) => setCharge(event.target.value)} placeholder="Leave blank if not recorded" className="mt-1.5 block w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            <span className="mt-1 block text-xs font-normal text-slate-400">Informational only. This will not post anything to accounts.</span>
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={3} placeholder="Optional settlement or behavior note" className="mt-1.5 block w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">Cancel</button><button type="button" onClick={save} disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save details'}</button></div>
      </div>
    </div>
    <ConfirmModal
      isOpen={Boolean(returnConfirmation)}
      title={returnConfirmation === 'reopen' ? 'Dispute rider return?' : 'Correct restaurant return time?'}
      message={returnConfirmation === 'reopen' ? 'This will restore the delivery as active and resume live tracking for the rider.' : 'The current time will replace the rider-reported return time after your live-map check.'}
      confirmLabel={returnConfirmation === 'reopen' ? 'Resume Tracking' : 'Correct Return Time'}
      variant={returnConfirmation === 'reopen' ? 'danger' : 'default'}
      isLoading={Boolean(returnBusy)}
      onConfirm={() => changeReturn(returnConfirmation)}
      onCancel={() => setReturnConfirmation('')}
    />
    </>
  );
};

const RiderPerformanceReport = ({
  outletId,
  canEdit = false,
  socketFactory = getOpsSocket,
  loadPerformance = getRiderPerformance,
  saveReview = saveRiderDeliveryReview,
  overrideReturn = overrideRiderReturnApi,
}) => {
  const [from, setFrom] = useState(dateValue(new Date(Date.now() - (7 * 86_400_000))));
  const [to, setTo] = useState(dateValue(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewOrder, setReviewOrder] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!outletId) return;
    if (!quiet) setLoading(true);
    try {
      const response = await loadPerformance({ outletId, from: `${from}T00:00:00`, to: `${to}T23:59:59.999` });
      setData(response.data?.data || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not load rider performance.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [from, loadPerformance, outletId, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socketFactory) return undefined;
    const socket = socketFactory();
    const refresh = () => load({ quiet: true });
    socket.on('rider-performance:updated', refresh);
    socket.on('rider-return:overridden', refresh);
    return () => { socket.off('rider-performance:updated', refresh); socket.off('rider-return:overridden', refresh); };
  }, [load, socketFactory]);

  const rankings = data?.rankings || [];
  const orders = data?.orders || [];
  const winner = data?.winner;
  const summary = data?.summary || {};
  const formulaText = useMemo(() => data?.formula?.note || '', [data]);

  if (data?.enabled === false) return null;

  return (
    <div className="space-y-5" data-testid="rider-performance-report">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mr-auto"><h2 className="font-extrabold text-slate-900">Rider performance & charges</h2><p className="text-xs text-slate-500">Operational information only; no accounting entries are created.</p></div>
        <label className="text-xs font-semibold text-slate-600">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <button type="button" onClick={() => load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Apply</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Delivered', summary.deliveredCount || 0, Bike, 'bg-indigo-50 text-indigo-700'],
          ['Reviewed', summary.reviewedCount || 0, FilePenLine, 'bg-amber-50 text-amber-700'],
          ['Average route cycle', duration(summary.averageDeliverySeconds), Clock3, 'bg-cyan-50 text-cyan-700'],
          ['Rider/fuel charges', money(summary.totalRiderChargeAmount), WalletCards, 'bg-emerald-50 text-emerald-700'],
        ].map(([label, value, Icon, tone]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={17} /></div><p className="text-xl font-black text-slate-900">{value}</p><p className="text-xs font-semibold text-slate-500">{label}</p></div>)}
      </div>

      {winner ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-5 shadow-sm">
          <div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-white"><Trophy size={24} /></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">Rider of the selected period</p><h3 className="text-xl font-black text-slate-900">{winner.rider.name}</h3><p className="text-xs text-slate-500">Performance score {winner.score}/100</p></div></div>
          <div className="text-right text-xs text-slate-600"><p><strong>{winner.deliveries}</strong> deliveries · <strong>{duration(winner.averageDeliverySeconds)}</strong> average pickup-to-return</p><p><strong>{money(winner.totalRiderChargeAmount)}</strong> total rider/fuel charge · <strong>{winner.averageBehaviorRating ?? 'Not rated'}</strong>/5 behavior</p></div>
        </div>
      ) : !loading && orders.length > 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">Automatic delivery counts and times are available. Add at least one behavior rating or rider/fuel charge to calculate Rider of the Week.</div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-extrabold text-slate-900">Rider ranking</h3><p className="text-xs text-slate-500">30% deliveries · 30% lower pickup-to-restaurant-return time · 20% lower total rider charge · 20% behavior. {formulaText}</p></div>
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100 text-sm"><thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Rank / Rider</th><th className="px-4 py-3">Deliveries</th><th className="px-4 py-3">Avg. time</th><th className="px-4 py-3">Rider/fuel charge</th><th className="px-4 py-3">Behavior</th><th className="px-4 py-3">Score</th></tr></thead><tbody className="divide-y divide-slate-100">{rankings.map((row) => <tr key={row.rider._id}><td className="px-4 py-3 font-bold text-slate-800">{row.rank ? `#${row.rank} ` : '— '}{row.rider.name}</td><td className="px-4 py-3 text-slate-600">{row.deliveries}</td><td className="px-4 py-3 text-slate-600">{duration(row.averageDeliverySeconds)}</td><td className="px-4 py-3 text-slate-600">{row.chargedDeliveries ? money(row.totalRiderChargeAmount) : 'Not entered'}</td><td className="px-4 py-3 text-slate-600">{row.averageBehaviorRating == null ? 'Not rated' : `${row.averageBehaviorRating}/5`}</td><td className="px-4 py-3 font-black text-indigo-700">{row.score == null ? 'Pending input' : `${row.score}/100`}</td></tr>)}{!loading && rankings.length === 0 && <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-500">No delivered rider orders in this period.</td></tr>}</tbody></table></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-extrabold text-slate-900">Delivery ratings & rider charges</h3><p className="text-xs text-slate-500">Performance time is calculated automatically from Picked up until the verified restaurant return.</p></div>
        <div className="divide-y divide-slate-100">{orders.map((order) => <article key={order._id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-800">{order.orderNumber}</p><span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700">{duration(order.deliveryDurationSeconds)}</span></div><p className="mt-1 text-xs text-slate-500">{order.rider?.name} · {order.customerName || 'Customer'} · Returned {timestamp(order.returnedAt)}</p><div className="mt-2 flex flex-wrap items-center gap-4 text-xs"><span>{order.review?.behaviorRating ? `${order.review.behaviorRating}/5 behavior` : 'Behavior not rated'}</span><span>{order.review?.riderChargeAmount != null ? `${money(order.review.riderChargeAmount)} rider/fuel charge` : 'Rider charge not entered'}</span>{order.review?.enteredByName && <span className="text-slate-400">Updated by {order.review.enteredByName}</span>}</div></div>{canEdit && <button type="button" onClick={() => setReviewOrder(order)} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><FilePenLine size={14} /> {order.review ? 'Edit details' : 'Add rating & charge'}</button>}</article>)}{!loading && orders.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">No returned rider orders in this period.</p>}</div>
      </section>
      {reviewOrder && <ReviewDialog order={reviewOrder} onClose={() => setReviewOrder(null)} onSaved={() => load({ quiet: true })} saveReview={saveReview} overrideReturn={overrideReturn} />}
    </div>
  );
};

export default RiderPerformanceReport;
