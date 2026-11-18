import { useState, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { Plus, Search, Eye, Pencil, Trash2, Building2, CheckCircle2, Clock, AlertOctagon } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { deleteVendor } from '../../api/vendorApi';
import { baseApi, useGetVendorsListQuery, listQueryOpts } from '../../store/baseApi';
import useDebounce from '../../hooks/useDebounce';
import usePagination from '../../hooks/usePagination';
import useAuth from '../../hooks/useAuth';
import usePermissions from '../../hooks/usePermissions';
import Table from '../../components/UI/Table';
import StatusChip from '../../components/UI/StatusChip';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import Button from '../../components/UI/Button';
import ConfirmModal from '../../components/UI/ConfirmModal';
import Pagination from '../../components/UI/Pagination';
import useQueryState from '../../hooks/useQueryState';

const CATEGORIES = ['', 'Produce', 'Meat', 'Seafood', 'Dairy', 'Bakery', 'Beverages', 'Dry Goods', 'Cleaning', 'Packaging', 'Other'];
const STATUS_OPTIONS = [
  { value: '',         label: 'All statuses' },
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'onHold',   label: 'On Hold' },
];

// Soft white stat tile — mirrors the dashboard's ingredient-KPI row.
const StatCard = ({ label, value, icon: Icon, color, bg, loading }) => (
  <div className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
    <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', bg)}>
      <Icon size={16} className={color} />
    </div>
    <div className="min-w-0">
      <p className={clsx('text-xl font-bold leading-tight tabular-nums', color)}>
        {loading ? '…' : (value ?? 0)}
      </p>
      <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-widest">{label}</p>
    </div>
  </div>
);

