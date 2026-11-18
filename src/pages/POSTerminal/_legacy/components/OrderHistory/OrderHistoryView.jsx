import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Search, ChevronDown, ChevronLeft, ChevronRight, Receipt, Filter, X, RefreshCw, Banknote, CreditCard, Layers, Wallet, User, MapPin, UtensilsCrossed, ShoppingBag, Truck, Printer, Award, Trash2, Ban, Bike, Landmark, SlidersHorizontal } from 'lucide-react';
import { getMyTransactions, getOrderWastePreview, logOrderAsWaste, retryPraSubmission } from '../../api/sessionApi';
import { buildEndOfDayHtml, printEndOfDayReport } from '../../utils/eodReportPrinter';
import api from '../../api/axios';
import useSession from '../../hooks/useSession';
import Spinner from '../UI/Spinner';
import { requiresKitchenCancellation, KDS_CANCELLATION_MESSAGE } from '../../utils/kdsCancellation';
import { CancelHeldDialog } from '../HeldOrders/HeldOrdersPanel';
import { useReceiptPrint } from '../Print/ReceiptPrintProvider';
import ThermalReportModal from '../Print/ThermalReportModal';
import SearchableSelect from '../../../../../components/UI/SearchableSelect';
import DateRangePicker from '../../../../../components/UI/DateRangePicker';
import FilterBar from '../../../../../components/UI/FilterBar';
import useQueryState from '../../../../../hooks/useQueryState';
import useDebounce from '../../../../../hooks/useDebounce';
import { hasEffectivePermission } from '../../../../../config/permissions';
import SalesSnapshotCards from '../../../../Reports/SalesSnapshotCards';
import { getCancellationReason } from '../../../../../utils/orderCancellation';
import {
  buildWasteSelection,
  calculateWasteValues,
  preferredWasteValuation,
} from '../../utils/wasteValuation';

