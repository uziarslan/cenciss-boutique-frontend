import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { Plus, RotateCcw, BookOpen, CheckCircle2, RefreshCcw, Layers, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { reverseJournalEntry, deleteJournalEntry } from '../../api/accountingApi';
import {
  baseApi,
  useGetAdvanceByIdQuery,
  useGetJournalEntriesQuery,
  useGetPaymentByIdQuery,
  useGetPurchaseQuery,
  useGetSalesTransactionByIdQuery,
  listQueryOpts,
} from '../../store/baseApi';
import usePagination from '../../hooks/usePagination';
import usePartyOptions from '../../hooks/usePartyOptions';
import usePermissions from '../../hooks/usePermissions';
import Table from '../../components/UI/Table';
import Pagination from '../../components/UI/Pagination';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import SearchInput from '../../components/UI/SearchInput';
import HeroBanner from '../../components/UI/HeroBanner';
import FilterBar from '../../components/UI/FilterBar';
import Button from '../../components/UI/Button';
import ConfirmModal from '../../components/UI/ConfirmModal';
import JournalEntryForm from './JournalEntryForm';
import { SalesTransactionDrawer } from '../Reports/SalesTransactions';
import { AdvanceDetailDrawer } from '../Salaries/SalaryManager';
import {
  PaymentDetailDrawer,
  PurchaseDetailDrawer,
} from '../../components/Accounting/PurchasePaymentDrawers';
import useQueryState from '../../hooks/useQueryState';

const fmt = (n) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SOURCE_MODULE_OPTIONS = [
  { value: '',           label: 'All modules' },
  { value: 'manual',     label: 'Manual' },
  { value: 'purchase',   label: 'Purchase' },
  { value: 'purchaseAdjustment', label: 'Purchase correction' },
  { value: 'payment',    label: 'Payment' },
  { value: 'inventory',  label: 'Stock inventory' },
  { value: 'waste',      label: 'Waste' },
  { value: 'pos',        label: 'POS' },
  { value: 'stockCount', label: 'Stock Count' },
  { value: 'assetDepreciation', label: 'Asset depreciation' },
  { value: 'assetAuditAdjustment', label: 'Asset audit adjustment' },
  { value: 'assetAcquisition', label: 'Asset acquisition' },
  { value: 'assetDisposal', label: 'Asset disposal' },
  { value: 'allowance',  label: 'Allowance' },
  { value: 'cashDrawer', label: 'Cash Drawer' },
];

const MODULE_COLOR = {
  manual:     'bg-indigo-100 text-indigo-700',
  purchase:   'bg-blue-100 text-blue-700',
  purchaseAdjustment: 'bg-violet-100 text-violet-700',
  payment:    'bg-emerald-100 text-emerald-700',
  inventory:  'bg-purple-100 text-purple-700',
  waste:      'bg-rose-100 text-rose-700',
  pos:        'bg-orange-100 text-orange-700',
  stockCount: 'bg-amber-100 text-amber-700',
  allowance:  'bg-cyan-100 text-cyan-700',
  assetDepreciation: 'bg-fuchsia-100 text-fuchsia-700',
  assetAuditAdjustment: 'bg-rose-100 text-rose-700',
  assetAcquisition: 'bg-violet-100 text-violet-700',
  assetDisposal: 'bg-orange-100 text-orange-700',
};
const SOURCE_CONTROLLED_MODULES = [
  'purchase',
  'purchaseAdjustment',
  'assetDepreciation',
  'assetAuditAdjustment',
  'assetAcquisition',
  'assetDisposal',
];

const JournalEntries = () => {
  const navigate = useNavigate();
  const { has } = usePermissions();
  const dispatch = useDispatch();
  const canManage = has('accounting.journals');
  const canEdit   = has('accounting.editJournalEntry');
  const canDelete = has('accounting.deleteJournalEntry');
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [reversing,  setReversing]  = useState(null);
  const [deleting,   setDeleting]   = useState(null);
  const [saleOrderId, setSaleOrderId] = useState('');
  const { data: saleOrder } = useGetSalesTransactionByIdQuery(saleOrderId, {
    skip: !saleOrderId,
  });
  const [advanceId, setAdvanceId] = useState('');
  const { data: advance } = useGetAdvanceByIdQuery(advanceId, {
    skip: !advanceId,
  });
  const [purchaseId, setPurchaseId] = useState('');
  const { data: purchase } = useGetPurchaseQuery(purchaseId, {
    skip: !purchaseId,
  });
  const [paymentId, setPaymentId] = useState('');
  const { data: payment } = useGetPaymentByIdQuery(paymentId, {
    skip: !paymentId,
  });
  const [dateFrom, setDateFrom] = useQueryState('from', '');
  const [dateTo, setDateTo] = useQueryState('to', '');
  const [srcModule, setSrcModule] = useQueryState('module', '');
  const [search, setSearch] = useQueryState('search', '');
  // Debounce the text search so we don't hit the server on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Party filter — same keys as AP Aging / the Ledger (vendors + saved custom parties).
  const [party, setParty] = useQueryState('party', '');
  const [partyName, setPartyName] = useQueryState('partyName', '');
  const partyOptions = usePartyOptions(party, partyName);
  const onPartyChange = (val) => {
    if (!val) { setParty(''); setPartyName(''); return; }
    setParty(val);
    setPartyName(partyOptions.find((o) => o.value === val)?.label ?? '');
  };

  const pagination = usePagination(25);

  const queryParams = useMemo(() => ({
    page:         pagination.page,
    limit:        pagination.pageSize,
    from:         dateFrom       || undefined,
    to:           dateTo         || undefined,
    sourceModule: srcModule      || undefined,
    search:       debouncedSearch || undefined,
    party:        party           || undefined,
  }), [pagination.page, pagination.pageSize, dateFrom, dateTo, srcModule, debouncedSearch, party]);

  const { data: payload, isLoading: loading } = useGetJournalEntriesQuery(queryParams, listQueryOpts);
  const entries = useMemo(() => payload?.entries ?? [], [payload]);

  useEffect(() => { if (payload?.total != null) pagination.setTotal(payload.total); }, [payload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { pagination.reset(); }, [dateFrom, dateTo, srcModule, debouncedSearch, party]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => dispatch(baseApi.util.invalidateTags(['JournalEntry', 'Accounting', 'Report']));

  const handleReverse = async () => {
    try {
      const { data } = await reverseJournalEntry(reversing._id);
      toast.success(`Reversal entry ${data.data.entryNumber} created.`);
      setReversing(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Reversal failed.');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteJournalEntry(deleting._id);
      toast.success(`Journal entry ${deleting.entryNumber} deleted.`);
      setDeleting(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Delete failed.');
    }
  };

  const columns = [
    {
      key:    'entryNumber',
      header: 'Entry #',
      render: (v) => <span className="font-mono text-xs font-semibold text-indigo-600">{v}</span>,
    },
    {
      key:    'date',
      header: 'Date',
      render: (v) => v ? <span className="text-sm text-gray-700">{format(new Date(v), 'dd MMM yyyy')}</span> : '—',
    },
    {
      key:    'description',
      header: 'Description',
      render: (v, row) => {
        if (row.sourceModule === 'pos' && row.sourceId) {
          const href = `/reports/sales-transactions?order=${row.sourceId}`;
          return (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                setSaleOrderId(String(row.sourceId));
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded max-w-xs truncate block text-left"
              title="Open order details"
            >
              {v}
            </a>
          );
        }
        if (row.sourceModule === 'salaryAdvance' && row.sourceId) {
          const href = `/salaries?tab=advances&advance=${row.sourceId}`;
          return (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                setAdvanceId(String(row.sourceId));
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded max-w-xs truncate block text-left"
              title="Open salary advance details"
            >
              {v}
            </a>
          );
        }
        if (row.sourceModule === 'payment' && row.sourceId) {
          const href = `/payments?ref=${row.sourceId}`;
          return (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                setPaymentId(String(row.sourceId));
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded max-w-xs truncate block text-left"
              title="Open payment details"
            >
              {v}
            </a>
          );
        }
        const linkedPurchaseId = row.sourceModule === 'purchase'
          ? row.sourceId
          : row.sourceModule === 'purchaseAdjustment'
            ? row.sourcePath?.match(/^\/purchases\/([^/?]+)/)?.[1]
            : null;
        if (linkedPurchaseId) {
          const href = `/purchases/${linkedPurchaseId}`;
          return (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                setPurchaseId(String(linkedPurchaseId));
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded max-w-xs truncate block text-left"
              title="Open purchase details"
            >
              {v}
            </a>
          );
        }
        const sourcePath = row.sourcePath
          || '';
        return sourcePath ? (
        <Link
          to={sourcePath}
          className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded max-w-xs truncate block text-left"
          title={`Open ${row.sourceNumber || row.sourceModule}`}
        >
          {v}
        </Link>
      ) : row.sourceId && row.sourceModule === 'payment' ? (
        <button
          type="button"
          onClick={() => navigate(`/payments?ref=${row.sourceId}`)}
          className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded max-w-xs truncate block text-left"
          title="Open payment"
        >
          {v}
        </button>
      ) : (
        <span className="text-sm text-gray-800 max-w-xs truncate block">{v}</span>
      );
      },
    },
    {
      key:    'sourceModule',
      header: 'Module',
      render: (v) => (
        <span className={clsx(
          'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize',
          MODULE_COLOR[v] ?? 'bg-gray-100 text-gray-600'
        )}>
          {v}
        </span>
      ),
    },
    {
      key:    'lines',
      header: 'Debits (Rs.)',
      align:  'right',
      render: (v) => (
        <span className="font-semibold text-gray-800 tabular-nums">
          {fmt((v ?? []).reduce((s, l) => s + (l.debit ?? 0), 0))}
        </span>
      ),
    },
    {
      key:    'lines',
      header: 'Credits (Rs.)',
      align:  'right',
      render: (v) => (
        <span className="font-semibold text-gray-800 tabular-nums">
          {fmt((v ?? []).reduce((s, l) => s + (l.credit ?? 0), 0))}
        </span>
      ),
    },
    {
      key:    'status',
      header: 'Status',
      render: (v, row) => (
        <span className={clsx(
          'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize',
          row.reversedBy
            ? 'bg-amber-100 text-amber-700'
            : v === 'posted'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-gray-100 text-gray-600'
        )}>
          {row.reversedBy ? 'reversed' : v}
        </span>
      ),
    },
    {
      key:    '_actions',
      header: '',
      render: (_, row) => (
        <div className="flex items-center gap-1 justify-end">
          {canEdit && row.status === 'posted' && !row.reversedBy && !row.salaryAdvance && !SOURCE_CONTROLLED_MODULES.includes(row.sourceModule) && (
            <button
              onClick={() => setEditing(row)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
              title={['purchase', 'purchaseAdjustment', 'payment'].includes(row.sourceModule) ? 'Edit from the linked source document' : 'Edit journal entry'}
            >
              <Pencil size={12} /> Edit
            </button>
          )}
          {row.status === 'posted' && !row.reversedBy && !row.salaryAdvance && canManage && !String(row.sourceModule || '').startsWith('asset') && (
            <button
              onClick={() => setReversing(row)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
              title="Reverse"
            >
              <RotateCcw size={12} /> Reverse
            </button>
          )}
          {canDelete && row.sourceModule === 'manual' && row.status === 'posted' && !row.reversedBy && (
            <button
              onClick={() => setDeleting(row)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              title="Delete manual entry"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
          {row.reversedBy && (
            <span className="text-xs text-gray-400 italic">Reversed</span>
          )}
        </div>
      ),
    },
  ];

  const hasFilters = dateFrom || dateTo || srcModule || search || party;

  // Page-level stats (current page)
  const postedCount   = entries.filter((e) => e.status === 'posted' && !e.reversedBy).length;
  const reversedCount = entries.filter((e) => e.reversedBy).length;
  const moduleCount   = new Set(entries.map((e) => e.sourceModule)).size;

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={BookOpen}
        eyebrow="Accounting"
        title="Journal Entries"
        subtitle="Complete audit trail of every debit and credit posted across the system."
        accent="indigo"
        compact
        actions={canManage && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setShowForm(true)}
          >
            New Manual Entry
          </Button>
        )}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',    value: pagination.total, icon: BookOpen,     color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
          { label: 'Posted',   value: postedCount,      icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Reversed', value: reversedCount,    icon: RefreshCcw,   color: 'text-amber-600',   bg: 'bg-amber-50'   },
          { label: 'Modules',  value: moduleCount,      icon: Layers,       color: 'text-violet-600',  bg: 'bg-violet-50'  },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon size={16} className={s.color} />
            </div>
            <div className="min-w-0">
              <p className={clsx('text-xl font-bold leading-tight tabular-nums', s.color)}>
                {loading ? '…' : s.value}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-widest">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search entries, notes, accounts, amounts…"
          className="min-w-[240px] flex-1"
        />

        <div className="min-w-[200px]">
          <SearchableSelect
            options={SOURCE_MODULE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={srcModule}
            onChange={setSrcModule}
          />
        </div>

        <div className="min-w-[200px]">
          <SearchableSelect
            options={partyOptions}
            value={party}
            onChange={onPartyChange}
            placeholder="Filter by party…"
            searchPlaceholder="Search parties…"
            allowClear
          />
        </div>

        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
        />

        {hasFilters && (
          <button
            onClick={() => { setSrcModule(''); setDateFrom(''); setDateTo(''); setSearch(''); setParty(''); setPartyName(''); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            Clear filters
          </button>
        )}
      </FilterBar>

      {/* Table card with header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">All Entries</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? 'Loading…' : `${pagination.total} ${pagination.total === 1 ? 'entry' : 'entries'} total`}
            </p>
          </div>
        </div>
        <Table
          columns={columns}
          data={entries}
          loading={loading}
          emptyMessage="No journal entries found."
          bare
        />
      </div>

      <Pagination {...pagination} />

      <SalesTransactionDrawer
        order={saleOrderId ? saleOrder : null}
        onClose={() => setSaleOrderId('')}
      />
      <AdvanceDetailDrawer
        advance={advanceId ? advance : null}
        onClose={() => setAdvanceId('')}
      />
      <PurchaseDetailDrawer
        purchase={purchaseId ? purchase : null}
        onClose={() => setPurchaseId('')}
      />
      <PaymentDetailDrawer
        payment={paymentId ? payment : null}
        onClose={() => setPaymentId('')}
      />

      {(showForm || editing) && (
        <JournalEntryForm
          entry={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); invalidate(); }}
        />
      )}

      <ConfirmModal
        isOpen={!!reversing}
        title="Reverse Journal Entry"
        message={`Create a reversal entry for ${reversing?.entryNumber}? This will post equal and opposite debits/credits.`}
        confirmLabel="Reverse"
        variant="danger"
        onConfirm={handleReverse}
        onCancel={() => setReversing(null)}
      />

      <ConfirmModal
        isOpen={!!deleting}
        title="Delete Journal Entry"
        message={`Permanently delete manual entry ${deleting?.entryNumber}? This removes it from the ledger and cannot be undone. Only hand-keyed manual entries can be deleted — for anything system-generated, reverse it instead.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
};

export default JournalEntries;
