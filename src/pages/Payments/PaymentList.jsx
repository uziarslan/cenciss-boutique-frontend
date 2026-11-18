import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useGetVendorsQuery, useGetOutletsQuery, useGetPaymentsQuery, listQueryOpts, baseApi } from '../../store/baseApi';
import { useDispatch } from 'react-redux';
import usePagination from '../../hooks/usePagination';
import usePermissions from '../../hooks/usePermissions';
import Table from '../../components/UI/Table';
import Pagination from '../../components/UI/Pagination';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import Card from '../../components/UI/Card';
import ConfirmModal from '../../components/UI/ConfirmModal';
import DateRangePicker from '../../components/UI/DateRangePicker';
import { ChevronDown, CreditCard, Pencil, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import PurchaseTabs from '../Purchases/PurchaseTabs';
import { reversePayment, updatePayment } from '../../api/paymentApi';
import useQueryState from '../../hooks/useQueryState';

const METHOD_LABEL = {
  bankTransfer: 'Bank Transfer',
  cash:         'Cash',
  cheque:       'Cheque',
  creditCard:   'Credit Card',
};
const METHOD_OPTIONS = [
  { value: '', label: 'All methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'bankTransfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'creditCard', label: 'Credit card' },
];
const EDIT_METHOD_OPTIONS = METHOD_OPTIONS.filter((option) => option.value);
const REFERENCE_OPTIONS = [
  { value: '', label: 'Any payment reference' },
  { value: 'withReference', label: 'Has payment reference' },
  { value: 'withoutReference', label: 'Missing payment reference' },
];
const PURCHASE_STATE_OPTIONS = [
  { value: '', label: 'Any purchase balance' },
  { value: 'outstanding', label: 'Purchase still outstanding' },
  { value: 'settled', label: 'Purchase paid in full' },
];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest payments' },
  { value: 'oldest', label: 'Oldest payments' },
  { value: 'amountHigh', label: 'Highest amount' },
  { value: 'amountLow', label: 'Lowest amount' },
];
const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const Metric = ({ label, value, tone = 'slate', note }) => {
  const tones = {
    slate: 'border-slate-200',
    indigo: 'border-indigo-200 bg-indigo-50/30',
    emerald: 'border-emerald-200 bg-emerald-50/30',
    amber: 'border-amber-200 bg-amber-50/30',
    cyan: 'border-cyan-200 bg-cyan-50/30',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
};

const PaymentList = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const refId = searchParams.get('ref') || '';
  const { has } = usePermissions();
  const canEdit = has('payments.edit');
  const canDelete = has('payments.delete');

  const { data: vendors = [] } = useGetVendorsQuery();
  const { data: outlets = [] } = useGetOutletsQuery();
  const [vendorId, setVendorId] = useQueryState('vendor', '');
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const [dateFrom, setDateFrom] = useQueryState('from', '');
  const [dateTo, setDateTo] = useQueryState('to', '');
  const [search, setSearch] = useQueryState('search', '');
  const [method, setMethod] = useState('');
  const [minAmount, setMinAmount] = useQueryState('minAmount', '');
  const [maxAmount, setMaxAmount] = useQueryState('maxAmount', '');
  const [referenceState, setReferenceState] = useQueryState('referenceState', '');
  const [purchaseState, setPurchaseState] = useQueryState('purchaseState', '');
  const [sort, setSort] = useQueryState('sort', 'newest');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // payment object
  const [deleting,      setDeleting]      = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [editingPayment, setEditingPayment] = useState(null);
  const [editedPaymentDate, setEditedPaymentDate] = useState('');
  const [editedPaymentMethod, setEditedPaymentMethod] = useState('cash');
  const [savingPayment, setSavingPayment] = useState(false);

  const pagination = usePagination(25);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const reason = deleteReason.trim();
    if (reason.length < 5) {
      toast.error('Enter a reversal reason of at least 5 characters.');
      return;
    }
    setDeleting(true);
    try {
      await reversePayment(pendingDelete._id, reason);
      dispatch(baseApi.util.invalidateTags(['Payment', 'Purchase', 'Accounting']));
      toast.success('Payment reversed; the original record was retained.');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Delete failed.');
    } finally {
      setDeleting(false);
      setPendingDelete(null);
      setDeleteReason('');
    }
  };

  const openPaymentEditor = (payment) => {
    setEditingPayment(payment);
    setEditedPaymentDate(format(new Date(payment.paymentDate), 'yyyy-MM-dd'));
    setEditedPaymentMethod(payment.method || 'cash');
  };

  const savePayment = async () => {
    if (!editingPayment || !editedPaymentDate || !editedPaymentMethod) return;
    setSavingPayment(true);
    try {
      await updatePayment(editingPayment._id, {
        paymentDate: editedPaymentDate,
        method: editedPaymentMethod,
      });
      dispatch(baseApi.util.invalidateTags(['Payment', 'Purchase', 'Accounting']));
      toast.success('Payment date and method updated on the same payment and journal entry.');
      setEditingPayment(null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Payment could not be updated.');
    } finally {
      setSavingPayment(false);
    }
  };

  const queryParams = useMemo(() => ({
    page:   pagination.page,
    limit:  pagination.pageSize,
    vendor: vendorId || undefined,
    outlet: outlet   || undefined,
    from:   dateFrom || undefined,
    to:     dateTo   || undefined,
    search: search || undefined,
    method: method || undefined,
    minAmount: minAmount || undefined,
    maxAmount: maxAmount || undefined,
    referenceState: referenceState || undefined,
    purchaseState: purchaseState || undefined,
    sort,
  }), [pagination.page, pagination.pageSize, vendorId, outlet, dateFrom, dateTo, search, method, minAmount, maxAmount, referenceState, purchaseState, sort]);

  const { data: payload, isLoading: loading } = useGetPaymentsQuery(queryParams, listQueryOpts);
  const payments = useMemo(() => payload?.payments ?? [], [payload]);

  useEffect(() => {
    if (payload?.total != null) pagination.setTotal(payload.total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  useEffect(() => { pagination.reset(); }, [vendorId, outlet, dateFrom, dateTo, search, method, minAmount, maxAmount, referenceState, purchaseState, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    {
      key: 'paymentDate',
      header: 'Payment',
      render: (value, row) => (
        <div className="min-w-[145px]">
          <p className="font-mono text-xs font-bold text-indigo-600">{row.reference || `PAY-${String(row._id).slice(-6).toUpperCase()}`}</p>
          <p className="mt-1 text-xs text-slate-400">{value ? format(new Date(value), 'dd MMM yyyy') : 'No date'}</p>
        </div>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor / bill',
      render: (value, row) => (
        <div className="min-w-[165px]">
          <p className="font-semibold text-slate-800">{value?.name || row.purchase?.vendorName || 'Direct purchase'}</p>
          <p className="font-mono text-xs text-slate-400">{row.purchase?.vendorInvoiceNumber || 'No vendor bill #'}</p>
        </div>
      ),
    },
    {
      key: 'purchase',
      header: 'Purchase / items',
      render: (value) => value ? (
        <div className="min-w-[220px]">
          <button onClick={(event) => { event.stopPropagation(); navigate(`/purchases/${value._id ?? value}`); }} className="font-mono text-xs font-bold text-indigo-600 hover:underline">{value.purchaseNumber ?? '—'}</button>
          <p className="mt-1 font-medium text-slate-700">{value.itemSummary || 'Purchase'}</p>
          <p className="text-xs text-slate-400">{value.lines?.length || 0} purchased line{value.lines?.length === 1 ? '' : 's'}</p>
        </div>
      ) : <span className="text-slate-400">Legacy payment without purchase</span>,
    },
    {
      key: 'amount',
      header: 'Paid / remaining',
      render: (value, row) => {
        const remaining = Math.max(0, Number(row.purchase?.totalAmount || 0) - Number(row.purchase?.amountPaid || 0));
        return (
          <div className="min-w-[145px] text-right">
            <p className="font-bold text-emerald-700">{money(value)}</p>
            <p className={remaining ? 'text-xs font-medium text-rose-600' : 'text-xs font-medium text-emerald-600'}>
              {remaining ? `${money(remaining)} still due` : 'Paid in full'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'method',
      header: 'Method / reference',
      render: (value, row) => (
        <div className="min-w-[145px]">
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {METHOD_LABEL[value] ?? value ?? '—'}
          </span>
          <p className="mt-1 font-mono text-xs text-slate-400">{row.reference || 'No reference'}</p>
        </div>
      ),
    },
    {
      key: 'recordedBy',
      header: 'Recorded / journal',
      render: (value, row) => (
        <div className="min-w-[145px]">
          <p className="text-sm font-medium text-slate-700">{value?.name ?? value?.email ?? '—'}</p>
          <p className="font-mono text-xs text-slate-400">{row.journalEntryId?.entryNumber || 'No journal link'}</p>
        </div>
      ),
    },
    ...((canEdit || canDelete) ? [{
      key:    '_actions',
      header: '',
      render: (_, row) => (
        row.status !== 'reversed' && (
          <div className="flex items-center justify-end gap-1">
            {canEdit && (
              <button
                onClick={(event) => { event.stopPropagation(); openPaymentEditor(row); }}
                className="rounded-lg p-1.5 text-indigo-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                title="Edit payment"
              >
                <Pencil size={14} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={(event) => { event.stopPropagation(); setDeleteReason(''); setPendingDelete(row); }}
                className="rounded-lg p-1.5 text-red-400 transition hover:bg-red-50 hover:text-red-600"
                title="Reverse payment"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )
      ),
    }] : []),
  ];

  const advancedFilterCount = [
    method,
    vendorId,
    outlet,
    dateFrom || dateTo,
    minAmount || maxAmount,
    referenceState,
    purchaseState,
    sort !== 'newest',
  ].filter(Boolean).length;
  const activeFilterCount = advancedFilterCount + (search ? 1 : 0);

  const clearFilters = () => {
    setSearch('');
    setMethod('');
    setVendorId('');
    setOutlet('');
    setDateFrom('');
    setDateTo('');
    setMinAmount('');
    setMaxAmount('');
    setReferenceState('');
    setPurchaseState('');
    setSort('newest');
  };

  const fmtPKR = (n) => `Rs. ${Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
  const summary = payload?.summary ?? {};

  return (
    <div className="space-y-5">
      <HeroBanner
        icon={CreditCard}
        eyebrow="Purchases"
        title="Payments"
        subtitle="Every vendor payment linked directly to the purchase and its journal trail."
        accent="emerald"
      />

      <PurchaseTabs />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Total paid" value={money(summary.totalPaid)} tone="emerald" note="Posted vendor payments" />
        <Metric label="Transactions" value={pagination.total} tone="cyan" note="Match current filters" />
        <Metric label="Cash paid" value={money(summary.cashAmount)} tone="amber" note={`${summary.cash || 0} payment(s)`} />
        <Metric label="Non-cash paid" value={money(summary.digitalAmount)} tone="indigo" note={`${(summary.bankTransfer || 0) + (summary.cheque || 0) + (summary.creditCard || 0)} payment(s)`} />
        <Metric label="Bank / card / cheque" value={`${summary.bankTransfer || 0} / ${summary.creditCard || 0} / ${summary.cheque || 0}`} note="Payment count by method" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[260px] flex-1">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search payment, purchase, vendor, or bill…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            <SlidersHorizontal size={15} />
            Advanced filters
            {advancedFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-bold text-indigo-700">
                {advancedFilterCount}
              </span>
            )}
            <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <X size={14} /> Clear all {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
            </button>
          )}
          <p className="text-xs text-slate-400">{payload?.total || 0} matching payment{payload?.total === 1 ? '' : 's'}</p>
        </div>

        {showAdvanced && (
          <div className="mt-3 space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <SearchableSelect
                options={METHOD_OPTIONS}
                value={method}
                onChange={setMethod}
                searchPlaceholder="Search methods…"
              />
              <SearchableSelect
                options={[{ value: '', label: 'All vendors' }, ...vendors.map((v) => ({ value: v._id, label: v.name, meta: v.code || '' }))]}
                value={vendorId}
                onChange={setVendorId}
                searchPlaceholder="Search vendors…"
              />
              <SearchableSelect
                options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
                value={outlet}
                onChange={setOutlet}
                searchPlaceholder="Search outlets…"
              />
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment date</p>
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect options={REFERENCE_OPTIONS} value={referenceState} onChange={setReferenceState} />
              <SearchableSelect options={PURCHASE_STATE_OPTIONS} value={purchaseState} onChange={setPurchaseState} />
              <SearchableSelect options={SORT_OPTIONS} value={sort} onChange={setSort} />
              <div className="hidden xl:block" />
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Minimum payment</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minAmount}
                  onChange={(event) => setMinAmount(event.target.value)}
                  placeholder="Rs. 0.00"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Maximum payment</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={maxAmount}
                  onChange={(event) => setMaxAmount(event.target.value)}
                  placeholder="No maximum"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </label>
            </div>
          </div>
        )}
      </Card>

      <Card padding={false}>
        <Table
          columns={columns}
          data={payments}
          loading={loading}
          emptyMessage="No payments found."
          rowClassName={(row) => refId && row._id === refId ? 'bg-amber-50 ring-1 ring-inset ring-amber-300' : ''}
          onRowClick={(row) => setExpandedId((current) => current === row._id ? null : row._id)}
          isRowExpanded={(row) => expandedId === row._id}
          expandedRowRender={(row) => (
            <div>
              <div className="mb-3 grid gap-3 sm:grid-cols-4">
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment amount</p><p className="font-semibold text-slate-800">{fmtPKR(row.amount)}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Method</p><p className="font-medium text-slate-700">{METHOD_LABEL[row.method] ?? row.method ?? '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reference</p><p className="font-mono text-sm text-slate-700">{row.reference || 'Not provided'}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recorded by</p><p className="font-medium text-slate-700">{row.recordedBy?.name ?? row.recordedBy?.email ?? '—'}</p></div>
              </div>
              {row.purchase?.lines?.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <div className="grid grid-cols-[minmax(200px,1fr)_90px_120px_130px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"><span>Purchased item</span><span>Quantity</span><span>Unit price</span><span>Line total</span></div>
                {row.purchase.lines.map((line, index) => <div key={line._id ?? index} className="grid grid-cols-[minmax(200px,1fr)_90px_120px_130px] gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-0"><div><p className="font-medium text-slate-800">{line.product?.name ?? line.productName ?? line.description ?? 'Unnamed item'}</p><p className="text-xs text-slate-400">{line.product?.sku ?? ''}</p></div><span>{line.qty ?? 0}</span><span>{fmtPKR(line.unitPrice)}</span><span className="font-semibold">{fmtPKR(line.lineTotal)}</span></div>)}
              </div>}
            </div>
          )}
          bare
        />
      </Card>
      <Pagination {...pagination} />

      {pendingDelete && (
        <ConfirmModal
          isOpen
          title="Reverse Payment"
          message={`Reverse payment of Rs. ${(pendingDelete.amount ?? 0).toFixed(2)} via ${METHOD_LABEL[pendingDelete.method] ?? pendingDelete.method}? The purchase balance will be restored and the original record retained.`}
          confirmLabel="Continue"
          variant="danger"
          isLoading={deleting}
          onConfirm={handleDelete}
          onCancel={() => { setPendingDelete(null); setDeleteReason(''); }}
        >
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
            Reversal reason
            <textarea
              autoFocus
              rows={3}
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder="Explain why this payment is being reversed…"
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
          isLoading={savingPayment}
          onConfirm={savePayment}
          onCancel={() => { if (!savingPayment) setEditingPayment(null); }}
        >
          <div className="space-y-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Payment method
              <div className="mt-2"><SearchableSelect searchable={false} options={EDIT_METHOD_OPTIONS} value={editedPaymentMethod} onChange={setEditedPaymentMethod} /></div>
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Payment date
              <input
                required
                type="date"
                max={format(new Date(), 'yyyy-MM-dd')}
                value={editedPaymentDate}
                onChange={(event) => setEditedPaymentDate(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          </div>
        </ConfirmModal>
      )}
    </div>
  );
};

export default PaymentList;
