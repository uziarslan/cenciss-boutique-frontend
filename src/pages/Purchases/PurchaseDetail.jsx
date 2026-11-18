import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Banknote, ExternalLink, Pencil, Send, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { useDispatch } from 'react-redux';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  deletePurchase,
  getPurchase,
  payPurchase,
  postPurchase,
} from '../../api/purchaseApi';
import { updatePayment } from '../../api/paymentApi';
import { baseApi } from '../../store/baseApi';
import usePermissions from '../../hooks/usePermissions';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import HeroBanner from '../../components/UI/HeroBanner';
import SearchableSelect from '../../components/UI/SearchableSelect';
import StatusChip from '../../components/UI/StatusChip';
import ConfirmModal from '../../components/UI/ConfirmModal';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const paymentMethodOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'bankTransfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'creditCard', label: 'Credit card' },
];

const Info = ({ label, children }) => (
  <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><div className="mt-1 text-sm font-medium text-slate-800">{children || '—'}</div></div>
);

const PurchaseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { has } = usePermissions();
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [inventoryAction, setInventoryAction] = useState('keep');
  const [payment, setPayment] = useState({
    amount: '',
    method: 'cash',
    reference: '',
    notes: '',
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
  });
  const [editingPayment, setEditingPayment] = useState(null);
  const [editedPaymentDate, setEditedPaymentDate] = useState('');
  const [editedPaymentMethod, setEditedPaymentMethod] = useState('cash');

  const load = useCallback(() => {
    setLoading(true);
    getPurchase(id)
      .then(({ data }) => {
        setPurchase(data.data);
        const balance = Math.max(0, Number(data.data.totalAmount) - Number(data.data.amountPaid));
        setPayment((old) => ({ ...old, amount: balance ? balance.toFixed(2) : '' }));
      })
      .catch((error) => toast.error(error.response?.data?.message || 'Purchase could not be loaded.'))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  const postDraft = async () => {
    setBusy(true);
    try {
      await postPurchase(id);
      toast.success('Purchase posted to stock and accounting.');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Purchase could not be posted.');
    } finally { setBusy(false); }
  };

  const recordPayment = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await payPurchase(id, { ...payment, amount: Number(payment.amount) });
      toast.success('Payment posted.');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Payment could not be posted.');
    } finally { setBusy(false); }
  };

  const openPaymentEditor = (row) => {
    setEditingPayment(row);
    setEditedPaymentDate(format(new Date(row.paymentDate), 'yyyy-MM-dd'));
    setEditedPaymentMethod(row.method || 'cash');
  };

  const savePayment = async () => {
    if (!editingPayment || !editedPaymentDate || !editedPaymentMethod) return;
    setBusy(true);
    try {
      await updatePayment(editingPayment._id, {
        paymentDate: editedPaymentDate,
        method: editedPaymentMethod,
      });
      dispatch(baseApi.util.invalidateTags(['Payment', 'Purchase', 'Accounting']));
      toast.success('Payment date and method updated on the same payment and journal entry.');
      setEditingPayment(null);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Payment could not be updated.');
    } finally { setBusy(false); }
  };

  const openConfirm = (action) => {
    setConfirmAction(action);
    setActionReason('');
    setInventoryAction('keep');
  };

  const closeConfirm = () => {
    if (busy) return;
    setConfirmAction(null);
    setActionReason('');
    setInventoryAction('keep');
  };

  const remove = async () => {
    const reason = actionReason.trim();
    if (reason.length < 5) {
      toast.error('Enter a deletion reason of at least 5 characters.');
      return;
    }
    setBusy(true);
    try {
      await deletePurchase(id, reason, inventoryAction);
      toast.success(inventoryAction === 'adjust' && purchase.stockPostedAt
        ? 'Purchase and journal entries deleted; received quantities removed.'
        : 'Purchase and journal entries deleted without reversal.');
      setConfirmAction(null);
      navigate('/purchases');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Purchase could not be removed.');
    } finally { setBusy(false); }
  };

  if (loading) return <div className="py-24 text-center text-slate-400">Loading purchase…</div>;
  if (!purchase) return <div className="py-24 text-center text-slate-400">Purchase not found.</div>;
  const draft = ['draft', 'pendingApproval'].includes(purchase.status);
  const payable = ['open', 'partiallyPaid', 'corrected', 'migrationReview'].includes(purchase.status);
  const balance = payable ? Math.max(0, Number(purchase.totalAmount) - Number(purchase.amountPaid)) : 0;
  const hasLinkedAssets = (purchase.assets || []).length > 0;
  const typeLabel = purchase.type === 'stock'
    ? 'Stock purchase'
    : purchase.type === 'mixed'
      ? 'Mixed bill'
      : 'Direct expense';

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/purchases')} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-indigo-600"><ArrowLeft size={15} /> Back to purchases</button>
      <HeroBanner
        eyebrow="Purchase"
        title={purchase.purchaseNumber}
        subtitle={purchase.itemSummary}
        actions={<>
          {has('purchases.edit') && !hasLinkedAssets && purchase.status !== 'reversed' && (
            <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/purchases/${id}/edit`)}>{draft ? 'Edit draft' : 'Edit purchase'}</Button>
          )}
          {draft && has('purchases.post') && <Button icon={Send} disabled={busy} onClick={postDraft}>Post purchase</Button>}
          {has('purchases.delete') && (
            <Button variant="danger" icon={Trash2} disabled={busy} onClick={() => openConfirm('delete')}>Delete</Button>
          )}
        </>}
      />

      {purchase.migrationReview?.required && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Migration review:</strong> {(purchase.migrationReview.reasons || []).join(' · ')}
        </div>
      )}

      <Card>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
          <Info label="Status"><StatusChip status={purchase.status} /></Info>
          <Info label="Vendor">{purchase.vendor?.name || purchase.vendorName || 'Direct purchase'}</Info>
          <Info label="Vendor bill">{purchase.vendorInvoiceNumber || 'Not entered'}</Info>
          <Info label="Purchase date">{format(new Date(purchase.purchaseDate), 'dd MMM yyyy')}</Info>
          <Info label="Type">{typeLabel}</Info>
          <Info label="Destination">{purchase.outlet?.name ? `${purchase.outlet.name} · ${purchase.destination}` : 'No inventory movement'}</Info>
          <Info label="Balance">
            {draft
              ? <span className="text-amber-600">Not posted</span>
              : purchase.status === 'reversed'
                ? <span className="text-slate-400">Reversed · no balance</span>
                : <span className={balance ? 'text-rose-600' : 'text-emerald-600'}>{balance ? money(balance) : 'Paid in full'}</span>}
          </Info>
        </div>
      </Card>

      {!draft && hasLinkedAssets && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          This posted bill created fixed-asset records. It cannot be corrected in place because that would break the tag and acquisition trail; reverse it before entering a replacement bill.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card padding={false}>
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">{purchase.type === 'stock' ? 'Goods received' : purchase.type === 'mixed' ? 'Bill lines' : 'Expense items and services'}</h2><p className="text-xs text-slate-400">{purchase.itemSummary}</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Item</th><th className="px-4 py-3">Treatment</th><th className="px-4 py-3 text-right">Entered qty</th><th className="px-4 py-3 text-right">Base quantity</th><th className="px-4 py-3 text-right">Rate</th><th className="px-5 py-3 text-right">Line total</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(purchase.lines || []).map((line) => {
                  const treatment = line.accountingTreatment
                    || (purchase.type === 'stock' ? 'inventory' : 'expense');
                  const stockReceived = line.entryMode === 'pack'
                    ? Number(line.qty || 0) * Number(line.packSize || 0)
                    : Number(line.qty || 0);
                  return <tr key={line._id}><td className="px-5 py-3"><p className="font-semibold text-slate-800">{line.productName || line.product?.name || line.description}</p><p className="text-xs text-slate-400">{treatment === 'asset' ? `${line.assetCategory?.name || 'Fixed asset'}${line.assetLocation ? ` · ${line.assetLocation}` : ''}` : line.description !== line.productName ? line.description : line.notes || ''}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${treatment === 'asset' ? 'bg-violet-100 text-violet-700' : treatment === 'inventory' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{treatment}</span></td><td className="px-4 py-3 text-right tabular-nums">{line.qty} {line.entryMode === 'pack' ? 'packs' : line.unit}</td><td className="px-4 py-3 text-right tabular-nums"><p>{stockReceived} {line.unit}</p>{line.entryMode === 'pack' && <p className="text-[10px] text-slate-400">{line.packSize} {line.unit}/pack</p>}</td><td className="px-4 py-3 text-right tabular-nums"><p>{money(line.unitPrice)}</p><p className="text-[10px] text-slate-400">per {line.entryMode === 'pack' ? 'pack' : (line.unit || 'unit')}{line.priceEntryMode === 'total' ? ' · derived from total' : ''}</p></td><td className="px-5 py-3 text-right font-semibold tabular-nums">{money(line.lineTotal)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            {[['Subtotal', purchase.subtotal], ['Discount', -purchase.discountAmount], ['Tax', purchase.taxAmount], ['AIT', purchase.aitAmount], ['Paid', -purchase.amountPaid]].map(([label, value]) => <div key={label} className="flex justify-between py-1.5 text-sm text-slate-500"><span>{label}</span><span>{money(value)}</span></div>)}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-3 text-lg font-bold text-slate-900"><span>Balance</span><span>{money(balance)}</span></div>
            {purchase.journalEntryId && (
              <Link to={`/accounting/journal-entries?search=${encodeURIComponent(purchase.journalEntryId.entryNumber || purchase.journalEntryId)}`} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
                {purchase.journalEntryId.entryNumber || 'Open journal entry'} <ExternalLink size={12} />
              </Link>
            )}
          </Card>

          {payable && has('payments.record') && (
            <Card>
              <div className="mb-3 flex items-center gap-2"><Banknote size={17} className="text-emerald-600" /><h2 className="font-bold text-slate-900">Record payment</h2></div>
              <form className="space-y-3" onSubmit={recordPayment}>
                <input required type="number" min="0.01" max={balance} step="0.01" className={fieldClass} value={payment.amount} onChange={(event) => setPayment((old) => ({ ...old, amount: event.target.value }))} placeholder="Amount" />
                <SearchableSelect searchable={false} options={paymentMethodOptions} value={payment.method} onChange={(value) => setPayment((old) => ({ ...old, method: value }))} />
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Payment date
                  <input required type="date" max={format(new Date(), 'yyyy-MM-dd')} className={`${fieldClass} mt-1`} value={payment.paymentDate} onChange={(event) => setPayment((old) => ({ ...old, paymentDate: event.target.value }))} />
                </label>
                <input className={fieldClass} value={payment.reference} onChange={(event) => setPayment((old) => ({ ...old, reference: event.target.value }))} placeholder="Reference (optional)" />
                <Button type="submit" disabled={busy} className="w-full">Post payment</Button>
              </form>
            </Card>
          )}
        </div>
      </div>

      {hasLinkedAssets && (
        <Card padding={false}>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold text-slate-900">Assets created from this purchase</h2>
            <p className="text-xs text-slate-400">Each record is linked back to this bill and its acquisition journal.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {purchase.assets.map((asset) => (
              <Link
                key={asset._id}
                to={`/assets/register/${asset._id}`}
                className="flex items-center justify-between px-5 py-3 transition hover:bg-slate-50"
              >
                <div>
                  <p className="font-mono text-xs font-bold text-violet-600">{asset.assetNumber}</p>
                  <p className="text-sm font-semibold text-slate-800">{asset.name}</p>
                  <p className="text-xs text-slate-400">{asset.category?.name || 'Asset'} · {asset.trackingMode === 'bulk' ? `${asset.quantity} units` : 'Serialized'}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">{money(asset.originalCost)}</p>
                  <p className="text-xs capitalize text-slate-400">{asset.status}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card padding={false}>
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Payments</h2></div>
          {(purchase.payments || []).length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">No payments posted.</p> : <div className="divide-y divide-slate-100">{purchase.payments.map((row) => <div key={row._id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{paymentMethodOptions.find((option) => option.value === row.method)?.label || row.method}</p><p className="break-words text-xs text-slate-400">{format(new Date(row.paymentDate), 'dd MMM yyyy')} · {row.reference || 'No reference'}</p></div><div className="flex shrink-0 items-center gap-2 sm:gap-3"><div className="text-right"><p className="font-bold text-slate-900">{money(row.amount)}</p><p className={row.status === 'reversed' ? 'text-xs text-rose-600' : 'text-xs text-emerald-600'}>{row.status || 'posted'}</p></div>{has('payments.edit') && row.status !== 'reversed' && <button type="button" onClick={() => openPaymentEditor(row)} className="rounded-lg p-2 text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-700" title="Edit payment"><Pencil size={15} /></button>}</div></div>)}</div>}
        </Card>
        <Card padding={false}>
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Corrections</h2></div>
          {(purchase.adjustments || []).length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">No corrections. Original values are intact.</p> : <div className="divide-y divide-slate-100">{purchase.adjustments.map((row) => <div key={row._id} className="px-5 py-3"><div className="flex items-center justify-between"><p className="font-mono text-xs font-bold text-indigo-600">{row.adjustmentNumber}</p><span className="text-xs font-medium uppercase text-slate-400">{row.type}</span></div><p className="mt-1 text-sm text-slate-700">{row.reason}</p><p className="mt-1 text-xs text-slate-400">{format(new Date(row.createdAt), 'dd MMM yyyy, HH:mm')} · financial change {money(row.financialDelta)} · inventory {row.inventoryAction === 'keep' ? 'kept unchanged' : row.inventoryAction === 'notApplicable' ? 'not applicable' : 'updated'}{row.paymentChanges?.length ? ` · ${row.paymentChanges.length} payment${row.paymentChanges.length === 1 ? '' : 's'} reconciled` : ''}</p></div>)}</div>}
        </Card>
      </div>

      {confirmAction && (
        <ConfirmModal
          isOpen
          title={`Delete ${purchase.purchaseNumber}?`}
          message={draft
            ? 'This removes the draft purchase from operational lists while retaining its audit record.'
            : 'The purchase and its linked journal entries will be deleted directly. No reversal entries will be created.'}
          confirmLabel="Delete purchase"
          isLoading={busy}
          onConfirm={remove}
          onCancel={closeConfirm}
        >
          {!draft && purchase.status !== 'reversed' && purchase.stockPostedAt && (
            <fieldset className="mb-4">
              <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Inventory treatment</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[
                  ['keep', 'Keep quantities', 'Delete accounting records only'],
                  ['adjust', 'Remove quantities', 'Remove received stock too'],
                ].map(([value, label, detail]) => (
                  <label key={value} className={`cursor-pointer rounded-xl border p-3 ${inventoryAction === value ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'}`}>
                    <input type="radio" className="sr-only" name="inventoryAction" value={value} checked={inventoryAction === value} onChange={() => setInventoryAction(value)} />
                    <span className="block text-sm font-semibold text-slate-800">{label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
            Reason
            <textarea
              autoFocus
              rows={3}
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
              placeholder="Explain why this purchase is being deleted…"
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
          </label>
        </ConfirmModal>
      )}

      {editingPayment && (
        <ConfirmModal
          isOpen
          title="Edit payment"
          message="This changes the date and payment method on the existing payment and its linked journal entry. No reversal or replacement record will be created."
          confirmLabel="Save changes"
          variant="default"
          isLoading={busy}
          onConfirm={savePayment}
          onCancel={() => { if (!busy) setEditingPayment(null); }}
        >
          <div className="space-y-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Payment method
              <div className="mt-2"><SearchableSelect searchable={false} options={paymentMethodOptions} value={editedPaymentMethod} onChange={setEditedPaymentMethod} /></div>
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Payment date
              <input
                required
                type="date"
                max={format(new Date(), 'yyyy-MM-dd')}
                value={editedPaymentDate}
                onChange={(event) => setEditedPaymentDate(event.target.value)}
                className={`${fieldClass} mt-2`}
              />
            </label>
          </div>
        </ConfirmModal>
      )}
    </div>
  );
};

export default PurchaseDetail;
