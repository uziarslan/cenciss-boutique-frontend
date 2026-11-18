import { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CheckCircle,
  Clock,
  Pencil,
  Printer,
  Search,
  Trash2,
  TrendingDown,
  User,
  X,
} from 'lucide-react';
import api from '../../api/axios';
import {
  deleteDrawerMovement,
  issueEmployeeAdvanceFromDrawer,
  recordDrawerMovement,
  updateDrawerMovement,
} from '../../api/sessionApi';
import {
  getChargeToSalaryCreditSummary,
  searchChargeToSalaryEmployees,
} from '../../api/saleApi';
import { fetchCurrentSession } from '../../store/slices/sessionSlice';
import AmountInput from '../UI/AmountInput';
import ConfirmModal from '../UI/ConfirmModal';
import useSession from '../../hooks/useSession';
import { buildDrawerReportHtml, printDrawerReport } from '../../utils/eodReportPrinter';
import ThermalReportModal from '../Print/ThermalReportModal';

const formatPKR = (v) => `Rs. ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtTime = (d) => {
  try { return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};

// Drawer operations panel. Ordinary movements only adjust the expected
// physical cash; the Advance tab additionally creates a linked payroll and
// accounting record through its dedicated endpoint.
const CashDrawerModal = ({ isOpen, onClose, canAdd = false, canEdit = false, canDelete = false }) => {
  const dispatch = useDispatch();
  const { cashier, session, outletName, outletCode } = useSession();
  const [mode, setMode] = useState('payout'); // 'payout' | 'cash_in' | 'advance'
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [paidOut, setPaidOut] = useState(0);
  const [paidIn, setPaidIn] = useState(0);
  const [drawerPrintPreview, setDrawerPrintPreview] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [summaryData, setSummaryData] = useState({});
  const [printing, setPrinting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employeeResults, setEmployeeResults] = useState([]);
  const [employeeSearchOpen, setEmployeeSearchOpen] = useState(false);
  const [employeeSearching, setEmployeeSearching] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [creditSummary, setCreditSummary] = useState(null);
  const [creditSummaryLoading, setCreditSummaryLoading] = useState(false);
  const [overrideRequested, setOverrideRequested] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const employeeSearchTimer = useRef(null);

  const loadSummary = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get('/api/pos/sessions/current/summary');
      const d = res.data?.data ?? {};
      setPaidOut(d.paidOut ?? 0);
      setPaidIn(d.paidIn ?? 0);
      setMovements(Array.isArray(d.drawerMovements) ? d.drawerMovements : []);
      setSummaryData(d);
    } catch {
      // Non-fatal — the form still works; history just won't show.
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const searchEmployees = useCallback(async (query = '') => {
    setEmployeeSearching(true);
    try {
      setEmployeeResults(await searchChargeToSalaryEmployees(query.trim()));
    } catch {
      setEmployeeResults([]);
    } finally {
      setEmployeeSearching(false);
    }
  }, []);

  const handleEmployeeQuery = (value) => {
    setEmployeeQuery(value);
    setSelectedEmployee(null);
    setCreditSummary(null);
    setOverrideRequested(false);
    setOverrideReason('');
    setEmployeeSearchOpen(true);
    if (employeeSearchTimer.current) clearTimeout(employeeSearchTimer.current);
    employeeSearchTimer.current = setTimeout(
      () => searchEmployees(value),
      value.trim() ? 250 : 0
    );
  };

  const chooseEmployee = (employee) => {
    if (employee.cashAdvanceEnabled === false) return;
    setSelectedEmployee(employee);
    setEmployeeQuery(employee.name);
    setEmployeeResults([]);
    setEmployeeSearchOpen(false);
  };

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setReason('');
      setMode('payout');
      setEditingId(null);
      setEmployeeQuery('');
      setEmployeeResults([]);
      setEmployeeSearchOpen(false);
      setSelectedEmployee(null);
      setCreditSummary(null);
      setOverrideRequested(false);
      setOverrideReason('');
      loadSummary();
    }
  }, [isOpen, loadSummary]);

  useEffect(() => () => {
    if (employeeSearchTimer.current) clearTimeout(employeeSearchTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOverrideRequested(false);
    setOverrideReason('');
    if (!selectedEmployee?._id) {
      setCreditSummary(null);
      setCreditSummaryLoading(false);
      return undefined;
    }
    setCreditSummaryLoading(true);
    getChargeToSalaryCreditSummary(selectedEmployee._id)
      .then((summary) => {
        if (!cancelled) setCreditSummary(summary || null);
      })
      .catch(() => {
        if (!cancelled) setCreditSummary(null);
      })
      .finally(() => {
        if (!cancelled) setCreditSummaryLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedEmployee]);

  if (!isOpen) return null;

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount.');
      return;
    }
    const movementType = mode;
    const movementReason = reason.trim() || undefined;

    if (saving) return;
    setSaving(true);
    const snapshot = { movements, paidOut, paidIn };

    // Optimistic: reflect the movement instantly, then post in the background.
    const optimistic = {
      _id: `temp-${Date.now()}`,
      type: movementType,
      amount: amt,
      reason: movementReason,
      at: new Date().toISOString(),
      _optimistic: true,
    };
    if (!editingId) {
      setMovements((prev) => [...prev, optimistic]);
      if (movementType === 'payout') setPaidOut((v) => Math.round((v + amt) * 100) / 100);
      else setPaidIn((v) => Math.round((v + amt) * 100) / 100);
    }
    try {
      const data = editingId
        ? await updateDrawerMovement(editingId, { type: movementType, amount: amt, reason: movementReason })
        : await recordDrawerMovement({ type: movementType, amount: amt, reason: movementReason });
      if (data?.paidOut != null) setPaidOut(data.paidOut);
      if (data?.paidIn != null) setPaidIn(data.paidIn);
      if (Array.isArray(data?.drawerMovements)) setMovements(data.drawerMovements);
      toast.success(editingId ? 'Drawer movement updated' : (movementType === 'payout' ? 'Cash paid out noted for this drawer' : 'Cash addition noted for this drawer'));
      setAmount('');
      setReason('');
      setEditingId(null);
      dispatch(fetchCurrentSession());
    } catch (err) {
      setMovements(snapshot.movements);
      setPaidOut(snapshot.paidOut);
      setPaidIn(snapshot.paidIn);
      toast.error(err.response?.data?.message || 'Could not save drawer movement');
    } finally {
      setSaving(false);
    }
  };

  const submitAdvance = async () => {
    const amt = Number(amount);
    if (!selectedEmployee?._id) {
      toast.error('Select an employee.');
      return;
    }
    if (!amt || amt <= 0) {
      toast.error('Enter a valid advance amount.');
      return;
    }
    if (!creditSummary) {
      toast.error('Employee credit limits could not be verified.');
      return;
    }
    if (creditSummary.limits?.cashAdvanceEnabled === false) {
      toast.error('Cash advances are disabled for this employee.');
      return;
    }
    if (advanceHardBlocked) {
      toast.error(`This amount exceeds the non-overridable ${formatPKR(advanceOverrideAvailable)} available limit.`);
      return;
    }
    if (advanceRequiresOverride && !canOverrideCreditLimits) {
      toast.error('This amount requires an authorized manager override.');
      return;
    }
    if (advanceRequiresOverride && !validAdvanceOverride) {
      toast.error('Enable the override and enter a reason of at least 5 characters.');
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      const data = await issueEmployeeAdvanceFromDrawer({
        employeeId: selectedEmployee._id,
        amount: amt,
        notes: reason.trim() || undefined,
        ...(validAdvanceOverride
          ? { creditLimitOverride: { requested: true, reason: overrideReason.trim() } }
          : {}),
      });
      if (data?.paidOut != null) setPaidOut(data.paidOut);
      if (data?.paidIn != null) setPaidIn(data.paidIn);
      if (Array.isArray(data?.drawerMovements)) setMovements(data.drawerMovements);
      toast.success(`Advance issued to ${selectedEmployee.name} and removed from this drawer`);
      setAmount('');
      setReason('');
      setEmployeeQuery('');
      setEmployeeResults([]);
      setSelectedEmployee(null);
      setCreditSummary(null);
      setOverrideRequested(false);
      setOverrideReason('');
      dispatch(fetchCurrentSession());
    } catch (err) {
      if (err.response?.data?.creditSummary) {
        setCreditSummary(err.response.data.creditSummary);
      }
      toast.error(err.response?.data?.message || 'Could not issue employee advance');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (movement) => {
    setEditingId(movement._id);
    setMode(movement.type);
    setAmount(String(movement.amount));
    setReason(movement.reason || '');
  };

  const removeMovement = async () => {
    if (!deleteTarget) return;
    try {
      const data = await deleteDrawerMovement(deleteTarget._id);
      setPaidOut(data?.paidOut ?? 0);
      setPaidIn(data?.paidIn ?? 0);
      setMovements(Array.isArray(data?.drawerMovements) ? data.drawerMovements : []);
      if (editingId === deleteTarget._id) {
        setEditingId(null);
        setAmount('');
        setReason('');
      }
      dispatch(fetchCurrentSession());
      toast.success('Drawer movement deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete drawer movement');
    }
  };

  const handlePreviewReport = async () => {
    setPrinting(true);
    try {
      const res = await api.get('/api/pos/sessions/current/summary');
      const latest = res.data?.data ?? summaryData;
      setSummaryData(latest);
      const generatedAt = new Date();
      const report = {
        outletName: outletName || outletCode,
        cashierName: cashier?.name || cashier?.email || 'Cashier',
        session,
        totals: latest,
        generatedAt,
      };
      setDrawerPrintPreview({
        ...report,
        reportHtml: buildDrawerReportHtml(report),
      });
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not prepare drawer report');
    } finally {
      setPrinting(false);
    }
  };

  const isPayout = mode === 'payout';
  const isAdvance = mode === 'advance';
  const requestedAdvance = Number(amount) || 0;
  const advanceRegularAvailable = Number(creditSummary?.available || 0);
  const advanceOverrideAvailable = Number(creditSummary?.availableWithOverride || 0);
  const canOverrideCreditLimits = creditSummary?.canOverride === true;
  const advanceRequiresOverride = Boolean(
    creditSummary
    && requestedAdvance > advanceRegularAvailable + 0.001
    && requestedAdvance <= advanceOverrideAvailable + 0.001
  );
  const advanceHardBlocked = Boolean(
    creditSummary
    && (
      creditSummary.limits?.cashAdvanceEnabled === false
      || requestedAdvance > advanceOverrideAvailable + 0.001
    )
  );
  const validAdvanceOverride = advanceRequiresOverride
    && canOverrideCreditLimits
    && overrideRequested
    && overrideReason.trim().length >= 5;
  const advanceSubmitBlocked = !selectedEmployee
    || !creditSummary
    || creditSummaryLoading
    || requestedAdvance <= 0
    || advanceHardBlocked
    || (advanceRequiresOverride && !validAdvanceOverride);

  return (
    <>
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-float" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
              <Banknote size={15} />
            </div>
            <p className="text-sm font-bold text-surface-900">Cash Drawer</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-surface-400 hover:bg-surface-100">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          {canAdd && <>
          {/* Mode toggle */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                if (isAdvance) { setAmount(''); setReason(''); }
                setMode('payout');
                setEditingId(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                isPayout ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'
              }`}
            >
              <ArrowUpFromLine size={13} /> Pay Out
            </button>
            <button
              type="button"
              onClick={() => {
                if (isAdvance) { setAmount(''); setReason(''); }
                setMode('cash_in');
                setEditingId(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                mode === 'cash_in' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'
              }`}
            >
              <ArrowDownToLine size={13} /> Add to Drawer
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isAdvance) { setAmount(''); setReason(''); }
                setMode('advance');
                setEditingId(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                isAdvance ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'
              }`}
            >
              <TrendingDown size={13} /> Advance
            </button>
          </div>

          <p className="text-[11px] text-surface-500 leading-relaxed">
            {isAdvance
              ? 'Issue a salary advance from this till. It is posted to payroll and accounting, checked against employee limits, and removed from the expected drawer count.'
              : isPayout
              ? 'Note cash physically removed from the till. This changes the expected drawer count only; it does not post to accounts.'
              : 'Note cash physically added to the till. This changes the expected drawer count only; it does not post to accounts.'}
          </p>

          {isAdvance && (
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-surface-500">Employee</label>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  value={employeeQuery}
                  onChange={(event) => handleEmployeeQuery(event.target.value)}
                  onFocus={() => {
                    setEmployeeSearchOpen(true);
                    if (!employeeResults.length && !selectedEmployee) searchEmployees(employeeQuery);
                  }}
                  onBlur={() => setTimeout(() => setEmployeeSearchOpen(false), 150)}
                  placeholder="Tap to browse or search staff…"
                  autoFocus
                  className="w-full rounded-xl border border-surface-200 bg-white py-2.5 pl-9 pr-3 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              {employeeSearchOpen && !selectedEmployee && (
                <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-surface-200 bg-white shadow-lg">
                  {employeeSearching ? (
                    <div className="px-3 py-3 text-xs text-surface-400">Searching…</div>
                  ) : employeeResults.length ? (
                    employeeResults.map((employee) => (
                      <button
                        key={employee._id}
                        type="button"
                        disabled={employee.cashAdvanceEnabled === false}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          chooseEmployee(employee);
                        }}
                        className={`flex w-full items-center justify-between gap-3 border-b border-surface-100 px-3 py-2.5 text-left last:border-0 ${
                          employee.cashAdvanceEnabled === false
                            ? 'cursor-not-allowed bg-surface-50 opacity-60'
                            : 'hover:bg-amber-50'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-surface-900">{employee.name}</span>
                          <span className="block truncate text-[11px] text-surface-400">
                            {[employee.designation, employee.department].filter(Boolean).join(' · ') || 'Employee'}
                          </span>
                        </span>
                        {employee.cashAdvanceEnabled === false
                          ? <span className="shrink-0 text-[10px] font-semibold text-rose-500">Disabled</span>
                          : <User size={14} className="shrink-0 text-amber-600" />}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-xs text-surface-400">No active employees found.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {isAdvance && selectedEmployee && (
            <div className="overflow-hidden rounded-xl border border-surface-200 bg-white">
              <div className="flex items-center gap-2.5 border-b border-surface-100 px-3 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                  {selectedEmployee.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-surface-900">{selectedEmployee.name}</p>
                  <p className="truncate text-[11px] text-surface-400">
                    {[selectedEmployee.designation, selectedEmployee.department].filter(Boolean).join(' · ') || 'Employee'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEmployee(null);
                    setEmployeeQuery('');
                    setCreditSummary(null);
                  }}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-500 hover:bg-rose-50"
                >
                  Change
                </button>
              </div>
              {creditSummaryLoading ? (
                <p className="px-3 py-3 text-xs text-amber-600">Checking employee credit limits…</p>
              ) : creditSummary ? (
                <>
                  <div className="grid grid-cols-2 divide-x divide-y divide-amber-100 bg-amber-50/60">
                    {[
                      ['Available', creditSummary.available],
                      ['Used Today', creditSummary.usage?.issuedToday],
                      ['Used 7 Days', creditSummary.usage?.issuedSevenDays],
                      ['Outstanding', creditSummary.usage?.outstanding],
                    ].map(([label, value]) => (
                      <div key={label} className="px-3 py-2">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600">{label}</p>
                        <p className="mt-0.5 text-xs font-bold tabular-nums text-amber-950">{formatPKR(value)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="border-t border-amber-100 px-3 py-2 text-[10px] text-amber-700">
                    {creditSummary.limits?.dailyLimitPercent}% daily · {creditSummary.limits?.rollingSevenDayLimitPercent}% rolling 7 days · {creditSummary.limits?.maxOutstandingPercent}% maximum · salary day {creditSummary.salaryDay}
                  </p>
                </>
              ) : (
                <p className="px-3 py-3 text-xs text-rose-600">Unable to verify limits. The advance cannot be issued.</p>
              )}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-surface-500">
              {isAdvance ? 'Advance Amount (PKR)' : 'Amount (PKR)'}
            </label>
            <div className="relative">
              <Banknote size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${isAdvance ? 'text-amber-600/80' : 'text-indigo-500/80'}`} />
              <AmountInput
                value={amount}
                onChange={setAmount}
                placeholder="0"
                autoFocus={!isAdvance}
                className={`w-full rounded-xl border border-surface-200 bg-white pl-9 pr-3 py-2.5 text-lg font-bold tabular-nums text-surface-900 focus:outline-none focus:ring-2 ${isAdvance ? 'focus:ring-amber-500/40' : 'focus:ring-indigo-500/40'}`}
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-surface-500">
              {isAdvance ? 'Notes' : 'Reason'} <span className="font-normal text-surface-400">(optional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder={isAdvance ? 'Reason for advance' : isPayout ? 'e.g. bought tomatoes & onions' : 'e.g. change returned'}
              className={`w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 ${isAdvance ? 'focus:ring-amber-500/40' : 'focus:ring-indigo-500/40'}`}
            />
          </div>

          {isAdvance && advanceRequiresOverride && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-xs font-semibold text-amber-900">Manager override required</p>
                  <p className="mt-0.5 text-[11px] text-amber-700">
                    This amount is above the normal {formatPKR(advanceRegularAvailable)} available limit.
                  </p>
                </div>
              </div>
              {canOverrideCreditLimits ? (
                <div className="mt-2.5 space-y-2">
                  <button
                    type="button"
                    onClick={() => setOverrideRequested((current) => !current)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                      overrideRequested ? 'border-amber-300 bg-white' : 'border-amber-200'
                    }`}
                    aria-pressed={overrideRequested}
                  >
                    <span className="text-[11px] font-semibold text-amber-900">Use authorized override</span>
                    <span className={`relative h-5 w-9 rounded-full transition ${overrideRequested ? 'bg-amber-500' : 'bg-surface-300'}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${overrideRequested ? 'left-[18px]' : 'left-0.5'}`} />
                    </span>
                  </button>
                  {overrideRequested && (
                    <textarea
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      rows={2}
                      placeholder="Reason for approving this exception…"
                      className="w-full resize-none rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                  )}
                  <p className="text-[10px] text-amber-700">Only daily and seven-day limits can be overridden. The overall ceiling remains blocked.</p>
                </div>
              ) : (
                <p className="mt-2 text-[11px] font-medium text-amber-800">
                  An owner must grant override access before this user can approve it.
                </p>
              )}
            </div>
          )}

          {isAdvance && advanceHardBlocked && requestedAdvance > 0 && creditSummary?.limits?.cashAdvanceEnabled !== false && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-600" />
              <p className="text-[11px] text-rose-700">
                Blocked by the non-overridable outstanding or salary-cycle ceiling. Maximum available: <strong>{formatPKR(advanceOverrideAvailable)}</strong>.
              </p>
            </div>
          )}

          {isAdvance && creditSummary?.limits?.cashAdvanceEnabled === false && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-600" />
              <p className="text-[11px] font-medium text-rose-700">Cash advances are disabled for this employee.</p>
            </div>
          )}

          {isAdvance && selectedEmployee && creditSummary && !advanceHardBlocked && !advanceRequiresOverride && requestedAdvance > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <CheckCircle size={14} className="shrink-0 text-emerald-600" />
              <p className="text-[11px] text-emerald-700">
                {formatPKR(requestedAdvance)} is within this employee’s current limit.
              </p>
            </div>
          )}
          </>}

          {/* Running totals */}
          <div className="flex items-center justify-between rounded-xl bg-surface-50 px-3 py-2 text-xs">
            <span className="text-rose-600 font-semibold">Paid out: {formatPKR(paidOut)}</span>
            <span className="text-emerald-600 font-semibold">Returned: {formatPKR(paidIn)}</span>
          </div>

          {/* History — skeleton while the session summary loads */}
          {loadingHistory && movements.length === 0 && (
            <div className="rounded-xl border border-surface-100 divide-y divide-surface-100 overflow-hidden">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 animate-pulse">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-surface-200 shrink-0" />
                    <span className="h-2.5 w-24 rounded bg-surface-200" />
                  </span>
                  <span className="h-2.5 w-14 rounded bg-surface-200 shrink-0" />
                </div>
              ))}
            </div>
          )}

          {/* History */}
          {movements.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-surface-100 divide-y divide-surface-100">
              {[...movements].reverse().map((m, i) => (
                <div key={m._id || i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {m.type === 'payout'
                      ? <ArrowUpFromLine size={11} className="text-rose-500 shrink-0" />
                      : <ArrowDownToLine size={11} className="text-emerald-500 shrink-0" />}
                    <span className="truncate text-surface-600">{m.reason || (m.type === 'payout' ? 'Payout' : 'Returned')}</span>
                    {m.at && <span className="inline-flex items-center gap-0.5 text-surface-400 shrink-0"><Clock size={9} />{fmtTime(m.at)}</span>}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span className={`font-semibold tabular-nums ${m.type === 'payout' ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {m.type === 'payout' ? '-' : '+'}{formatPKR(m.amount)}
                    </span>
                    {!m._optimistic && !m.salaryAdvance && (canEdit || canDelete) && (
                      <>
                        {canEdit && <button type="button" onClick={() => startEdit(m)} className="rounded p-1 text-indigo-500 hover:bg-indigo-50" title="Edit movement"><Pencil size={11} /></button>}
                        {canDelete && <button type="button" onClick={() => setDeleteTarget(m)} className="rounded p-1 text-rose-500 hover:bg-rose-50" title="Delete movement"><Trash2 size={11} /></button>}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-surface-100 px-4 py-3">
          <button
            type="button"
            onClick={handlePreviewReport}
            disabled={printing || loadingHistory}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            <Printer size={14} /> {printing ? 'Printing…' : 'Print Report'}
          </button>
          <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={editingId ? () => { setEditingId(null); setAmount(''); setReason(''); } : onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-surface-500 hover:bg-surface-100">
            {editingId ? 'Cancel Edit' : 'Close'}
          </button>
          {canAdd && <button
            type="button"
            onClick={isAdvance ? submitAdvance : submit}
            disabled={saving || (isAdvance && advanceSubmitBlocked)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              isAdvance
                ? 'bg-amber-500 hover:bg-amber-600'
                : isPayout
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isAdvance
              ? <TrendingDown size={14} />
              : isPayout
                ? <ArrowUpFromLine size={14} />
                : <ArrowDownToLine size={14} />}
            {saving
              ? (isAdvance ? 'Issuing…' : 'Saving…')
              : editingId
                ? 'Save Changes'
                : isAdvance
                  ? 'Issue Advance'
                  : isPayout
                    ? 'Pay Out'
                    : 'Add to Drawer'}
          </button>}
          </div>
        </div>
      </div>
    </div>
    {deleteTarget && (
      <ConfirmModal
        title="Delete drawer movement?"
        message={`${deleteTarget.type === 'payout' ? 'Paid out' : 'Added'} ${formatPKR(deleteTarget.amount)} will be removed from this shift's drawer calculation. No accounting entry will be changed.`}
        confirmLabel="Delete movement"
        onConfirm={removeMovement}
        onCancel={() => setDeleteTarget(null)}
      />
    )}
    {drawerPrintPreview && (
      <ThermalReportModal
        title="Print Cash Drawer Report?"
        reportHtml={drawerPrintPreview.reportHtml}
        onPrint={() => printDrawerReport(drawerPrintPreview)}
        onPrinted={() => {
          setDrawerPrintPreview(null);
          toast.success('Drawer report sent to counter printer');
        }}
        onClose={() => setDrawerPrintPreview(null)}
      />
    )}
    </>
  );
};

export default CashDrawerModal;