const STATUS_META = {
  held:      { label: 'Held',     cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  'out-for-delivery': { label: 'Out for Delivery', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  completed: { label: 'Paid',     cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  refunded:  { label: 'Refunded', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  void:      { label: 'Voided',   cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

const PAYMENT_META = {
  cash:      { label: 'Cash',      Icon: Banknote },
  card:      { label: 'Card',      Icon: CreditCard },
  'online-transfer': { label: 'Online Transfer', Icon: Landmark },
  split:     { label: 'Split',     Icon: Layers },
  allowance: { label: 'Allowance', Icon: Wallet },
  'charge-to-salary': { label: 'Charge to Salary', Icon: User },
  foodpanda: { label: 'Food Panda', Icon: Bike },
};

const ORDER_TYPE_META = {
  'dine-in': { label: 'Dine-In',  Icon: UtensilsCrossed, cls: 'bg-emerald-50 text-emerald-700' },
  takeaway:  { label: 'Takeaway', Icon: ShoppingBag,    cls: 'bg-sky-50 text-sky-700' },
  delivery:  { label: 'Delivery', Icon: Truck,          cls: 'bg-amber-50 text-amber-700' },
  foodpanda: { label: 'Foodpanda', Icon: Bike,          cls: 'bg-pink-50 text-pink-700' },
};

// Module-level stale-while-revalidate cache for the cashier's order history,
// keyed by the query params. Survives panel close/reopen so re-entering shows
// the last result instantly while a background refetch keeps it fresh.
const historyCache = new Map(); // key -> { rows, pagination, at }
const historyKey = (params) => JSON.stringify(params);

const fmtPKR = (v) => `Rs. ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPKRshort = (v) => `Rs. ${Math.round(Number(v || 0)).toLocaleString('en-PK')}`;
// Clean rate: 16, 5, 12.5 — no trailing zeros.
const fmtRate = (r) => String(+Number(r || 0).toFixed(2));
const entityId = (value) => String(value?._id ?? value?.id ?? value ?? '');
const cashierLabel = (tx) => tx?.cashier?.name
  || tx?.cashier?.email
  || tx?.voidedBy?.name
  || tx?.voidedBy?.email
  || 'Unknown cashier';
const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'held', label: 'Held / In Progress' },
  { value: 'out-for-delivery', label: 'Out for Delivery' },
  { value: 'completed', label: 'Paid' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'void', label: 'Voided' },
];
const ORDER_OPTIONS = [
  { value: '', label: 'All order types' },
  { value: 'dine-in', label: 'Dine in' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'foodpanda', label: 'Foodpanda' },
];
const PAYMENT_OPTIONS = [
  { value: '', label: 'All payments' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'online-transfer', label: 'Online transfer' },
  { value: 'split-bill', label: 'Split bill' },
  { value: 'foodpanda', label: 'Foodpanda' },
  { value: 'allowance', label: 'Allowance' },
  { value: 'charge-to-salary', label: 'Charge to salary' },
];
const SOURCE_OPTIONS = [
  { value: '', label: 'All order sources' },
  { value: 'cashier', label: 'Cashier terminal' },
  { value: 'qr-self-order', label: 'QR self-order' },
  { value: 'staff-tablet', label: 'Staff tablet' },
];
const PRA_OPTIONS = [
  { value: '', label: 'All PRA statuses' },
  { value: 'reported', label: 'PRA reported' },
  { value: 'pending', label: 'PRA pending' },
  { value: 'submitting', label: 'PRA submitting' },
  { value: 'failed', label: 'PRA failed' },
  { value: 'skipped', label: 'PRA skipped' },
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

const OrderHistoryView = () => {
  const { cashier, session, outletName } = useSession();
  const isManager = ['owner', 'financeManager'].includes(cashier?.role);
  const canCancelOrders = hasEffectivePermission(cashier, 'pos.cancelOrder');
  const canLogOrderAsWaste = hasEffectivePermission(cashier, 'pos.logWaste');
  const [printingEod, setPrintingEod] = useState(false);
  const [eodPrintPreview, setEodPrintPreview] = useState(null);

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, pages: 1 });
  const [serverSummary, setServerSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useQueryState('historySearch', '');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [status, setStatus] = useQueryState('historyStatus', ''); // '' = all terminal statuses
  const [cashierFilter, setCashierFilter] = useQueryState('historyCashier', '');
  const [orderTypeFilter, setOrderTypeFilter] = useQueryState('historyOrderType', '');
  const [paymentFilter, setPaymentFilter] = useQueryState('historyPayment', '');
  const [sourceFilter, setSourceFilter] = useQueryState('historySource', '');
  const [praFilter, setPraFilter] = useQueryState('historyPraStatus', '');
  const [discountFilter, setDiscountFilter] = useQueryState('historyDiscount', '');
  const [wasteFilter, setWasteFilter] = useQueryState('historyWaste', '');
  const [minAmount, setMinAmount] = useQueryState('historyMinAmount', '');
  const [maxAmount, setMaxAmount] = useQueryState('historyMaxAmount', '');
  const [tableNumber, setTableNumber] = useQueryState('historyTable', '');
  const debouncedTableNumber = useDebounce(tableNumber.trim(), 300);
  const [sort, setSort] = useQueryState('historySort', 'newest');
  const [cashiers, setCashiers] = useState([]);
  const [from, setFrom] = useQueryState('historyFrom', '');
  const [to, setTo] = useQueryState('historyTo', '');
  const [page, setPage] = useQueryState('historyPage', 1);
  const [showAdvanced, setShowAdvanced] = useQueryState('historyFilters', false);
  const [selected, setSelected] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [wasteTarget, setWasteTarget] = useState(null);
  const [wasteReason, setWasteReason] = useState('');
  const [wasteRePrepare, setWasteRePrepare] = useState(false);
  const [wasteMode, setWasteMode] = useState('whole');   // 'whole' | 'select'
  const [wasteSel, setWasteSel] = useState({});          // { [lineIndex]: qty }
  const [wastePreview, setWastePreview] = useState(null);
  const [wastePreviewLoading, setWastePreviewLoading] = useState(false);
  const [wasteValuationMethod, setWasteValuationMethod] = useState('ingredientCost');
  const [wasteBusy, setWasteBusy] = useState(false);

  const loadWastePreview = async (tx) => {
    setWastePreviewLoading(true);
    setWastePreview(null);
    try {
      const preview = await getOrderWastePreview(tx._id);
      setWastePreview(preview);
      setWasteValuationMethod(preferredWasteValuation(preview));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not calculate this order’s waste values.');
    } finally {
      setWastePreviewLoading(false);
    }
  };

  const openWaste = (tx) => {
    if (!canLogOrderAsWaste) {
      toast.error('You do not have permission to log orders as waste.');
      return;
    }
    if (!isManager && tx?.isCurrentBusinessDay === false) {
      toast.error('Cashiers cannot log waste after an order’s business day has ended. Ask an owner or finance manager.');
      return;
    }
    setWasteReason('');
    setWasteRePrepare(false);
    setWasteMode('whole');
    setWasteSel({});
    setWasteValuationMethod('ingredientCost');
    setWasteTarget(tx);
    loadWastePreview(tx);
  };

  const setWasteLineQty = (index, remaining, q) => {
    const v = Math.max(0, Math.min(remaining, Math.round(q)));
    setWasteSel((prev) => { const n = { ...prev }; if (v <= 0) delete n[index]; else n[index] = v; return n; });
  };
  const toggleWasteLine = (index, remaining) => {
    setWasteSel((prev) => { const n = { ...prev }; if (n[index] > 0) delete n[index]; else n[index] = remaining; return n; });
  };
  const wasteValues = calculateWasteValues(wastePreview, wasteMode, wasteSel);
  const selectedWasteValue = wasteValuationMethod === 'orderValue'
    ? wasteValues.orderValue
    : wasteValues.ingredientCost;
  const wasteReasonIsValid = wasteReason.trim().length >= 3;

  const loadPage = useCallback(async ({ force = false } = {}) => {
    const params = { page, limit: 25 };
    if (debouncedSearch) params.search = debouncedSearch;
    if (status) params.status = status;
    if (cashierFilter) params.cashier = cashierFilter;
    if (orderTypeFilter) params.orderType = orderTypeFilter;
    if (paymentFilter) params.paymentMethod = paymentFilter;
    if (sourceFilter) params.source = sourceFilter;
    if (praFilter) params.praStatus = praFilter;
    if (discountFilter) params.discountState = discountFilter;
    if (wasteFilter) params.wasteState = wasteFilter;
    if (minAmount !== '') params.minAmount = minAmount;
    if (maxAmount !== '') params.maxAmount = maxAmount;
    if (debouncedTableNumber) params.tableNumber = debouncedTableNumber;
    if (sort !== 'newest') params.sort = sort;
    if (from) params.from = from;
    if (to) params.to = to;

    // Stale-while-revalidate: if we have a cached result for these params,
    // paint it immediately (no spinner) and refetch silently. Otherwise show
    // the spinner for the cold load.
    const key = historyKey({ outlet: session?.outlet?._id || session?.outlet || cashier?.outletRef || cashier?.outletCode, ...params });
    const cached = historyCache.get(key);
    if (cached && !force) {
      setRows(cached.rows);
      setPagination(cached.pagination);
      setServerSummary(cached.summary || null);
    } else {
      setLoading(true);
    }

    try {
      const res = await getMyTransactions(params);
      const rowsData = res?.data || [];
      const pag = res?.pagination || { total: 0, page: 1, limit: 25, pages: 1 };
      setRows(rowsData);
      setPagination(pag);
      setServerSummary(res?.summary || null);
      setCashiers(res?.cashiers || []);
      historyCache.set(key, { rows: rowsData, pagination: pag, summary: res?.summary || null, at: Date.now() });
    } catch (err) {
      if (!cached || force) toast.error(err.response?.data?.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [
    page, debouncedSearch, status, cashierFilter, orderTypeFilter, paymentFilter,
    sourceFilter, praFilter, discountFilter, wasteFilter, minAmount, maxAmount,
    debouncedTableNumber, sort, from, to, session, cashier,
  ]);

  useEffect(() => { loadPage(); }, [loadPage]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPage({ force: true });
    } finally {
      setRefreshing(false);
    }
  };

  const pageSummary = useMemo(() => {
    const totals = rows.reduce(
      (acc, r) => {
        if (r.status === 'completed') {
          const totalAmount = Number(r.totalAmount || 0);
          const tax = Number(r.taxAmount || 0);
          const service = Number(r.serviceChargeAmount || 0);
          const delivery = Number(r.deliveryChargeAmount || 0);
          const discount = Number(r.discountAmount || 0);
          const redemption = Number(r.pointsRedeemedValue || 0);
          // Older transactions may not have `subtotal`. Reconstruct it from the
          // final bill so card/online/legacy sales are never omitted from Gross.
          const netSales = Number(r.subtotal) > 0
            ? Math.max(0, Number(r.subtotal) - discount - redemption)
            : Math.max(0, totalAmount - tax - service - delivery);
          const grossSales = Number(r.subtotal) > 0
            ? Number(r.subtotal)
            : netSales + discount + redemption;
          acc.gross += grossSales;
          acc.serviceCharge += service;
          acc.deliveryCharge += delivery;
          acc.net += totalAmount;
          acc.salesExcludingServiceCharges += Math.max(0, totalAmount - service);
          acc.collected += totalAmount;
          acc.discounts += discount + redemption;
          acc.tax += tax;
          acc.items += (r.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
          const method = r.paymentMethod;
          if (method === 'cash') acc.cash += totalAmount;
          else if (method === 'card') acc.card += totalAmount;
          else if (method === 'online-transfer') acc.online += totalAmount;
          else if (method === 'foodpanda') {
            acc.foodPanda += totalAmount;
            acc.foodPandaCount += 1;
          }
          else if (method === 'charge-to-salary') {
            acc.chargeToSalary += totalAmount;
            acc.chargeToSalaryCount += 1;
          }
          else if (method === 'split' || method === 'split-bill') {
            const cashPart = Number(r.cashAmount || 0);
            const cardPart = Number(r.cardAmount || 0);
            acc.cash += cashPart;
            acc.card += cardPart;
            acc.other += Math.max(0, totalAmount - cashPart - cardPart);
          } else acc.other += totalAmount;
          acc.count += 1;
        } else if (['held', 'out-for-delivery'].includes(r.status)) {
          acc.awaitingPayments += Number(r.totalAmount || 0);
          acc.awaitingCount += 1;
        }
        return acc;
      },
      {
        gross: 0, serviceCharge: 0, deliveryCharge: 0, net: 0,
        salesExcludingServiceCharges: 0, collected: 0, discounts: 0, tax: 0,
        items: 0, count: 0, cash: 0, card: 0, online: 0, foodPanda: 0,
        foodPandaCount: 0, other: 0, awaitingPayments: 0, awaitingCount: 0,
        chargeToSalary: 0, chargeToSalaryCount: 0,
      },
    );
    totals.average = totals.count > 0 ? totals.net / totals.count : 0;
    totals.invoices = totals.count;
    totals.totalOrders = pagination.total;
    return totals;
  }, [rows, pagination.total]);
  const summary = serverSummary || pageSummary;

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setCashierFilter('');
    setOrderTypeFilter('');
    setPaymentFilter('');
    setSourceFilter('');
    setPraFilter('');
    setDiscountFilter('');
    setWasteFilter('');
    setMinAmount('');
    setMaxAmount('');
    setTableNumber('');
    setSort('newest');
    setFrom('');
    setTo('');
    setPage(1);
  };

  // Pull current totals first, then freeze one exact report payload for both
  // the on-screen preview and the eventual print job.
  const handlePreviewEod = async () => {
    setPrintingEod(true);
    try {
      const res = await api.get('/api/pos/sessions/current/summary');
      const totals = res.data?.data ?? null;
      if (!totals && !session) {
        toast.error('No open shift to report.');
        return;
      }
      const generatedAt = new Date();
      const report = {
        outletName,
        cashierName: cashier?.name || cashier?.email || '—',
        session,
        totals: totals || session?.totals || {},
        generatedAt,
      };
      setEodPrintPreview({
        ...report,
        reportHtml: buildEndOfDayHtml(report),
      });
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not prepare shift summary.');
    } finally {
      setPrintingEod(false);
    }
  };

  const hasFilter = Boolean(
    search || status || cashierFilter || orderTypeFilter || paymentFilter
    || sourceFilter || praFilter || discountFilter || wasteFilter || minAmount
    || maxAmount || tableNumber || sort !== 'newest' || from || to
  );
  const advancedFilterCount = [
    status, cashierFilter, orderTypeFilter, paymentFilter, sourceFilter, praFilter,
    discountFilter, wasteFilter, minAmount || maxAmount, tableNumber,
    sort !== 'newest', from || to,
  ].filter(Boolean).length;

  // Log an order (or selected items) as waste: close the drawer, post, then
  // reconcile the authoritative waste state (partial / full / wastedQty) by
  // refetching the page — partial state is too involved to mirror optimistically.
  const confirmWaste = async () => {
    const tx = wasteTarget;
    if (!tx) return;
    if (!canLogOrderAsWaste) {
      setWasteTarget(null);
      toast.error('You do not have permission to log orders as waste.');
      return;
    }
    if (!isManager && tx.isCurrentBusinessDay === false) {
      setWasteTarget(null);
      toast.error('Cashiers cannot log waste after an order’s business day has ended. Ask an owner or finance manager.');
      return;
    }
    if (wastePreviewLoading || !wastePreview) {
      toast.error('Wait for the waste values to finish calculating.');
      return;
    }
    if (!wasteReasonIsValid) {
      toast.error('Enter a waste reason (at least 3 characters).');
      return;
    }
    const notes = wasteReason.trim();
    const rePrepare = wasteRePrepare;
    const selection = buildWasteSelection(wastePreview, wasteMode, wasteSel);
    if (wasteMode === 'select' && (!selection || selection.length === 0)) {
      toast.error('Select at least one item to waste.');
      return;
    }
    if (selectedWasteValue <= 0) {
      toast.error(
        wasteValuationMethod === 'ingredientCost'
          ? 'Ingredient cost is zero. Choose Order value before logging this waste.'
          : 'The selected order value is zero and cannot be logged.',
      );
      return;
    }
    setWasteBusy(true);
    try {
      await logOrderAsWaste(tx._id, {
        reason: 'orderVoid',
        notes,
        rePrepare,
        selection,
        valuationMethod: wasteValuationMethod,
      });
      toast.success(
        `${rePrepare ? 'Order logged as waste & re-prepared' : 'Order logged as waste'} · ${fmtPKR(selectedWasteValue)}`,
      );
      setWasteTarget(null);
      setWasteReason('');
      setWasteRePrepare(false);
      setWasteMode('whole');
      setWasteSel({});
      setWastePreview(null);
      setSelected(null);
      // Reconcile authoritative waste state (partial / full / wastedQty) from server.
      loadPage();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to log waste');
    } finally {
      setWasteBusy(false);
    }
  };

  // Cancel (void) a completed order from the terminal — reverses the sale's
  // accounting, kitchen stock and loyalty. Reason is required (backend min 3).
  const openCancel = (tx) => {
    if (requiresKitchenCancellation(tx.kds)) { toast.error(KDS_CANCELLATION_MESSAGE); return; }
    if (!canCancelOrders) {
      toast.error('You do not have permission to cancel orders.');
      return;
    }
    if (!isManager && tx?.isCurrentBusinessDay === false) {
      toast.error('Cashiers cannot cancel orders after their business day has ended. Ask an owner or finance manager.');
      return;
    }
    setSelected(null);
    setCancelTarget(tx);
  };
  const confirmCancel = async (prepared, reason, wasteOptions) => {
    const tx = cancelTarget;
    if (!tx) return;
    if (!canCancelOrders) {
      setCancelTarget(null);
      toast.error('You do not have permission to cancel orders.');
      return;
    }
    if (reason.length < 3) { toast.error('Enter a reason (at least 3 characters).'); return; }
    try {
      await api.post(`/api/pos/sale/${tx._id}/void`, { voidReason: reason, prepared, ...wasteOptions });
      toast.success(prepared ? 'Order cancelled — prepared items recorded as waste.' : 'Order cancelled — sale, stock & points reversed.');
      setCancelTarget(null);
      } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel order.');
    } finally {
      loadPage();
    }
  };

  // PRA retry is an owner/finance action; the durable worker auto-retries
  // 'pending', so this is mainly for 'failed' after a config fix.
  const canRetryPra = isManager;
  const handleRetryPra = async (tx) => {
    try {
      const pra = await retryPraSubmission(tx._id);
      toast.success(pra?.status === 'reported' ? 'Reported to PRA.' : `PRA: ${pra?.status || 'submitted'}`);
      // Keep the open drawer in sync with the new status (avoids a stale
      // "Retry" button / status after a successful retry).
      if (pra) {
        setSelected((prev) => {
          if (!prev || prev._id !== tx._id) return prev;
          const isCredit = ['void', 'refunded'].includes(prev.status) && prev.pra?.status === 'reported';
          return isCredit
            ? { ...prev, pra: { ...prev.pra, credit: pra } }
            : { ...prev, pra };
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'PRA retry failed.');
    } finally {
      loadPage();
    }
  };

  return (
    <div className="w-full px-3 py-4 sm:px-4 md:py-5 lg:px-5">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-surface-900 flex items-center gap-2">
            <Receipt size={20} className="text-brand-600" />
            Order History
          </h1>
          <p className="mt-1 text-xs text-surface-500">
            All cashier transactions for <span className="font-semibold text-surface-700">{outletName || 'this outlet'}</span>.
            {' '}Business day <span className="font-semibold text-surface-700">{summary.businessDate || 'current'}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePreviewEod}
            disabled={printingEod}
            className="flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-60"
            title="Print my current shift summary (thermal)"
          >
            <Printer size={12} className={printingEod ? 'animate-pulse' : ''} />
            {printingEod ? 'Preparing…' : 'My End of Day'}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl border border-surface-200 bg-white px-3 py-1.5 text-xs font-semibold text-surface-600 transition-colors hover:bg-surface-50 disabled:opacity-60"
          >
            <RefreshCw size={12} className={loading || refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Compact business-day sales overview */}
      <SalesSnapshotCards
        className="mb-4"
        loading={loading && !serverSummary}
        grossSales={summary.grossSales ?? summary.gross}
        netSales={Math.max(0, Number(summary.grossSales ?? summary.gross ?? 0) - Number(summary.discount ?? summary.discounts ?? 0))}
        collected={summary.collected ?? summary.net}
        salesTax={summary.salesTax ?? summary.tax}
        serviceCharges={summary.serviceCharge}
        deliveryCharges={summary.deliveryCharge}
        discounts={summary.discount ?? summary.discounts}
        orders={summary.invoices ?? summary.count}
        averageOrder={summary.average}
        cashSales={summary.cash}
        cardSales={summary.card}
        onlineSales={summary.online}
        foodPandaSales={summary.foodPanda}
        heldTotal={summary.heldOrdersTotal ?? summary.awaitingPayments}
        heldCount={summary.heldOrdersCount ?? summary.awaitingCount}
      />

      {/* URL-backed filters */}
      <FilterBar className="mb-3">
        <div className="flex w-full flex-wrap items-center gap-2.5">
          <label className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search transaction # or note…"
              className="input-field w-full pl-9 pr-9 text-sm"
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-surface-400 hover:bg-surface-100">
                <X size={13} />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            aria-expanded={showAdvanced}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-surface-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
          >
            <SlidersHorizontal size={15} />
            Advanced Filters
            {advancedFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-100 px-1.5 text-[11px] font-bold text-brand-700">
                {advancedFilterCount}
              </span>
            )}
            <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
          {hasFilter && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-surface-500 hover:bg-surface-100 hover:text-surface-800">
              <X size={14} /> Clear all
            </button>
          )}
        </div>

        {showAdvanced && (
          <div className="w-full space-y-4 rounded-xl border border-brand-100 bg-brand-50/30 p-3 sm:p-4">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-surface-400">Business day range</p>
              <DateRangePicker from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); setPage(1); }} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect
                options={STATUS_OPTIONS}
                value={status}
                onChange={(value) => { setStatus(value); setPage(1); }}
                searchPlaceholder="Search statuses…"
              />
              <SearchableSelect options={ORDER_OPTIONS} value={orderTypeFilter} onChange={(value) => { setOrderTypeFilter(value); setPage(1); }} />
              <SearchableSelect options={PAYMENT_OPTIONS} value={paymentFilter} onChange={(value) => { setPaymentFilter(value); setPage(1); }} />
              <SearchableSelect
                options={[
                  { value: '', label: 'All cashiers' },
                  ...cashiers.map((person) => ({
                    value: person._id,
                    label: person.name || person.email || 'Unknown cashier',
                    meta: person.name && person.email ? person.email : '',
                  })),
                ]}
                value={cashierFilter}
                onChange={(value) => { setCashierFilter(value); setPage(1); }}
                searchPlaceholder="Search cashiers…"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect options={SOURCE_OPTIONS} value={sourceFilter} onChange={(value) => { setSourceFilter(value); setPage(1); }} />
              <SearchableSelect options={PRA_OPTIONS} value={praFilter} onChange={(value) => { setPraFilter(value); setPage(1); }} />
              <SearchableSelect options={DISCOUNT_OPTIONS} value={discountFilter} onChange={(value) => { setDiscountFilter(value); setPage(1); }} />
              <SearchableSelect options={WASTE_OPTIONS} value={wasteFilter} onChange={(value) => { setWasteFilter(value); setPage(1); }} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-surface-400">Minimum total</span>
                <input type="number" min="0" step="0.01" value={minAmount} onChange={(event) => { setMinAmount(event.target.value); setPage(1); }} placeholder="Rs. 0.00" className="input-field w-full text-sm" />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-surface-400">Maximum total</span>
                <input type="number" min="0" step="0.01" value={maxAmount} onChange={(event) => { setMaxAmount(event.target.value); setPage(1); }} placeholder="No maximum" className="input-field w-full text-sm" />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-surface-400">Table number</span>
                <input value={tableNumber} onChange={(event) => { setTableNumber(event.target.value); setPage(1); }} placeholder="Any table" className="input-field w-full text-sm" />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-surface-400">Sort by</span>
                <SearchableSelect options={SORT_OPTIONS} value={sort} onChange={(value) => { setSort(value); setPage(1); }} searchable={false} />
              </label>
            </div>
          </div>
        )}
      </FilterBar>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-surface-200 bg-white">
        {/* Spinner only when there's nothing to show yet. While paging/filtering
            we keep the current rows visible and refresh silently. */}
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="md" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-100">
              <Filter size={20} className="text-surface-400" />
            </div>
            <p className="mt-3 text-sm font-semibold text-surface-700">
              {hasFilter ? 'No transactions match your filters' : 'No transactions yet'}
            </p>
            <p className="mt-1 text-xs text-surface-400 max-w-sm">
              {hasFilter
                ? 'Try widening the date range or clearing some filters.'
                : 'When you take a paid sale it shows up here. Held orders live in the Held Orders panel.'}
            </p>
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50/50 text-[10px] uppercase tracking-wider text-surface-500">
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Txn #</th>
                <th className="px-3 py-2 text-left">Cashier</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Pay</th>
                <th className="px-3 py-2 text-right">Items</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => {
                const otMeta = ORDER_TYPE_META[tx.orderType] ?? ORDER_TYPE_META['dine-in'];
                const stMeta = STATUS_META[tx.status] ?? { label: tx.status, cls: 'bg-surface-100 text-surface-600 ring-surface-200' };
                const pmMeta = PAYMENT_META[tx.paymentMethod] ?? { label: tx.paymentMethod, Icon: Banknote };
                const isUnpaid = tx.status === 'held' || tx.status === 'out-for-delivery';
                const itemCount = (tx.items || []).reduce((s, i) => s + (i.qty || 0), 0);
                return (
                  <tr
                    key={tx._id}
                    onClick={() => setSelected(tx)}
                    className="cursor-pointer border-b border-surface-100 last:border-0 hover:bg-brand-50/40 transition-colors"
                  >
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <div className="text-xs text-surface-700">{format(new Date(tx.createdAt), 'dd MMM')}</div>
                      <div className="text-[11px] text-surface-400">{format(new Date(tx.createdAt), 'h:mm a')}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono text-xs text-surface-800">{tx.transactionNumber || '—'}</div>
                      {tx.tableNumber && (
                        <div className="text-[11px] font-bold text-emerald-700">Table {tx.tableNumber}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-surface-700">
                      <span className="inline-flex items-center gap-1"><User size={11} />{cashierLabel(tx)}</span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${otMeta.cls}`}>
                        <otMeta.Icon size={9} />
                        {otMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isUnpaid ? (
                        <span className="text-xs font-medium text-amber-600">Awaiting payment</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-surface-600">
                          <pmMeta.Icon size={11} />
                          {pmMeta.label}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-xs text-surface-600">{itemCount}</td>
                    <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                      <div className="font-bold text-surface-900">{fmtPKRshort(tx.totalAmount)}</div>
                      {tx.orderType !== 'foodpanda' && tx.paymentMethod !== 'foodpanda'
                        && (tx.pointsRedeemed > 0 || tx.pointsEarned > 0) && (
                        <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] font-bold">
                          {tx.pointsRedeemed > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-rose-700 ring-1 ring-rose-100">
                              <Award size={9} /> -{tx.pointsRedeemed}
                            </span>
                          )}
                          {tx.pointsEarned > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700 ring-1 ring-emerald-100">
                              <Award size={9} /> +{tx.pointsEarned}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${stMeta.cls}`}>
                        {stMeta.label}
                      </span>
                      {tx.isVoidedAsWaste ? (
                        <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 ring-1 ring-orange-100">
                          <Trash2 size={9} /> {tx.rePrepared ? 'Wasted · Re-made' : 'Wasted'}
                        </span>
                      ) : tx.partiallyWasted ? (
                        <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-100">
                          <Trash2 size={9} /> Partial waste
                        </span>
                      ) : null}
                      {tx.pra?.status && (
                        <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                          tx.pra.status === 'reported' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                          : tx.pra.status === 'failed' ? 'bg-rose-50 text-rose-700 ring-rose-100'
                          : 'bg-amber-50 text-amber-700 ring-amber-100'}`}>
                          {tx.pra.status === 'reported' ? 'PRA ✓' : tx.pra.status === 'failed' ? 'PRA ✕' : 'PRA …'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && pagination.pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-surface-500">
          <span>
            Page {pagination.page} of {pagination.pages} · {pagination.total} transactions
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-surface-200 bg-white p-1.5 text-surface-500 transition-colors hover:bg-surface-50 disabled:opacity-50"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={page >= pagination.pages}
              className="rounded-lg border border-surface-200 bg-white p-1.5 text-surface-500 transition-colors hover:bg-surface-50 disabled:opacity-50"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <DetailDrawer
          tx={selected}
          onClose={() => setSelected(null)}
          outletName={outletName}
          isOwnOrder={entityId(selected.cashier) === entityId(cashier)}
          isManager={isManager}
          canCancelOrders={canCancelOrders}
          canLogOrderAsWaste={canLogOrderAsWaste}
          onWaste={openWaste}
          onCancel={openCancel}
          canRetryPra={canRetryPra}
          onRetryPra={handleRetryPra}
        />
      )}

      {/* Confirm logging an order as waste — with an optional reason */}
      {wasteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !wasteBusy && setWasteTarget(null)}>
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-float" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-surface-100 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                <Trash2 size={15} />
              </div>
              <p className="text-sm font-bold text-surface-900">Log order as waste?</p>
            </div>
            <div className="space-y-3 overflow-y-auto px-4 py-4">
              <p className="text-xs text-surface-500 leading-relaxed">
                Order <span className="font-semibold text-surface-700">{wasteTarget.transactionNumber || ''}</span> —
                choose the prepared items and the value to show in the Waste Log. Accounting remains based on actual ingredient cost. This cannot be undone.
              </p>

              {/* What to waste: entire order or selected items */}
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-surface-500">What to waste</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={wastePreviewLoading || !wastePreview}
                    onClick={() => setWasteMode('whole')}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${wasteMode === 'whole' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'}`}
                  >
                    Entire order
                  </button>
                  <button
                    type="button"
                    disabled={wastePreviewLoading || !wastePreview}
                    onClick={() => setWasteMode('select')}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${wasteMode === 'select' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'}`}
                  >
                    Select items
                  </button>
                </div>
                {wastePreviewLoading && (
                  <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-surface-200 py-5 text-xs font-medium text-surface-500">
                    <RefreshCw size={13} className="animate-spin" /> Calculating ingredient cost and order value…
                  </div>
                )}
                {!wastePreviewLoading && !wastePreview && (
                  <button
                    type="button"
                    onClick={() => loadWastePreview(wasteTarget)}
                    className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                  >
                    Could not calculate values · Try again
                  </button>
                )}
                {wasteMode === 'select' && wastePreview && (
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-surface-200 divide-y divide-surface-100">
                    {wastePreview.items.map((it) => {
                      const idx = Number(it.index);
                      const remaining = Number(it.remainingQty ?? it.qty) || 0;
                      const sel = Number(wasteSel[idx]) || 0;
                      return (
                        <div key={idx} className={`flex items-center gap-2 px-3 py-2 ${remaining === 0 ? 'opacity-50' : ''}`}>
                          <input
                            type="checkbox"
                            disabled={remaining === 0}
                            checked={sel > 0}
                            onChange={() => toggleWasteLine(idx, remaining)}
                            className="h-4 w-4 rounded border-surface-300 text-orange-600 focus:ring-orange-400 shrink-0 disabled:opacity-40"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-surface-800 truncate">
                              {it.name}{it.variation?.name ? ` (${it.variation.name})` : ''}
                            </p>
                            <p className="text-[11px] text-surface-400">{remaining} available to log</p>
                          </div>
                          {remaining === 0 ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-surface-400 shrink-0">wasted</span>
                          ) : sel > 0 ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={() => setWasteLineQty(idx, remaining, sel - 1)} className="h-6 w-6 rounded-md border border-surface-200 text-surface-600 hover:bg-surface-100 flex items-center justify-center text-sm font-bold">−</button>
                              <span className="w-5 text-center text-sm font-bold tabular-nums">{sel}</span>
                              <button type="button" onClick={() => setWasteLineQty(idx, remaining, sel + 1)} disabled={sel >= remaining} className="h-6 w-6 rounded-md border border-surface-200 text-surface-600 hover:bg-surface-100 disabled:opacity-40 flex items-center justify-center text-sm font-bold">+</button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {wastePreview && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-surface-500">Waste valuation</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={wasteValuationMethod === 'ingredientCost'}
                      onClick={() => setWasteValuationMethod('ingredientCost')}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${wasteValuationMethod === 'ingredientCost' ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200' : 'border-surface-200 bg-white hover:border-surface-300'}`}
                    >
                      <span className="block text-sm font-bold text-surface-900">Ingredient cost</span>
                      <span className="mt-0.5 block text-xs text-surface-500">Recipe purchase cost · {fmtPKR(wasteValues.ingredientCost)}</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={wasteValuationMethod === 'orderValue'}
                      onClick={() => setWasteValuationMethod('orderValue')}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${wasteValuationMethod === 'orderValue' ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-200' : 'border-surface-200 bg-white hover:border-surface-300'}`}
                    >
                      <span className="block text-sm font-bold text-surface-900">Order value</span>
                      <span className="mt-0.5 block text-xs text-surface-500">Final billed value · {fmtPKR(wasteValues.orderValue)}</span>
                    </button>
                  </div>
                  {wasteValuationMethod === 'ingredientCost' && wasteValues.ingredientCost <= 0 && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-700">
                      Ingredient cost is zero. Choose Order value if purchases were not recorded in the app.
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-50 px-3 py-2 text-xs">
                    <span className="text-surface-500">Logging {wasteValues.units} item{wasteValues.units === 1 ? '' : 's'} as waste</span>
                    <span className="font-bold tabular-nums text-orange-700">{fmtPKR(selectedWasteValue)}</span>
                  </div>
                </div>
              )}

              {/* Re-prepare: deduct stock a second time for the re-cooked batch */}
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-surface-500">
                  Re-prepare this order for the customer?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWasteRePrepare(false)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${!wasteRePrepare ? 'border-surface-300 bg-surface-100 text-surface-900' : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'}`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setWasteRePrepare(true)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${wasteRePrepare ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'}`}
                  >
                    Yes, re-make it
                  </button>
                </div>
                {wasteRePrepare && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700">
                    Ingredients will be deducted from stock a second time so the count stays exact. The re-made batch is the food the customer receives — only the wasted batch is booked as a loss.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-surface-500">
                  Reason <span className="font-normal text-rose-500">(required)</span>
                </label>
                <textarea
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value)}
                  aria-invalid={wasteReason.length > 0 && !wasteReasonIsValid}
                  rows={2}
                  maxLength={300}
                  placeholder="e.g. wrong order, dropped, customer cancelled after prep"
                  className="w-full resize-none rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                />
                {wasteReason.length > 0 && !wasteReasonIsValid && (
                  <p className="mt-1 text-[11px] font-medium text-rose-600">Enter at least 3 characters.</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-surface-100 px-4 py-3">
              <button type="button" disabled={wasteBusy} onClick={() => setWasteTarget(null)} className="rounded-lg px-3 py-2 text-sm font-semibold text-surface-500 hover:bg-surface-100 disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={wasteBusy || wastePreviewLoading || !wastePreview || !wasteReasonIsValid || wasteValues.units <= 0 || selectedWasteValue <= 0}
                onClick={confirmWaste}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300"
              >
                {wasteBusy ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {wasteBusy ? 'Logging…' : 'Log as Waste'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <CancelHeldDialog
          order={cancelTarget}
          onKeep={() => setCancelTarget(null)}
          onChoose={confirmCancel}
        />
      )}
      {eodPrintPreview && (
        <ThermalReportModal
          title="Print End-of-Day Report?"
          reportHtml={eodPrintPreview.reportHtml}
          onPrint={() => printEndOfDayReport(eodPrintPreview)}
          onPrinted={() => {
            setEodPrintPreview(null);
            toast.success('End-of-day report sent to counter printer');
          }}
          onClose={() => setEodPrintPreview(null)}
        />
      )}
    </div>
  );
};

export const DetailDrawer = ({
  tx,
  onClose,
  outletName,
  isOwnOrder,
  isManager,
  canCancelOrders,
  canLogOrderAsWaste,
  onWaste,
  onCancel,
  canRetryPra,
  onRetryPra,
}) => {
  const requestReceiptPrint = useReceiptPrint();
  const otMeta = ORDER_TYPE_META[tx.orderType] ?? ORDER_TYPE_META['dine-in'];
  const stMeta = STATUS_META[tx.status] ?? { label: tx.status, cls: 'bg-surface-100 text-surface-600 ring-surface-200' };
  const pmMeta = PAYMENT_META[tx.paymentMethod] ?? { label: tx.paymentMethod, Icon: Banknote };
  const isUnpaid = tx.status === 'held' || tx.status === 'out-for-delivery';
  const cancellationReason = getCancellationReason(tx);
  const praIsCredit = ['void', 'refunded'].includes(tx.status) && Boolean(tx.pra?.credit?.status);
  const praResult = praIsCredit ? tx.pra.credit : tx.pra;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-surface-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="safe-area-drawer relative ml-auto h-full w-full max-w-md overflow-y-auto bg-white shadow-float animate-slide-in-right">
        <div className="sticky top-0 z-10 border-b border-surface-200 bg-white px-5 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Transaction</p>
            <p className="font-mono text-sm font-bold text-surface-900 truncate">{tx.transactionNumber || '—'}</p>
            <p className="text-[11px] text-surface-500 mt-0.5">{format(new Date(tx.createdAt), 'dd MMM yyyy · h:mm a')}</p>
          </div>
          <button onClick={onClose} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700" aria-label="Close transaction details">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Status + meta */}
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${stMeta.cls}`}>{stMeta.label}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${otMeta.cls}`}>
              <otMeta.Icon size={10} />
              {otMeta.label}
            </span>
            {isUnpaid ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">Awaiting payment</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[11px] font-bold text-surface-700">
                <pmMeta.Icon size={10} />
                {pmMeta.label}
              </span>
            )}
            {tx.tableNumber && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                Table {tx.tableNumber}
              </span>
            )}
            {tx.assignedRider?.name && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                <Bike size={10} /> Rider: {tx.assignedRider.name}
              </span>
            )}
          </div>

          <div className="rounded-xl border border-surface-200 bg-surface-50/40 p-3">
            <div className="flex items-center gap-2">
              <User size={13} className="text-surface-400" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Punched by</p>
                <p className="text-sm font-semibold text-surface-800">{cashierLabel(tx)}</p>
              </div>
            </div>
          </div>

          {cancellationReason && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
              <div className="flex items-start gap-2">
                <Ban size={13} className="mt-0.5 shrink-0 text-rose-500" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Cancellation reason</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium text-rose-800">{cancellationReason}</p>
                </div>
              </div>
            </div>
          )}

          {/* Customer */}
          {tx.customer && (
            <div className="rounded-xl border border-surface-200 bg-surface-50/40 p-3">
              <div className="flex items-center gap-2">
                <User size={13} className="text-surface-400" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-surface-800 truncate">{tx.customer.name || 'Guest'}</p>
                  {tx.customer.phone && <p className="text-xs text-surface-500">{tx.customer.phone}</p>}
                </div>
              </div>
              {tx.deliveryAddress && (
                <div className="mt-2 flex items-start gap-2 text-xs text-surface-500">
                  <MapPin size={12} className="text-surface-400 mt-0.5 shrink-0" />
                  <span>{[tx.deliveryAddress.label, tx.deliveryAddress.street, tx.deliveryAddress.area, tx.deliveryAddress.city].filter(Boolean).join(', ')}</span>
                </div>
              )}
            </div>
          )}
          {tx.orderType === 'foodpanda' && (
            <div className="rounded-xl border border-pink-200 bg-pink-50/40 p-3 text-xs text-surface-600">
              <div className="flex justify-between gap-3">
                <span>Foodpanda Order #</span>
                <span className="font-bold text-pink-700">{tx.foodPandaOrderNumber || tx.foodPandaReference || '—'}</span>
              </div>
              <div className="mt-1 flex justify-between gap-3">
                <span>Customer</span>
                <span className="font-medium text-right">{tx.foodPandaCustomerName || '—'}</span>
              </div>
            </div>
          )}

          {/* Items */}
          <div className="rounded-xl border border-surface-200">
            <div className="flex items-center justify-between border-b border-surface-100 bg-surface-50 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">Items</span>
              <span className="text-[10px] text-surface-400">{(tx.items || []).reduce((s, i) => s + (i.qty || 0), 0)} qty</span>
            </div>
            <div className="divide-y divide-surface-100">
              {(tx.items || []).map((it, i) => (
                <div key={i} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-surface-800 truncate">
                      {it.name}{(it.variation?.name || it.variationName) ? ` (${it.variation?.name || it.variationName})` : ''}
                    </p>
                    <p className="text-xs text-surface-500">
                      {it.qty} × {fmtPKR(it.unitPrice)}
                      {(Number(it.wastedQty) || 0) > 0 && <span className="ml-1 font-semibold text-orange-600">· {it.wastedQty} wasted</span>}
                    </p>
                  </div>
                  <p className="font-semibold text-surface-900 whitespace-nowrap">{fmtPKR(it.lineTotal ?? (it.qty * it.unitPrice))}</p>
                </div>
              ))}
              {(tx.items || []).length === 0 && <p className="px-3 py-2 text-xs italic text-surface-400">No items</p>}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-surface-200 p-3 space-y-1.5">
            <div className="flex justify-between text-xs text-surface-500">
              <span>Subtotal</span>
              <span>{fmtPKR(tx.subtotal)}</span>
            </div>
            {tx.taxAmount > 0 && (() => {
              const taxBase = (tx.items || []).reduce(
                (s, i) => s + ((Number(i.taxRate) || 0) > 0 ? Number(i.lineTotal ?? 0) : 0), 0);
              const rate = tx.effectiveTaxRate != null && tx.effectiveTaxRate !== ''
                ? Number(tx.effectiveTaxRate)
                : (taxBase > 0 ? (tx.taxAmount / taxBase) * 100 : 0);
              return (
                <div className="flex justify-between text-xs text-surface-500">
                  <span>Tax{rate > 0 ? ` (${fmtRate(rate)}%)` : ''}</span>
                  <span>{fmtPKR(tx.taxAmount)}</span>
                </div>
              );
            })()}
            {tx.serviceChargeAmount > 0 && (() => {
              const scBase = (tx.items || []).reduce(
                (s, i) => s + ((Number(i.serviceChargeRate ?? i.serviceCharge) || 0) > 0 ? Number(i.lineTotal ?? 0) : 0), 0);
              const rate = scBase > 0 ? (tx.serviceChargeAmount / scBase) * 100 : 0;
              return (
                <div className="flex justify-between text-xs text-surface-500">
                  <span>Service Charge{rate > 0 ? ` (${fmtRate(rate)}%)` : ''}</span>
                  <span>{fmtPKR(tx.serviceChargeAmount)}</span>
                </div>
              );
            })()}
            {tx.orderType !== 'foodpanda' && tx.paymentMethod !== 'foodpanda' && tx.discountAmount > 0 && (() => {
              const storedRate = Number(tx.discountPercent || 0);
              const subtotal = Number(tx.subtotal || 0);
              const effectiveRate = storedRate > 0
                ? storedRate
                : (subtotal > 0 ? (Number(tx.discountAmount) / subtotal) * 100 : 0);
              return (
                <div className="flex justify-between text-xs text-rose-600">
                  <span>Discount{effectiveRate > 0 ? ` (${fmtRate(effectiveRate)}%)` : ''}</span>
                  <span>- {fmtPKR(tx.discountAmount)}</span>
                </div>
              );
            })()}
            {tx.orderType !== 'foodpanda' && tx.paymentMethod !== 'foodpanda' && tx.pointsRedeemed > 0 && (
              <div className="flex justify-between text-xs text-amber-700">
                <span className="inline-flex items-center gap-1"><Award size={11} /> Points Redeemed ({tx.pointsRedeemed})</span>
                <span>- {fmtPKR(tx.pointsRedeemedValue || 0)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-surface-100 pt-2 text-sm font-bold text-surface-900">
              <span>Total</span>
              <span>{fmtPKR(tx.totalAmount)}</span>
            </div>
          </div>

          {/* Membership / Rewards block — shown only when this sale touched points. */}
          {tx.orderType !== 'foodpanda' && tx.paymentMethod !== 'foodpanda'
            && (tx.pointsEarned > 0 || tx.pointsRedeemed > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                <Award size={11} /> Membership Rewards
              </div>
              {tx.pointsRedeemed > 0 && (
                <div className="flex justify-between text-xs text-amber-800">
                  <span>Redeemed</span>
                  <span className="font-semibold">−{tx.pointsRedeemed} pts ({fmtPKR(tx.pointsRedeemedValue || 0)})</span>
                </div>
              )}
              {tx.pointsEarned > 0 && (
                <div className="flex justify-between text-xs text-amber-800">
                  <span>Earned</span>
                  <span className="font-semibold">+{tx.pointsEarned} pts</span>
                </div>
              )}
              {tx.status === 'refunded' && (
                <p className="text-[11px] italic text-amber-600 mt-1">
                  Reversed when this sale was refunded.
                </p>
              )}
              {tx.status === 'void' && (
                <p className="text-[11px] italic text-amber-600 mt-1">
                  Reversed when this sale was voided.
                </p>
              )}
            </div>
          )}

          {/* Payment breakdown */}
          {!isUnpaid && tx.paymentMethod === 'cash' && tx.cashTendered != null && (
            <div className="rounded-xl border border-surface-200 p-3 space-y-1 text-xs text-surface-500">
              <div className="flex justify-between"><span>Cash tendered</span><span>{fmtPKR(tx.cashTendered)}</span></div>
              <div className="flex justify-between"><span>Change</span><span>{fmtPKR(tx.changeGiven ?? Math.max(0, (tx.cashTendered ?? 0) - (tx.totalAmount ?? 0)))}</span></div>
            </div>
          )}
          {!isUnpaid && tx.paymentMethod === 'split' && (
            <div className="rounded-xl border border-surface-200 p-3 space-y-1 text-xs text-surface-500">
              <div className="flex justify-between"><span>Cash</span><span>{fmtPKR(tx.cashAmount)}</span></div>
              <div className="flex justify-between"><span>Card</span><span>{fmtPKR(tx.cardAmount)}</span></div>
            </div>
          )}
          {!isUnpaid && tx.paymentMethod === 'card' && (
            <div className="rounded-xl border border-surface-200 p-3 space-y-1 text-xs text-surface-500">
              <div className="flex justify-between">
                <span>Card</span>
                <span className="tabular-nums">{tx.cardLast4 ? `****${tx.cardLast4}` : fmtPKR(tx.totalAmount)}</span>
              </div>
            </div>
          )}
          {!isUnpaid && tx.paymentMethod === 'online-transfer' && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3 space-y-1 text-xs text-surface-600">
              <div className="flex justify-between"><span>Online transfer</span><span>{fmtPKR(tx.onlineTransferAmount || tx.totalAmount)}</span></div>
              <div className="flex justify-between gap-3"><span>Reference</span><span className="font-medium break-all text-right">{tx.onlineTransferReference || '—'}</span></div>
            </div>
          )}
          {!isUnpaid && tx.paymentMethod === 'charge-to-salary' && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-1 text-xs text-surface-600">
              <div className="flex justify-between gap-3">
                <span className="font-semibold text-violet-700">Charged to salary</span>
                <span>{fmtPKR(tx.totalAmount)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Employee</span>
                <span className="font-medium text-right">
                  {tx.chargeToSalaryEmployee?.name || tx.chargeToSalaryEmployeeName || 'Employee'}
                </span>
              </div>
              <p className="text-[10px] italic text-violet-600">Recoverable through payroll; no cash entered the drawer.</p>
            </div>
          )}
          {!isUnpaid && tx.paymentMethod === 'foodpanda' && (
            <div className="rounded-xl border border-pink-200 bg-pink-50/40 p-3 space-y-1 text-xs text-surface-600">
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-pink-700">
                  <Bike size={12} /> Food Panda
                </span>
                <span>{fmtPKR(tx.foodPandaAmount || tx.totalAmount)}</span>
              </div>
              {tx.foodPandaReference && (
                <div className="flex justify-between">
                  <span>Reference</span>
                  <span className="font-medium">{tx.foodPandaReference}</span>
                </div>
              )}
              <p className="text-[10px] text-pink-600 italic">Platform pays later — recorded as receivable.</p>
            </div>
          )}

          {tx.notes && (
            <div className="rounded-xl border border-surface-200 bg-surface-50/40 p-3 text-xs text-surface-600">
              <p className="font-semibold text-surface-700 mb-1">Note</p>
              <p className="whitespace-pre-wrap">{tx.notes}</p>
            </div>
          )}

          {praResult?.status && (
            <div className="rounded-xl border border-surface-200 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-surface-700">PRA eIMS {praIsCredit ? 'credit' : 'invoice'}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  praResult.status === 'reported' ? 'bg-emerald-50 text-emerald-700'
                  : praResult.status === 'failed' ? 'bg-rose-50 text-rose-700'
                  : 'bg-amber-50 text-amber-700'}`}>
                  {praResult.status === 'reported' ? 'Reported' : praResult.status === 'failed' ? 'Failed' : 'Pending'}
                </span>
              </div>
              {praResult.invoiceNumber && (
                <p className="mt-1 text-xs text-surface-500 break-all">#{praResult.invoiceNumber}</p>
              )}
              {praResult.error && praResult.status !== 'reported' && (
                <p className="mt-1 text-xs text-rose-600">{praResult.error}</p>
              )}
              {canRetryPra && !['reported', 'submitting'].includes(praResult.status) && (
                <button
                  type="button"
                  onClick={() => onRetryPra?.(tx)}
                  className="mt-2 btn-secondary w-full justify-center gap-2 py-2 text-xs"
                >
                  <RefreshCw size={13} /> Retry PRA submission
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => requestReceiptPrint({
              transaction: tx,
              outletName,
              cashierName: cashierLabel(tx),
            })}
            className="btn-secondary w-full justify-center gap-2 py-2.5 text-sm"
          >
            <Printer size={14} />
            Reprint Receipt
          </button>

          {!isOwnOrder && tx.status === 'completed' && (
            <p className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-center text-[11px] text-surface-500">
              Only {cashierLabel(tx)} can cancel this order or log its items as waste.
            </p>
          )}

          {/* Log as waste — available until the order is fully wasted */}
          {isOwnOrder && canLogOrderAsWaste && tx.status === 'completed' && (
            tx.isVoidedAsWaste ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 py-2.5 text-sm font-semibold text-orange-700">
                <Trash2 size={14} /> {tx.rePrepared ? 'Logged as waste · re-made' : 'Logged as waste'}
              </div>
            ) : (
              <>
                {tx.partiallyWasted && (
                  <div className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-1.5 text-[11px] font-semibold text-amber-700">
                    <Trash2 size={12} /> Partially wasted — some items remain
                  </div>
                )}
                {(isManager || tx.isCurrentBusinessDay !== false) && (
                  <button
                    type="button"
                    onClick={() => onWaste?.(tx)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 transition"
                  >
                    <Trash2 size={14} />
                    {tx.partiallyWasted ? 'Log more as waste' : 'Log Order as Waste'}
                  </button>
                )}
              </>
            )
          )}

          {!isManager
            && isOwnOrder
            && (canCancelOrders || canLogOrderAsWaste)
            && tx.status === 'completed'
            && tx.isCurrentBusinessDay === false && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-medium text-amber-700">
              This business day has ended. Cashier cancellation and waste logging are locked; ask an owner or finance manager.
            </p>
          )}

          {isOwnOrder
            && tx.status === 'completed'
            && !canCancelOrders
            && !canLogOrderAsWaste && (
            <p className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-center text-[11px] text-surface-500">
              You do not have permission to cancel orders or log them as waste.
            </p>
          )}

          {/* Cancel (void) the whole order — full reversal; hidden once any waste is logged */}
          {isOwnOrder && canCancelOrders && (isManager || tx.isCurrentBusinessDay !== false) && tx.status === 'completed' && !tx.isVoidedAsWaste && !tx.partiallyWasted && (
            <button
              type="button"
              onClick={() => onCancel?.(tx)}
              disabled={requiresKitchenCancellation(tx.kds)}
              title={requiresKitchenCancellation(tx.kds) ? KDS_CANCELLATION_MESSAGE : undefined}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition"
            >
              <Ban size={14} /> {requiresKitchenCancellation(tx.kds) ? 'Cancel from KDS' : 'Cancel Order'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderHistoryView;
