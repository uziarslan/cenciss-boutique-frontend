import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { format } from 'date-fns';
import { ChevronDown, Plus, Search, ShoppingCart, SlidersHorizontal, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { deletePurchase, getPurchases } from '../../api/purchaseApi';
import { useGetOutletsQuery, useGetVendorsQuery } from '../../store/baseApi';
import usePermissions from '../../hooks/usePermissions';
import usePagination from '../../hooks/usePagination';
import HeroBanner from '../../components/UI/HeroBanner';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import Pagination from '../../components/UI/Pagination';
import SearchableSelect from '../../components/UI/SearchableSelect';
import StatusChip from '../../components/UI/StatusChip';
import ConfirmModal from '../../components/UI/ConfirmModal';
import DateRangePicker from '../../components/UI/DateRangePicker';
import PurchaseTabs from './PurchaseTabs';
import { useQueryFilters } from '../../hooks/useQueryState';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const STATUSES = [
  ['', 'All statuses'],
  ['draft', 'Draft'],
  ['pendingApproval', 'Pending approval'],
  ['open', 'Open'],
  ['partiallyPaid', 'Partially paid'],
  ['paid', 'Paid'],
  ['disputed', 'Disputed'],
  ['corrected', 'Corrected'],
  ['migrationReview', 'Migration review'],
  ['reversed', 'Reversed'],
].map(([value, label]) => ({ value, label }));
const PAYABLE_STATUSES = ['open', 'partiallyPaid', 'corrected', 'migrationReview'];

const TYPE_OPTIONS = [
  { value: '', label: 'All purchase types' },
  { value: 'stock', label: 'Stock purchases' },
  { value: 'expense', label: 'Direct expenses' },
  { value: 'mixed', label: 'Mixed purchases' },
];
const DESTINATION_OPTIONS = [
  { value: '', label: 'All destinations' },
  { value: 'store', label: 'Raw materials' },
  { value: 'none', label: 'No inventory destination' },
];
const PAYMENT_OPTIONS = [
  { value: '', label: 'Any payment state' },
  { value: 'outstanding', label: 'Any outstanding balance' },
  { value: 'unpaid', label: 'Completely unpaid' },
  { value: 'partial', label: 'Partially paid' },
  { value: 'settled', label: 'Paid in full' },
];
const DUE_OPTIONS = [
  { value: '', label: 'Any due date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'next7', label: 'Due in next 7 days' },
  { value: 'hasDueDate', label: 'Has a due date' },
  { value: 'noDueDate', label: 'No due date' },
];
const BILL_OPTIONS = [
  { value: '', label: 'Any vendor bill #' },
  { value: 'withBill', label: 'Has vendor bill #' },
  { value: 'withoutBill', label: 'Missing vendor bill #' },
];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest purchases' },
  { value: 'oldest', label: 'Oldest purchases' },
  { value: 'amountHigh', label: 'Highest amount' },
  { value: 'amountLow', label: 'Lowest amount' },
];

const EMPTY_FILTERS = {
  search: '', status: '', vendor: '', outlet: '', from: '', to: '', type: '',
  destination: '', paymentState: '', dueState: '', billState: '', minAmount: '',
  maxAmount: '', sort: 'newest',
};

const Metric = ({ label, value, tone = 'slate', note }) => {
  const tones = {
    slate: 'border-slate-200',
    indigo: 'border-indigo-200 bg-indigo-50/30',
    emerald: 'border-emerald-200 bg-emerald-50/30',
    amber: 'border-amber-200 bg-amber-50/30',
    rose: 'border-rose-200 bg-rose-50/30',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
};

const PurchaseList = () => {
  const navigate = useNavigate();
  const { has } = usePermissions();
  const canDelete = has('purchases.delete');
  const pagination = usePagination(20);
  const { data: vendors = [] } = useGetVendorsQuery();
  const { data: outlets = [] } = useGetOutletsQuery();
  const [payload, setPayload] = useState({ purchases: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [filters, setFilters] = useQueryFilters(EMPTY_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateFilter = (key, value) => {
    pagination.reset();
    setFilters((old) => ({ ...old, [key]: value }));
  };

  const advancedFilterCount = useMemo(() => [
    filters.status,
    filters.vendor,
    filters.outlet,
    filters.from || filters.to,
    filters.type,
    filters.destination,
    filters.paymentState,
    filters.dueState,
    filters.billState,
    filters.minAmount || filters.maxAmount,
    filters.sort !== 'newest',
  ].filter(Boolean).length, [filters]);

  const activeFilterCount = useMemo(
    () => advancedFilterCount + (filters.search ? 1 : 0),
    [advancedFilterCount, filters.search],
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    getPurchases({
      page: pagination.page,
      limit: pagination.pageSize,
      ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
    })
      .then(({ data }) => {
        if (!live) return;
        const next = data.data || {};
        setPayload(next);
        pagination.setTotal(next.total || 0);
      })
      .catch((error) => toast.error(error.response?.data?.message || 'Failed to load purchases.'))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.pageSize, filters, refreshToken]);

  const requestDelete = (row, event) => {
    event.stopPropagation();
    setDeleteReason('');
    setDeleteTarget(row);
  };

  const remove = async () => {
    const reason = deleteReason.trim();
    if (!deleteTarget || reason.length < 5) {
      toast.error('Enter a deletion reason of at least 5 characters.');
      return;
    }
    setDeletingId(deleteTarget._id);
    try {
      await deletePurchase(deleteTarget._id, reason);
      toast.success('Purchase removed from operational lists.');
      setDeleteTarget(null);
      setDeleteReason('');
      setRefreshToken((value) => value + 1);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Purchase could not be removed.');
    } finally {
      setDeletingId('');
    }
  };

  const columns = useMemo(() => [
    {
      key: 'purchaseNumber',
      header: 'Purchase',
      render: (value, row) => (
        <div className="min-w-[145px]">
          <Link
            to={`/purchases/${row._id}`}
            onClick={(event) => event.stopPropagation()}
            className="font-mono text-xs font-bold text-indigo-600 hover:underline"
          >
            {value}
          </Link>
          <p className="mt-1 text-xs text-slate-400">{format(new Date(row.purchaseDate), 'dd MMM yyyy')}</p>
        </div>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor / bill',
      render: (value, row) => (
        <div className="min-w-[170px]">
          <p className="font-semibold text-slate-800">{row.vendor?.name || value || 'Direct purchase'}</p>
          <p className="font-mono text-xs text-slate-400">{row.vendorInvoiceNumber || 'No vendor bill #'}</p>
        </div>
      ),
    },
    {
      key: 'itemSummary',
      header: 'Items / purpose',
      render: (value, row) => (
        <div className="min-w-[220px]">
          <p className="font-medium text-slate-800">{value}</p>
          <p className="mt-1 text-xs text-slate-400">
            {row.type === 'stock'
              ? 'Raw materials → outlet stock'
              : row.type === 'mixed'
                ? 'Mixed inventory / expense / asset bill'
                : 'Direct expense · no inventory'}
            {' · '}{row.lines?.length || 0} line{row.lines?.length === 1 ? '' : 's'}
          </p>
        </div>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Total / balance',
      render: (value, row) => {
        const payable = PAYABLE_STATUSES.includes(row.status);
        const balance = payable ? Math.max(0, Number(value) - Number(row.amountPaid)) : 0;
        return (
          <div className="min-w-[145px] text-right">
            <p className="font-bold text-slate-900">{money(value)}</p>
            <p className={balance ? 'text-xs font-medium text-rose-600' : 'text-xs font-medium text-slate-400'}>
              {['draft', 'pendingApproval'].includes(row.status)
                ? 'Not posted · no balance'
                : row.status === 'reversed'
                  ? 'Reversed · no balance'
                  : balance
                    ? `${money(balance)} due`
                    : 'Paid in full'}
            </p>
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', render: (value) => <StatusChip status={value} /> },
    ...(canDelete ? [{
      key: '_actions',
      header: '',
      render: (_, row) => (
        ['draft', 'pendingApproval', 'reversed'].includes(row.status)
      ) ? (
        <button
          type="button"
          disabled={deletingId === row._id}
          onClick={(event) => requestDelete(row, event)}
          title="Delete purchase"
          className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
        >
          <Trash2 size={15} />
        </button>
      ) : null,
    }] : []),
  ], [canDelete, deletingId]);

  const summary = payload.summary || {};
  return (
    <div className="space-y-5">
      <HeroBanner
        icon={ShoppingCart}
        eyebrow="Purchasing"
        title="Purchases"
        subtitle="One document for goods received, the vendor bill, stock, accounting, and payment."
        actions={has('purchases.create') && (
          <Button icon={Plus} onClick={() => navigate('/purchases/new')}>New purchase</Button>
        )}
      />
      <PurchaseTabs />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Purchased" value={money(summary.total)} tone="indigo" />
        <Metric label="Paid" value={money(summary.paid)} tone="emerald" />
        <Metric label="Outstanding" value={money(summary.open)} tone="rose" />
        <Metric label="Drafts" value={summary.drafts || 0} tone="amber" />
        <Metric
          label={summary.review ? 'Migration review' : 'Reversed'}
          value={summary.review || summary.reversed || 0}
          note={summary.review ? 'Needs owner review' : 'No amount due'}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[260px] flex-1">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder="Search purchase, bill, vendor, or goods…"
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
              onClick={() => { pagination.reset(); setFilters(EMPTY_FILTERS); }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <X size={14} /> Clear all {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
            </button>
          )}
          <p className="ml-auto text-xs text-slate-400">
            {payload.total || 0} matching purchase{payload.total === 1 ? '' : 's'}
          </p>
        </div>

        {showAdvanced && (
          <div className="mt-3 space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <SearchableSelect
                options={STATUSES}
                value={filters.status}
                onChange={(value) => updateFilter('status', value)}
              />
              <SearchableSelect
                options={[{ value: '', label: 'All vendors' }, ...vendors.map((vendor) => ({ value: vendor._id, label: vendor.name }))]}
                value={filters.vendor}
                onChange={(value) => updateFilter('vendor', value)}
              />
              <SearchableSelect
                options={[{ value: '', label: 'All outlets' }, ...outlets.map((outlet) => ({ value: outlet._id, label: outlet.name }))]}
                value={filters.outlet}
                onChange={(value) => updateFilter('outlet', value)}
              />
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Purchase date</p>
              <DateRangePicker
                from={filters.from}
                to={filters.to}
                onChange={(from, to) => {
                  pagination.reset();
                  setFilters((old) => ({ ...old, from, to }));
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect options={TYPE_OPTIONS} value={filters.type} onChange={(value) => updateFilter('type', value)} />
              <SearchableSelect options={DESTINATION_OPTIONS} value={filters.destination} onChange={(value) => updateFilter('destination', value)} />
              <SearchableSelect options={PAYMENT_OPTIONS} value={filters.paymentState} onChange={(value) => updateFilter('paymentState', value)} />
              <SearchableSelect options={DUE_OPTIONS} value={filters.dueState} onChange={(value) => updateFilter('dueState', value)} />
              <SearchableSelect options={BILL_OPTIONS} value={filters.billState} onChange={(value) => updateFilter('billState', value)} />
              <SearchableSelect options={SORT_OPTIONS} value={filters.sort} onChange={(value) => updateFilter('sort', value)} />
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Minimum amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.minAmount}
                  onChange={(event) => updateFilter('minAmount', event.target.value)}
                  placeholder="Rs. 0.00"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Maximum amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.maxAmount}
                  onChange={(event) => updateFilter('maxAmount', event.target.value)}
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
          data={payload.purchases || []}
          loading={loading}
          emptyMessage="No purchases match these filters."
          onRowClick={(row) => navigate(`/purchases/${row._id}`)}
          bare
        />
      </Card>
      <Pagination {...pagination} />

      {deleteTarget && (
        <ConfirmModal
          isOpen
          title={`Delete ${deleteTarget.purchaseNumber}?`}
          message="This removes the draft/reversed purchase from operational lists. Its audit history remains available."
          confirmLabel="Delete purchase"
          isLoading={deletingId === deleteTarget._id}
          onConfirm={remove}
          onCancel={() => { setDeleteTarget(null); setDeleteReason(''); }}
        >
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
            Reason
            <textarea
              autoFocus
              rows={3}
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder="Explain why this purchase is being deleted…"
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
          </label>
        </ConfirmModal>
      )}
    </div>
  );
};

export default PurchaseList;
