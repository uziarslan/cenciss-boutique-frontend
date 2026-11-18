import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { X, CreditCard, Banknote, Wallet, Search, AlertTriangle, CheckCircle, User, MapPin, Truck, ShoppingBag, UtensilsCrossed, Users as UsersIcon, Edit2, ArrowDownToLine, RotateCcw, Bike, Landmark } from 'lucide-react';
import axios from 'axios';
import { processSale, searchChargeToSalaryEmployees, getChargeToSalaryCreditSummary } from '../../api/saleApi';
import { searchUsersForAllowance, getUserAllowance } from '../../api/allowanceApi';
import ReceiptModal from './ReceiptModal';
import { useDispatch, useSelector } from 'react-redux';
import {
  clearCart,
  selectCartDeliveryCharge,
  selectCartTaxableSubtotal,
} from '../../store/slices/cartSlice';
import { resetOrder } from '../../store/slices/orderSlice';
import { addToOfflineQueue, markHoldSynced } from '../../store/slices/offlineSlice';
import { useLoyalty } from '../../hooks/useLoyalty';
import { effectiveTaxRate } from '../../store/slices/taxConfigSlice';
import { removeCachedHeldOrder } from '../../utils/heldOrdersCache';
import { calculateCartCharges } from '../../utils/chargeInclusivePricing';
import FloatingSelect from '../../../../../components/UI/FloatingSelect';

const fmt = (v) =>
  `PKR ${Number(v).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtRate = (v) =>
  Number(v || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });

const createClientTransactionId = () =>
  window.crypto?.randomUUID?.() ?? `txn_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const NUMPAD_KEYS = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['.', '0', '⌫']];

const METHODS = [
  { id: 'cash',       label: 'Cash',       icon: Banknote  },
  { id: 'card',       label: 'Card',       icon: CreditCard },
  { id: 'online-transfer', label: 'Online Transfer', icon: Landmark },
  { id: 'split-bill', label: 'Split Bill', icon: UsersIcon },
  { id: 'allowance',  label: 'Allowance',  icon: Wallet    },
  { id: 'charge-to-salary', label: 'Charge to Salary', icon: User },
];