const VendorList = () => {
  const navigate  = useNavigate();
  const dispatch  = useDispatch();
  useAuth(); // keep hook order stable; permission lookups go through usePermissions
  const { has } = usePermissions();
  // Gate every mutation button on the explicit permission key. View-only
  // users (those with vendors.manage = false) see no Add / Edit / Delete UI.
  const canWrite  = has('vendors.manage');
  const canDelete = has('vendors.manage');

  const [search, setSearch] = useQueryState('search', '');
  const [status, setStatus] = useQueryState('status', '');
  const [category, setCategory] = useQueryState('category', '');
  const [currency, setCurrency] = useQueryState('currency', '');
  const [contactState, setContactState] = useQueryState('contactState', '');
  const [minPaymentTerms, setMinPaymentTerms] = useQueryState('minPaymentTerms', '');
  const [maxPaymentTerms, setMaxPaymentTerms] = useQueryState('maxPaymentTerms', '');
  const [minCreditLimit, setMinCreditLimit] = useQueryState('minCreditLimit', '');
  const [maxCreditLimit, setMaxCreditLimit] = useQueryState('maxCreditLimit', '');
  const [sort, setSort] = useQueryState('sort', 'newest');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const pagination      = usePagination(20);

  const queryParams = useMemo(() => ({
    page:     pagination.page,
    limit:    pagination.pageSize,
    search:   debouncedSearch || undefined,
    status:   status   || undefined,
    category: category || undefined,
    currency: currency || undefined,
    contactState: contactState || undefined,
    minPaymentTerms: minPaymentTerms || undefined,
    maxPaymentTerms: maxPaymentTerms || undefined,
    minCreditLimit: minCreditLimit || undefined,
    maxCreditLimit: maxCreditLimit || undefined,
    sortBy: ({ newest: 'createdAt', oldest: 'createdAt', name: 'name', termsHigh: 'paymentTerms', creditHigh: 'creditLimit' })[sort],
    sortOrder: ['oldest', 'name'].includes(sort) ? 'asc' : 'desc',
  }), [pagination.page, pagination.pageSize, debouncedSearch, status, category, currency, contactState, minPaymentTerms, maxPaymentTerms, minCreditLimit, maxCreditLimit, sort]);

  const { data: payload, isLoading: loading } = useGetVendorsListQuery(queryParams, listQueryOpts);
  const vendors = useMemo(() => payload?.vendors ?? [], [payload]);
  const total = payload?.total;

  useEffect(() => {
    if (total != null) pagination.setTotal(total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Reset to page 1 when filters change
  useEffect(() => { pagination.reset(); }, [debouncedSearch, status, category, currency, contactState, minPaymentTerms, maxPaymentTerms, minCreditLimit, maxCreditLimit, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteVendor(deleteTarget._id);
      toast.success(`${deleteTarget.name} deactivated.`);
      setDeleteTarget(null);
      dispatch(baseApi.util.invalidateTags(['Vendor']));
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to deactivate vendor.');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: 'code',    header: 'Code',     className: 'font-mono text-xs' },
    { key: 'name',    header: 'Name',     render: (v, row) => (
      <button
        onClick={() => navigate(`/vendors/${row._id}`)}
        className="font-medium text-indigo-600 hover:underline text-left"
      >
        {v}
      </button>
    )},
    { key: 'category',     header: 'Category' },
    { key: 'contactName',  header: 'Contact' },
    { key: 'paymentTerms', header: 'Terms', render: (v) => v != null ? `${v} days` : '—' },
    { key: 'status',       header: 'Status', render: (v) => <StatusChip status={v} /> },
    {
      key: '_actions',
      header: '',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/vendors/${row._id}`)}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
            title="View"
          >
            <Eye size={15} />
          </button>
          {canWrite && (
            <button
              onClick={() => navigate(`/vendors/${row._id}/edit`)}
              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
              title="Edit"
            >
              <Pencil size={15} />
            </button>
          )}
          {canDelete && row.status !== 'inactive' && (
            <button
              onClick={() => setDeleteTarget(row)}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Deactivate"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  // Quick stats from current page
  const activeCount   = vendors.filter((v) => v.status === 'active').length;
  const onHoldCount   = vendors.filter((v) => v.status === 'onHold').length;
  const inactiveCount = vendors.filter((v) => v.status === 'inactive').length;

  return (
    <div className="space-y-6 pb-8">
      {/* Header — quiet, dashboard-style */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage supplier accounts, payment terms, credit limits, and contacts.
          </p>
        </div>
        {canWrite && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => navigate('/vendors/new')}
          >
            Add Vendor
          </Button>
        )}
      </div>

      {/* Stat row — soft white tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total"    value={pagination.total} icon={Building2}     color="text-indigo-600"  bg="bg-indigo-50"  loading={loading} />
        <StatCard label="Active"   value={activeCount}      icon={CheckCircle2}  color="text-emerald-600" bg="bg-emerald-50" loading={loading} />
        <StatCard label="On Hold"  value={onHoldCount}      icon={Clock}         color="text-amber-600"   bg="bg-amber-50"   loading={loading} />
        <StatCard label="Inactive" value={inactiveCount}    icon={AlertOctagon}  color="text-slate-500"   bg="bg-slate-100"  loading={loading} />
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
          />
        </div>

        <div className="min-w-[160px]">
          <SearchableSelect
            options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={status}
            onChange={setStatus}
          />
        </div>

        <div className="min-w-[180px]">
          <SearchableSelect
            options={[
              { value: '', label: 'All categories' },
              ...CATEGORIES.filter(Boolean).map((c) => ({ value: c, label: c })),
            ]}
            value={category}
            onChange={setCategory}
          />
        </div>
        <div className="min-w-[160px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'All currencies' }, ...['PKR', 'USD', 'EUR', 'GBP', 'AED'].map((value) => ({ value, label: value }))]} value={currency} onChange={setCurrency} /></div>
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'Any contact status' }, { value: 'with-email', label: 'Has email' }, { value: 'without-email', label: 'Missing email' }]} value={contactState} onChange={setContactState} /></div>
        <input type="number" min="0" value={minPaymentTerms} onChange={(e) => setMinPaymentTerms(e.target.value)} placeholder="Min payment days" className="w-44 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <input type="number" min="0" value={maxPaymentTerms} onChange={(e) => setMaxPaymentTerms(e.target.value)} placeholder="Max payment days" className="w-44 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <input type="number" min="0" value={minCreditLimit} onChange={(e) => setMinCreditLimit(e.target.value)} placeholder="Min credit limit" className="w-44 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <input type="number" min="0" value={maxCreditLimit} onChange={(e) => setMaxCreditLimit(e.target.value)} placeholder="Max credit limit" className="w-44 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'name', label: 'Vendor name' }, { value: 'termsHigh', label: 'Longest payment terms' }, { value: 'creditHigh', label: 'Highest credit limit' }]} value={sort} onChange={setSort} /></div>
      </FilterBar>

      {/* Table — wrapped in a dashboard-style Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">All Vendors</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? 'Loading…' : `${pagination.total} ${pagination.total === 1 ? 'vendor' : 'vendors'} total`}
            </p>
          </div>
        </div>
        <Table
          columns={columns}
          data={vendors}
          loading={loading}
          emptyMessage="No vendors found. Try adjusting your filters."
          bare
        />
      </div>

      <Pagination {...pagination} />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Deactivate vendor?"
        message={`"${deleteTarget?.name}" will be marked inactive. Active purchases will block this action.`}
        confirmLabel="Deactivate"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default VendorList;
