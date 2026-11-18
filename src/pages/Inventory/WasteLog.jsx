import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { Trash2, Plus, ChevronDown, ShoppingBag, Search, ChevronRight, AlertTriangle, Loader2, FlaskConical, Receipt, X, RefreshCw, Ban } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { cancelSaleTransaction, logWaste, getSaleTransactionsForWaste, getSaleWasteCostPreview, logWasteFromSale } from '../../api/inventoryApi';
import usePermissions from '../../hooks/usePermissions';
import { useGetOutletsQuery, useGetProductsQuery, useGetWasteLogsQuery, listQueryOpts, baseApi } from '../../store/baseApi';
import usePagination from '../../hooks/usePagination';
import Table from '../../components/UI/Table';
import Pagination from '../../components/UI/Pagination';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import { entryUnitsForProduct, convertQty } from '../../utils/units';
import HeroBanner from '../../components/UI/HeroBanner';
import StatTile from '../../components/UI/StatTile';
import Button from '../../components/UI/Button';
import PremiumModal, { SecondaryButton, PrimaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';
import Portal from '../../components/UI/Portal';
import FilterBar from '../../components/UI/FilterBar';
import useQueryState from '../../hooks/useQueryState';

const fmt = (n) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const REASONS = [
  { value: 'spoilage',       label: 'Spoilage' },
  { value: 'spillage',       label: 'Spillage' },
  { value: 'overProduction', label: 'Over Production' },
  { value: 'theft',          label: 'Theft' },
  { value: 'expired',        label: 'Expired' },
  { value: 'orderVoid',      label: 'Order Voided as Loss' },
  { value: 'other',          label: 'Other' },
];

const REASON_OPTIONS = [{ value: '', label: 'All reasons' }, ...REASONS];

// 'orderVoid' ("Order Voided as Loss") belongs to the Punched-Order waste flow,
// not manual entry — exclude it from the manual Log Waste dropdown.
const MANUAL_REASONS = REASONS.filter((r) => r.value !== 'orderVoid');

const REASON_COLOR = {
  spoilage:       'bg-orange-100 text-orange-700',
  spillage:       'bg-blue-100 text-blue-700',
  overProduction: 'bg-purple-100 text-purple-700',
  theft:          'bg-red-100 text-red-700',
  expired:        'bg-amber-100 text-amber-700',
  orderVoid:      'bg-rose-100 text-rose-700',
  other:          'bg-gray-100 text-gray-600',
};

// ── Product searchable select ─────────────────────────────────────────────────
const ProductSelect = ({ value, onChange, products }) => {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef();

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = products.find((p) => p._id === value);
  const filtered = products.filter((p) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm text-left transition',
          open ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-300 hover:border-gray-400'
        )}
      >
        <span className={clsx('truncate', selected ? 'text-gray-800' : 'text-gray-400')}>
          {selected ? selected.name : 'Select product…'}
        </span>
        <ChevronDown size={14} className="shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-400 text-center">No products found.</li>
            )}
            {filtered.map((p) => (
              <li key={p._id}>
                <button
                  type="button"
                  onClick={() => { onChange(p); setOpen(false); setSearch(''); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-indigo-50 transition"
                >
                  {p.sku && <span className="font-mono text-xs text-gray-400 shrink-0">{p.sku}</span>}
                  <span className="text-gray-800 truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ── Waste log form schema ─────────────────────────────────────────────────────
const schema = z.object({
  product: z.string().min(1, 'Product required'),
  qty:     z.coerce.number().positive('Quantity must be positive'),
  unit:    z.string().min(1, 'Unit required'),
  reason:  z.enum(['spoilage', 'spillage', 'overProduction', 'theft', 'expired', 'other'], { required_error: 'Select reason' }),
  notes:   z.string().optional(),
});

// ── Log Waste Modal ───────────────────────────────────────────────────────────
const LogWasteModal = ({ onClose, onSaved, outletId }) => {
  const dispatch = useDispatch();
  const { data: products = [] } = useGetProductsQuery({ limit: 200, isActive: true });
  const [selectedProd,  setSelectedProd]  = useState(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const qty = parseFloat(watch('qty')) || 0;

  const handleProductChange = (prod) => {
    setSelectedProd(prod);
    setValue('product', prod._id);
    setValue('unit', prod.unit ?? '');
  };

  // Units offered are filtered to the selected product's base unit (weight →
  // weight sub-units, volume → volume, count → just the base) — same helper the
  // Store↔Kitchen transfer form uses.
  const baseUnit = selectedProd?.unit || '';
  const unitOptions = selectedProd
    ? entryUnitsForProduct(baseUnit).map((u) => ({ value: u, label: u }))
    : [];

  // Weighted-average cost (product.currentPrice) is the canonical carrying value
  // used everywhere else; vendor last price / defaultPrice are only fallbacks.
  const currentPrice = selectedProd?.currentPrice || selectedProd?.vendors?.[0]?.currentPrice || selectedProd?.defaultPrice || 0;
  // Cost is per BASE unit, so convert the entered qty→base for the estimate
  // (matches the server, which stores/deducts/cost in base units).
  const enteredUnit = watch('unit') || baseUnit;
  const { qty: baseQty, converted: unitOk } = convertQty(qty, enteredUnit, baseUnit);
  const estimatedCost = (baseQty * currentPrice).toFixed(2);

  const onSubmit = async (values) => {
    try {
      await logWaste({
        ...values,
        outlet: outletId || undefined,
        costAtTime: currentPrice || undefined,
      });
      dispatch(baseApi.util.invalidateTags(['WasteLog', 'Stock', 'Report', 'Accounting']));
      toast.success('Waste logged.');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to log waste.');
    }
  };

  return (
    <PremiumModal
      open
      onClose={isSubmitting ? undefined : onClose}
      icon={Trash2}
      eyebrow="Log Waste"
      title="Log Waste"
      subtitle="Record spoilage, spillage or other inventory loss"
      accent="rose"
      size="md"
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose} disabled={isSubmitting}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting} accent="rose">
            {isSubmitting ? 'Logging…' : 'Log Waste'}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div>
            <label className={labelCls}>Product <span className="text-rose-500">*</span></label>
            <Controller
              name="product"
              control={control}
              render={() => (
                <ProductSelect
                  value={selectedProd?._id ?? ''}
                  onChange={handleProductChange}
                  products={products}
                />
              )}
            />
            {errors.product && <p className="mt-1 text-xs text-red-600">{errors.product.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Quantity <span className="text-rose-500">*</span></label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                {...register('qty')}
                className={inputCls}
              />
              {errors.qty && <p className="mt-1 text-xs text-red-600">{errors.qty.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Unit <span className="text-rose-500">*</span></label>
              <Controller
                name="unit"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={unitOptions}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder={selectedProd ? 'Select unit…' : 'Pick a product first'}
                    searchPlaceholder="Search units…"
                    disabled={!selectedProd}
                  />
                )}
              />
              {errors.unit && <p className="mt-1 text-xs text-red-600">{errors.unit.message}</p>}
            </div>
          </div>

          <div>
            <label className={labelCls}>Reason <span className="text-rose-500">*</span></label>
            <Controller
              name="reason"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  options={MANUAL_REASONS.map((r) => ({ value: r.value, label: r.label }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select reason…"
                />
              )}
            />
            {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason.message}</p>}
          </div>

          <div>
            <label className={labelCls}>Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              {...register('notes')}
              rows={2}
              className={clsx(inputCls, 'resize-none')}
            />
          </div>

          {selectedProd && qty > 0 && unitOk && (
            <div className="flex items-center justify-between px-4 py-3 bg-rose-50/50 rounded-xl border border-rose-100">
              <div className="text-xs text-slate-500">
                {fmt(qty)} {enteredUnit}
                {enteredUnit !== baseUnit && <span> = {fmt(baseQty)} {baseUnit}</span>}
                {' '}× Rs.{currentPrice.toFixed(2)}/{baseUnit || 'unit'}
              </div>
              <div className="text-sm font-bold text-slate-800">
                Est. cost: <span className="text-rose-600 tabular-nums">Rs. {estimatedCost}</span>
              </div>
            </div>
          )}
        </div>
      </form>
    </PremiumModal>
  );
};

// ── Log Sale (Punched Order) as Waste Modal ──────────────────────────────────
export const LogSaleWasteModal = ({ onClose, onSaved, initialTransactions = [], setInitialTransactions, previewCacheRef = null, transactionsLoaded = false, setTransactionsLoaded = () => {} }) => {
  const dispatch = useDispatch();
  const { has } = usePermissions();
  const canCancelOrders = has('pos.cancelOrder');
  const [search, setSearch] = useState('');
  const [transactions, setTxns]         = useState(initialTransactions);
  const [txnLoading,   setTxnLoading]   = useState(false);
  const [selected,     setSelected]     = useState(null);
  const [preview,      setPreview]      = useState(null);   // cost breakdown
  const [previewLoading, setPreviewLoading] = useState(false);
  const [expandedItems, setExpandedItems]  = useState({});  // { index: bool }
  const [reason,       setReason]       = useState('orderVoid');
  const [notes,        setNotes]        = useState('');
  const [rePrepare,    setRePrepare]    = useState(false);
  const [valuationMethod, setValuationMethod] = useState('ingredientCost');
  const [mode,         setMode]         = useState('whole');  // 'whole' | 'select'
  const [selQty,       setSelQty]       = useState({});       // { [lineIndex]: qty }
  const [submitting,   setSubmitting]   = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [preparedChoice, setPreparedChoice] = useState(null);
  const [cancelBusy,   setCancelBusy]   = useState(false);
  const [show,         setShow]         = useState(false);    // drawer slide-in
  const searchTimeout = useRef(null);
  const localPreviewCacheRef = useRef({});
  const previewCache = previewCacheRef ?? localPreviewCacheRef;

  // Trigger the slide-in AFTER the portal has painted the closed (off-screen)
  // state — double rAF guarantees the browser sees translate-x-full first, so the
  // transition to translate-x-0 actually animates (a plain effect gets coalesced
  // into the initial insert when portaled).
  useEffect(() => {
    let r2;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShow(true)); });
    return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2); };
  }, []);

  const loadTransactions = useCallback(async (q = '') => {
    setTxnLoading(true);
    try {
      const { data } = await getSaleTransactionsForWaste({ q: q || undefined, limit: 20 });
      setTxns(data.data?.transactions ?? []);
      if (setInitialTransactions) setInitialTransactions(data.data?.transactions ?? []);
      if (setTransactionsLoaded) setTransactionsLoaded(true);
    } catch {
      setTxns([]);
    } finally {
      setTxnLoading(false);
    }
  }, [setInitialTransactions, setTransactionsLoaded]);

  // Auto-load ONCE per mount. Guarded with a ref because loadTransactions itself
  // updates initialTransactions (to a fresh array — empty when there are no
  // orders), which would otherwise re-trigger this effect and loop forever,
  // leaving the spinner stuck. On (re)open, if nothing is cached we fetch once.
  const didAutoLoad = useRef(false);
  useEffect(() => {
    if (didAutoLoad.current) return;
    didAutoLoad.current = true;
    if (!transactionsLoaded || (initialTransactions?.length ?? 0) === 0) {
      loadTransactions();
    } else {
      setTxns(initialTransactions);
    }
  }, [loadTransactions, transactionsLoaded, initialTransactions]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadTransactions(val), 350);
  };

  const handleSelect = async (tx) => {
    setSelected(tx);
    setExpandedItems({});
    setMode('whole');
    setSelQty({});
    setValuationMethod('ingredientCost');

    // Serve from cache if available
    const cached = previewCache.current?.[tx._id];
    if (cached) {
      setPreview(cached);
      setValuationMethod(Number(cached.recipeCost) > 0 ? 'ingredientCost' : 'orderValue');
      setPreviewLoading(false);
      return;
    }

    setPreview(null);
    setPreviewLoading(true);
    try {
      const { data } = await getSaleWasteCostPreview(tx._id);
      setPreview(data.data);
      setValuationMethod(Number(data.data?.recipeCost) > 0 ? 'ingredientCost' : 'orderValue');
      // store in cache (local or parent-provided ref)
      if (previewCache && previewCache.current) previewCache.current[tx._id] = data.data;
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const toggleItem = (i) => setExpandedItems((prev) => ({ ...prev, [i]: !prev[i] }));

  // ── Partial-waste selection helpers ──────────────────────────────────────────
  const previewItems = preview?.items ?? [];
  const perUnitCost = (it) => (Number(it.qty) > 0 ? (Number(it.ingredientCost) || 0) / Number(it.qty) : 0);
  const perUnitOrderValue = (it) => (Number(it.qty) > 0
    ? Number(it.orderValue ?? it.lineTotal ?? 0) / Number(it.qty)
    : 0);
  const remainingOf = (it) => Number(it.remainingQty ?? it.qty) || 0;
  const totalRemaining = previewItems.reduce((s, it) => s + remainingOf(it), 0);
  const selectedUnits = mode === 'whole'
    ? totalRemaining
    : Object.values(selQty).reduce((s, q) => s + (Number(q) || 0), 0);
  const ingredientWasteCost = mode === 'whole'
    ? previewItems.reduce((s, it) => s + perUnitCost(it) * remainingOf(it), 0)
    : previewItems.reduce((s, it) => s + perUnitCost(it) * (Number(selQty[it.index]) || 0), 0);
  const orderWasteValue = mode === 'whole'
    ? previewItems.reduce((s, it) => s + perUnitOrderValue(it) * remainingOf(it), 0)
    : previewItems.reduce((s, it) => s + perUnitOrderValue(it) * (Number(selQty[it.index]) || 0), 0);
  const wasteValue = valuationMethod === 'orderValue' ? orderWasteValue : ingredientWasteCost;
  const canSubmit = !!selected
    && !submitting
    && totalRemaining > 0
    && (mode === 'whole' || selectedUnits > 0)
    && wasteValue > 0;

  const setLineQty = (index, remaining, q) => {
    const v = Math.max(0, Math.min(remaining, Math.round(q)));
    setSelQty((prev) => {
      const next = { ...prev };
      if (v <= 0) delete next[index]; else next[index] = v;
      return next;
    });
  };
  const toggleLine = (index, remaining) => {
    setSelQty((prev) => {
      const next = { ...prev };
      if (next[index] > 0) delete next[index]; else next[index] = remaining;
      return next;
    });
  };

  const buildSelection = () => {
    if (mode === 'whole') return null;
    return previewItems
      .filter((it) => (Number(selQty[it.index]) || 0) > 0)
      .map((it) => ({ index: it.index, qty: Number(selQty[it.index]) }));
  };

  const handleSubmit = async () => {
    if (!selected) return toast.error('Select a transaction first.');
    if (mode === 'select' && selectedUnits <= 0) return toast.error('Select at least one item to waste.');
    if (wasteValue <= 0) {
      return toast.error(
        valuationMethod === 'ingredientCost'
          ? 'Ingredient cost is zero. Choose Order value before logging this waste.'
          : 'The selected order value is zero and cannot be logged.',
      );
    }
    setSubmitting(true);
    try {
      await logWasteFromSale({
        saleTransactionId: selected._id,
        reason,
        notes,
        rePrepare,
        selection: buildSelection(),
        valuationMethod,
      });
      dispatch(baseApi.util.invalidateTags(['WasteLog', 'Stock', 'Report', 'Accounting']));
      // Incremental waste leaves the order selectable — drop its stale cached
      // preview and force the transaction list to reload so reopening shows the
      // updated remaining quantities (not the pre-waste ones).
      if (previewCache?.current) delete previewCache.current[selected._id];
      setTransactionsLoaded(false);
      toast.success(rePrepare ? 'Order logged as waste & re-prepared.' : 'Order logged as waste successfully.');
      animateClose(onSaved);
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to log waste.');
    } finally {
      setSubmitting(false);
    }
  };

  const openCancelConfirmation = () => {
    if (!selected) return toast.error('Select a transaction first.');
    if (!canCancelOrders) return toast.error('You do not have permission to cancel orders.');
    if (selected.partiallyWasted) {
      return toast.error('This order already has waste logged against it and cannot be cancelled.');
    }
    setCancelReason('');
    setPreparedChoice(null);
    setCancelTarget(selected);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    if (!canCancelOrders) {
      setCancelTarget(null);
      return toast.error('You do not have permission to cancel orders.');
    }
    const voidReason = cancelReason.trim();
    if (voidReason.length < 3) return toast.error('Enter a reason (at least 3 characters).');
    if (preparedChoice === null) return toast.error('Choose whether the kitchen prepared this order.');
    if (preparedChoice && (previewLoading || !preview)) {
      return toast.error('Wait for the waste values to finish calculating.');
    }
    if (preparedChoice && mode === 'select' && selectedUnits <= 0) {
      return toast.error('Select at least one prepared item to waste.');
    }
    if (preparedChoice && wasteValue <= 0) {
      return toast.error(
        valuationMethod === 'ingredientCost'
          ? 'Ingredient cost is zero. Choose Order value before cancelling this prepared order.'
          : 'The selected order value is zero and cannot be logged.',
      );
    }

    setCancelBusy(true);
    try {
      await cancelSaleTransaction(cancelTarget._id, {
        voidReason,
        prepared: preparedChoice,
        selection: preparedChoice ? buildSelection() : null,
        ...(preparedChoice ? { valuationMethod } : {}),
      });
      dispatch(baseApi.util.invalidateTags(['WasteLog', 'Stock', 'Report', 'Accounting']));
      if (previewCache?.current) delete previewCache.current[cancelTarget._id];
      setTransactionsLoaded(false);
      toast.success(
        preparedChoice
          ? 'Order cancelled — prepared items logged as waste.'
          : 'Order cancelled — unprepared ingredients restored to stock.',
      );
      setCancelTarget(null);
      setCancelReason('');
      setPreparedChoice(null);
      animateClose(onSaved);
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to cancel order.');
    } finally {
      setCancelBusy(false);
    }
  };

  const fmtRs = (n) => `Rs. ${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Slide out, then unmount once the transition finishes.
  const animateClose = (cb) => { setShow(false); setTimeout(() => cb?.(), 300); };
  const requestClose = () => { if (!submitting && !cancelBusy) animateClose(onClose); };

  return (
    <Portal>
      {/* Backdrop */}
      <div
        onClick={requestClose}
        className={clsx('fixed inset-0 bg-black/30 z-[60] transition-opacity duration-300', show ? 'opacity-100' : 'opacity-0 pointer-events-none')}
      />
      {/* Panel */}
      <div
        className={clsx(
          'safe-area-drawer fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl z-[70] flex flex-col',
          'transition-transform duration-300 ease-out will-change-transform',
          show ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="relative px-5 py-4 bg-gradient-to-r from-rose-500 to-orange-500 text-white shrink-0">
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            className="absolute right-4 top-2.5 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-50"
            aria-label="Close punched order waste form"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 shrink-0">
              <ShoppingBag size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Punched Order</p>
              <h2 className="text-lg font-bold leading-tight">Manage Punched Order</h2>
              <p className="text-xs text-white/80 mt-0.5">Log waste or cancel and fully reverse the order</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-5">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search by transaction number…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent transition"
            />
          </div>

          {/* Transaction list */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Orders</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {txnLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                  <Loader2 size={16} className="animate-spin" /> Loading transactions…
                </div>
              ) : transactions.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No transactions found.</div>
              ) : (
                <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {transactions.map((tx) => {
                    const isSelected = selected?._id === tx._id;
                    return (
                      <li key={tx._id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(tx)}
                          className={clsx(
                            'w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                            isSelected ? 'bg-rose-50' : 'hover:bg-gray-50'
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={clsx(
                              'w-2 h-2 rounded-full shrink-0 transition-colors',
                              isSelected ? 'bg-rose-500' : 'bg-gray-300'
                            )} />
                            <div className="min-w-0">
                              <p className={clsx('text-sm font-semibold truncate', isSelected ? 'text-rose-700' : 'text-gray-800')}>
                                {tx.transactionNumber}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {format(new Date(tx.createdAt), 'dd MMM yyyy, hh:mm a')}
                                {' · '}{tx.items?.length ?? 0} item{tx.items?.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-gray-700">{fmtRs(tx.totalAmount)}</p>
                            <p className="text-xs text-gray-400">sale total</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Cost Breakdown */}
          {selected && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ingredient Cost Breakdown</p>
                {preview && totalRemaining > 0 && (
                  <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                    <button
                      type="button"
                      onClick={() => setMode('whole')}
                      className={clsx('px-2.5 py-1 rounded-md text-xs font-semibold transition-colors', mode === 'whole' ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                    >
                      Entire order
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('select')}
                      className={clsx('px-2.5 py-1 rounded-md text-xs font-semibold transition-colors', mode === 'select' ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                    >
                      Select items
                    </button>
                  </div>
                )}
              </div>

              {preview && (
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="mb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Waste valuation</p>
                    <p className="mt-0.5 text-xs text-slate-400">Controls the value shown in the Waste Log and waste reports.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setValuationMethod('ingredientCost')}
                      aria-pressed={valuationMethod === 'ingredientCost'}
                      className={clsx(
                        'rounded-xl border px-3 py-2.5 text-left transition',
                        valuationMethod === 'ingredientCost'
                          ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <span className="block text-sm font-bold text-slate-800">Ingredient cost</span>
                      <span className="mt-0.5 block text-xs text-slate-500">Recipe purchase cost · {fmtRs(ingredientWasteCost)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setValuationMethod('orderValue')}
                      aria-pressed={valuationMethod === 'orderValue'}
                      className={clsx(
                        'rounded-xl border px-3 py-2.5 text-left transition',
                        valuationMethod === 'orderValue'
                          ? 'border-rose-400 bg-rose-50 ring-1 ring-rose-200'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <span className="block text-sm font-bold text-slate-800">Order value</span>
                      <span className="mt-0.5 block text-xs text-slate-500">Final billed value · {fmtRs(orderWasteValue)}</span>
                    </button>
                  </div>
                  {valuationMethod === 'ingredientCost' && ingredientWasteCost <= 0 && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-700">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      Ingredient cost is zero. Choose Order value if purchases were not recorded in the app.
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-slate-400">
                    Accounting entries remain based on ingredient cost so retail markup and tax are not treated as inventory cost.
                  </p>
                </div>
              )}

              {previewLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 border border-gray-200 rounded-xl text-sm text-gray-400">
                  <Loader2 size={16} className="animate-spin" /> Calculating ingredient costs…
                </div>
              ) : preview ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Per-item rows */}
                  {preview.items.map((item, i) => {
                    const lineIndex = item.index ?? i;
                    const remaining = Number(item.remainingQty ?? item.qty) || 0;
                    const selectedQty = Number(selQty[lineIndex]) || 0;
                    const hasDetail = !item.usingFallback && item.ingredients?.length > 0;
                    const displayedItemValue = valuationMethod === 'orderValue'
                      ? Number(item.orderValue ?? item.lineTotal ?? 0)
                      : Number(item.ingredientCost || 0);
                    return (
                    <div key={i} className={clsx('border-b border-gray-100 last:border-0', remaining === 0 ? 'bg-gray-50/60' : item.usingFallback ? 'bg-amber-50/40' : 'bg-white')}>
                      {/* Item header row */}
                      <div className={clsx('flex items-center gap-3 px-4 py-3', remaining === 0 && 'opacity-60')}>
                        {mode === 'select' && (
                          <input
                            type="checkbox"
                            disabled={remaining === 0}
                            checked={selectedQty > 0}
                            onChange={() => toggleLine(lineIndex, remaining)}
                            className="h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-400 shrink-0 disabled:opacity-40"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => hasDetail && toggleItem(i)}
                          className={clsx('flex flex-1 min-w-0 items-center gap-3 text-left', hasDetail ? 'cursor-pointer' : 'cursor-default')}
                        >
                          <div className={clsx(
                            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                            item.usingFallback ? 'bg-amber-100' : 'bg-emerald-50'
                          )}>
                            {item.usingFallback
                              ? <AlertTriangle size={13} className="text-amber-500" />
                              : <FlaskConical size={13} className="text-emerald-600" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {item.name}{(item.variation?.name || item.variationName) ? ` (${item.variation?.name || item.variationName})` : ''}
                              <span className="text-gray-400 font-normal"> ×{item.qty}</span>
                            </p>
                            <p className={clsx('text-xs mt-0.5', item.usingFallback ? 'text-amber-600' : 'text-emerald-600')}>
                              {item.wastedQty > 0 && <span className="text-rose-500 font-medium">{item.wastedQty} wasted · {remaining} left · </span>}
                              {item.usingFallback ? 'No recipe — using sale price as fallback' : `${item.ingredients?.length ?? 0} ingredient${item.ingredients?.length !== 1 ? 's' : ''}`}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-gray-800">{fmtRs(displayedItemValue)}</p>
                            <p className="text-xs text-gray-400">{valuationMethod === 'orderValue' ? 'order value' : 'ingredient cost'}</p>
                          </div>
                          {hasDetail && (
                            <ChevronRight size={14} className={clsx('text-gray-400 transition-transform shrink-0', expandedItems[i] && 'rotate-90')} />
                          )}
                        </button>
                        {mode === 'select' && remaining === 0 && (
                          <span className="text-[10px] font-semibold text-gray-400 shrink-0 uppercase tracking-wide">fully wasted</span>
                        )}
                        {mode === 'select' && remaining > 0 && selectedQty > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setLineQty(lineIndex, remaining, selectedQty - 1)}
                              className="w-6 h-6 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm font-bold"
                            >−</button>
                            <span className="w-6 text-center text-sm font-bold tabular-nums text-gray-800">{selectedQty}</span>
                            <button
                              type="button"
                              onClick={() => setLineQty(lineIndex, remaining, selectedQty + 1)}
                              disabled={selectedQty >= remaining}
                              className="w-6 h-6 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 flex items-center justify-center text-sm font-bold"
                            >+</button>
                          </div>
                        )}
                      </div>

                      {/* Expanded ingredient detail */}
                      {expandedItems[i] && item.ingredients?.length > 0 && (
                        <div className="px-4 pb-3">
                          <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-100 w-full">
                            <div className="w-full overflow-x-auto">
                              <table className="min-w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-200 bg-gray-100">
                                  <th className="text-left px-3 py-2 font-semibold text-gray-500">Ingredient</th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-500">Qty Used</th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-500">Unit Price</th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-500">Cost</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {item.ingredients.map((ing, j) => (
                                  <tr key={j} className="hover:bg-white transition-colors">
                                    <td className="px-3 py-2 text-gray-700 font-medium">{ing.name}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">
                                      {ing.qty % 1 === 0 ? ing.qty : ing.qty.toFixed(3)} {ing.unit}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-600">
                                      {fmtRs(ing.unitCost)}/{ing.productUnit}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-800">
                                      {fmtRs(ing.cost)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}

                  {/* Summary footer */}
                  <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Receipt size={12} /> Sale total: <span className="font-semibold text-gray-700">{fmtRs(preview.saleTotal)}</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 mb-0.5">
                        Waste Value ({valuationMethod === 'orderValue' ? 'order value' : 'ingredient cost'}){mode === 'select' ? ` · ${selectedUnits} unit${selectedUnits === 1 ? '' : 's'}` : ''}
                      </p>
                      <p className="text-lg font-bold text-rose-600">{fmtRs(wasteValue)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-gray-400 border border-gray-200 rounded-xl">
                  Could not load cost breakdown.
                </div>
              )}
            </div>
          )}

          {/* Reason & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Reason</label>
              <SearchableSelect
                options={REASONS.map((r) => ({ value: r.value, label: r.label }))}
                value={reason}
                onChange={setReason}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Notes <span className="text-gray-300 font-normal normal-case">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={1}
                placeholder="e.g. Wrong order, customer rejected…"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent transition resize-none"
              />
            </div>
          </div>

          {/* Re-prepare: re-deduct stock for the re-cooked batch */}
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">Re-prepare this order for the customer?</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Deducts the recipe from stock a second time so the count stays exact. Only the wasted batch is booked as a loss — the re-made batch is the food the customer receives.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setRePrepare(false)}
                  className={clsx('rounded-lg border px-4 py-2 text-sm font-semibold transition-colors', !rePrepare ? 'border-gray-300 bg-gray-100 text-gray-900' : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50')}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setRePrepare(true)}
                  className={clsx('rounded-lg border px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap', rePrepare ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50')}
                >
                  Yes, re-make
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap items-center gap-2 shrink-0">
          <div className="min-w-0 flex-1 text-left text-sm text-slate-500">
            {preview && (
              <span>
                Logging <span className="font-semibold text-slate-800 tabular-nums">{fmtRs(wasteValue)}</span> as {valuationMethod === 'orderValue' ? 'order-value' : 'ingredient-cost'} waste
                {mode === 'select' && <span className="text-slate-400"> · {selectedUnits} unit{selectedUnits === 1 ? '' : 's'}</span>}
                {rePrepare && <span className="text-amber-600"> · stock re-deducted for re-make</span>}
              </span>
            )}
          </div>
          <SecondaryButton type="button" onClick={requestClose} disabled={submitting || cancelBusy}>Close</SecondaryButton>
          {canCancelOrders && (
            <button
              type="button"
              disabled={!selected || submitting || cancelBusy || selected?.partiallyWasted}
              onClick={openCancelConfirmation}
              title={selected?.partiallyWasted ? 'Orders with recorded waste cannot be cancelled.' : undefined}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Ban size={14} /> Cancel Order
            </button>
          )}
          <PrimaryButton
            type="button"
            disabled={!canSubmit || cancelBusy}
            onClick={handleSubmit}
            accent="rose"
          >
            {submitting
              ? <><Loader2 size={14} className="animate-spin" /> Logging…</>
              : 'Log as Waste'
            }
          </PrimaryButton>
        </div>
      </div>

      {cancelTarget && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          onClick={() => { if (!cancelBusy) setCancelTarget(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-order-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white">
                <Ban size={18} />
              </div>
              <div className="min-w-0">
                <p id="cancel-order-title" className="font-bold text-slate-900">Cancel this order?</p>
                <p className="truncate text-xs text-slate-500">{cancelTarget.transactionNumber}</p>
              </div>
            </div>
            <div className="space-y-3 overflow-y-auto px-5 py-4">
              <p className="text-sm leading-relaxed text-slate-600">
                This fully reverses the sale and undoes any loyalty points. Choose the kitchen status so stock and waste stay accurate.
              </p>
              {cancelTarget.pra?.status === 'reported' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
                  This order was reported to PRA{cancelTarget.pra.invoiceNumber ? ` (#${cancelTarget.pra.invoiceNumber})` : ''}. Cancelling it will submit the required PRA credit invoice.
                </div>
              )}
              <div>
                <label htmlFor="waste-log-cancel-reason" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Reason <span className="font-normal normal-case text-rose-500">(required)</span>
                </label>
                <textarea
                  id="waste-log-cancel-reason"
                  autoFocus
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="e.g. Punched by mistake, wrong order"
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Has the kitchen already prepared this order?</p>
                <div className="space-y-2">
                  <button
                    type="button"
                    aria-pressed={preparedChoice === false}
                    disabled={cancelBusy}
                    onClick={() => setPreparedChoice(false)}
                    className={clsx(
                      'w-full rounded-xl border px-4 py-3 text-left transition disabled:opacity-50',
                      preparedChoice === false
                        ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200/60'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className={clsx('block text-sm font-bold', preparedChoice === false ? 'text-emerald-800' : 'text-slate-900')}>Not started yet</span>
                    <span className={clsx('block text-xs', preparedChoice === false ? 'text-emerald-700' : 'text-slate-500')}>
                      Cancel and restore the unprepared ingredients to kitchen stock.
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={preparedChoice === true}
                    disabled={cancelBusy}
                    onClick={() => setPreparedChoice(true)}
                    className={clsx(
                      'w-full rounded-xl border px-4 py-3 text-left transition disabled:opacity-50',
                      preparedChoice === true
                        ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-200/60'
                        : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/50',
                    )}
                  >
                    <span className={clsx('block text-sm font-bold', preparedChoice === true ? 'text-amber-800' : 'text-slate-900')}>Already prepared</span>
                    <span className={clsx('block text-xs', preparedChoice === true ? 'text-amber-700' : 'text-slate-500')}>
                      Cancel while keeping prepared ingredients consumed and logging them as waste.
                    </span>
                  </button>
                </div>
              </div>
              {preparedChoice === true && (
                <div className="space-y-4 border-t border-slate-100 pt-3">
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Which items were prepared?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={cancelBusy || previewLoading || !preview}
                        onClick={() => setMode('whole')}
                        className={clsx(
                          'rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-50',
                          mode === 'whole' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-500',
                        )}
                      >
                        Entire order
                      </button>
                      <button
                        type="button"
                        disabled={cancelBusy || previewLoading || !preview}
                        onClick={() => setMode('select')}
                        className={clsx(
                          'rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-50',
                          mode === 'select' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-500',
                        )}
                      >
                        Select items
                      </button>
                    </div>
                    {previewLoading && (
                      <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-5 text-xs font-medium text-slate-500">
                        <Loader2 size={13} className="animate-spin" /> Calculating waste values…
                      </div>
                    )}
                    {!previewLoading && !preview && (
                      <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                        Waste values could not be calculated. Select the order again and retry.
                      </p>
                    )}
                    {mode === 'select' && preview && (
                      <div className="mt-2 max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                        {previewItems.map((item, itemPosition) => {
                          const lineIndex = Number(item.index ?? itemPosition);
                          const available = remainingOf(item);
                          const selectedQty = Number(selQty[lineIndex]) || 0;
                          return (
                            <div key={lineIndex} className="flex items-center gap-2 px-3 py-2">
                              <input
                                type="checkbox"
                                disabled={cancelBusy || available <= 0}
                                checked={selectedQty > 0}
                                onChange={() => toggleLine(lineIndex, available)}
                                className="h-4 w-4 shrink-0 rounded border-slate-300 text-amber-600 focus:ring-amber-400"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-800">
                                  {item.name}{(item.variation?.name || item.variationName) ? ` (${item.variation?.name || item.variationName})` : ''}
                                </p>
                                <p className="text-[11px] text-slate-400">{available} available</p>
                              </div>
                              {selectedQty > 0 && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button type="button" disabled={cancelBusy} onClick={() => setLineQty(lineIndex, available, selectedQty - 1)} className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-sm font-bold">−</button>
                                  <span className="w-5 text-center text-sm font-bold tabular-nums">{selectedQty}</span>
                                  <button type="button" disabled={cancelBusy || selectedQty >= available} onClick={() => setLineQty(lineIndex, available, selectedQty + 1)} className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-sm font-bold disabled:opacity-40">+</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {preview && (
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Waste valuation</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          aria-pressed={valuationMethod === 'ingredientCost'}
                          disabled={cancelBusy}
                          onClick={() => setValuationMethod('ingredientCost')}
                          className={clsx(
                            'rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50',
                            valuationMethod === 'ingredientCost' ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200' : 'border-slate-200 bg-white',
                          )}
                        >
                          <span className="block text-sm font-bold text-slate-900">Ingredient cost</span>
                          <span className="mt-0.5 block text-xs text-slate-500">Recipe purchase cost · {fmtRs(ingredientWasteCost)}</span>
                        </button>
                        <button
                          type="button"
                          aria-pressed={valuationMethod === 'orderValue'}
                          disabled={cancelBusy}
                          onClick={() => setValuationMethod('orderValue')}
                          className={clsx(
                            'rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50',
                            valuationMethod === 'orderValue' ? 'border-rose-400 bg-rose-50 ring-1 ring-rose-200' : 'border-slate-200 bg-white',
                          )}
                        >
                          <span className="block text-sm font-bold text-slate-900">Order value</span>
                          <span className="mt-0.5 block text-xs text-slate-500">Final billed value · {fmtRs(orderWasteValue)}</span>
                        </button>
                      </div>
                      {valuationMethod === 'ingredientCost' && ingredientWasteCost <= 0 && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-700">
                          Ingredient cost is zero. Choose Order value if purchase costs were not recorded.
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                        <span className="text-slate-500">{selectedUnits} prepared item{selectedUnits === 1 ? '' : 's'}</span>
                        <span className="font-bold tabular-nums text-rose-700">{fmtRs(wasteValue)}</span>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                        Only prepared items stay deducted from stock. Accounting remains based on ingredient cost.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <SecondaryButton type="button" onClick={() => setCancelTarget(null)} disabled={cancelBusy}>
                Keep Order
              </SecondaryButton>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={
                  cancelBusy
                  || cancelReason.trim().length < 3
                  || preparedChoice === null
                  || (preparedChoice === true && (previewLoading || !preview || selectedUnits <= 0 || wasteValue <= 0))
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelBusy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                {cancelBusy ? 'Cancelling…' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Portal>
  );
};

// ── Waste detail modal (opened by clicking a row) ────────────────────────────
const fmtRs = (n) => `Rs. ${fmt(n)}`;

const DetailRow = ({ label, value, valueClass }) => (
  <div className="flex items-center justify-between px-4 py-2.5">
    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
    <span className={clsx('text-sm text-gray-800', valueClass)}>{value}</span>
  </div>
);

// Right-side slide-over drawer (mirrors ReportDrillDrawer) — kept mounted and
// animated so it slides in/out; `entry` is retained during slide-out.
const WasteDetailDrawer = ({ entry, open, onClose }) => {
  const [last, setLast] = useState(null);
  useEffect(() => { if (entry) setLast(entry); }, [entry]);
  const e = entry || last;

  const isSale = e?.source === 'saleOrder';
  const snap = e?.saleOrderSnapshot || {};
  const items = snap.items || [];
  const saleTotal = snap.saleTotal ?? items.reduce((s, i) => s + (i.lineTotal || 0), 0);
  const valuationMethod = e?.valuationMethod || 'ingredientCost';
  const valuationLabel = valuationMethod === 'orderValue' ? 'Order value' : 'Ingredient cost';
  const reasonLabel = e ? (REASONS.find((r) => r.value === e.reason)?.label ?? e.reason ?? '—') : '';
  const variationOf = (it) => it.variation?.name || it.variationName;

  return (
    <Portal>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={clsx('fixed inset-0 bg-black/30 z-[60] transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}
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
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-rose-500">
              {isSale ? <ShoppingBag size={12} /> : <Trash2 size={12} />} Waste Detail
            </div>
            <h2 className="text-base font-bold text-gray-900 mt-0.5 truncate">
              {isSale ? (snap.transactionNumber || 'Sale Order') : (e?.product?.name || 'Waste entry')}
            </h2>
            {e?.loggedAt && <p className="text-xs text-gray-400 mt-0.5 truncate">{format(new Date(e.loggedAt), 'dd MMM yyyy, hh:mm a')}</p>}
          </div>
          <button onClick={onClose} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Close waste details">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!e ? null : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={clsx('inline-flex px-2 py-0.5 rounded-full font-semibold', isSale ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600')}>
                  {isSale ? 'Sale Order' : 'Manual'}
                </span>
                <span className={clsx('inline-flex px-2 py-0.5 rounded-full font-semibold capitalize', REASON_COLOR[e.reason] ?? 'bg-gray-100 text-gray-600')}>
                  {reasonLabel}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Logged by {e.loggedBy?.name ?? e.loggedBy?.email ?? '—'}
                </span>
                {isSale && e.partial && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700">
                    Partial waste
                  </span>
                )}
                {isSale && e.rePrepared && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">
                    <RefreshCw size={11} /> Re-made · stock re-deducted
                  </span>
                )}
              </div>

              {isSale ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  {items.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-400">No item breakdown stored for this order.</div>
                  ) : items.map((it, i) => (
                    <div key={i} className={clsx('flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0', it.usingFallback ? 'bg-amber-50/40' : 'bg-white')}>
                      <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', it.usingFallback ? 'bg-amber-100' : 'bg-emerald-50')}>
                        {it.usingFallback
                          ? <AlertTriangle size={13} className="text-amber-500" />
                          : <FlaskConical size={13} className="text-emerald-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {it.name}{variationOf(it) ? ` (${variationOf(it)})` : ''}<span className="text-gray-400 font-normal"> ×{it.qty}</span>
                        </p>
                        <p className={clsx('text-xs mt-0.5', it.usingFallback ? 'text-amber-600' : 'text-emerald-600')}>
                          {it.usingFallback ? 'No recipe — sale price used as cost' : 'Ingredient cost'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-gray-800">
                          {fmtRs(valuationMethod === 'orderValue' ? (it.orderValue ?? it.lineTotal) : it.ingredientCost)}
                        </p>
                        <p className="text-xs text-gray-400">{valuationMethod === 'orderValue' ? 'order value' : 'ingredient cost'}</p>
                      </div>
                    </div>
                  ))}
                  <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Receipt size={12} /> Sale total: <span className="font-semibold text-gray-700">{fmtRs(saleTotal)}</span>
                    </span>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 mb-0.5">Waste Value · {valuationLabel}</p>
                      <p className="text-lg font-bold text-rose-600">{fmtRs(e.totalCost)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                  <DetailRow label="Product" value={e.product?.name ?? '—'} />
                  {e.product?.sku && <DetailRow label="SKU" value={e.product.sku} />}
                  <DetailRow label="Quantity" value={`${fmt(e.qty)} ${e.unit ?? ''}`} />
                  <DetailRow label="Waste Cost" value={fmtRs(e.totalCost)} valueClass="font-bold text-rose-600" />
                </div>
              )}

              {isSale && <DetailRow label="Valuation" value={valuationLabel} />}

              {e.notes && (
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{e.notes}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Portal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const WasteLog = () => {
  const { has } = usePermissions();
  const canManage = has('inventory.manage');
  const [showModal,      setShowModal]      = useState(false);
  const [showSaleModal,  setShowSaleModal]  = useState(false);
  const [selectedWaste,  setSelectedWaste]  = useState(null);
  const [cachedTransactions, setCachedTransactions] = useState([]);
  const [transactionsLoaded, setTransactionsLoaded] = useState(false);
  const previewCacheRef = useRef({});
  const [reason, setReason] = useQueryState('reason', '');
  const [dateFrom, setDateFrom] = useQueryState('from', format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useQueryState('to', format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const { data: outlets = [] } = useGetOutletsQuery();
  const [selectedOutletId, setSelectedOutletId] = useQueryState('outlet', '');

  useEffect(() => {
    if (outlets.length > 0 && !selectedOutletId) setSelectedOutletId(outlets[0]._id);
  }, [outlets, selectedOutletId, setSelectedOutletId]);

  const pagination = usePagination(25);

  const queryParams = useMemo(() => ({
    page:   pagination.page,
    limit:  pagination.pageSize,
    from:   dateFrom          || undefined,
    to:     dateTo            || undefined,
    reason: reason            || undefined,
    outlet: selectedOutletId  || undefined,
  }), [pagination.page, pagination.pageSize, dateFrom, dateTo, reason, selectedOutletId]);

  const { data: payload, isLoading: loading, refetch: fetchWaste } = useGetWasteLogsQuery(queryParams, listQueryOpts);
  const waste = useMemo(() => payload?.wasteLogs ?? (Array.isArray(payload) ? payload : []), [payload]);

  useEffect(() => {
    if (payload?.total != null) pagination.setTotal(payload.total);
  }, [payload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { pagination.reset(); }, [dateFrom, dateTo, reason]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalWasteCost = waste.reduce((s, w) => s + (w.totalCost ?? 0), 0);

  const columns = [
    {
      key:    'source',
      header: 'Source',
      render: (v) => (
        <span className={clsx(
          'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold',
          v === 'saleOrder' ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600'
        )}>
          {v === 'saleOrder' ? 'Sale Order' : 'Manual'}
        </span>
      ),
    },
    {
      key:    'loggedAt',
      header: 'Date',
      render: (v) => v
        ? <span className="text-sm text-gray-700">{format(new Date(v), 'dd MMM yyyy')}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      key:    'product',
      header: 'Product / Order',
      render: (v, row) => (
        row.source === 'saleOrder'
          ? <span className="font-medium text-gray-800 text-xs">{row.saleOrderSnapshot?.transactionNumber ?? '—'}</span>
          : <span className="font-medium text-gray-800">{v?.name ?? '—'}</span>
      ),
    },
    {
      key:    'qty',
      header: 'Qty',
      render: (v, row) => row.source === 'saleOrder'
        ? <span className="text-gray-400">—</span>
        : <span className="text-gray-700">{fmt(v)}</span>,
    },
    {
      key:    'unit',
      header: 'Unit',
      render: (v, row) => row.source === 'saleOrder'
        ? <span className="text-gray-400">—</span>
        : <span className="text-gray-500">{v ?? '—'}</span>,
    },
    {
      key:    'reason',
      header: 'Reason',
      render: (v) => (
        <span className={clsx(
          'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize',
          REASON_COLOR[v] ?? 'bg-gray-100 text-gray-600'
        )}>
          {REASONS.find((r) => r.value === v)?.label ?? v ?? '—'}
        </span>
      ),
    },
    {
      key:    'totalCost',
      header: 'Waste Value (Rs.)',
      render: (v, row) => (
        <div>
          <span className="font-semibold text-red-600">{fmt(v)}</span>
          {row.source === 'saleOrder' && (
            <p className="mt-0.5 text-[10px] text-slate-400">
              {row.valuationMethod === 'orderValue' ? 'Order value' : 'Ingredient cost'}
            </p>
          )}
        </div>
      ),
    },
    {
      key:    'loggedBy',
      header: 'Logged By',
      render: (v) => <span className="text-sm text-gray-500">{v?.name ?? v?.email ?? '—'}</span>,
    },
  ];

  const hasFilters = reason || (dateFrom !== format(startOfMonth(new Date()), 'yyyy-MM-dd')) || (dateTo !== format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  return (
    <div className="space-y-5">
      <HeroBanner
        icon={Trash2}
        eyebrow="Kitchen Loss"
        title="Waste Log"
        subtitle="Track spoilage, spillage, and other waste events. Visibility into where your margin is leaking."
        accent="rose"
        actions={canManage && (
          <>
            <Button
              variant="secondary"
              icon={ShoppingBag}
              onClick={() => setShowSaleModal(true)}

            >
              Punched Order
            </Button>
            <Button
              variant="secondary"
              icon={Plus}
              onClick={() => setShowModal(true)}

            >
              Log Waste
            </Button>
          </>
        )}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile label="Waste Value (period)" value={`Rs. ${Number(totalWasteCost || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`} icon={Trash2} gradient="rose" />
        <StatTile label="Events" value={waste.length} icon={ShoppingBag} gradient="amber" />
        <StatTile label="Categories" value={new Set(waste.map((w) => w.reason)).size} icon={FlaskConical} gradient="slate" />
      </div>

      {/* Filters */}
      <FilterBar>
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
        />

        {outlets.length > 1 && (
          <div className="min-w-[180px]">
            <SearchableSelect
              options={outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))}
              value={selectedOutletId}
              onChange={setSelectedOutletId}
              searchPlaceholder="Search outlets…"
            />
          </div>
        )}

        <div className="min-w-[160px]">
          <SearchableSelect
            options={REASON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={reason}
            onChange={setReason}
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => {
              setReason('');
              setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
              setDateTo(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
            }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            Reset to this month
          </button>
        )}
      </FilterBar>

      <Table
        columns={columns}
        data={waste}
        loading={loading}
        emptyMessage="No waste entries found."
        onRowClick={setSelectedWaste}
      />
      <Pagination {...pagination} />

      {showModal && (
        <LogWasteModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchWaste(); }}
          outletId={selectedOutletId}
        />
      )}
      {showSaleModal && (
        <LogSaleWasteModal
          onClose={() => setShowSaleModal(false)}
          onSaved={() => { setShowSaleModal(false); fetchWaste(); }}
          initialTransactions={cachedTransactions}
          setInitialTransactions={setCachedTransactions}
          previewCacheRef={previewCacheRef}
          transactionsLoaded={transactionsLoaded}
          setTransactionsLoaded={setTransactionsLoaded}
        />
      )}
      <WasteDetailDrawer
        entry={selectedWaste}
        open={!!selectedWaste}
        onClose={() => setSelectedWaste(null)}
      />
    </div>
  );
};

export default WasteLog;