const ChargeToSalaryPicker = ({
  selected,
  onSelect,
  total,
  creditSummary,
  summaryLoading,
  canOverride,
  overrideRequested,
  onOverrideRequested,
  overrideReason,
  onOverrideReason,
}) => {
  const [query, setQuery] = useState(selected?.name || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async (value) => {
    setSearching(true);
    try {
      setResults(await searchChargeToSalaryEmployees(value.trim()));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleChange = (value) => {
    setQuery(value);
    onSelect(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(value), value.trim() ? 250 : 0);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div className="flex flex-1 flex-col px-6 py-5 space-y-4 overflow-y-auto">
      <div>
        <p className="text-sm font-medium text-surface-700 mb-1">Employee</p>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(event) => handleChange(event.target.value)}
            onFocus={() => {
              setFocused(true);
              if (!results.length && !selected) load(query);
            }}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            className="input-field pl-9"
            placeholder="Tap to browse or search active staff…"
            autoFocus
          />
        </div>
        {focused && !selected && (
          <div className="mt-1 max-h-56 overflow-y-auto border border-surface-200 rounded-xl shadow-lg bg-white">
            {searching ? (
              <div className="px-4 py-3 text-xs text-surface-400">Searching…</div>
            ) : results.length ? (
              results.map((employee) => (
                <button
                  key={employee._id}
                  type="button"
                  disabled={employee.chargeToSalaryEnabled === false}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (employee.chargeToSalaryEnabled === false) return;
                    setQuery(employee.name);
                    setFocused(false);
                    setResults([]);
                    onSelect(employee);
                  }}
                  className={`flex w-full items-center justify-between gap-3 border-b border-surface-100 px-4 py-3 text-left last:border-0 ${
                    employee.chargeToSalaryEnabled === false
                      ? 'cursor-not-allowed bg-surface-50 opacity-60'
                      : 'hover:bg-brand-50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-surface-900 truncate">{employee.name}</span>
                    <span className="block text-xs text-surface-400 truncate">
                      {[employee.designation, employee.department].filter(Boolean).join(' · ') || 'Employee'}
                    </span>
                  </span>
                  {employee.chargeToSalaryEnabled === false ? (
                    <span className="shrink-0 text-[10px] font-semibold text-rose-500">Disabled</span>
                  ) : (
                    <User size={15} className="shrink-0 text-brand-500" />
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-xs text-surface-400">
                {query.trim() ? `No active employees found for "${query}"` : 'No active employees found.'}
              </div>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-surface-100 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-600">
              {selected.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-surface-900">{selected.name}</p>
              <p className="truncate text-xs text-surface-400">
                {[selected.designation, selected.department].filter(Boolean).join(' · ') || 'Employee'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { onSelect(null); setQuery(''); setResults([]); }}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-700"
            >
              Change
            </button>
          </div>
          <div className="space-y-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={13} className="shrink-0 text-emerald-500" />
              <p className="text-xs text-emerald-700">{fmt(total)} will be recoverable from this employee’s salary.</p>
            </div>
            <p className="text-xs text-surface-500">
              No cash enters the drawer. Payroll will show this charge with the linked POS transaction.
            </p>
          </div>
        </div>
      )}

      {selected && (
        <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/50">
          {summaryLoading ? (
            <p className="px-4 py-4 text-xs text-indigo-500">Checking employee credit limits…</p>
          ) : creditSummary ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-indigo-100">
                {[
                  ['Available', creditSummary.available],
                  ['Used Today', creditSummary.usage?.issuedToday],
                  ['Used 7 Days', creditSummary.usage?.issuedSevenDays],
                  ['Outstanding', creditSummary.usage?.outstanding],
                ].map(([label, value]) => (
                  <div key={label} className="px-3 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-500">{label}</p>
                    <p className="mt-0.5 text-xs font-bold tabular-nums text-indigo-900">{fmt(value || 0)}</p>
                  </div>
                ))}
              </div>
              <p className="border-t border-indigo-100 px-3 py-2 text-[10px] text-indigo-700">
                {creditSummary.limits?.dailyLimitPercent}% daily · {creditSummary.limits?.rollingSevenDayLimitPercent}% rolling 7 days · {creditSummary.limits?.maxOutstandingPercent}% maximum · salary cycle day {creditSummary.salaryDay}
              </p>
            </>
          ) : (
            <p className="px-4 py-4 text-xs text-rose-600">Unable to verify limits. Charge to Salary cannot be completed.</p>
          )}
        </div>
      )}

      {selected && creditSummary && total > Number(creditSummary.available || 0) + 0.001
        && total <= Number(creditSummary.availableWithOverride || 0) + 0.001 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Manager override required</p>
              <p className="mt-0.5 text-xs text-amber-700">
                This bill is above the normal {fmt(creditSummary.available)} available limit.
              </p>
            </div>
          </div>
          {canOverride ? (
            <div className="mt-3 space-y-2.5">
              <button
                type="button"
                onClick={() => onOverrideRequested(!overrideRequested)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${
                  overrideRequested ? 'border-amber-300 bg-white' : 'border-amber-200 bg-amber-50'
                }`}
                aria-pressed={overrideRequested}
              >
                <span className="text-xs font-semibold text-amber-900">Use authorized override</span>
                <span className={`relative h-6 w-11 rounded-full transition ${overrideRequested ? 'bg-amber-500' : 'bg-surface-300'}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${overrideRequested ? 'left-[22px]' : 'left-0.5'}`} />
                </span>
              </button>
              {overrideRequested && (
                <textarea
                  value={overrideReason}
                  onChange={(event) => onOverrideReason(event.target.value)}
                  rows={2}
                  className="input-field resize-none"
                  placeholder="Reason for approving this exception…"
                />
              )}
              <p className="text-[10px] text-amber-700">
                Only daily and seven-day limits are overridden. The overall 60% ceiling remains blocked.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs font-medium text-amber-800">
              An owner must grant “Override Employee Credit Limits” access before this user can approve it.
            </p>
          )}
        </div>
      )}

      {selected && creditSummary && total > Number(creditSummary.availableWithOverride || 0) + 0.001 && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600" />
          <p className="text-xs text-rose-700">
            Blocked by the non-overridable outstanding or salary-cycle ceiling. Maximum currently available: <strong>{fmt(creditSummary.availableWithOverride || 0)}</strong>.
          </p>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Split-the-Bill flow
// Step 1 ('choose'): cashier picks how many ways. No tiles shown yet.
// Step 2 ('tiles'):  N tiles, each with editable share + pay action.
// Each tile records: { share, method, tendered?, cardReference?, coveredBy?, note?, paidAt }
// ─────────────────────────────────────────────────────────────────────────────
const SplitBillFlow = ({
  effectiveTotal,
  splitStep,
  setSplitStep,
  splitParts,
  setSplitParts,
  splitCollected,
  splitRemaining,
  splitShareSum,
  activeTileIdx,
  setActiveTileIdx,
  fmt,
}) => {
  // Build N tiles with even shares; the last tile absorbs any rounding remainder.
  const startSplit = (n) => {
    if (!n || n < 2) return;
    const each = Math.floor((effectiveTotal / n) * 100) / 100;
    const parts = Array.from({ length: n }, () => ({
      share: each,
      method: null,
      tendered: 0,
      cardReference: '',
      coveredBy: null,
      note: '',
      paidAt: null,
    }));
    // Push the rounding remainder onto the last tile so totals tie.
    const sumSoFar = Math.round(each * n * 100) / 100;
    const remainder = Math.round((effectiveTotal - sumSoFar) * 100) / 100;
    if (remainder !== 0 && parts.length > 0) {
      parts[parts.length - 1].share = Math.round((each + remainder) * 100) / 100;
    }
    setSplitParts(parts);
    setSplitStep('tiles');
    setActiveTileIdx(null);
  };

  if (splitStep === 'choose') {
    return <SplitWaysPicker effectiveTotal={effectiveTotal} onPick={startSplit} fmt={fmt} />;
  }

  return (
    <SplitTiles
      effectiveTotal={effectiveTotal}
      splitParts={splitParts}
      setSplitParts={setSplitParts}
      splitCollected={splitCollected}
      splitRemaining={splitRemaining}
      splitShareSum={splitShareSum}
      activeTileIdx={activeTileIdx}
      setActiveTileIdx={setActiveTileIdx}
      onResetWays={() => { setSplitParts([]); setActiveTileIdx(null); setSplitStep('choose'); }}
      fmt={fmt}
    />
  );
};

// Step 1: number-of-ways picker
const SplitWaysPicker = ({ effectiveTotal, onPick, fmt }) => {
  const [custom, setCustom] = useState('');
  const presets = [2, 3, 4, 5, 6];
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 space-y-6">
      <div className="text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-3">
          <UsersIcon size={26} className="text-brand-600" />
        </div>
        <h3 className="text-xl font-bold text-surface-900">How many ways to split?</h3>
        <p className="mt-1 text-sm text-surface-500">
          Bill <span className="font-semibold text-surface-900">{fmt(effectiveTotal)}</span> · each person pays separately
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5 w-full max-w-md sm:grid-cols-5">
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-surface-200 bg-white py-4 hover:border-brand-400 hover:bg-brand-50 transition-all active:scale-95"
          >
            <span className="text-2xl font-extrabold text-surface-900 leading-none">{n}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mt-1">ways</span>
            <span className="text-[10px] text-brand-600 mt-1 tabular-nums">{fmt(Math.floor(effectiveTotal / n))} each</span>
          </button>
        ))}
      </div>

      <div className="w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2 text-center">Custom</p>
        <div className="flex gap-2">
          <input
            type="number"
            min="2"
            max="50"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. 7"
            className="flex-1 rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="button"
            disabled={!custom || Number(custom) < 2}
            onClick={() => onPick(Number(custom))}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition"
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
};

// Step 2: tiles grid
const SplitTiles = ({
  effectiveTotal, splitParts, setSplitParts, splitCollected, splitRemaining, splitShareSum,
  activeTileIdx, setActiveTileIdx, onResetWays, fmt,
}) => {
  const sharesMatch = Math.abs(splitShareSum - effectiveTotal) < 0.01;

  const updatePart = (idx, patch) => {
    setSplitParts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  // Mark a tile as covered by another. The covering tile absorbs this tile's
  // share. Reverse this by tapping "Uncover" on the covered tile.
  const coverWith = (coveredIdx, coverIdx) => {
    if (coveredIdx === coverIdx) return;
    setSplitParts((prev) => {
      const next = prev.map((p, i) => ({ ...p }));
      const coveredShare = next[coveredIdx].share || 0;
      next[coverIdx] = {
        ...next[coverIdx],
        share: Math.round((Number(next[coverIdx].share || 0) + Number(coveredShare)) * 100) / 100,
        // If the cover tile was already paid, force a re-pay (share changed).
        method: null,
        tendered: 0,
        cardReference: '',
        paidAt: null,
      };
      next[coveredIdx] = {
        ...next[coveredIdx],
        share: 0,
        method: 'covered',
        tendered: 0,
        cardReference: '',
        coveredBy: coverIdx,
        note: `Covered by Person ${coverIdx + 1}`,
        paidAt: new Date().toISOString(),
      };
      return next;
    });
    setActiveTileIdx(null);
  };

  const uncover = (coveredIdx) => {
    setSplitParts((prev) => {
      const next = prev.map((p) => ({ ...p }));
      const coverIdx = next[coveredIdx].coveredBy;
      // Restore: split the cover tile's share back into two equal halves.
      // We don't know the original split, so we restore the most recent
      // even share. Cashier can edit either tile's share manually after.
      if (typeof coverIdx === 'number' && coverIdx !== null && next[coverIdx]) {
        const combined = Number(next[coverIdx].share || 0);
        const restored = Math.round((combined / 2) * 100) / 100;
        const remainder = Math.round((combined - restored) * 100) / 100;
        next[coverIdx] = {
          ...next[coverIdx],
          share: restored,
          method: null, tendered: 0, cardReference: '', paidAt: null,
        };
        next[coveredIdx] = {
          ...next[coveredIdx],
          share: remainder,
          method: null, coveredBy: null, note: '', tendered: 0, cardReference: '', paidAt: null,
        };
      }
      return next;
    });
  };

  return (
    <div className="flex flex-1 flex-col px-5 py-4 overflow-y-auto bg-surface-50/40">
      {/* Top control bar */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-surface-500">
            Split into
          </span>
          <span className="rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
            {splitParts.length} ways
          </span>
        </div>
        <button
          type="button"
          onClick={onResetWays}
          className="inline-flex items-center gap-1 rounded-lg border border-surface-200 bg-white px-3 py-1 text-xs font-semibold text-surface-600 hover:bg-surface-50"
          title="Pick a different number of ways"
        >
          <RotateCcw size={11} /> Reset
        </button>
      </div>

      {/* Tiles grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {splitParts.map((part, idx) => (
          <SplitTile
            key={idx}
            idx={idx}
            part={part}
            isActive={activeTileIdx === idx}
            onActivate={() => setActiveTileIdx(activeTileIdx === idx ? null : idx)}
            updatePart={(patch) => updatePart(idx, patch)}
            coverWith={(coverIdx) => coverWith(idx, coverIdx)}
            uncover={() => uncover(idx)}
            allParts={splitParts}
            fmt={fmt}
          />
        ))}
      </div>

      {/* Bottom summary */}
      <div className="mt-4 sticky bottom-0 rounded-2xl border border-surface-200 bg-white shadow-sm p-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Collected</p>
          <p className="text-base font-extrabold tabular-nums text-emerald-700 mt-0.5">{fmt(splitCollected)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Remaining</p>
          <p className={`text-base font-extrabold tabular-nums mt-0.5 ${splitRemaining > 0.01 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {fmt(splitRemaining)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Bill</p>
          <p className="text-base font-extrabold tabular-nums text-surface-900 mt-0.5">{fmt(effectiveTotal)}</p>
        </div>
        {!sharesMatch && (
          <div className="col-span-3 mt-1 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-700 inline-flex items-center justify-center gap-1">
            <AlertTriangle size={11} /> Shares total {fmt(splitShareSum)} — adjust tiles so they sum to {fmt(effectiveTotal)}
          </div>
        )}
      </div>
    </div>
  );
};

// Single tile + inline pay panel
const SplitTile = ({ idx, part, isActive, onActivate, updatePart, coverWith, uncover, allParts, fmt }) => {
  const isPaid = !!part.paidAt && part.method !== 'covered';
  const isCovered = part.method === 'covered';
  const [editingShare, setEditingShare] = useState(false);
  const [shareDraft, setShareDraft] = useState(String(part.share ?? ''));

  useEffect(() => { setShareDraft(String(part.share ?? '')); }, [part.share]);

  const commitShare = () => {
    const v = Math.max(0, Number(shareDraft) || 0);
    updatePart({ share: Math.round(v * 100) / 100, method: null, tendered: 0, cardReference: '', paidAt: null });
    setEditingShare(false);
  };

  const tone = isCovered
    ? 'border-slate-200 bg-slate-50/60'
    : isPaid
      ? 'border-emerald-300 bg-emerald-50/40'
      : 'border-surface-200 bg-white hover:border-brand-300';

  return (
    <div className={`rounded-2xl border-2 px-3 py-2.5 transition-all ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Person {idx + 1}</p>
          {editingShare ? (
            <div className="flex items-center gap-1 mt-1">
              <input
                type="number"
                value={shareDraft}
                onChange={(e) => setShareDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitShare(); if (e.key === 'Escape') setEditingShare(false); }}
                className="w-24 rounded border border-brand-300 bg-white px-2 py-1 text-sm font-bold tabular-nums focus:outline-none"
                autoFocus
              />
              <button type="button" onClick={commitShare} className="rounded p-1 text-brand-600 hover:bg-brand-100"><CheckCircle size={14} /></button>
              <button type="button" onClick={() => setEditingShare(false)} className="rounded p-1 text-surface-400 hover:bg-surface-100"><X size={14} /></button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => !isCovered && setEditingShare(true)}
              disabled={isCovered}
              className="mt-0.5 inline-flex items-center gap-1 group disabled:cursor-not-allowed"
              title={isCovered ? 'Covered — uncover to edit' : 'Tap to edit share'}
            >
              <span className="text-lg font-extrabold text-surface-900 tabular-nums">{fmt(part.share || 0)}</span>
              {!isCovered && <Edit2 size={10} className="text-surface-300 group-hover:text-brand-500" />}
            </button>
          )}
        </div>
        {/* Status badge */}
        {isCovered ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            <ArrowDownToLine size={9} />
            Covered
          </span>
        ) : isPaid ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            <CheckCircle size={9} />
            Paid
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Pending
          </span>
        )}
      </div>

      {/* Paid summary */}
      {isPaid && !isCovered && (
        <div className="mt-1.5 text-[11px] text-surface-500">
          {part.method === 'cash' ? (
            <>
              Cash · tendered {fmt(part.tendered || 0)}
              {Number(part.tendered || 0) > Number(part.share || 0) && (
                <span className="ml-1 text-emerald-700 font-semibold">(change {fmt(part.tendered - part.share)})</span>
              )}
            </>
          ) : (
            <>
              Card{part.cardReference ? ` · ${part.cardReference}` : ''}
            </>
          )}
        </div>
      )}

      {/* Covered note */}
      {isCovered && part.note && (
        <p className="mt-1 text-[11px] italic text-slate-500">{part.note}</p>
      )}

      {/* Action row */}
      {!isActive && !isCovered && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {isPaid ? (
            <button
              type="button"
              onClick={onActivate}
              className="flex-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={onActivate}
              className="flex-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700"
            >
              Pay
            </button>
          )}
          {!isPaid && allParts.length > 1 && (
            <button
              type="button"
              onClick={onActivate}
              className="rounded-lg border border-surface-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-surface-600 hover:bg-surface-50"
              title="Mark as covered by another person"
            >
              Cover
            </button>
          )}
        </div>
      )}

      {isCovered && (
        <button
          type="button"
          onClick={uncover}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Uncover
        </button>
      )}

      {/* Inline pay panel */}
      {isActive && !isCovered && (
        <SplitTilePanel
          part={part}
          updatePart={updatePart}
          onClose={onActivate}
          onCoverWith={coverWith}
          allParts={allParts}
          idx={idx}
          fmt={fmt}
        />
      )}
    </div>
  );
};

// Inline pay-this-tile panel
const SplitTilePanel = ({ part, updatePart, onClose, onCoverWith, allParts, idx, fmt }) => {
  const [localMethod, setLocalMethod] = useState(part.method || 'cash');
  const [tendered, setTendered] = useState(String(part.tendered || part.share || ''));
  const [cardRef, setCardRef] = useState(part.cardReference || '');
  const [coverChoice, setCoverChoice] = useState('');

  const change = Math.max(0, Math.round((Number(tendered || 0) - Number(part.share || 0)) * 100) / 100);

  const save = () => {
    if (localMethod === 'cash') {
      const t = Math.max(0, Number(tendered) || 0);
      if (t < Number(part.share || 0) - 0.01) {
        alert(`Tendered ${fmt(t)} is less than share ${fmt(part.share)}.`);
        return;
      }
      updatePart({
        method: 'cash',
        tendered: Math.round(t * 100) / 100,
        cardReference: '',
        paidAt: new Date().toISOString(),
      });
    } else if (localMethod === 'card') {
      updatePart({
        method: 'card',
        tendered: 0,
        cardReference: cardRef.trim(),
        paidAt: new Date().toISOString(),
      });
    } else if (localMethod === 'cover') {
      if (coverChoice === '' || coverChoice === null) {
        alert('Pick which person is covering this share.');
        return;
      }
      onCoverWith(Number(coverChoice));
      return; // onCoverWith already mutates state
    }
    onClose();
  };

  return (
    <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3 space-y-2.5">
      {/* Method tabs */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { v: 'cash',  label: 'Cash',  icon: Banknote },
          { v: 'card',  label: 'Card',  icon: CreditCard },
          { v: 'cover', label: 'Cover', icon: ArrowDownToLine },
        ].map(({ v, label, icon: Icon }) => (
          <button
            key={v}
            type="button"
            onClick={() => setLocalMethod(v)}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
              localMethod === v
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-surface-200 text-surface-600 hover:bg-surface-50'
            }`}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {localMethod === 'cash' && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold text-surface-600">Cash tendered</label>
          <input
            type="number"
            value={tendered}
            onChange={(e) => setTendered(e.target.value)}
            placeholder={String(part.share || 0)}
            className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-bold tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            autoFocus
          />
          {Number(tendered) > 0 && (
            <div className={`flex items-center justify-between text-xs ${change > 0 ? 'text-emerald-700' : 'text-surface-500'}`}>
              <span>Share: {fmt(part.share)}</span>
              <span className="font-semibold">Change: {fmt(change)}</span>
            </div>
          )}
        </div>
      )}

      {localMethod === 'card' && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold text-surface-600">Card — last 4 digits (optional)</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={cardRef}
            onChange={(e) => setCardRef(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="e.g. 4242"
            className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            autoFocus
          />
          <p className="text-[10px] text-surface-400">Process the swipe on the card terminal first.</p>
        </div>
      )}

      {localMethod === 'cover' && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold text-surface-600">Covered by</label>
          <FloatingSelect
            label="Covered by"
            options={[{ value: '', label: '— Select person —' }, ...allParts.map((person, index) => (
              index === idx || person.method === 'covered' ? null : { value: String(index), label: `Person ${index + 1} (${fmt(person.share || 0)})` }
            )).filter(Boolean)]}
            value={coverChoice}
            onChange={setCoverChoice}
            searchable={false}
            className="border-surface-200 text-sm"
          />
          <p className="text-[10px] text-surface-400">
            Their share will increase by {fmt(part.share || 0)}; this tile will show "Covered".
          </p>
        </div>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={save}
          className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          {localMethod === 'cover' ? 'Apply Cover' : 'Mark as Paid'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-semibold text-surface-600 hover:bg-surface-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

const PaymentModal = ({
  isOpen,
  onClose,
  total,
  cartItems,
  session,
  cashier,
  outletCode,
  outletName,
  onSaleComplete,
  discount = 0,
  discountMode = 'amount',
  discountPercent = 0,
  note = '',
  cashierNote = '',
}) => {
  const [method, setMethod] = useState('cash');
  const [input, setInput] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [onlineTransferRef, setOnlineTransferRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const confirmInFlightRef = useRef(false);

  // Allowance state
  const [allowanceSearch, setAllowanceSearch] = useState('');
  const [allowanceResults, setAllowanceResults] = useState([]);
  const [allowanceSearching, setAllowanceSearching] = useState(false);
  const [allowanceInputFocused, setAllowanceInputFocused] = useState(false);
  const [selectedAllowanceUser, setSelectedAllowanceUser] = useState(null); // { userId, name, remainingAmount, monthlyLimit, usedAmount }
  const allowanceSearchTimer = useRef(null);
  const [selectedChargeToSalaryEmployee, setSelectedChargeToSalaryEmployee] = useState(null);
  const [chargeToSalaryCreditSummary, setChargeToSalaryCreditSummary] = useState(null);
  const [creditSummaryLoading, setCreditSummaryLoading] = useState(false);
  const [creditOverrideRequested, setCreditOverrideRequested] = useState(false);
  const [creditOverrideReason, setCreditOverrideReason] = useState('');

  // ── Split-the-bill state ─────────────────────────────────────────────────
  // 'choose' = picking how many ways. 'tiles' = N tiles, each individually
  // paid. Reset every time the cashier switches into or out of split-bill.
  const [splitStep, setSplitStep] = useState('choose'); // 'choose' | 'tiles'
  const [splitParts, setSplitParts] = useState([]); // [{ share, method, tendered, change, cardReference, coveredBy, note, paidAt }]
  // Modal-within-modal state for the per-tile pay panel.
  const [activeTileIdx, setActiveTileIdx] = useState(null);

  const dispatch = useDispatch();

  // Order type & customer
  const orderType = useSelector((state) => state.order.orderType);
  const orderCustomer = useSelector((state) => state.order.customer);
  const deliveryAddress = useSelector((state) => state.order.deliveryAddress);
  const deliveryChargeAmount = useSelector(selectCartDeliveryCharge);
  const taxableSubtotal = useSelector(selectCartTaxableSubtotal);
  const tableNumber = useSelector((state) => state.order.tableNumber);
  const foodPandaOrderNumber = useSelector((state) => state.order.foodPandaOrderNumber || '');
  const foodPandaCustomerName = useSelector((state) => state.order.foodPandaCustomerName || '');
  const resumedFromHoldId = useSelector((state) => state.order.resumedFromHoldId);
  const cartSourceHeldOrderId = useSelector((state) => state.cart.sourceHeldOrderId);
  const activeHeldOrderId = resumedFromHoldId || cartSourceHeldOrderId;
  const resumedFromOfflineId = useSelector((state) => state.order.resumedFromOfflineId);
  const kdsItemCancellationVersion = useSelector((state) => state.cart.kdsItemCancellationVersion) || 0;
  const heldItemCancellationDetails = useSelector((state) => state.cart.heldItemCancellationDetails) || {};
  const heldItemCancellationReasons = useSelector((state) => state.cart.heldItemCancellationReasons) || {};
  const redeemPoints = useSelector((state) => state.order.redeemPoints || 0);

  // ── Payment-method-aware tax ──────────────────────────────────────────────
  // The taxable base (taxRate>0 items) is charged the standard rate by default.
  // Card and online payments independently opt into the shared reduced rate.
  // This mirrors the authoritative server calculation.
  const taxConfig = useSelector((state) => state.taxConfig);
  const reducedFraction = useMemo(() => {
    if (method === 'card') return taxConfig?.cardReducedEnabled ? 1 : 0;
    if (method === 'online-transfer') return taxConfig?.onlineReducedEnabled ? 1 : 0;
    if (method === 'split-bill' && splitParts.length) {
      let cardShare = 0;
      let totalShare = 0;
      for (const p of splitParts) {
        const share = Number(p.share) || 0;
        totalShare += share;
        if (taxConfig?.cardReducedEnabled && p.method === 'card') cardShare += share;
      }
      return totalShare > 0 ? cardShare / totalShare : 0;
    }
    return 0; // cash / allowance / foodpanda
  }, [method, splitParts, taxConfig?.cardReducedEnabled, taxConfig?.onlineReducedEnabled]);
  const foodPandaGstExempt = orderType === 'foodpanda' || method === 'foodpanda';
  const effRate = foodPandaGstExempt ? 0 : effectiveTaxRate(taxConfig, reducedFraction);

  // Service charge is the outlet's CENTRAL rate (Tax & PRA), applied to the whole
  // bill, only for the enabled order types. Mirrors the server so the amount
  // collected matches what's persisted.
  const serviceChargeEnabled = useMemo(() => {
    const types = taxConfig?.serviceChargeOrderTypes;
    return (Array.isArray(types) ? types : ['dine-in']).includes(orderType);
  }, [taxConfig, orderType]);

  const methodPricing = useMemo(() => calculateCartCharges(cartItems, {
    taxRate: effRate,
    serviceChargeRate: serviceChargeEnabled ? Number(taxConfig?.serviceChargeRate || 0) : 0,
  }), [cartItems, effRate, serviceChargeEnabled, taxConfig?.serviceChargeRate]);
  const subtotal = methodPricing.subtotal;
  const taxAmount = methodPricing.taxAmount;
  const serviceChargeAmount = methodPricing.serviceChargeAmount;
  const appliedDiscount = foodPandaGstExempt || method === 'allowance'
    ? 0
    : discountMode === 'percent' && Number(discountPercent) > 0
      ? Math.round(subtotal * Number(discountPercent) * 100 / 100) / 100
      : Number(discount || 0);
  const methodAdjustedTotal = Math.max(
    0,
    subtotal + taxAmount + serviceChargeAmount + deliveryChargeAmount - appliedDiscount,
  );

  // Effective total = method-adjusted cart total minus the value of points being
  // redeemed. All payment math (tendered, change, cardAmount) runs against this
  // so the cashier collects the correct (post-redemption, card-reduced) amount.
  const { config: loyaltyConfig } = useLoyalty();
  const redeemValue = orderCustomer && redeemPoints > 0 && loyaltyConfig?.redemptionValue
    ? Math.round(redeemPoints * loyaltyConfig.redemptionValue)
    : 0;
  const appliedDiscountPercent = appliedDiscount > 0 && subtotal > 0
    ? discountMode === 'percent' && Number(discountPercent) > 0
      ? Number(discountPercent)
      : (appliedDiscount / subtotal) * 100
    : 0;
  const appliedRedeemValue = foodPandaGstExempt ? 0 : redeemValue;
  const effectiveTotal = Math.max(0, methodAdjustedTotal - appliedRedeemValue);
  const canOverrideCreditLimits = cashier?.role === 'owner'
    || cashier?.permissions?.['salaries.overrideCreditLimits'] === true;
  const chargeRegularAvailable = Number(chargeToSalaryCreditSummary?.available || 0);
  const chargeOverrideAvailable = Number(chargeToSalaryCreditSummary?.availableWithOverride || 0);
  const chargeRequiresOverride = Boolean(
    selectedChargeToSalaryEmployee
    && chargeToSalaryCreditSummary
    && effectiveTotal > chargeRegularAvailable + 0.001
    && effectiveTotal <= chargeOverrideAvailable + 0.001
  );
  const chargeHardBlocked = Boolean(
    selectedChargeToSalaryEmployee
    && chargeToSalaryCreditSummary
    && (
      chargeToSalaryCreditSummary.limits?.chargeToSalaryEnabled === false
      || effectiveTotal > chargeOverrideAvailable + 0.001
    )
  );
  const validCreditOverride = chargeRequiresOverride
    && canOverrideCreditLimits
    && creditOverrideRequested
    && creditOverrideReason.trim().length >= 5;

  useEffect(() => {
    let cancelled = false;
    setCreditOverrideRequested(false);
    setCreditOverrideReason('');
    if (!selectedChargeToSalaryEmployee?._id) {
      setChargeToSalaryCreditSummary(null);
      setCreditSummaryLoading(false);
      return undefined;
    }
    setCreditSummaryLoading(true);
    getChargeToSalaryCreditSummary(selectedChargeToSalaryEmployee._id)
      .then((summary) => {
        if (!cancelled) setChargeToSalaryCreditSummary(summary || null);
      })
      .catch(() => {
        if (!cancelled) setChargeToSalaryCreditSummary(null);
      })
      .finally(() => {
        if (!cancelled) setCreditSummaryLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedChargeToSalaryEmployee]);

  // Reset transient state when switching methods.
  useEffect(() => {
    setInput('');
    if (method !== 'allowance') {
      setAllowanceSearch('');
      setAllowanceResults([]);
      setAllowanceInputFocused(false);
      setSelectedAllowanceUser(null);
    }
    if (method !== 'charge-to-salary') {
      setSelectedChargeToSalaryEmployee(null);
      setChargeToSalaryCreditSummary(null);
      setCreditOverrideRequested(false);
      setCreditOverrideReason('');
    }
    if (method !== 'split-bill') {
      setSplitStep('choose');
      setSplitParts([]);
      setActiveTileIdx(null);
    }
  }, [method]);

  // A Foodpanda order is always settled to the platform receivable. Keeping
  // this automatic prevents a cashier from accidentally recording it as cash.
  // It remains an internal settlement method rather than a checkout option.
  useEffect(() => {
    if (orderType === 'foodpanda' && method !== 'foodpanda') {
      setMethod('foodpanda');
    } else if (orderType !== 'foodpanda' && method === 'foodpanda') {
      setMethod('cash');
    }
  }, [orderType, method]);

  const handleAllowanceSearch = useCallback((q) => {
    setAllowanceSearch(q);
    setSelectedAllowanceUser(null);
    if (allowanceSearchTimer.current) clearTimeout(allowanceSearchTimer.current);

    allowanceSearchTimer.current = setTimeout(async () => {
      setAllowanceSearching(true);
      try {
        const res = await searchUsersForAllowance(q.trim());
        setAllowanceResults(res.data?.data?.users ?? []);
      } catch {
        setAllowanceResults([]);
      } finally {
        setAllowanceSearching(false);
      }
    }, q.trim() ? 300 : 0);
  }, []);

  const handleAllowanceFocus = useCallback(async () => {
    setAllowanceInputFocused(true);
    if (allowanceResults.length === 0 && !allowanceSearch.trim()) {
      setAllowanceSearching(true);
      try {
        const res = await searchUsersForAllowance('');
        setAllowanceResults(res.data?.data?.users ?? []);
      } catch {
        setAllowanceResults([]);
      } finally {
        setAllowanceSearching(false);
      }
    }
  }, [allowanceResults.length, allowanceSearch]);

  const selectAllowanceUser = useCallback(async (user) => {
    setAllowanceSearch(user.name);
    setAllowanceResults([]);
    setAllowanceInputFocused(false);
    const subjectType = user.subjectType || 'employee';
    // Re-fetch fresh allowance balance
    try {
      const res = await getUserAllowance(user.subjectId ?? user.userId, subjectType);
      const d = res.data?.data;
      setSelectedAllowanceUser({
        userId: user.subjectId ?? user.userId,
        subjectType,
        name: user.name,
        monthlyLimit: d?.monthlyLimit ?? user.monthlyLimit,
        usedAmount: d?.usedAmount ?? user.usedAmount,
        remainingAmount: d?.remainingAmount ?? user.remainingAmount,
        hasAllowance: d?.hasAllowance ?? user.hasAllowance,
      });
    } catch {
      setSelectedAllowanceUser({
        userId: user.subjectId ?? user.userId,
        subjectType,
        name: user.name,
        monthlyLimit: user.monthlyLimit,
        usedAmount: user.usedAmount,
        remainingAmount: user.remainingAmount,
        hasAllowance: user.hasAllowance,
      });
    }
  }, []);

  const tendered = Number(input) || 0;
  const cardAmount = Math.max(0, effectiveTotal - tendered);
  const change = tendered - effectiveTotal;

  // ── Split-bill derived state ─────────────────────────────────────────────
  const splitCollected = useMemo(
    () => splitParts.reduce((s, p) => s + (p.paidAt && p.method !== 'covered' ? Number(p.share) || 0 : 0), 0),
    [splitParts],
  );
  const splitShareSum = useMemo(
    () => splitParts.reduce((s, p) => s + (Number(p.share) || 0), 0),
    [splitParts],
  );
  const splitRemaining = Math.max(0, Math.round((effectiveTotal - splitCollected) * 100) / 100);
  const splitAllPaid = splitParts.length > 0 && splitParts.every((p) => !!p.paidAt);
  const splitShareTotalsMatch = Math.abs(splitShareSum - effectiveTotal) < 0.01;
  const splitReady = splitAllPaid && splitShareTotalsMatch;

  const canConfirm = useMemo(() => {
    if (!cartItems.length) return false;
    if (!taxConfig?.loaded) return false;
    if (method === 'cash') return tendered >= effectiveTotal;
    if (method === 'card') return true;
    if (method === 'online-transfer') return true;
    if (method === 'split-bill') return splitReady;
    if (method === 'allowance') return !!selectedAllowanceUser;
    if (method === 'charge-to-salary') {
      if (!selectedChargeToSalaryEmployee || creditSummaryLoading || !chargeToSalaryCreditSummary) return false;
      if (chargeHardBlocked) return false;
      if (chargeRequiresOverride) return validCreditOverride;
      return true;
    }
    if (method === 'foodpanda') return Boolean(foodPandaOrderNumber.trim());
    return false;
  }, [
    method,
    tendered,
    effectiveTotal,
    cartItems,
    selectedAllowanceUser,
    selectedChargeToSalaryEmployee,
    splitReady,
    creditSummaryLoading,
    chargeToSalaryCreditSummary,
    chargeHardBlocked,
    chargeRequiresOverride,
    validCreditOverride,
    orderType,
    foodPandaOrderNumber,
    taxConfig?.loaded,
  ]);

  const handleNumKey = useCallback((key) => {
    if (key === '⌫') {
      setInput((prev) => prev.slice(0, -1));
    } else if (key === '.') {
      setInput((prev) => (prev.includes('.') ? prev : prev + '.'));
    } else {
      setInput((prev) => prev + key);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    // React state updates after the event returns. The ref closes the small
    // double-click window before `loading` can re-render the button.
    if (!canConfirm || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;

    let paymentDetails;
    if (method === 'allowance') {
      paymentDetails = {
        paymentMethod: 'allowance',
        allowanceUserId: selectedAllowanceUser.userId,
        allowanceSubjectType: selectedAllowanceUser.subjectType || 'employee',
        cashTendered: 0,
        changeGiven: 0,
      };
    } else if (method === 'charge-to-salary') {
      paymentDetails = {
        paymentMethod: 'charge-to-salary',
        chargeToSalaryEmployeeId: selectedChargeToSalaryEmployee._id,
        cashTendered: 0,
        changeGiven: 0,
        ...(validCreditOverride
          ? {
              creditLimitOverride: {
                requested: true,
                reason: creditOverrideReason.trim(),
              },
            }
          : {}),
      };
    } else if (method === 'card') {
      const last4 = String(cardRef || '').replace(/\D/g, '').slice(-4);
      paymentDetails = {
        paymentMethod: 'card',
        cashTendered: 0,
        changeGiven: 0,
        cardReference: cardRef || '',
        cardLast4: /^\d{4}$/.test(last4) ? last4 : undefined,
      };
    } else if (method === 'online-transfer') {
      paymentDetails = {
        paymentMethod: 'online-transfer',
        cashTendered: 0,
        changeGiven: 0,
        onlineTransferAmount: effectiveTotal,
        onlineTransferReference: onlineTransferRef.trim(),
      };
    } else if (method === 'foodpanda') {
      paymentDetails = {
        paymentMethod: 'foodpanda',
        cashTendered: 0,
        changeGiven: 0,
        foodPandaAmount: effectiveTotal,
        foodPandaReference: foodPandaOrderNumber.trim(),
      };
    } else if (method === 'split-bill') {
      // Sums for the SaleTransaction's flat cashAmount/cardAmount/changeGiven
      // — used by reports and journal entries. Per-tile detail goes in
      // splitBill below.
      const sumCash = splitParts
        .filter((p) => p.method === 'cash')
        .reduce((s, p) => s + Number(p.share || 0), 0);
      const sumCardShare = splitParts
        .filter((p) => p.method === 'card')
        .reduce((s, p) => s + Number(p.share || 0), 0);
      const sumChange = splitParts
        .filter((p) => p.method === 'cash')
        .reduce((s, p) => s + Math.max(0, Number(p.tendered ?? p.share) - Number(p.share || 0)), 0);
      paymentDetails = {
        paymentMethod: 'split-bill',
        cashTendered: sumCash,        // cash actually kept (drawer impact)
        changeGiven: Math.round(sumChange * 100) / 100,
        cardAmount: sumCardShare,
        splitBill: {
          ways: splitParts.length,
          parts: splitParts.map((p) => ({
            share: Number(p.share || 0),
            method: p.method,
            tendered: p.method === 'cash' ? Number(p.tendered ?? p.share) : undefined,
            cardReference: p.method === 'card' ? (p.cardReference || '') : undefined,
            coveredBy: p.method === 'covered' ? p.coveredBy : undefined,
            note: p.note || undefined,
            paidAt: p.paidAt,
          })),
        },
      };
    } else {
      paymentDetails = { paymentMethod: 'cash', cashTendered: tendered, changeGiven: Math.max(0, change) };
    }

    const payload = {
      clientTransactionId: createClientTransactionId(),
      outletCode,
      sessionId: session?._id ?? session?.id ?? null,
      cashierId: cashier?._id ?? cashier?.id ?? null,
      items: methodPricing.items.map((item) => ({
        menuItemId: item.id,
        variationId: item.variationId ?? undefined,
        dealSelections: item.dealSelections || [],
        variationName: item.variationName ?? undefined,
        name: item.name,
        qty: item.qty,
        listedUnitPrice: item.listedUnitPrice,
        priceMode: item.priceMode,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        serviceCharge: item.serviceCharge,
        lineTotal: item.lineTotal,
      })),
      subtotal,
      taxAmount,
      serviceChargeAmount,
      deliveryChargeAmount,
      // Allowance and Foodpanda checkout cannot have discounts.
      discountAmount: appliedDiscount,
      discountMode: appliedDiscount > 0 ? discountMode : 'amount',
      discountPercent: appliedDiscount > 0 ? discountPercent : 0,
      totalAmount: method === 'allowance' ? subtotal + taxAmount + serviceChargeAmount + deliveryChargeAmount : effectiveTotal,
      notes: note || undefined,
      cashierNotes: cashierNote || undefined,
      orderType,
      ...(orderType === 'foodpanda' && {
        foodPandaOrderNumber: foodPandaOrderNumber.trim(),
        foodPandaCustomerName: foodPandaCustomerName.trim(),
      }),
      ...(orderType === 'dine-in' && tableNumber && { tableNumber }),
      ...(orderCustomer && { customerId: orderCustomer._id }),
      ...(orderCustomer && !foodPandaGstExempt && redeemPoints > 0 && { redeemPoints }),
      ...(orderType === 'delivery' && deliveryAddress && { deliveryAddress }),
      ...(activeHeldOrderId && { resumedFromHoldId: activeHeldOrderId }),
      heldItemCancellationDetails,
      kdsItemCancellationVersion,
      ...(Object.keys(heldItemCancellationReasons).length > 0 && { heldItemCancellationReasons }),
      ...(resumedFromOfflineId && {
        localHoldClientTransactionId: resumedFromOfflineId,
      }),
      ...paymentDetails,
    };

    setLoading(true);
    try {
      const response = await processSale(payload);
      // Backend returns { success, transaction, receiptData }.
      // Use receiptData (which has transactionNumber, items, cashierName, etc.)
      // and fall back to the raw response if receiptData is absent.
      // Spread receiptData LAST for fields the backend computes authoritatively
      // (totalAmount, pointsEarned, pointsRedeemed, pointsBalanceAfter, etc.).
      setReceipt({
        ...paymentDetails,
        subtotal,
        taxAmount,
        serviceChargeAmount,
        deliveryChargeAmount,
        discountAmount: appliedDiscount,
        discountMode: appliedDiscount > 0 ? discountMode : 'amount',
        discountPercent: appliedDiscount > 0 ? discountPercent : 0,
        totalAmount: effectiveTotal,
        notes: note,
        customer: orderCustomer ?? null,
        orderType,
        foodPandaOrderNumber: orderType === 'foodpanda' ? foodPandaOrderNumber.trim() : null,
        foodPandaCustomerName: orderType === 'foodpanda' ? foodPandaCustomerName.trim() : null,
        tableNumber: orderType === 'dine-in' ? tableNumber : '',
        deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
        chargeToSalaryEmployee: selectedChargeToSalaryEmployee,
        ...(response.receiptData ?? response),
      });
      // If this sale was resumed from a local (offline) hold, drop it now
      // that it's been settled — the paid sale supersedes the local copy.
      if (resumedFromOfflineId) {
        dispatch(markHoldSynced(resumedFromOfflineId));
      }
      if (activeHeldOrderId) {
        removeCachedHeldOrder(outletCode, activeHeldOrderId);
      }
      dispatch(clearCart());
      dispatch(resetOrder());
      onSaleComplete?.();
      toast.success('Sale processed successfully');
    } catch (err) {
      const isNetwork = !err.response || (axios.isAxiosError(err) && err.code === 'ERR_NETWORK');
      if (isNetwork) {
        if (method === 'charge-to-salary') {
          toast.error('Charge to Salary requires an online connection so employee limits can be verified.');
          return;
        }
        try {
          dispatch(addToOfflineQueue(payload));
        } catch {
          toast.error('Could not save the sale offline. The cart was kept open.');
          return;
        }
        // A paid sale supersedes the local hold it came from. Removing that
        // hold only after the sale was durably queued prevents both records
        // from uploading when connectivity returns.
        if (resumedFromOfflineId) {
          dispatch(markHoldSynced(resumedFromOfflineId));
        }
        dispatch(clearCart());
        dispatch(resetOrder());
        onSaleComplete?.();
        toast('Network unavailable. Sale saved to offline queue.', { icon: '📴', duration: 6000 });

        // Local earn estimate — pure client computation; backend will
        // recalculate authoritatively on sync. We tag it `*Pending` so the
        // receipt UI can flag "to be confirmed on sync".
        const earnEstimate = (orderCustomer && loyaltyConfig?.pointsPerCurrencyUnit > 0
          && (loyaltyConfig.earnOnPaymentMethods || []).includes(method))
          ? Math.floor(
              (loyaltyConfig.earnBasis === 'subtotalPlusTax'
                ? subtotal + taxAmount - appliedDiscount
                : subtotal - appliedDiscount)
              * loyaltyConfig.pointsPerCurrencyUnit,
            )
          : 0;

        setReceipt({
          ...payload,
          transactionNumber: null,
          offline: true,
          ...paymentDetails,
          totalAmount: effectiveTotal,
          subtotal,
          taxAmount,
          serviceChargeAmount,
          discountAmount: appliedDiscount,
          discountMode: appliedDiscount > 0 ? discountMode : 'amount',
          discountPercent: appliedDiscount > 0 ? discountPercent : 0,
          // Show what we already know about loyalty on the offline receipt.
          // pointsBalanceAfter is intentionally omitted — we don't know it
          // until sync; the receipt shows "pending" instead.
          pointsRedeemed: foodPandaGstExempt ? 0 : (redeemPoints || 0),
          pointsRedeemedValue: appliedRedeemValue,
          pointsEarnedPending: earnEstimate,
          customer: orderCustomer ?? null,
          orderType,
          foodPandaOrderNumber: orderType === 'foodpanda' ? foodPandaOrderNumber.trim() : null,
          foodPandaCustomerName: orderType === 'foodpanda' ? foodPandaCustomerName.trim() : null,
          tableNumber: orderType === 'dine-in' ? tableNumber : '',
          deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
          chargeToSalaryEmployee: selectedChargeToSalaryEmployee,
        });
      } else {
        if (err.response?.data?.creditSummary) {
          setChargeToSalaryCreditSummary(err.response.data.creditSummary);
          setCreditOverrideRequested(false);
          setCreditOverrideReason('');
        }
        toast.error(err.response?.data?.message || 'Payment failed. Please try again.');
      }
    } finally {
      confirmInFlightRef.current = false;
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kdsItemCancellationVersion, canConfirm, loading, method, cardRef, onlineTransferRef, tendered, cardAmount, change, outletCode, session, cashier, cartItems, subtotal, taxAmount, serviceChargeAmount, deliveryChargeAmount, appliedDiscount, discountMode, discountPercent, note, total, effectiveTotal, redeemPoints, splitParts, dispatch, onSaleComplete, selectedAllowanceUser, selectedChargeToSalaryEmployee, orderType, orderCustomer, deliveryAddress, tableNumber, foodPandaOrderNumber, foodPandaCustomerName, activeHeldOrderId, resumedFromOfflineId, validCreditOverride, creditOverrideReason, loyaltyConfig, foodPandaGstExempt, appliedRedeemValue]);

  // Keyboard handler for the whole modal
  useEffect(() => {
    if (!isOpen || receipt) return;
    const handler = (e) => {
      // If the user is typing in any text field (search box, inline share
      // edit, custom-ways input, card reference, etc.), let the field handle
      // the key. Otherwise the cash numpad eats every digit.
      const tag = e.target?.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
      if (editable) {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        return;
      }

      // The cash numpad only exists for the legacy cash mode. Don't grab
      // keys in split-bill / card / allowance — they have their own inputs.
      const numpadActive = method === 'cash';

      if (numpadActive && e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleNumKey(e.key);
      } else if (numpadActive && e.key === '.') {
        e.preventDefault();
        handleNumKey('.');
      } else if (numpadActive && e.key === 'Backspace') {
        e.preventDefault();
        handleNumKey('⌫');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, receipt, method, handleNumKey, handleConfirm, onClose]);

  if (!isOpen) return null;

  const quickAmounts = [
    effectiveTotal,
    Math.ceil(effectiveTotal / 100) * 100,
    Math.ceil(effectiveTotal / 500) * 500,
    Math.ceil(effectiveTotal / 1000) * 1000,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <div
      className="fixed inset-0 z-50 flex bg-surface-900/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={orderType === 'foodpanda' ? 'Confirm Foodpanda order' : 'Collect payment'}
    >
      {/* Left panel: order summary (desktop only) */}
      <div className="hidden w-72 shrink-0 flex-col bg-surface-900 md:flex">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700">
          <h2 className="text-base font-semibold text-white">Order Summary</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {cartItems.map((item) => (
            <div key={item.lineKey ?? item.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {item.name}{item.variationName ? ` (${item.variationName})` : ''}
                </p>
                <p className="text-xs text-surface-400">
                  × {item.qty} @ PKR {item.unitPrice.toFixed(0)}
                </p>
              </div>
              <p className="text-sm font-semibold text-white shrink-0">
                PKR {(item.qty * item.unitPrice).toFixed(0)}
              </p>
            </div>
          ))}
        </div>
        {/* Order type + customer + delivery address */}
        {(orderType !== 'dine-in' || orderCustomer) && (() => {
          const OrderTypeIcon = orderType === 'foodpanda'
            ? Bike
            : orderType === 'delivery'
              ? Truck
              : orderType === 'takeaway'
                ? ShoppingBag
                : UtensilsCrossed;
          const orderTypeColors = {
            'dine-in':  'bg-emerald-500/20 text-emerald-300',
            'takeaway': 'bg-sky-500/20 text-sky-300',
            'delivery': 'bg-amber-500/20 text-amber-300',
            'foodpanda': 'bg-pink-500/20 text-pink-300',
          };
          return (
            <div className="mx-5 mb-3 rounded-xl bg-surface-800 px-3 py-2.5 space-y-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${orderTypeColors[orderType]}`}>
                <OrderTypeIcon size={11} />
                {orderType.charAt(0).toUpperCase() + orderType.slice(1)}
              </span>
              {orderCustomer && (
                <div className="flex items-start gap-2">
                  <User size={12} className="text-surface-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-surface-100 truncate leading-tight">
                      {orderCustomer.name || <span className="font-normal italic text-surface-400">No name</span>}
                    </p>
                    <p className="text-[11px] text-surface-400">{orderCustomer.phone}</p>
                  </div>
                </div>
              )}
              {orderType === 'delivery' && deliveryAddress && (
                <div className="flex items-start gap-2">
                  <MapPin size={12} className="text-surface-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-surface-400 leading-snug">
                    {[deliveryAddress.label, deliveryAddress.street, deliveryAddress.area, deliveryAddress.city]
                      .filter(Boolean).join(', ')}
                  </p>
                </div>
              )}
              {orderType === 'foodpanda' && (
                <div className="space-y-0.5 text-[11px] text-pink-200">
                  <p><span className="text-surface-400">Order #:</span> {foodPandaOrderNumber}</p>
                  <p><span className="text-surface-400">Customer:</span> {foodPandaCustomerName || '—'}</p>
                  <p className="font-semibold">GST excluded</p>
                </div>
              )}
            </div>
          );
        })()}

        <div className="px-5 py-4 border-t border-surface-700 space-y-2">
          <div className="flex justify-between text-sm text-surface-400">
            <span>Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          {taxAmount > 0 && (
            <div className="flex justify-between text-sm text-surface-400">
              <span>Tax ({fmtRate(effRate)}%)</span>
              <span>{fmt(taxAmount)}</span>
            </div>
          )}
          {serviceChargeAmount > 0 && (
            <div className="flex justify-between text-sm text-surface-400">
              <span>Service Charge ({fmtRate(taxConfig?.serviceChargeRate)}%)</span>
              <span>{fmt(serviceChargeAmount)}</span>
            </div>
          )}
          {deliveryChargeAmount > 0 && (
            <div className="flex justify-between text-sm text-surface-400">
              <span>Delivery Charge</span>
              <span>{fmt(deliveryChargeAmount)}</span>
            </div>
          )}
          {appliedDiscount > 0 && (
            <div className="flex justify-between text-sm text-rose-400">
              <span>Discount ({fmtRate(appliedDiscountPercent)}%)</span>
              <span>-{fmt(appliedDiscount)}</span>
            </div>
          )}
          {appliedRedeemValue > 0 && (
            <div className="flex justify-between text-sm text-amber-300">
              <span>Points Redeemed ({redeemPoints})</span>
              <span>-{fmt(appliedRedeemValue)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-surface-700">
            <span>Total</span>
            <span>{fmt(effectiveTotal)}</span>
          </div>
          {note && (
            <div className="rounded-lg bg-surface-800 px-3 py-2 mt-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-400 mb-0.5">Note</p>
              <p className="text-xs text-surface-200 whitespace-pre-wrap">{note}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel: payment entry */}
      <div className="flex flex-1 flex-col bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-surface-400">
              {orderType === 'foodpanda' ? 'Confirm Foodpanda Order' : 'Collect Payment'}
            </p>
            <p className="mt-0.5 text-2xl font-extrabold text-surface-900">{fmt(effectiveTotal)}</p>
            {appliedRedeemValue > 0 && (
              <p className="text-[11px] text-amber-600 font-semibold mt-0.5">
                Redeemed {redeemPoints} pts (−{fmt(appliedRedeemValue)}) from {fmt(methodAdjustedTotal)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-surface-400 hover:bg-surface-100 hover:text-surface-900 md:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* Foodpanda is chosen at cart level and settles to the platform
            automatically, so it is intentionally not a payment-method tab. */}
        {orderType !== 'foodpanda' && (
          <div className="flex gap-2 overflow-x-auto border-b border-surface-100 px-6 py-3">
            {METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${
                    method === m.id
                      ? 'bg-brand-600 text-white shadow-glow'
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                  }`}
                >
                  <Icon size={15} />
                  {m.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {method === 'charge-to-salary' ? (
            <ChargeToSalaryPicker
              selected={selectedChargeToSalaryEmployee}
              onSelect={setSelectedChargeToSalaryEmployee}
              total={effectiveTotal}
              creditSummary={chargeToSalaryCreditSummary}
              summaryLoading={creditSummaryLoading}
              canOverride={canOverrideCreditLimits}
              overrideRequested={creditOverrideRequested}
              onOverrideRequested={setCreditOverrideRequested}
              overrideReason={creditOverrideReason}
              onOverrideReason={setCreditOverrideReason}
            />
          ) : method === 'allowance' ? (
            /* Allowance payment */
            <div className="flex flex-1 flex-col px-6 py-5 space-y-4 overflow-y-auto">
              <div>
                <p className="text-sm font-medium text-surface-700 mb-1">Search</p>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <input
                    type="text"
                    value={allowanceSearch}
                    onChange={(e) => handleAllowanceSearch(e.target.value)}
                    onFocus={handleAllowanceFocus}
                    onBlur={() => setTimeout(() => setAllowanceInputFocused(false), 150)}
                    className="input-field pl-9"
                    placeholder="Tap to browse or type to search…"
                  />
                </div>

                {/* Dropdown — show when focused and no user selected */}
                {allowanceInputFocused && !selectedAllowanceUser && (
                  <div className="mt-1 border border-surface-200 rounded-xl overflow-hidden shadow-lg">
                    {allowanceSearching ? (
                      <div className="px-4 py-3 text-xs text-surface-400">Searching…</div>
                    ) : allowanceResults.length > 0 ? (
                      allowanceResults.map((u) => (
                        <button
                          key={u.userId}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); selectAllowanceUser(u); }}
                          className="flex items-center justify-between w-full px-4 py-3 text-left text-sm hover:bg-brand-50 border-b border-surface-100 last:border-0"
                        >
                          <div>
                            <p className="font-medium text-surface-900">{u.name}</p>
                            <p className="text-xs text-surface-400">{u.email}</p>
                          </div>
                          {!u.hasAllowance && (
                            <span className="text-xs text-rose-400">No allowance</span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-xs text-surface-400">
                        {allowanceSearch.trim()
                          ? `No employees found for "${allowanceSearch}"`
                          : 'No employees with allowance configured.'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedAllowanceUser && (
                <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
                  {/* Identity row */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-100">
                    <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-brand-600 leading-none">
                        {selectedAllowanceUser.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-surface-900 truncate leading-tight">{selectedAllowanceUser.name}</p>
                      <p className="text-xs text-surface-400 leading-tight mt-0.5">Staff member</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedAllowanceUser(null); setAllowanceSearch(''); }}
                      className="shrink-0 text-xs font-medium text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg px-2.5 py-1 transition-colors"
                    >
                      Change
                    </button>
                  </div>

                  {/* Status + notices */}
                  <div className="px-4 py-3 space-y-2">
                    {total > (selectedAllowanceUser.remainingAmount || 0) ? (
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">
                          Order exceeds remaining allowance — excess will be tracked as receivable.
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CheckCircle size={13} className="text-emerald-500 shrink-0" />
                        <p className="text-xs text-emerald-700">Order is within allowance limit.</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                      <p className="text-xs text-amber-700">No discounts are applied on allowance orders.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : method === 'card' ? (
            /* Card payment */
            <div className="flex flex-1 flex-col items-center justify-center px-6 space-y-5">
              <div className="rounded-2xl bg-brand-50 p-5">
                <CreditCard size={40} className="text-brand-600" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-surface-900">{fmt(effectiveTotal)}</p>
                {taxableSubtotal > 0 && taxConfig?.cardReducedEnabled && (
                  <p className="mt-1 text-xs font-medium text-emerald-600">
                    Card rate applied — tax {effRate}% (vs {taxConfig.standardRate}% cash)
                  </p>
                )}
                <p className="mt-1 text-sm text-surface-500">
                  Process on card terminal, then confirm below.
                </p>
              </div>
              <div className="w-full max-w-xs">
                <label className="block text-sm font-medium text-surface-700">
                  Card — last 4 digits (optional)
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={cardRef}
                    onChange={(e) => setCardRef(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="input-field mt-2"
                    placeholder="e.g. 4242"
                    autoFocus
                  />
                </label>
              </div>
            </div>
          ) : method === 'online-transfer' ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 space-y-5">
              <div className="rounded-2xl bg-sky-50 p-5">
                <Landmark size={40} className="text-sky-600" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-surface-900">{fmt(effectiveTotal)}</p>
                {taxableSubtotal > 0 && (
                  <p className={`mt-1 text-xs font-medium ${taxConfig?.onlineReducedEnabled ? 'text-emerald-600' : 'text-surface-500'}`}>
                    {taxConfig?.onlineReducedEnabled
                      ? `Reduced online rate applied — tax ${effRate}%`
                      : `Standard rate applied — tax ${effRate}%`}
                  </p>
                )}
                <p className="mt-1 text-sm text-surface-500">Confirm the funds in the bank or wallet before completing the sale.</p>
              </div>
              <div className="w-full max-w-xs">
                <label className="block text-sm font-medium text-surface-700">
                  Transfer reference (optional)
                  <input
                    type="text"
                    maxLength={100}
                    value={onlineTransferRef}
                    onChange={(e) => setOnlineTransferRef(e.target.value)}
                    className="input-field mt-2"
                    placeholder="Transaction ID / bank reference"
                    autoFocus
                  />
                </label>
              </div>
            </div>
          ) : method === 'foodpanda' ? (
            /* Food Panda payment */
            <div className="flex flex-1 flex-col items-center justify-center px-6 space-y-5">
              <div className="rounded-2xl bg-pink-50 p-5">
                <Bike size={40} className="text-pink-600" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-surface-900">{fmt(effectiveTotal)}</p>
                <p className="mt-1 text-sm text-surface-500">
                  Food Panda order — platform pays later. No cash in drawer.
                </p>
              </div>
              <div className="w-full max-w-xs">
                <div className="space-y-2 rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm">
                  <p><span className="text-surface-500">Order #:</span> <strong>{foodPandaOrderNumber}</strong></p>
                  <p><span className="text-surface-500">Customer:</span> <strong>{foodPandaCustomerName || '—'}</strong></p>
                  <p className="text-xs font-semibold text-pink-700">GST is not included.</p>
                </div>
              </div>
            </div>
          ) : method === 'split-bill' ? (
            /* Split-the-bill flow */
            <SplitBillFlow
              effectiveTotal={effectiveTotal}
              splitStep={splitStep}
              setSplitStep={setSplitStep}
              splitParts={splitParts}
              setSplitParts={setSplitParts}
              splitCollected={splitCollected}
              splitRemaining={splitRemaining}
              splitShareSum={splitShareSum}
              activeTileIdx={activeTileIdx}
              setActiveTileIdx={setActiveTileIdx}
              fmt={fmt}
            />
          ) : (
            /* Cash: Amount display + numpad */
            <div className="flex flex-1 flex-col md:flex-row">
              {/* Left: display + quick amounts + change */}
              <div className="flex flex-col gap-3 border-b border-surface-100 px-5 py-4 md:w-60 md:border-b-0 md:border-r md:border-surface-100 md:overflow-y-auto">
                {/* Live amount display */}
                <div>
                  <p className="mb-1 text-xs font-medium text-surface-500">Cash Tendered</p>
                  <div
                    className={`rounded-2xl border-2 px-4 py-3 text-right text-2xl font-bold tabular-nums transition-all duration-200 ${
                      input
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-surface-200 bg-surface-50 text-surface-400'
                    }`}
                  >
                    {input ? fmt(Number(input) || 0) : fmt(0)}
                  </div>
                </div>

                {/* Quick amounts */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-surface-400">Quick amounts</p>
                  {quickAmounts.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setInput(String(val))}
                      className={`w-full rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200 ${
                        Number(input) === val
                          ? 'bg-brand-600 text-white shadow-glow'
                          : 'border border-surface-200 bg-surface-50 text-surface-700 hover:bg-brand-50 hover:text-brand-700'
                      }`}
                    >
                      {fmt(val)}
                    </button>
                  ))}
                </div>

                {/* Change */}
                {tendered > 0 && (
                  <div
                    className={`rounded-2xl border px-4 py-3 ${
                      change >= 0
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-rose-200 bg-rose-50'
                    }`}
                  >
                    <p className="text-xs font-medium text-surface-500">
                      {change >= 0 ? 'Change' : 'Short by'}
                    </p>
                    <p
                      className={`mt-0.5 text-lg font-bold ${
                        change >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {fmt(Math.abs(change))}
                    </p>
                  </div>
                )}
              </div>

              {/* Right: Numpad */}
              <div className="flex flex-1 flex-col justify-center p-4">
                <div className="mx-auto w-full max-w-xs space-y-2">
                  {NUMPAD_KEYS.map((row, rowIdx) => (
                    <div key={rowIdx} className="grid grid-cols-3 gap-2">
                      {row.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleNumKey(key)}
                          className={`rounded-2xl py-5 text-xl font-semibold transition-all duration-150 active:scale-95 ${
                            key === '⌫'
                              ? 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                              : 'border border-surface-200 bg-white text-surface-900 shadow-card hover:shadow-card-hover hover:border-brand-300'
                          }`}
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-surface-100 px-6 py-4">
          {!taxConfig?.loaded && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Tax settings are not available on this terminal. Connect once before completing payment.</span>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm || loading}
              className="btn-primary flex-1 py-4"
            >
              {!taxConfig?.loaded
                ? 'Tax settings unavailable'
                : loading
                  ? 'Processing…'
              : method === 'allowance'
                // Allowance ignores redemption — charge the gross amount.
                ? `Charge to Allowance · ${fmt(total)}`
              : method === 'charge-to-salary'
                ? `Charge to Salary · ${fmt(effectiveTotal)}`
              : method === 'split-bill'
                ? splitReady
                  ? `Confirm Split · ${fmt(effectiveTotal)}`
                  : `Collect from all ${splitParts.length || ''} people first`
                : method === 'foodpanda'
                  ? `Confirm Food Panda · ${fmt(effectiveTotal)}`
                : method === 'online-transfer'
                  ? `Confirm Transfer · ${fmt(effectiveTotal)}`
                  : `Confirm Payment · ${fmt(effectiveTotal)}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-6 py-4"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {receipt && (
        <ReceiptModal
          transaction={receipt}
          outletName={outletName}
          cashierName={cashier?.name || cashier?.email}
          onClose={() => {
            setReceipt(null);
            onClose();
          }}
          onNewOrder={() => {
            setReceipt(null);
            onClose();
          }}
        />
      )}
    </div>
  );
};

export default PaymentModal;
