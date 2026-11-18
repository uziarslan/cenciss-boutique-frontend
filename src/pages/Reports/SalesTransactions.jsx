import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { format } from 'date-fns';
import {
  Banknote, ChevronDown, ChevronLeft, ChevronRight, CornerDownRight, CreditCard,
  Landmark, Layers, Printer, ReceiptText, Search, ShoppingBag, SlidersHorizontal, Wallet, X,
} from 'lucide-react';
import clsx from 'clsx';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import Portal from '../../components/UI/Portal';
import useDebounce from '../../hooks/useDebounce';
import { resolveBusinessDate } from '../../utils/businessDate';
import { exportToCSV } from '../../utils/exportCSV';
import {
  useGetAllSalesTransactionsQuery, useGetOutletsQuery,
  useGetSalesTransactionByIdQuery, reportQueryOpts,
} from '../../store/baseApi';
import {
  ExportButton, fmt, ReportCard, ReportEmpty, ReportSectionHeader,
  ReportSkeleton, ReportThead, StatCard,
} from './ReportShared';
import useQueryState from '../../hooks/useQueryState';
import { getCancellationReason } from '../../utils/orderCancellation';
import ReceiptPrintProvider, {
  useReceiptPrint,
} from '../POSTerminal/_legacy/components/Print/ReceiptPrintProvider';

const PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'held', label: 'Held' },
  { value: 'pending-approval', label: 'Pending approval' },
  { value: 'out-for-delivery', label: 'Out for delivery' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'void', label: 'Cancelled' },
];
const PAYMENT_OPTIONS = [
  { value: '', label: 'All payments' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'online-transfer', label: 'Online transfer' },
  { value: 'split-bill', label: 'Split bill' },
  { value: 'allowance', label: 'Allowance' },
  { value: 'charge-to-salary', label: 'Charge to salary' },
];
const DISCOUNT_OPTIONS = [
  { value: '', label: 'All discount states' },
  { value: 'with-discount', label: 'With discount' },
  { value: 'without-discount', label: 'Without discount' },
];
const WASTE_OPTIONS = [
  { value: '', label: 'All waste states' },
  { value: 'fully-wasted', label: 'Fully wasted' },
  { value: 'partially-wasted', label: 'Partially wasted' },
  { value: 'not-wasted', label: 'Not wasted' },
];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amountHigh', label: 'Highest amount' },
  { value: 'amountLow', label: 'Lowest amount' },
];

const STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700',
  held: 'bg-amber-50 text-amber-700',
  'pending-approval': 'bg-violet-50 text-violet-700',
  'out-for-delivery': 'bg-blue-50 text-blue-700',
  refunded: 'bg-rose-50 text-rose-700',
  void: 'bg-slate-100 text-slate-600',
};

const humanize = (value) => String(value || '—').replaceAll('-', ' ');
const fmtRate = (value) => String(+Number(value || 0).toFixed(2));

const PaymentIcon = ({ method, size = 13 }) => {
  if (method === 'cash') return <Banknote size={size} />;
  if (method === 'card') return <CreditCard size={size} />;
  if (method === 'online-transfer') return <Landmark size={size} />;
  if (method === 'split-bill') return <Layers size={size} />;
  return <Wallet size={size} />;
};

const DetailRow = ({ label, value }) => value ? (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
    <p className="mt-0.5 text-sm font-medium text-slate-800 break-words">{value}</p>
  </div>
) : null;

