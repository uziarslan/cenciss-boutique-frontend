import { useState, useEffect } from 'react';
import { X, Receipt, ChevronDown, ChevronRight, Banknote, CreditCard, Layers, Wallet, CornerDownRight, Landmark } from 'lucide-react';
import clsx from 'clsx';
import { useGetSalesTransactionsQuery, reportQueryOpts } from '../../store/baseApi';
import { fmt } from './ReportShared';
import { formatInTimeZone } from '../../utils/datetime';
import Portal from '../../components/UI/Portal';

const PAYMENT_META = {
  cash:         { label: 'Cash',      Icon: Banknote },
  card:         { label: 'Card',      Icon: CreditCard },
  'online-transfer': { label: 'Online Transfer', Icon: Landmark },
  'split-bill': { label: 'Split',     Icon: Layers },
  split:        { label: 'Split',     Icon: Layers },
  allowance:    { label: 'Allowance', Icon: Wallet },
};

const fmtRate = (r) => String(+Number(r || 0).toFixed(2));

export const discountRateFor = (tx) => (
  Number(tx?.discountPercent) > 0 ? Number(tx.discountPercent) : 0
);

// One expandable transaction row.
export const TxnRow = ({ tx, tz }) => {
  const [open, setOpen] = useState(false);
  const pm = PAYMENT_META[tx.paymentMethod] ?? { label: tx.paymentMethod, Icon: Banknote };
  const PmIcon = pm.Icon;
  const isRefund = tx.isRefund || tx.status === 'refunded';
  const isHeld = tx.status === 'held';
  const discountRate = discountRateFor(tx);

  // Compact meta line: date · cashier · table · payment + card.
  const meta = [
    tx.createdAt
      ? formatInTimeZone(tx.createdAt, tz, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
      : null,
    tx.cashierName || null,
    tx.customerName || tx.chargeToSalaryEmployeeName || tx.allowanceSubjectName || null,
    tx.tableNumber ? `Table ${tx.tableNumber}` : null,
    tx.orderType ? tx.orderType.replace('-', ' ') : null,
    `${pm.label}${tx.cardLast4 ? ` ****${tx.cardLast4}` : ''}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50/70 transition-colors"
      >
        <span className="pt-0.5 shrink-0">
          {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">
              {tx.transactionNumber || '—'}
              {isRefund && <span className="ml-2 text-[10px] font-bold uppercase text-rose-600">Refund</span>}
              {isHeld && <span className="ml-2 text-[10px] font-bold uppercase text-amber-600">Held</span>}
            </p>
            <span className={clsx('text-sm font-bold tabular-nums whitespace-nowrap', isRefund ? 'text-rose-600' : 'text-gray-900')}>
              Rs. {fmt(tx.totalAmount)}
            </span>
          </div>
          <p className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5 truncate">
            <PmIcon size={11} className="text-gray-400 shrink-0" />
            <span className="truncate">{meta}</span>
          </p>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/40 px-3 py-2.5 space-y-2">
          {/* Line items */}
          <div className="space-y-1">
            {(tx.items ?? []).map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <CornerDownRight size={11} className="text-gray-300 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-gray-700">
                  {it.name}{(it.variation?.name || it.variationName) ? ` (${it.variation?.name || it.variationName})` : ''}
                </span>
                <span className="text-gray-400 tabular-nums whitespace-nowrap">{it.qty} × {fmt(it.unitPrice)}</span>
                <span className="w-20 text-right font-medium text-gray-700 tabular-nums">{fmt(it.lineTotal ?? it.qty * it.unitPrice)}</span>
              </div>
            ))}
          </div>

          {(tx.customerName || tx.customerPhone || tx.onlineTransferReference || tx.notes) && (
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-600 space-y-0.5">
              {(tx.customerName || tx.customerPhone) && (
                <p><span className="font-semibold text-slate-700">Customer:</span> {[tx.customerName, tx.customerPhone].filter(Boolean).join(' · ')}</p>
              )}
              {tx.onlineTransferReference && (
                <p><span className="font-semibold text-slate-700">Transfer reference:</span> {tx.onlineTransferReference}</p>
              )}
              {tx.notes && <p><span className="font-semibold text-slate-700">Notes:</span> {tx.notes}</p>}
            </div>
          )}

          {/* Totals breakdown */}
          <div className="pt-2 border-t border-slate-200/70 space-y-0.5 text-xs">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="tabular-nums">{fmt(tx.subtotal)}</span></div>
            {tx.taxAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Tax{tx.effectiveTaxRate ? ` (${fmtRate(tx.effectiveTaxRate)}%)` : ''}</span>
                <span className="tabular-nums">{fmt(tx.taxAmount)}</span>
              </div>
            )}
            {tx.discountAmount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Discount{discountRate > 0 ? ` (${fmtRate(discountRate)}%)` : ''}</span>
                <span className="tabular-nums">- {fmt(tx.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 pt-0.5"><span>Total</span><span className="tabular-nums">{fmt(tx.totalAmount)}</span></div>
            {tx.paymentMethod === 'card' && tx.cardLast4 && (
              <div className="flex justify-between text-gray-500"><span>Card</span><span className="tabular-nums">****{tx.cardLast4}</span></div>
            )}
            {tx.paymentMethod === 'online-transfer' && (
              <span className="text-xs text-slate-500">Ref: {tx.onlineTransferReference || '—'}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Slide-over drawer that lists the transactions behind a clicked report row.
// `params` carries the row's filters (from/to/outlet + period/groupBy | menuItem | cashier).
// The drawer stays mounted and animates via translate/opacity so it slides in
// and out smoothly.
const ReportDrillDrawer = ({ open, onClose, title, subtitle, params, tz }) => {
  // Retain the last params + title so content stays put while the panel slides
  // out (params goes null the instant the parent closes the drawer).
  const [lastParams, setLastParams] = useState(null);
  const [lastTitle, setLastTitle] = useState({ title, subtitle });
  useEffect(() => {
    if (params) setLastParams(params);
    if (title) setLastTitle({ title, subtitle });
  }, [params, title, subtitle]);
  const queryParams = params || lastParams;
  const headerTitle = title || lastTitle.title;
  const headerSubtitle = subtitle || lastTitle.subtitle;

  const { data, isFetching } = useGetSalesTransactionsQuery(queryParams, {
    skip: !queryParams,
    ...reportQueryOpts,
  });
  const transactions = data?.transactions ?? [];
  const grandTotal = transactions.reduce(
    (s, t) => s + (t.status === 'held' ? 0 : (t.isRefund || t.status === 'refunded' ? -1 : 1) * Number(t.totalAmount || 0)),
    0,
  );

  return (
    <Portal>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={clsx(
          'fixed inset-0 bg-black/30 z-[60] transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      />
      {/* Panel */}
      <div
        className={clsx(
          'safe-area-drawer fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col',
          'transition-transform duration-300 ease-out will-change-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-500">
              <Receipt size={12} /> Transactions
            </div>
            <h2 className="text-base font-bold text-gray-900 mt-0.5 truncate">{headerTitle}</h2>
            {headerSubtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{headerSubtitle}</p>}
          </div>
          <button onClick={onClose} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Close transactions">
            <X size={18} />
          </button>
        </div>

        {/* Summary strip */}
        {!isFetching && transactions.length > 0 && (
          <div className="px-5 py-3 bg-slate-50/60 border-b border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {transactions.length} transaction{transactions.length === 1 ? '' : 's'}{data?.truncated ? ' (first 500)' : ''}
            </span>
            <span className="font-bold text-gray-900 tabular-nums">Rs. {fmt(grandTotal)}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {isFetching ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                <Receipt size={20} className="text-gray-300" />
              </div>
              <p className="text-sm text-gray-400">No transactions for this selection.</p>
            </div>
          ) : (
            transactions.map((tx) => <TxnRow key={tx._id} tx={tx} tz={tz} />)
          )}
        </div>
      </div>
    </Portal>
  );
};

export default ReportDrillDrawer;
