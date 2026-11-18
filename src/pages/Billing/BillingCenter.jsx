import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Download, FileText, Loader2, ReceiptText } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadSubscriptionDocument, getSubscriptionBillingStatus, getSubscriptionInvoices } from '../../api/billingApi';

const money = (value, currency = 'PKR') => `${currency} ${Number(value || 0).toLocaleString('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const date = (value) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const STATUS = {
  issued: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  void: 'bg-slate-100 text-slate-600 border-slate-200',
};

const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const BillingCenter = () => {
  const [status, setStatus] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusResponse, invoiceResponse] = await Promise.all([
        getSubscriptionBillingStatus(),
        getSubscriptionInvoices(),
      ]);
      setStatus(statusResponse.data.data || null);
      setInvoices(invoiceResponse.data.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load subscription billing.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const download = async (invoice, kind) => {
    const key = `${invoice.id}:${kind}`;
    setDownloading(key);
    try {
      const { data } = await downloadSubscriptionDocument(invoice.id, kind);
      saveBlob(data, kind === 'receipt' ? `${invoice.receiptNumber}.pdf` : `${invoice.invoiceNumber}.pdf`);
    } catch (error) {
      toast.error(error.response?.data?.message || `Could not download ${kind}.`);
    } finally { setDownloading(''); }
  };

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center text-sm text-slate-500"><Loader2 size={16} className="mr-2 animate-spin" /> Loading billing...</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-100">Account</p><h1 className="mt-1 text-2xl font-extrabold">Subscription billing</h1><p className="mt-1 text-sm text-indigo-100">Review invoices, receipts and your current access period.</p></div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-right ring-1 ring-white/20"><p className="text-[10px] font-bold uppercase tracking-wider text-indigo-100">Access until</p><p className="mt-1 text-sm font-extrabold">{date(status?.accessUntil)}</p></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15"><p className="text-[10px] uppercase tracking-wider text-indigo-100">Days remaining</p><p className="mt-1 text-2xl font-extrabold">{status?.daysRemaining ?? '-'}</p></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15"><p className="text-[10px] uppercase tracking-wider text-indigo-100">Outstanding</p><p className="mt-1 text-xl font-extrabold">{money(status?.outstandingAmount, status?.currency)}</p></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15"><p className="text-[10px] uppercase tracking-wider text-indigo-100">Account status</p><p className="mt-1 text-xl font-extrabold capitalize">{status?.status || '-'}</p></div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileText size={16} /></div><div><h2 className="text-sm font-extrabold text-slate-900">Invoices and receipts</h2><p className="text-xs text-slate-500">Documents are also sent to the owner by email.</p></div></div>
        {invoices.length === 0 ? <div className="py-12 text-center text-sm text-slate-400">No subscription invoices have been issued.</div> : (
          <div className="divide-y divide-slate-100">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{invoice.invoiceNumber}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS[invoice.status] || STATUS.issued}`}>{invoice.status}</span></div><div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><CalendarClock size={11} /> Due {date(invoice.dueDate)}</span>{invoice.paidAt && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11} /> Paid {date(invoice.paidAt)}</span>}</div></div>
                  <div className="text-right"><p className="font-extrabold text-slate-900">{money(invoice.total, invoice.currency)}</p><p className="text-xs text-slate-500">Balance {money(invoice.balance, invoice.currency)}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => download(invoice, 'invoice')} disabled={downloading === `${invoice.id}:invoice`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{downloading === `${invoice.id}:invoice` ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Invoice PDF</button>{invoice.status === 'paid' && <button type="button" onClick={() => download(invoice, 'receipt')} disabled={downloading === `${invoice.id}:receipt`} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">{downloading === `${invoice.id}:receipt` ? <Loader2 size={12} className="animate-spin" /> : <ReceiptText size={12} />} Receipt PDF</button>}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default BillingCenter;