const SalesTransactionDrawerContent = ({ order, onClose }) => {
  const requestReceiptPrint = useReceiptPrint();
  const [lastOrder, setLastOrder] = useState(null);
  useEffect(() => { if (order) setLastOrder(order); }, [order]);
  const tx = order || lastOrder;
  const open = !!order;
  const cancellationReason = getCancellationReason(tx);
  const address = tx?.deliveryAddress
    ? [tx.deliveryAddress.label, tx.deliveryAddress.street, tx.deliveryAddress.area, tx.deliveryAddress.city].filter(Boolean).join(', ')
    : '';
  const handlePrint = () => {
    const customer = tx.customer && typeof tx.customer === 'object'
      ? tx.customer
      : (tx.customerName || tx.customerPhone
        ? { name: tx.customerName, phone: tx.customerPhone }
        : null);
    const assignedRider = tx.assignedRider && typeof tx.assignedRider === 'object'
      ? tx.assignedRider
      : (tx.riderName ? { name: tx.riderName } : null);

    requestReceiptPrint({
      transaction: { ...tx, customer, assignedRider },
      outletName: tx.outletName,
      cashierName: tx.cashierName || 'Unassigned',
    });
  };

  return (
    <Portal>
      <div
        onClick={onClose}
        className={clsx('fixed inset-0 z-[60] bg-black/30 transition-opacity duration-300', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />
      <aside
        className={clsx(
          'safe-area-drawer fixed right-0 top-0 z-[70] flex h-full w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        {tx && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-500">
                  <ReceiptText size={12} /> Order details
                </div>
                <h2 className="mt-0.5 truncate text-lg font-bold text-slate-900">{tx.transactionNumber || '—'}</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {tx.createdAt ? format(new Date(tx.createdAt), 'dd MMM yyyy, h:mm a') : '—'}
                  {tx.businessDate ? ` · Business day ${tx.businessDate}` : ''}
                </p>
              </div>
              <button type="button" onClick={onClose} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close order details">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-bold capitalize', STATUS_STYLES[tx.status] || 'bg-slate-100 text-slate-600')}>
                  {humanize(tx.status)}
                </span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-indigo-700">{humanize(tx.orderType)}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-slate-700">
                  <PaymentIcon method={tx.paymentMethod} size={11} /> {humanize(tx.paymentMethod)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 p-3">
                <DetailRow label="Outlet" value={tx.outletName} />
                <DetailRow label="Cashier" value={tx.cashierName || 'Unassigned'} />
                <DetailRow label="Customer" value={[tx.customerName, tx.customerPhone].filter(Boolean).join(' · ')} />
                <DetailRow label="Transfer reference" value={tx.onlineTransferReference} />
                <DetailRow label="Card" value={tx.cardLast4 ? `•••• ${tx.cardLast4}` : ''} />
                <DetailRow label="Allowance for" value={tx.allowanceSubjectName} />
                <DetailRow label="Charge to salary" value={tx.chargeToSalaryEmployeeName} />
              </div>

              {address && <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><DetailRow label="Delivery address" value={address} /></div>}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Items</span>
                  <span className="text-[10px] text-slate-400">{tx.itemCount ?? (tx.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)} qty</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {(tx.items || []).map((item, index) => (
                    <div key={`${item.name}-${index}`} className="flex items-start gap-2 px-3 py-2.5 text-xs">
                      <CornerDownRight size={11} className="mt-0.5 shrink-0 text-slate-300" />
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-700">{item.name}{item.variation?.name ? ` (${item.variation.name})` : ''}</p>
                        {item.discountAmount > 0 && <p className="text-[10px] text-rose-500">Discount {fmt(item.discountAmount)}</p>}
                      </div>
                      <span className="whitespace-nowrap tabular-nums text-slate-400">{item.qty} × {fmt(item.unitPrice)}</span>
                      <span className="w-20 text-right font-medium tabular-nums text-slate-700">{fmt(item.lineTotal ?? item.qty * item.unitPrice)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1 rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="tabular-nums">Rs. {fmt(tx.subtotal)}</span></div>
                {tx.discountAmount > 0 && <div className="flex justify-between text-rose-600"><span>Discount{tx.discountPercent ? ` (${fmtRate(tx.discountPercent)}%)` : ''}</span><span className="tabular-nums">- Rs. {fmt(tx.discountAmount)}</span></div>}
                {tx.taxAmount > 0 && <div className="flex justify-between text-slate-500"><span>Tax{tx.effectiveTaxRate ? ` (${fmtRate(tx.effectiveTaxRate)}%)` : ''}</span><span className="tabular-nums">Rs. {fmt(tx.taxAmount)}</span></div>}
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>Total</span><span className="tabular-nums">Rs. {fmt(tx.totalAmount)}</span></div>
              </div>

              {(cancellationReason || tx.refundReason || tx.notes) && (
                <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50 p-3">
                  <DetailRow label="Cancellation reason" value={cancellationReason} />
                  <DetailRow label="Refund reason" value={tx.refundReason} />
                  <DetailRow label="Notes" value={tx.notes} />
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Printer size={16} />
                Reprint Receipt
              </button>
            </div>
          </>
        )}
      </aside>
    </Portal>
  );
};

export const SalesTransactionDrawer = (props) => (
  <ReceiptPrintProvider>
    <SalesTransactionDrawerContent {...props} />
  </ReceiptPrintProvider>
);

const SalesTransactions = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedOrderId = searchParams.get('order') || '';
  const calendarToday = format(new Date(), 'yyyy-MM-dd');
  const [from, setFrom] = useQueryState('from', calendarToday);
  const [to, setTo] = useQueryState('to', calendarToday);
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const [status, setStatus] = useQueryState('status', '');
  const [paymentMethod, setPaymentMethod] = useQueryState('paymentMethod', '');
  const [discountState, setDiscountState] = useQueryState('discountState', '');
  const [wasteState, setWasteState] = useQueryState('wasteState', '');
  const [minAmount, setMinAmount] = useQueryState('minAmount', '');
  const [maxAmount, setMaxAmount] = useQueryState('maxAmount', '');
  const [sort, setSort] = useQueryState('sort', 'newest');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [search, setSearch] = useQueryState('search', '');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const { data: linkedOrder } = useGetSalesTransactionByIdQuery(linkedOrderId, {
    skip: !linkedOrderId,
  });
  const debouncedSearch = useDebounce(search, 350);
  const { data: outlets = [] } = useGetOutletsQuery();

  useEffect(() => {
    if (linkedOrder) setSelected(linkedOrder);
  }, [linkedOrder]);

  const closeDrawer = () => {
    setSelected(null);
    if (!linkedOrderId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('order');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!outlets.length) return;
    if (outlets.length === 1 && !outlet) setOutlet(outlets[0]._id || '');
  }, [outlets, outlet, setOutlet]);

  // This report opens on one operating day, not the calendar month. Changing
  // the outlet also moves the range to that outlet's active business date.
  useEffect(() => {
    if (!outlets.length) return;
    const businessToday = resolveBusinessDate(outlets, outlet);
    setFrom(businessToday);
    setTo(businessToday);
  // Outlet changes are the deliberate reset boundary; a background outlet
  // cache refresh must not overwrite a date range the user selected manually.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlet, outlets.length]);

  useEffect(() => { setPage(1); }, [
    from, to, outlet, status, paymentMethod,
    discountState, wasteState, minAmount, maxAmount, sort, debouncedSearch,
  ]);

  const activeBusinessDate = resolveBusinessDate(outlets, outlet);
  const advancedFilterCount = [
    from !== activeBusinessDate || to !== activeBusinessDate,
    outlets.length > 1 && outlet, status, paymentMethod,
    discountState, wasteState, minAmount || maxAmount,
    sort !== 'newest',
  ].filter(Boolean).length;

  const clearAdvancedFilters = () => {
    setFrom(activeBusinessDate);
    setTo(activeBusinessDate);
    setOutlet(outlets.length === 1 ? outlets[0]._id : '');
    setStatus('');
    setPaymentMethod('');
    setDiscountState('');
    setWasteState('');
    setMinAmount('');
    setMaxAmount('');
    setSort('newest');
  };

  const query = useMemo(() => {
    const params = { from, to, page, limit: PAGE_SIZE };
    if (outlet) params.outlet = outlet;
    if (status) params.status = status;
    if (paymentMethod) params.paymentMethod = paymentMethod;
    if (discountState) params.discountState = discountState;
    if (wasteState) params.wasteState = wasteState;
    if (minAmount !== '') params.minAmount = minAmount;
    if (maxAmount !== '') params.maxAmount = maxAmount;
    if (sort !== 'newest') params.sort = sort;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    return params;
  }, [
    from, to, page, outlet, status, paymentMethod,
    discountState, wasteState, minAmount, maxAmount, sort, debouncedSearch,
  ]);

  const { data: payload, isLoading, isFetching } = useGetAllSalesTransactionsQuery(query, {
    skip: !from || !to,
    ...reportQueryOpts,
  });
  const rows = payload?.transactions || [];
  const pagination = payload?.pagination || { page, pages: 1, total: 0 };
  const summary = payload?.summary || {};

  const handleExport = () => exportToCSV(rows.map((tx) => ({
    'Order #': tx.transactionNumber || '',
    'Business Date': tx.businessDate || '',
    Time: tx.createdAt ? format(new Date(tx.createdAt), 'yyyy-MM-dd HH:mm') : '',
    Outlet: tx.outletName || '', Cashier: tx.cashierName || '', Customer: tx.customerName || '',
    Status: humanize(tx.status), 'Order Type': humanize(tx.orderType), Payment: humanize(tx.paymentMethod),
    Items: (tx.items || []).map((item) => `${item.qty}x ${item.name}`).join('; '),
    Subtotal: tx.subtotal || 0, Discount: tx.discountAmount || 0, Tax: tx.taxAmount || 0,
    Total: tx.totalAmount || 0,
  })), `sales-transactions-${from}-${to}-page-${page}`);

  return (
    <div className="space-y-6 pb-8">
      <FilterBar>
        <div className="flex w-full flex-wrap items-center gap-2.5">
          <label className="relative min-w-[250px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search any order detail…" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
            {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button>}
          </label>
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            <SlidersHorizontal size={15} /> Advanced Filters
            {advancedFilterCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-bold text-indigo-700">{advancedFilterCount}</span>}
            <ChevronDown size={14} className={clsx('transition-transform', showAdvanced && 'rotate-180')} />
          </button>
          {(search || advancedFilterCount > 0) && (
            <button type="button" onClick={() => { setSearch(''); clearAdvancedFilters(); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <X size={14} /> Clear all
            </button>
          )}
          <ExportButton onClick={handleExport} disabled={!rows.length} />
        </div>

        {showAdvanced && (
          <div className="w-full space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Business day range</p>
              <DateRangePicker from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect options={[{ value: '', label: 'All outlets' }, ...outlets.map((item) => ({ value: item._id, label: item.name, meta: item.code || '' }))]} value={outlet} onChange={setOutlet} searchPlaceholder="Search outlets…" />
              <SearchableSelect options={STATUS_OPTIONS} value={status} onChange={setStatus} />
              <SearchableSelect options={PAYMENT_OPTIONS} value={paymentMethod} onChange={setPaymentMethod} />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect options={DISCOUNT_OPTIONS} value={discountState} onChange={setDiscountState} />
              <SearchableSelect options={WASTE_OPTIONS} value={wasteState} onChange={setWasteState} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Minimum total</span>
                <input type="number" min="0" step="0.01" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} placeholder="Rs. 0.00" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Maximum total</span>
                <input type="number" min="0" step="0.01" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} placeholder="No maximum" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sort by</span>
                <SearchableSelect options={SORT_OPTIONS} value={sort} onChange={setSort} searchable={false} />
              </label>
            </div>
          </div>
        )}
      </FilterBar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="All orders" value={summary.total || 0} sub="Matching filters" icon={ReceiptText} color="indigo" />
        <StatCard label="Completed" value={summary.completed || 0} sub={`Rs. ${fmt(summary.grossAmount)}`} icon={ShoppingBag} color="emerald" />
        <StatCard label="Refunded" value={summary.refunded || 0} sub={`Rs. ${fmt(summary.refundAmount)}`} icon={Wallet} color="rose" />
        <StatCard label="Cancelled" value={summary.voided || 0} sub="Voided orders" icon={X} color="slate" />
        <StatCard label="Net sales" value={`Rs. ${fmt(summary.netAmount)}`} sub="Completed less refunds" icon={Banknote} color="blue" highlight />
      </div>

      {isLoading ? <ReportSkeleton rows={8} cols={9} /> : !rows.length ? <ReportEmpty message="No sales transactions match these filters." /> : (
        <ReportCard className={isFetching ? 'opacity-70' : ''}>
          <ReportSectionHeader icon={ReceiptText} title="Sales Transactions" subtitle={`${from} to ${to} · Click an order to view its full detail`} right={<span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">{pagination.total} orders</span>} />
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full text-sm">
              <ReportThead headers={['Order #', 'Business Date', 'Time', 'Outlet', 'Cashier', 'Customer', 'Payment', 'Status', { label: 'Items', align: 'right' }, { label: 'Total', align: 'right' }]} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((tx) => (
                  <tr key={tx._id} onClick={() => setSelected(tx)} className="cursor-pointer transition-colors hover:bg-indigo-50/50" title="View order details">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-indigo-600">{tx.transactionNumber || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{tx.businessDate || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{tx.createdAt ? format(new Date(tx.createdAt), 'h:mm a') : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{tx.outletName || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{tx.cashierName || '—'}</td>
                    <td className="max-w-[170px] px-4 py-3 text-slate-600"><span className="block truncate">{tx.customerName || '—'}</span></td>
                    <td className="whitespace-nowrap px-4 py-3"><span className="inline-flex items-center gap-1.5 capitalize text-slate-600"><PaymentIcon method={tx.paymentMethod} />{humanize(tx.paymentMethod)}</span></td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold capitalize', STATUS_STYLES[tx.status] || 'bg-slate-100 text-slate-600')}>{humanize(tx.status)}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{tx.itemCount || 0}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-slate-900">Rs. {fmt(tx.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">Page {pagination.page} of {pagination.pages} · {pagination.total} orders</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || isFetching} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={14} /> Previous</button>
              <button type="button" onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))} disabled={page >= pagination.pages || isFetching} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next <ChevronRight size={14} /></button>
            </div>
          </div>
        </ReportCard>
      )}

      <SalesTransactionDrawer order={selected} onClose={closeDrawer} />
    </div>
  );
};

export default SalesTransactions;
