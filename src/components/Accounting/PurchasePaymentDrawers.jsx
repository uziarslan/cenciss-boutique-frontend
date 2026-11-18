import { useEffect } from 'react';
import { Link } from 'react-router';
import { CreditCard, ExternalLink, PackageCheck, X } from 'lucide-react';
import { format } from 'date-fns';
import Portal from '../UI/Portal';
import StatusChip from '../UI/StatusChip';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const methodLabel = {
  bankTransfer: 'Bank Transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  creditCard: 'Credit Card',
};

const Field = ({ label, children }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    <div className="mt-1 text-sm font-semibold text-slate-800 break-words">{children || '—'}</div>
  </div>
);

const DetailDrawer = ({ open, onClose, icon: Icon, eyebrow, title, subtitle, action, children }) => {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label={`${eyebrow} details`}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
        <aside className="safe-area-drawer relative z-[70] flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-slide-in-right">
          <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-500">
                <Icon size={12} /> {eyebrow}
              </p>
              <h2 className="mt-0.5 truncate text-lg font-bold text-slate-900">{title}</h2>
              <p className="mt-0.5 truncate text-xs text-slate-400">{subtitle}</p>
            </div>
            <button type="button" onClick={onClose} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close details">
              <X size={18} />
            </button>
          </header>
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 px-5 py-4">{children}</div>
          <footer className="border-t border-slate-100 bg-white px-5 py-4">
            {action}
          </footer>
        </aside>
      </div>
    </Portal>
  );
};

export const PurchaseDetailDrawer = ({ purchase, onClose }) => {
  const balance = Math.max(0, Number(purchase?.totalAmount || 0) - Number(purchase?.amountPaid || 0));
  return (
    <DetailDrawer
      open={!!purchase}
      onClose={onClose}
      icon={PackageCheck}
      eyebrow="Purchase details"
      title={purchase?.purchaseNumber || 'Purchase'}
      subtitle={purchase?.itemSummary || 'Purchased goods and services'}
      action={purchase && (
        <Link
          to={`/purchases/${purchase._id}`}
          onClick={onClose}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
        >
          Open purchase <ExternalLink size={15} />
        </Link>
      )}
    >
      {purchase && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Status"><StatusChip status={purchase.status} /></Field>
            <Field label="Vendor">{purchase.vendor?.name || purchase.vendorName || 'Direct purchase'}</Field>
            <Field label="Vendor bill">{purchase.vendorInvoiceNumber || 'Not entered'}</Field>
            <Field label="Purchase date">{purchase.purchaseDate ? format(new Date(purchase.purchaseDate), 'dd MMM yyyy') : '—'}</Field>
            <Field label="Total">{money(purchase.totalAmount)}</Field>
            <Field label="Balance"><span className={balance ? 'text-rose-600' : 'text-emerald-600'}>{balance ? money(balance) : 'Paid in full'}</span></Field>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Purchase lines</div>
            {(purchase.lines || []).map((line, index) => (
              <div key={line._id || index} className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-0">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{line.productName || line.product?.name || line.description || 'Item'}</p>
                  <p className="text-xs text-slate-400">{line.qty || 0} {line.entryMode === 'pack' ? 'packs' : line.unit || 'units'}</p>
                </div>
                <span className="shrink-0 font-bold tabular-nums text-slate-800">{money(line.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Subtotal">{money(purchase.subtotal)}</Field>
            <Field label="Paid">{money(purchase.amountPaid)}</Field>
          </div>
        </>
      )}
    </DetailDrawer>
  );
};

export const PaymentDetailDrawer = ({ payment, onClose }) => (
  <DetailDrawer
    open={!!payment}
    onClose={onClose}
    icon={CreditCard}
    eyebrow="Payment details"
    title={payment?.reference || (payment?._id ? `PAY-${String(payment._id).slice(-6).toUpperCase()}` : 'Payment')}
    subtitle={payment?.purchase?.purchaseNumber || 'Vendor payment'}
    action={payment && (
      <Link
        to={`/payments?ref=${payment._id}`}
        onClick={onClose}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
      >
        Open payment <ExternalLink size={15} />
      </Link>
    )}
  >
    {payment && (
      <>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Amount"><span className="text-emerald-700">{money(payment.amount)}</span></Field>
          <Field label="Status"><StatusChip status={payment.status || 'posted'} /></Field>
          <Field label="Method">{methodLabel[payment.method] || payment.method}</Field>
          <Field label="Payment date">{payment.paymentDate ? format(new Date(payment.paymentDate), 'dd MMM yyyy') : '—'}</Field>
          <Field label="Vendor">{payment.vendor?.name || payment.purchase?.vendorName || 'Direct purchase'}</Field>
          <Field label="Reference">{payment.reference || 'Not provided'}</Field>
          <Field label="Recorded by">{payment.recordedBy?.name || payment.recordedBy?.email || '—'}</Field>
          <Field label="Journal">{payment.journalEntryId?.entryNumber || '—'}</Field>
        </div>
        {payment.notes && <Field label="Notes">{payment.notes}</Field>}
        {payment.purchase && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Linked purchase</p>
            <p className="mt-1 font-bold text-slate-900">{payment.purchase.purchaseNumber}</p>
            <p className="mt-0.5 text-sm text-slate-500">{payment.purchase.itemSummary || 'Purchase'}</p>
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500">Purchase balance</span>
              <span className="font-bold text-slate-800">{money(Math.max(0, Number(payment.purchase.totalAmount || 0) - Number(payment.purchase.amountPaid || 0)))}</span>
            </div>
          </div>
        )}
      </>
    )}
  </DetailDrawer>
);
