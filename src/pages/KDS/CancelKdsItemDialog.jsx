import { useEffect, useState } from 'react';
import { Ban, X } from 'lucide-react';
import { getKdsItemCancellationPreview } from '../../api/kdsApi';

const money = (value) => `PKR ${Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CancelKdsItemDialog({ order, itemIndex, onKeep, onConfirm, onCancelOrder }) {
  const item = order.items[itemIndex];
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [prepared, setPrepared] = useState(null);
  const [valuationMethod, setValuationMethod] = useState('ingredientCost');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getKdsItemCancellationPreview(order._id, itemIndex, { version: order.version, qty })
      .then((data) => {
        if (!active) return;
        setPreview(data);
        setValuationMethod((current) => data.ingredientCost <= 0 ? 'orderValue' : current);
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.message || 'Could not load this item. Try again.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [order._id, order.version, itemIndex, qty, retry]);

  const value = valuationMethod === 'orderValue' ? preview?.orderValue : preview?.ingredientCost;
  const canConfirm = !busy && !loading && !error && preview?.qty === qty
    && reason.trim().length >= 3 && prepared !== null && (!prepared || value > 0);
  const submit = async (event) => {
    event.preventDefault();
    if (!canConfirm) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm({ qty, prepared, voidReason: reason.trim(), valuationMethod, version: order.version });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not cancel this item. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-kds-item-title">
      <form onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="rounded-xl bg-rose-100 p-2 text-rose-700"><Ban size={20} /></span>
          <h2 id="cancel-kds-item-title" className="flex-1 text-lg font-bold text-slate-900">{preview?.isDeal ? 'Cancel deal' : 'Cancel item'}</h2>
          <button type="button" disabled={busy} onClick={onKeep} aria-label="Close cancellation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5">
          <div>
            <p className="font-bold text-slate-900">{preview?.name || item.name}</p>
            {(preview?.variationName || item.variation?.name) && <p className="text-sm text-slate-500">{preview?.variationName || item.variation.name}</p>}
            <p className="mt-1 text-xs text-slate-500">Order #{order.ticketNumber} · The remaining items will stay active.</p>
          </div>
          {preview?.isDeal && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This item is part of a deal. Cancelling one deal removes all its included items together.</p>}
          <label className="block text-sm font-semibold text-slate-700">
            Quantity to cancel
            <input type="number" min="1" max={preview?.maxQty || item.qty} step="1" value={qty} disabled={busy}
              onChange={(event) => { setQty(Number(event.target.value)); setLoading(true); }}
              className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Cancellation reason
            <textarea autoFocus rows={2} maxLength={300} value={reason} disabled={busy}
              onChange={(event) => setReason(event.target.value)} placeholder="e.g. Customer changed their order"
              className="mt-1 block w-full resize-none rounded-xl border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <fieldset disabled={busy}>
            <legend className="mb-2 text-sm font-semibold text-slate-700">Was this item already prepared?</legend>
            <div className="grid grid-cols-2 gap-2">
              {[{ value: false, label: 'Not prepared' }, { value: true, label: 'Already prepared' }].map((choice) => (
                <button key={choice.label} type="button" aria-pressed={prepared === choice.value} onClick={() => setPrepared(choice.value)}
                  className={`rounded-xl border p-3 text-sm font-bold ${prepared === choice.value ? 'border-rose-400 bg-rose-50 text-rose-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{choice.label}</button>
              ))}
            </div>
          </fieldset>
          {prepared && preview && (
            <fieldset disabled={busy || loading}>
              <legend className="mb-2 text-sm font-semibold text-slate-700">Record cancelled quantity as waste</legend>
              {[{ value: 'ingredientCost', label: 'Ingredient cost', amount: preview.ingredientCost }, { value: 'orderValue', label: 'Order value', amount: preview.orderValue }].map((choice) => (
                <label key={choice.value} className="flex items-center gap-2 py-1.5 text-sm text-slate-700">
                  <input type="radio" name="item-waste-valuation" value={choice.value} checked={valuationMethod === choice.value} onChange={() => setValuationMethod(choice.value)} />
                  <span className="flex-1">{choice.label}</span><span className="font-semibold">{money(choice.amount)}</span>
                </label>
              ))}
              {value <= 0 && <p className="mt-2 text-xs text-rose-700">Select a valuation with a positive value to record waste.</p>}
            </fieldset>
          )}
          {loading && <p role="status" className="text-sm text-slate-500">Checking item…</p>}
          {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}<button type="button" disabled={busy} onClick={() => setRetry((count) => count + 1)} className="ml-2 font-bold underline">Retry</button></div>}
          <button type="button" disabled={busy} onClick={onCancelOrder} className="text-xs font-semibold text-slate-500 underline">Cancel entire order instead</button>
        </div>
        <div className="flex gap-2 border-t border-slate-100 p-4">
          <button type="button" disabled={busy} onClick={onKeep} className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700">Keep item</button>
          <button type="submit" disabled={!canConfirm} className="flex-1 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">{busy ? 'Cancelling…' : `Cancel ${qty} ${preview?.isDeal ? 'deal' : 'item'}${qty === 1 ? '' : 's'}`}</button>
        </div>
      </form>
    </div>
  );
}
