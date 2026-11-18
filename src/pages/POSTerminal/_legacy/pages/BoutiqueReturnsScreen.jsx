import { useMemo, useState } from 'react';
import { ArrowLeft, Check, RefreshCw, Search, RotateCcw, Store } from 'lucide-react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import api from '../api/axios';
import FloatingSelect from '../../../../components/UI/FloatingSelect';

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const money = (amount) => `PKR ${Number(amount || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const requestId = () => globalThis.crypto?.randomUUID?.() || `return-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const BoutiqueReturnsScreen = () => {
  const navigate = useNavigate();
  const [transactionNumber, setTransactionNumber] = useState('');
  const [sale, setSale] = useState(null);
  const [lines, setLines] = useState({});
  const [refundMethod, setRefundMethod] = useState('store-credit');
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const selectedLines = useMemo(() => Object.entries(lines).filter(([, line]) => Number(line.quantity) > 0), [lines]);
  const estimatedRefund = useMemo(() => selectedLines.reduce((sum, [index, line]) => {
    const source = sale?.items?.find((item) => item.index === Number(index));
    return sum + Number(source?.unitRefund || 0) * Number(line.quantity || 0);
  }, 0), [sale, selectedLines]);

  const lookupSale = async (event) => {
    event.preventDefault();
    if (!transactionNumber.trim()) return;
    setWorking(true);
    setReceipt(null);
    try {
      const response = await api.get('/api/pos/retail-returnable', { params: { transactionNumber: transactionNumber.trim() } });
      const data = response.data?.data?.sale;
      setSale(data || null);
      setLines(Object.fromEntries((data?.items || []).map((item) => [item.index, { quantity: 0, restock: true, condition: 'resalable' }])));
      if (!data) toast.error('Sale could not be found.');
    } catch (error) {
      setSale(null);
      toast.error(error.response?.data?.message || 'Could not find this POS sale. Shopify orders must be refunded in Shopify.');
    } finally { setWorking(false); }
  };

  const setLine = (index, changes) => setLines((current) => ({ ...current, [index]: { ...current[index], ...changes } }));

  const submitReturn = async () => {
    if (!sale || selectedLines.length === 0) return toast.error('Choose at least one quantity to return.');
    if (reason.trim().length < 3) return toast.error('Enter a return reason.');
    setWorking(true);
    try {
      const response = await api.post('/api/pos/retail-returns', {
        clientReturnId: requestId(),
        saleTransactionId: sale._id,
        refundMethod,
        reason: reason.trim(),
        lines: selectedLines.map(([index, line]) => ({ originalSaleItemIndex: Number(index), ...line })),
      });
      setReceipt(response.data?.data?.return || null);
      toast.success('Return recorded.');
      setSale(null);
      setLines({});
      setTransactionNumber('');
      setReason('');
    } catch (error) { toast.error(error.response?.data?.message || 'Return could not be recorded.'); }
    finally { setWorking(false); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-extrabold text-slate-900">Returns and exchanges</h1><p className="mt-1 text-sm text-slate-500">Find a POS receipt, choose item quantities, and refund cash or issue store credit.</p></div>
        <button onClick={() => navigate('/terminal/pos')} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><ArrowLeft size={15} />Back to sale</button>
      </div>

      <form onSubmit={lookupSale} className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input className={`${field} min-w-[220px] flex-1`} value={transactionNumber} onChange={(event) => setTransactionNumber(event.target.value)} placeholder="POS receipt number (e.g. TXN-20261012-0001)" />
        <button disabled={working || !transactionNumber.trim()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Search size={15} />Find sale</button>
      </form>

      {receipt && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <div className="flex items-start gap-3"><Check size={19} className="mt-0.5 shrink-0" /><div><p className="font-bold">Return {receipt.returnNumber} recorded · {money(receipt.refundAmount)}</p>{receipt.storeCredit && <p className="mt-1 text-sm">Store credit code: <span className="rounded bg-white px-2 py-1 font-mono font-bold">{receipt.storeCredit.code}</span> · balance {money(receipt.storeCredit.balance)}</p>}</div></div>
      </div>}

      {sale && <>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-3"><div><p className="font-bold text-slate-900">Receipt {sale.transactionNumber}</p><p className="text-xs text-slate-500">{sale.outlet?.name || 'Boutique outlet'} · {sale.createdAt ? new Date(sale.createdAt).toLocaleString() : ''}</p></div><p className="text-sm font-bold text-indigo-700">Original total {money(sale.totalAmount)}</p></div>
          <div className="space-y-3">
            {sale.items.map((item) => <div key={item.index} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_100px_180px_180px] md:items-center">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{item.name}</p><p className="mt-0.5 text-xs text-slate-500">{item.sku || item.barcode || 'No SKU'} · {money(item.unitRefund)} / unit · {item.remainingQuantity} left to return</p></div>
              <label className="text-xs font-semibold text-slate-600">Qty<input className={`${field} mt-1`} type="number" min="0" max={item.remainingQuantity} step="1" disabled={item.remainingQuantity <= 0} value={lines[item.index]?.quantity ?? 0} onChange={(event) => setLine(item.index, { quantity: Math.min(item.remainingQuantity, Math.max(0, Number(event.target.value) || 0)) })} /></label>
              <FloatingSelect label="Condition" options={[{ value: 'resalable', label: 'Resalable' }, { value: 'damaged', label: 'Damaged' }, { value: 'altered', label: 'Altered' }, { value: 'other', label: 'Other' }]} value={lines[item.index]?.condition || 'resalable'} onChange={(value) => setLine(item.index, { condition: value, restock: value === 'resalable' })} searchable={false} />
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={!!lines[item.index]?.restock} disabled={lines[item.index]?.condition !== 'resalable'} onChange={(event) => setLine(item.index, { restock: event.target.checked })} />Return to sellable stock</label>
            </div>)}
          </div>
        </section>
        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_260px]">
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600">Reason<textarea className={`${field} mt-1 min-h-20`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Fit, defect, wrong item…" /></label>
            <FloatingSelect label="Refund method" options={[{ value: 'store-credit', label: 'Issue store credit' }, { value: 'cash', label: 'Cash refund' }, { value: 'card', label: 'Card refund' }, { value: 'online-transfer', label: 'Online transfer' }]} value={refundMethod} onChange={setRefundMethod} searchable={false} />
            {refundMethod === 'store-credit' && <p className="flex items-center gap-2 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-900"><Store size={15} />A one-use code will be generated. Cashiers can apply it to a later sale while online.</p>}
          </div>
          <div className="flex flex-col justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated refund</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{money(estimatedRefund)}</p><p className="mt-1 text-xs text-slate-500">Final amount is calculated again by the server.</p></div><button onClick={submitReturn} disabled={working || !selectedLines.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{working ? <RefreshCw size={16} className="animate-spin" /> : <RotateCcw size={16} />}{working ? 'Recording…' : 'Record return'}</button></div>
        </section>
      </>}
    </div>
  );
};

export default BoutiqueReturnsScreen;
