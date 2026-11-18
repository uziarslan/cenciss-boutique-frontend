import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useDispatch } from 'react-redux';
import {
  DollarSign, TrendingDown, Utensils,
  RotateCcw, Copy, Ban, ChevronDown,
  User as UserIcon, Wallet, Banknote, CalendarDays, Clock, CheckCircle2, AlertTriangle, X,
  Search, SlidersHorizontal, Pencil, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  updateSalaryPayment, voidSalaryPayment,
  giveAdvance, updateAdvance, deleteAdvance, repayAdvance, getOutstandingAdvance, getOutstandingAllowanceExcess,
  getRevenueAccounts, voidAdvance, voidRepayment,
} from '../../api/salaryApi';
import {
  baseApi,
  useGetEmployeesQuery,
  useGetSalaryPaymentsQuery,
  useGetAdvancesQuery,
  listQueryOpts,
} from '../../store/baseApi';
import usePermissions from '../../hooks/usePermissions';
import useAuth from '../../hooks/useAuth';
import useDebounce from '../../hooks/useDebounce';
import AmountInput from '../../components/UI/AmountInput';
import SearchableSelect from '../../components/UI/SearchableSelect';
import PremiumModal, { ModalSection, inputCls, labelCls, PrimaryButton, SecondaryButton } from '../../components/UI/PremiumModal';
import HeroBanner from '../../components/UI/HeroBanner';
import StatTile from '../../components/UI/StatTile';
import Tabs from '../../components/UI/Tabs';
import Button from '../../components/UI/Button';
import FilterBar from '../../components/UI/FilterBar';
import DateRangePicker from '../../components/UI/DateRangePicker';
import Portal from '../../components/UI/Portal';
import { Users as UsersIcon, Wallet as WalletIcon, AlertTriangle as AlertTriIcon } from 'lucide-react';
import useQueryState from '../../hooks/useQueryState';
import { PayrollRecords, advanceIssueRange } from './PayrollRecords';
import { VoidReasonModal } from './VoidReasonModal';
// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v) =>
  `PKR ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Date inputs represent the user's calendar date. UTC serialization shows the
// previous day in Pakistan between midnight and 05:00, so use local components.
const localDateInputValue = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const formatRecordDate = (value) => {
  if (!value) return '—';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10))
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
};

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

// ── Give Advance Modal ────────────────────────────────────────────────────────

const AdvanceModal = ({ employees, onClose, onGiven }) => {
  const dispatch = useDispatch();
  const { role } = useAuth();
  const canOverrideCreditLimits = role === 'owner';
  const [mode, setMode] = useState('cash');   // 'cash' = Cash Advance | 'cts' = Charge to Salary
  const [empId, setEmpId] = useState('');
  const [amount, setAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(localDateInputValue);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [revenueAccount, setRevenueAccount] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [outstanding, setOutstanding] = useState(0);
  const [creditSummary, setCreditSummary] = useState(null);
  const [overrideRequested, setOverrideRequested] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const isCts = mode === 'cts';
  const selectedEmp = employees.find((e) => e._id === empId);

  // Revenue heads for CTS ("where to punch the sale") — salary-scoped endpoint so
  // a salary manager can pick a head without full Chart-of-Accounts access.
  const [revAccounts, setRevAccounts] = useState([]);
  useEffect(() => {
    getRevenueAccounts()
      .then((r) => setRevAccounts(r.data.data || []))
      .catch(() => setRevAccounts([]));
  }, []);
  const revenueOptions = useMemo(
    () => revAccounts.map((a) => ({ value: a._id, label: a.name, meta: a.code })),
    [revAccounts],
  );

  const selectedAccent = isCts ? 'indigo' : 'amber';

  useEffect(() => {
    setOverrideRequested(false);
    setOverrideReason('');
    if (!empId) { setOutstanding(0); setCreditSummary(null); return; }
    getOutstandingAdvance(empId)
      .then((r) => {
        setOutstanding(r.data.data.outstanding || 0);
        setCreditSummary(r.data.data.creditSummary || null);
      })
      .catch(() => {
        setOutstanding(0);
        setCreditSummary(null);
      });
  }, [empId]);

  useEffect(() => {
    setOverrideRequested(false);
    setOverrideReason('');
  }, [mode]);

  const requestedAmount = Number(amount) || 0;
  const typeEnabled = isCts
    ? creditSummary?.limits?.chargeToSalaryEnabled !== false
    : creditSummary?.limits?.cashAdvanceEnabled !== false;
  const regularAvailable = Number(creditSummary?.available || 0);
  const overrideAvailable = Number(creditSummary?.availableWithOverride || 0);
  const requiresOverride = Boolean(
    creditSummary && requestedAmount > regularAvailable + 0.001 && requestedAmount <= overrideAvailable + 0.001
  );
  const hardBlocked = Boolean(
    creditSummary && (!typeEnabled || requestedAmount > overrideAvailable + 0.001)
  );
  const validOverride = requiresOverride
    && canOverrideCreditLimits
    && overrideRequested
    && overrideReason.trim().length >= 5;

  const handleGive = async () => {
    if (!empId) return toast.error('Select an employee.');
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return toast.error(`Enter a valid ${isCts ? 'bill' : 'advance'} amount.`);
    if (isCts && !revenueAccount) return toast.error('Select the revenue account to punch the sale to.');
    if (!typeEnabled) return toast.error(`${isCts ? 'Charge to Salary' : 'Cash advances'} are disabled for this employee.`);
    if (hardBlocked) return toast.error(`This amount exceeds the employee’s non-overridable ${fmt(overrideAvailable)} available limit.`);
    if (requiresOverride && !canOverrideCreditLimits) return toast.error('This amount requires an owner override.');
    if (requiresOverride && !validOverride) return toast.error('Enable the override and enter a reason of at least 5 characters.');
    setSaving(true);
    try {
      await giveAdvance({
        employeeId: empId,
        type: mode,
        amount: parseFloat(amount),
        advanceDate,
        ...(isCts
          ? { revenueAccount }
          : { paymentMode, transactionRef: transactionRef || undefined }),
        ...(validOverride
          ? { creditLimitOverride: { requested: true, reason: overrideReason.trim() } }
          : {}),
        notes: notes || undefined,
      });
      dispatch(baseApi.util.invalidateTags(['Advance', 'SalaryPayment', 'Report', 'Accounting']));
      toast.success(isCts ? 'Charge to salary recorded and journal entry posted.' : 'Advance recorded and journal entry posted.');
      onGiven();
      onClose();
    } catch (err) {
      if (err?.response?.data?.creditSummary) setCreditSummary(err.response.data.creditSummary);
      toast.error(err?.response?.data?.message ?? 'Failed to record.');
    } finally {
      setSaving(false);
    }
  };

  const initials = (() => {
    const n = (selectedEmp?.name || '').trim();
    if (!n) return '$';
    const parts = n.split(/\s+/);
    return ((parts[0] || '').charAt(0) + (parts[1] || parts[0] || '').charAt(0)).toUpperCase();
  })();

  const employeeOptions = employees.map((e) => ({
    value: e._id,
    label: e.name,
    meta: e.designation || '',
  }));

  const heroStrip = selectedEmp && (
    <div className="flex items-center justify-between rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/20 px-4 py-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">{isCts ? 'Charge Amount' : 'Advance Amount'}</p>
        <p className="text-2xl font-extrabold tabular-nums mt-0.5">{fmt(parseFloat(amount) || 0)}</p>
      </div>
      <div className="text-right text-[11px] text-white/70 leading-tight">
        <p>Currently outstanding</p>
        <p className="font-semibold text-white">{fmt(outstanding)}</p>
      </div>
    </div>
  );

  return (
    <PremiumModal
      open
      onClose={saving ? undefined : onClose}
      icon={selectedEmp ? undefined : (isCts ? Utensils : TrendingDown)}
      iconNode={selectedEmp ? <span className="text-xl font-bold">{initials}</span> : undefined}
      eyebrow={isCts ? 'Charge to Salary' : 'Give Advance'}
      title={selectedEmp?.name || 'Select an employee'}
      subtitle={selectedEmp
        ? `${selectedEmp.designation || 'Staff'} • Recoverable from salary`
        : (isCts ? 'Charge a food/item bill to an employee’s salary' : 'Issue a salary advance to an employee')}
      accent={selectedAccent}
      size="md"
      hero={heroStrip}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={handleGive}
            disabled={saving || hardBlocked || (requiresOverride && !validOverride)}
            accent={selectedAccent}
          >
            {saving
              ? 'Processing…'
              : isCts
                ? `Charge ${amount ? fmt(parseFloat(amount) || 0) : 'to Salary'}`
                : `Give ${amount ? fmt(parseFloat(amount) || 0) : 'Advance'}`}
          </PrimaryButton>
        </>
      }
    >
          {/* Mode toggle: Cash Advance vs Charge to Salary */}
          <div className="mb-4 inline-flex w-full rounded-xl border border-slate-200 overflow-hidden">
            {[
              { k: 'cash', l: 'Cash Advance', Icon: TrendingDown },
              { k: 'cts', l: 'Charge to Salary', Icon: Utensils },
            ].map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setMode(o.k)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold transition ${
                  mode === o.k
                    ? (o.k === 'cts' ? 'bg-indigo-600 text-white' : 'bg-amber-500 text-white')
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <o.Icon size={14} /> {o.l}
              </button>
            ))}
          </div>

          {/* Employee */}
          <ModalSection icon={UserIcon} title="Employee" subtitle={isCts ? 'Who is being charged' : 'Who is receiving the advance'}>
            <div>
              <label className={labelCls}>Employee <span className="text-rose-500">*</span></label>
              <SearchableSelect
                options={employeeOptions}
                value={empId}
                onChange={setEmpId}
                placeholder="— Select employee —"
                searchPlaceholder="Search employees…"
              />
            </div>
            {outstanding > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800">
                  This employee already owes <strong>{fmt(outstanding)}</strong> (advances + charges), recoverable from salary.
                </p>
              </div>
            )}
            {creditSummary && (
              <div className="mt-3 overflow-hidden rounded-xl border border-indigo-100 bg-indigo-50/40">
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-indigo-100">
                  {[
                    ['Available Now', creditSummary.available],
                    ['Used Today', creditSummary.usage?.issuedToday],
                    ['Used 7 Days', creditSummary.usage?.issuedSevenDays],
                    ['Outstanding', creditSummary.usage?.outstanding],
                  ].map(([label, value]) => (
                    <div key={label} className="px-3 py-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-500">{label}</p>
                      <p className="mt-0.5 text-xs font-bold tabular-nums text-indigo-900">{fmt(value)}</p>
                    </div>
                  ))}
                </div>
                <p className="border-t border-indigo-100 px-3 py-2 text-[10px] text-indigo-700">
                  Limits: {creditSummary.limits?.dailyLimitPercent}% daily · {creditSummary.limits?.rollingSevenDayLimitPercent}% rolling 7 days · {creditSummary.limits?.maxOutstandingPercent}% maximum · salary cycle starts on day {creditSummary.salaryDay}
                </p>
              </div>
            )}
            {creditSummary && !typeEnabled && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5">
                <AlertTriangle size={14} className="shrink-0 text-rose-600" />
                <p className="text-xs font-medium text-rose-700">
                  {isCts ? 'Charge to Salary' : 'Cash advances'} are disabled for this employee.
                </p>
              </div>
            )}
          </ModalSection>

          {requiresOverride && (
            <ModalSection
              icon={AlertTriangle}
              title="Owner Override Required"
              subtitle={`The amount is above the normal ${fmt(regularAvailable)} available limit`}
              accent="amber"
            >
              {canOverrideCreditLimits ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setOverrideRequested((current) => !current)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition ${
                      overrideRequested
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-slate-200 bg-white'
                    }`}
                    aria-pressed={overrideRequested}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Use owner override</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Daily and seven-day limits only; the overall ceiling remains enforced.
                      </span>
                    </span>
                    <span className={`relative h-6 w-11 rounded-full transition ${overrideRequested ? 'bg-amber-500' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${overrideRequested ? 'left-[22px]' : 'left-0.5'}`} />
                    </span>
                  </button>
                  {overrideRequested && (
                    <div>
                      <label className={labelCls}>Override Reason <span className="text-rose-500">*</span></label>
                      <textarea
                        className={`${inputCls} resize-none`}
                        rows={2}
                        value={overrideReason}
                        onChange={(event) => setOverrideReason(event.target.value)}
                        placeholder="Explain why this exception is being approved…"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
                  Ask an owner to approve this exception from the management app.
                </p>
              )}
            </ModalSection>
          )}

          {hardBlocked && typeEnabled && requestedAmount > 0 && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-700">
              This amount is blocked by the non-overridable outstanding or salary-cycle ceiling. Maximum currently available: <strong>{fmt(overrideAvailable)}</strong>.
            </div>
          )}

          {/* Amount & date */}
          <ModalSection icon={Wallet} title={isCts ? 'Charge Details' : 'Advance Details'} subtitle="Amount and date" accent={selectedAccent}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{isCts ? 'Bill Amount (PKR)' : 'Amount (PKR)'} <span className="text-rose-500">*</span></label>
                <AmountInput className={inputCls} value={amount} onChange={setAmount} placeholder="5,000" />
              </div>
              <div>
                <label className={labelCls}>Date <span className="text-rose-500">*</span></label>
                <input type="date" className={inputCls} value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} />
              </div>
            </div>
          </ModalSection>

          {isCts ? (
            /* Sale posting — where the food/item revenue is booked */
            <ModalSection icon={Banknote} title="Sale Posting" subtitle="Where to punch the sale (revenue head)" accent="indigo">
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Revenue Account <span className="text-rose-500">*</span></label>
                  <SearchableSelect
                    options={revenueOptions}
                    value={revenueAccount}
                    onChange={setRevenueAccount}
                    placeholder="Select revenue head…"
                    searchPlaceholder="Search revenue accounts…"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">The bill is credited here as revenue and charged to the employee’s salary (recovered as a deduction).</p>
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Staff lunch" />
                </div>
              </div>
            </ModalSection>
          ) : (
            /* Payment details — how the cash advance is given */
            <ModalSection icon={Banknote} title="Payment Details" subtitle="How the advance is being given">
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Payment Mode <span className="text-rose-500">*</span></label>
                  <SearchableSelect
                    options={PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))}
                    value={paymentMode}
                    onChange={setPaymentMode}
                    placeholder="Select mode…"
                  />
                </div>
                {paymentMode !== 'cash' && (
                  <div>
                    <label className={labelCls}>Transaction Reference</label>
                    <input className={inputCls} value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="Cheque # / Transfer ID" />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Notes</label>
                  <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for advance" />
                </div>
              </div>
            </ModalSection>
          )}
    </PremiumModal>
  );
};

// ── Repay Advance Modal ───────────────────────────────────────────────────────

const RepayModal = ({ advance, onClose, onRepaid }) => {
  const dispatch = useDispatch();
  const outstanding = advance.amount - advance.recoveredAmount;
  const [amount, setAmount] = useState(String(outstanding));
  const [repaymentDate, setRepaymentDate] = useState(localDateInputValue);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [saving, setSaving] = useState(false);

  const handleRepay = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return toast.error('Enter a valid repayment amount.');
    if (amt > outstanding) return toast.error(`Amount cannot exceed outstanding balance of PKR ${outstanding.toLocaleString()}.`);
    setSaving(true);
    try {
      await repayAdvance(advance._id, {
        amount: amt,
        repaymentDate,
        paymentMode,
        transactionRef: transactionRef || undefined,
      });
      dispatch(baseApi.util.invalidateTags(['Advance', 'SalaryPayment', 'Report', 'Accounting']));
      toast.success('Repayment recorded and journal entry posted.');
      onRepaid();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Failed to record repayment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PremiumModal
      open
      onClose={onClose}
      eyebrow="Repay Advance"
      title={advance.employee?.name || 'Employee'}
      subtitle={`Outstanding ${fmt(outstanding)}`}
      icon={RotateCcw}
      accent="emerald"
      size="md"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton accent="emerald" onClick={handleRepay} disabled={saving}>
            {saving ? 'Recording…' : `Record ${fmt(parseFloat(amount) || 0)}`}
          </PrimaryButton>
        </>
      }
    >
      <ModalSection icon={DollarSign} title="Repayment Details" subtitle="Amount and date" accent="emerald">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Amount (PKR) <span className="text-rose-500">*</span></label>
            <AmountInput className={inputCls} value={amount} onChange={setAmount} />
          </div>
          <div>
            <label className={labelCls}>Date <span className="text-rose-500">*</span></label>
            <input type="date" className={inputCls} value={repaymentDate} onChange={(e) => setRepaymentDate(e.target.value)} />
          </div>
        </div>
      </ModalSection>

      <ModalSection icon={Banknote} title="Payment Method" subtitle="How the repayment is being made">
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Payment Mode <span className="text-rose-500">*</span></label>
            <SearchableSelect
              options={PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))}
              value={paymentMode}
              onChange={setPaymentMode}
            />
          </div>
          {paymentMode !== 'cash' && (
            <div>
              <label className={labelCls}>Transaction Reference</label>
              <input className={inputCls} value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="Cheque # / Transfer ID" />
            </div>
          )}
        </div>
      </ModalSection>
    </PremiumModal>
  );
};

// ── Status Badge ──────────────────────────────────────────────────────────────

const AdvanceStatusBadge = ({ status }) => {
  const map = {
    pending:             { label: 'Pending',          cls: 'bg-amber-100 text-amber-700' },
    partially_recovered: { label: 'Partly Recovered', cls: 'bg-blue-100  text-blue-700'  },
    recovered:           { label: 'Fully Recovered',  cls: 'bg-emerald-100 text-emerald-700' },
    voided:              { label: 'Voided',           cls: 'bg-rose-100 text-rose-700' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
};

// ── Advance / linked POS order details ───────────────────────────────────────

const titleCase = (value) => String(value || '—')
  .replace(/[-_]/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDate = (value, includeTime = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-PK', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' });
};

const DetailField = ({ label, value, className = '' }) => (
  <div className={`rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 ${className}`}>
    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p>
    <div className="mt-1 text-sm font-semibold text-slate-800 break-words">{value ?? '—'}</div>
  </div>
);

export const AdvanceDetailDrawer = ({ advance, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!advance) return null;
  const sale = advance.saleTransaction && typeof advance.saleTransaction === 'object'
    ? advance.saleTransaction
    : null;
  const isPunchedOrder = !!sale;
  const isCashAdvance = advance.type !== 'cts';
  const outstanding = Math.max(0, Number(advance.amount || 0) - Number(advance.recoveredAmount || 0));
  const repayments = advance.repayments || [];
  const activeRepayments = repayments.filter((repayment) => !repayment.voidedAt);
  const itemCount = (sale?.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const recordLabel = isPunchedOrder
    ? 'Punched POS Order'
    : (isCashAdvance ? 'Cash Advance' : 'Manual Charge to Salary');

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label={`${recordLabel} details`}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
        <aside className="safe-area-drawer relative z-[70] flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-slide-in-right">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div className="min-w-0">
              <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${
                isPunchedOrder ? 'text-indigo-500' : (isCashAdvance ? 'text-amber-600' : 'text-slate-500')
              }`}>
                {isPunchedOrder ? <Utensils size={12} /> : <Wallet size={12} />}
                {recordLabel}
              </div>
              <h2 className="mt-0.5 truncate text-base font-bold text-gray-900">
                {isPunchedOrder
                  ? `Order ${sale.transactionNumber || advance.transactionRef || ''}`
                  : `${recordLabel} Details`}
              </h2>
              <p className="mt-0.5 truncate text-xs text-gray-400">
                {advance.employee?.name || 'Employee'}
                {advance.employee?.designation ? ` • ${advance.employee.designation}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close details"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-px border-b border-gray-100 bg-gray-100">
          {[
            ['Amount', fmt(advance.amount)],
            ['Recovered', fmt(advance.recoveredAmount)],
            ['Outstanding', fmt(outstanding)],
          ].map(([label, value]) => (
            <div key={label} className="bg-slate-50 px-3 py-3 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-800">{value}</p>
            </div>
          ))}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 px-5 py-4">
          {isPunchedOrder ? (
        <>
          <ModalSection
            icon={Utensils}
            title="Punched Order"
            subtitle={`${itemCount} item${itemCount === 1 ? '' : 's'} charged to salary`}
            accent="indigo"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <DetailField label="Order Number" value={sale.transactionNumber || advance.transactionRef || '—'} />
              <DetailField label="Date & Time" value={formatDate(sale.createdAt || advance.advanceDate, true)} />
              <DetailField label="Cashier" value={sale.cashier?.name || sale.cashier?.email || '—'} />
              <DetailField
                label="Order Type"
                value={`${titleCase(sale.orderType)}${sale.tableNumber ? ` • Table ${sale.tableNumber}` : ''}`}
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Order Items</span>
                <span>Line Total</span>
              </div>
              <div className="divide-y divide-slate-100">
                {(sale.items || []).map((item, index) => (
                  <div key={`${item.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {item.name || 'Item'}
                        {item.variation?.name ? ` (${item.variation.name})` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {Number(item.qty || 0)} × {fmt(item.unitPrice)}
                      </p>
                    </div>
                    <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-800">
                      {fmt(item.lineTotal ?? (Number(item.qty || 0) * Number(item.unitPrice || 0)))}
                    </p>
                  </div>
                ))}
                {(sale.items || []).length === 0 && (
                  <p className="px-3 py-4 text-center text-xs italic text-slate-400">No line items available.</p>
                )}
              </div>
            </div>

            <div className="mt-4 ml-auto max-w-sm space-y-1.5 rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{fmt(sale.subtotal)}</span></div>
              {Number(sale.taxAmount || 0) > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Tax{Number(sale.effectiveTaxRate || 0) > 0 ? ` (${Number(sale.effectiveTaxRate).toLocaleString()}%)` : ''}</span>
                  <span>{fmt(sale.taxAmount)}</span>
                </div>
              )}
              {Number(sale.serviceChargeAmount || 0) > 0 && (
                <div className="flex justify-between text-slate-500"><span>Service Charge</span><span>{fmt(sale.serviceChargeAmount)}</span></div>
              )}
              {Number(sale.deliveryChargeAmount || 0) > 0 && (
                <div className="flex justify-between text-slate-500"><span>Delivery Charge</span><span>{fmt(sale.deliveryChargeAmount)}</span></div>
              )}
              {Number(sale.discountAmount || 0) > 0 && (
                <div className="flex justify-between text-rose-600"><span>Discount</span><span>− {fmt(sale.discountAmount)}</span></div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-900">
                <span>Total Charged</span><span>{fmt(sale.totalAmount ?? advance.amount)}</span>
              </div>
            </div>

            {sale.notes && (
              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Order note: </span>{sale.notes}
              </div>
            )}
          </ModalSection>
        </>
      ) : (
        <ModalSection
          icon={Banknote}
          title={isCashAdvance ? 'Cash Advance' : 'Manual Charge to Salary'}
          subtitle={isCashAdvance ? 'Money issued directly to the employee' : 'Charge entered directly from payroll'}
          accent={isCashAdvance ? 'amber' : 'slate'}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <DetailField label="Employee" value={advance.employee?.name || '—'} />
            <DetailField label="Issue Date" value={formatDate(advance.advanceDate)} />
            <DetailField
              label={isCashAdvance ? 'Payment Mode' : 'Revenue Account'}
              value={isCashAdvance
                ? titleCase(advance.paymentMode)
                : (advance.revenueAccount
                  ? `${advance.revenueAccount.code || ''} ${advance.revenueAccount.name || ''}`.trim()
                  : '—')}
            />
            <DetailField label="Issued By" value={advance.createdBy?.name || '—'} />
            <DetailField label="Transaction Reference" value={advance.transactionRef || '—'} className="col-span-2" />
            <DetailField label="Notes" value={advance.notes || '—'} className="col-span-2" />
          </div>
        </ModalSection>
      )}

      <ModalSection
        icon={RotateCcw}
        title="Recovery"
        subtitle="What has been recovered and what remains"
        accent="emerald"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <DetailField label="Original Amount" value={fmt(advance.amount)} />
          <DetailField label="Recovered" value={fmt(advance.recoveredAmount)} />
          <DetailField label="Outstanding" value={fmt(outstanding)} />
          <DetailField label="Status" value={<AdvanceStatusBadge status={advance.status} />} />
        </div>

        {activeRepayments.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Direct Repayments
            </div>
            <div className="divide-y divide-slate-100">
              {activeRepayments.map((repayment) => (
                <div key={repayment._id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-xs">
                  <div>
                    <p className="font-semibold text-slate-700">
                      {formatDate(repayment.repaymentDate)} • {titleCase(repayment.paymentMode)}
                    </p>
                    {(repayment.transactionRef || repayment.notes) && (
                      <p className="mt-0.5 text-slate-400">
                        {[repayment.transactionRef, repayment.notes].filter(Boolean).join(' • ')}
                      </p>
                    )}
                  </div>
                  <span className="font-semibold tabular-nums text-emerald-700">{fmt(repayment.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {Number(advance.recoveredAmount || 0) > 0 && activeRepayments.length === 0 && (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
            Recovery was applied through salary deduction.
          </p>
        )}

        {advance.voidedAt && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
            <p className="font-semibold">Voided {formatDate(advance.voidedAt, true)}</p>
            {advance.voidReason && <p className="mt-0.5">Reason: {advance.voidReason}</p>}
          </div>
        )}
      </ModalSection>

      {advance.creditPolicySnapshot && (
        <ModalSection
          icon={AlertTriangle}
          title="Credit Policy"
          subtitle="Limits and usage captured when this credit was issued"
          accent={advance.creditPolicySnapshot.overrideUsed ? 'amber' : 'indigo'}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <DetailField
              label="Configured Limits"
              value={`${advance.creditPolicySnapshot.dailyLimitPercent}% daily · ${advance.creditPolicySnapshot.rollingSevenDayLimitPercent}% / 7 days · ${advance.creditPolicySnapshot.maxOutstandingPercent}% max`}
              className="col-span-2"
            />
            <DetailField label="Used That Day" value={fmt(advance.creditPolicySnapshot.issuedTodayBefore)} />
            <DetailField label="Used In 7 Days" value={fmt(advance.creditPolicySnapshot.issuedSevenDaysBefore)} />
            <DetailField label="Outstanding Before" value={fmt(advance.creditPolicySnapshot.outstandingBefore)} />
            <DetailField label="Available Before" value={fmt(advance.creditPolicySnapshot.availableBefore)} />
          </div>
          {advance.creditPolicySnapshot.overrideUsed && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <p className="font-semibold">
                Owner override by {advance.creditPolicySnapshot.overriddenBy?.name || 'owner'}
              </p>
              <p className="mt-0.5">Reason: {advance.creditPolicySnapshot.overrideReason || '—'}</p>
            </div>
          )}
        </ModalSection>
      )}
          </div>
        </aside>
      </div>
    </Portal>
  );
};

const EditSalaryRecordModal = ({ target, employees, onClose, onSaved }) => {
  const isPayment = target.kind === 'payment';
  const record = target.record;
  const [employeeId, setEmployeeId] = useState(record.employee?._id || record.employee || '');
  const [amount, setAmount] = useState(String(isPayment ? record.grossAmount : record.amount));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const employeeLocked = isPayment
    ? Number(record.advanceDeducted || 0) > 0
      || Number(record.allowanceExcessDeducted || 0) > 0
      || (record.recoveryDetails?.length || 0) > 0
      || (record.allowanceRecoveryDetails?.length || 0) > 0
    : Number(record.recoveredAmount || 0) > 0;
  const deductions = isPayment
    ? Number(record.advanceDeducted || 0)
      + Number(record.allowanceExcessDeducted || 0)
      + Number(record.penaltyDeducted || 0)
    : 0;
  const nextNet = Math.max(0, Number(amount || 0) - deductions);
  const employeeOptions = employees.map((employee) => ({
    value: employee._id,
    label: employee.name,
    meta: [employee.designation, employee.isActive === false ? 'Inactive' : ''].filter(Boolean).join(' · '),
  }));

  const handleSave = async () => {
    const numericAmount = Number(amount);
    if (!employeeId) return toast.error('Select an employee.');
    if (!Number.isFinite(numericAmount) || numericAmount < 1) return toast.error('Enter a valid amount.');
    if (isPayment && numericAmount < deductions) return toast.error(`Amount cannot be below existing deductions of ${fmt(deductions)}.`);
    if (reason.trim().length < 5) return toast.error('Enter a correction reason of at least 5 characters.');
    setSaving(true);
    try {
      if (isPayment) {
        await updateSalaryPayment(record._id, { employeeId, grossAmount: numericAmount, reason: reason.trim() });
      } else {
        await updateAdvance(record._id, { employeeId, amount: numericAmount, reason: reason.trim() });
      }
      toast.success(`${isPayment ? 'Salary payment' : 'Advance'} updated without creating a reversal entry.`);
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error?.response?.data?.message || `Failed to edit ${isPayment ? 'salary payment' : 'advance'}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PremiumModal
      open
      onClose={saving ? undefined : onClose}
      icon={Pencil}
      eyebrow="Owner Correction"
      title={isPayment ? 'Edit Salary Payment' : 'Edit Advance / CTS'}
      subtitle="Updates the existing record and journal entry in place"
      accent="indigo"
      size="md"
      footer={(
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Updating…' : 'Update record'}
          </PrimaryButton>
        </>
      )}
    >
      <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-3 text-xs text-indigo-800">
        No reversal journal will be created. The original journal number and entry are retained, with balanced lines updated to the corrected person and amount.
      </div>
      <ModalSection icon={UserIcon} title="Correction" subtitle="Owner-only fields">
        <div className="space-y-3">
          <label className="block">
            <span className={labelCls}>Employee</span>
            <SearchableSelect options={employeeOptions} value={employeeId} onChange={setEmployeeId} disabled={employeeLocked} searchPlaceholder="Search employees…" />
            {employeeLocked && <span className="mt-1 block text-[11px] text-amber-700">Employee is locked because recovery allocations already exist.</span>}
          </label>
          <label className="block">
            <span className={labelCls}>{isPayment ? 'Gross Salary Amount (PKR)' : 'Advance / CTS Amount (PKR)'}</span>
            <AmountInput className={inputCls} value={amount} onChange={setAmount} />
            {!isPayment && record.saleTransaction && (
              <span className="mt-1 block text-[11px] text-indigo-700">This will also update the linked POS CTS total and its existing journal entry.</span>
            )}
          </label>
          {isPayment && (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Existing deductions: <strong>{fmt(deductions)}</strong> · Corrected net payment: <strong>{fmt(nextNet)}</strong>
            </div>
          )}
          <label className="block">
            <span className={labelCls}>Correction Reason <span className="text-rose-500">*</span></span>
            <textarea rows={3} className={`${inputCls} resize-none`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why the person or amount is being corrected…" />
          </label>
        </div>
      </ModalSection>
    </PremiumModal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════

const SalaryManager = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const openSalaryPage = (path) => navigate(path, { state: { salaryReturnTo: location.pathname + location.search } });
  const dispatch = useDispatch();
  const [tab, setTab] = useQueryState('tab', 'payments');

  // ── State ──────────────────────────────────────────────────────────────────
  const { has } = usePermissions();
  const { role } = useAuth();
  const canManage = has('salaries.manage');
  const isOwner = role === 'owner';

  // Modals
  const [advModal, setAdvModal] = useState(false);
  const [repayModal, setRepayModal] = useState(null); // null | advance object
  const [detailAdvance, setDetailAdvance] = useState(null); // null | advance object
  const [editTarget, setEditTarget] = useState(null); // { kind: 'payment'|'advance', record }
  // Destructive action target: void payment/advance/repayment or owner hard-delete advance.
  const [voidTarget, setVoidTarget] = useState(null);

  // Filters
  const [paySearch, setPaySearch] = useQueryState('paySearch', '');
  const [payPeriod, setPayPeriod] = useQueryState('payPeriod', '');
  const [payEmployeeId, setPayEmployeeId] = useQueryState('payEmployee', '');
  const [payMode, setPayMode] = useQueryState('payMode', '');
  const [payStatus, setPayStatus] = useQueryState('payStatus', '');
  const [payDateFrom, setPayDateFrom] = useQueryState('payFrom', '');
  const [payDateTo, setPayDateTo] = useQueryState('payTo', '');
  const [payMinAmount, setPayMinAmount] = useQueryState('payMinAmount', '');
  const [payMaxAmount, setPayMaxAmount] = useQueryState('payMaxAmount', '');
  const [paySort, setPaySort] = useQueryState('paySort', 'newest');
  const [showPayAdvanced, setShowPayAdvanced] = useState(false);

  const [advPeriod, setAdvPeriod] = useQueryState('advancePeriod', '');
  const [advSearch, setAdvSearch] = useQueryState('advanceSearch', '');
  const [advStatus, setAdvStatus] = useQueryState('advanceStatus', '');
  const [advEmployeeId, setAdvEmployeeId] = useQueryState('advanceEmployee', '');
  const [advType, setAdvType] = useQueryState('advanceType', '');
  const [advPaymentMode, setAdvPaymentMode] = useQueryState('advancePaymentMode', '');
  const [advOverrideUsed, setAdvOverrideUsed] = useQueryState('advanceOverride', '');
  const [advDateFrom, setAdvDateFrom] = useQueryState('advanceFrom', '');
  const [advDateTo, setAdvDateTo] = useQueryState('advanceTo', '');
  const [advMinAmount, setAdvMinAmount] = useQueryState('advanceMinAmount', '');
  const [advMaxAmount, setAdvMaxAmount] = useQueryState('advanceMaxAmount', '');
  const [advSort, setAdvSort] = useQueryState('advanceSort', 'newest');
  const [showAdvAdvanced, setShowAdvAdvanced] = useState(false);
  const debouncedPaySearch = useDebounce(paySearch, 350);
  const debouncedAdvSearch = useDebounce(advSearch, 350);

  // ── Data loaders ───────────────────────────────────────────────────────────
  const employeeParams = useMemo(() => ({}), []);
  const { data: employeesPayload } = useGetEmployeesQuery(employeeParams, listQueryOpts);
  const employees = useMemo(() => (Array.isArray(employeesPayload) ? employeesPayload : []), [employeesPayload]);

  const paymentParams = useMemo(() => ({
    ...(debouncedPaySearch.trim() ? { search: debouncedPaySearch.trim() } : {}),
    ...(payPeriod ? { period: payPeriod } : {}),
    ...(payEmployeeId ? { employeeId: payEmployeeId } : {}),
    ...(payMode ? { paymentMode: payMode } : {}),
    ...(payStatus ? { status: payStatus } : {}),
    ...(payDateFrom ? { dateFrom: payDateFrom } : {}),
    ...(payDateTo ? { dateTo: payDateTo } : {}),
    ...(payMinAmount !== '' ? { minAmount: payMinAmount } : {}),
    ...(payMaxAmount !== '' ? { maxAmount: payMaxAmount } : {}),
    ...(paySort !== 'newest' ? { sort: paySort } : {}),
  }), [debouncedPaySearch, payPeriod, payEmployeeId, payMode, payStatus, payDateFrom, payDateTo, payMinAmount, payMaxAmount, paySort]);
  const { data: paymentsPayload, isLoading: paymentsLoading } = useGetSalaryPaymentsQuery(paymentParams, listQueryOpts);
  const payments = useMemo(() => (Array.isArray(paymentsPayload) ? paymentsPayload : []), [paymentsPayload]);

  const advanceParams = useMemo(() => ({
    ...(debouncedAdvSearch.trim() ? { search: debouncedAdvSearch.trim() } : {}),
    ...(advStatus ? { status: advStatus } : {}),
    ...(advEmployeeId ? { employeeId: advEmployeeId } : {}),
    ...(advType ? { type: advType } : {}),
    ...(advPaymentMode ? { paymentMode: advPaymentMode } : {}),
    ...(advOverrideUsed ? { overrideUsed: advOverrideUsed } : {}),
    ...advanceIssueRange(advPeriod, advDateFrom, advDateTo),
    ...(advMinAmount !== '' ? { minAmount: advMinAmount } : {}),
    ...(advMaxAmount !== '' ? { maxAmount: advMaxAmount } : {}),
    ...(advSort !== 'newest' ? { sort: advSort } : {}),
  }), [advPeriod, debouncedAdvSearch, advStatus, advEmployeeId, advType, advPaymentMode, advOverrideUsed, advDateFrom, advDateTo, advMinAmount, advMaxAmount, advSort]);
  const { data: advancesPayload, isLoading: advancesLoading } = useGetAdvancesQuery(advanceParams, listQueryOpts);
  const advances = useMemo(() => (Array.isArray(advancesPayload) ? advancesPayload : []), [advancesPayload]);

  const loading = tab === 'payments' ? paymentsLoading : advancesLoading;

  // KPI numbers — voided records are excluded so the dashboard reflects
  // genuine cash impact, matching the GL.
  const fmtPKR = (n) => `Rs. ${Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
  const totalNetPaid    = payments.filter((p) => !p.voidedAt).reduce((s, p) => s + (p.netAmount || 0), 0);
  const outstandingTotal = advances
    .filter((a) => a.status !== 'voided' && !a.voidedAt)
    .reduce((s, a) => s + Math.max(0, (a.amount || 0) - (a.recoveredAmount || 0)), 0);
  const advancePending  = advances
    .filter((a) => a.status !== 'voided' && !a.voidedAt && (a.amount || 0) > (a.recoveredAmount || 0))
    .length;
  const employeeCount   = employees.filter((e) => e.isActive !== false).length;
  const employeeFilterOptions = useMemo(
    () => [{ value: '', label: 'All employees' }, ...employees.map((employee) => ({
      value: employee._id,
      label: employee.name,
      meta: [employee.designation, employee.isActive === false ? 'Inactive' : ''].filter(Boolean).join(' · '),
    }))],
    [employees]
  );
  const payAdvancedFilterCount = [
    payPeriod, payEmployeeId, payMode, payStatus, payDateFrom || payDateTo,
    payMinAmount || payMaxAmount, paySort !== 'newest',
  ].filter(Boolean).length;
  const advAdvancedFilterCount = [
    advPeriod, advStatus, advEmployeeId, advType, advPaymentMode, advOverrideUsed,
    advDateFrom || advDateTo, advMinAmount || advMaxAmount, advSort !== 'newest',
  ].filter(Boolean).length;
  const clearPaymentFilters = () => {
    setPaySearch(''); setPayPeriod(''); setPayEmployeeId(''); setPayMode(''); setPayStatus('');
    setPayDateFrom(''); setPayDateTo(''); setPayMinAmount(''); setPayMaxAmount(''); setPaySort('newest');
  };
  const clearAdvanceFilters = () => {
    setAdvPeriod(''); setAdvSearch(''); setAdvStatus(''); setAdvEmployeeId(''); setAdvType(''); setAdvPaymentMode('');
    setAdvOverrideUsed(''); setAdvDateFrom(''); setAdvDateTo(''); setAdvMinAmount(''); setAdvMaxAmount(''); setAdvSort('newest');
  };

  // ── Void handlers ─────────────────────────────────────────────────────────
  const handleVoidConfirm = useCallback(async (reason, expectedMode) => {
    if (!voidTarget) return;
    if (voidTarget.kind === 'payment') {
      await voidSalaryPayment(voidTarget.id, reason);
      dispatch(baseApi.util.invalidateTags(['SalaryPayment', 'Advance', 'Report', 'Accounting']));
      toast.success('Salary payment voided.');
    } else if (voidTarget.kind === 'advance') {
      await voidAdvance(voidTarget.id, reason);
      dispatch(baseApi.util.invalidateTags(['Advance', 'SalaryPayment', 'Report', 'Accounting']));
      toast.success('Advance voided.');
    } else if (voidTarget.kind === 'repayment') {
      await voidRepayment(voidTarget.advanceId, voidTarget.id, reason);
      dispatch(baseApi.util.invalidateTags(['Advance', 'SalaryPayment', 'Report', 'Accounting']));
      toast.success('Repayment voided.');
    } else if (voidTarget.kind === 'delete-advance') {
      const { data } = await deleteAdvance(voidTarget.id, reason, expectedMode);
      setDetailAdvance(null);
      dispatch(baseApi.util.invalidateTags(['Advance', 'SalaryPayment', 'Report', 'Accounting', 'JournalEntry', 'Session']));
      toast.success(data.message || 'Advance deleted.');
    }
  }, [voidTarget, dispatch]);

  const renderPaymentsActions = (p) => {
    const isVoid = !!p.voidedAt;
    return !isVoid && (                              <div className="inline-flex flex-wrap items-center gap-1.5">
                                {isOwner && (
                                  <button
                                    onClick={() => openSalaryPage(`/salaries/${p._id}/edit`)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                                    title="Edit this posted salary payment without a journal reversal"
                                  >
                                    <Pencil size={12} /> Edit
                                  </button>
                                )}
                                {canManage && (
                                  <button
                                onClick={() => setVoidTarget({
                                  kind: 'payment',
                                  id: p._id,
                                  title: `Void salary — ${p.employee?.name || ''}`,
                                  subtitle: `${p.period} · ${fmt(p.netAmount)} net paid`,
                                  consequences: [
                                    'Both journal entries (accrual + settlement) will be reversed in the GL.',
                                    p.advanceDeducted > 0
                                      ? `Recovered advance of ${fmt(p.advanceDeducted)} will be restored as outstanding.`
                                      : 'No advance recovery to restore.',
                                    'Period will become re-payable for this employee.',
                                  ],
                                })}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-100 transition"
                                title="Void this payment"
                              >
                                <Ban size={12} /> Void
                                  </button>
                                )}
                              </div>);
  };
  const renderAdvancesActions = (a) => {
    const isVoid = a.status === 'voided' || !!a.voidedAt;
    const hasRepayments = (a.repayments || []).length > 0;
    const canVoidAdvance = canManage && !isVoid && a.recoveredAmount === 0;
    const canDeleteAdvance = isOwner && !isVoid && Number(a.recoveredAmount || 0) === 0 && !hasRepayments;
    return (                              <div className="inline-flex flex-wrap items-center gap-1.5">
                                {isOwner && !isVoid && (
                                  <button
                                    onClick={() => setEditTarget({ kind: 'advance', record: a })}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                                    title="Edit person or amount without a journal reversal"
                                  >
                                    <Pencil size={12} /> Edit
                                  </button>
                                )}
                                {canManage && !isVoid && a.status !== 'recovered' && (
                                  <button
                                    onClick={() => setRepayModal(a)}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-100 transition"
                                    title="Record repayment from employee"
                                  >
                                    <RotateCcw size={12} /> Repay
                                  </button>
                                )}
                                {canVoidAdvance && (
                                  <button
                                    onClick={() => setVoidTarget({
                                      kind: 'advance',
                                      id: a._id,
                                      title: `Void advance — ${a.employee?.name || ''}`,
                                      subtitle: `${fmt(a.amount)} given on ${a.advanceDate ? new Date(a.advanceDate).toLocaleDateString('en-PK') : '—'}`,
                                      consequences: [
                                        'The give-advance journal entry will be reversed in the GL.',
                                        'The advance record stays for audit but is marked as Voided.',
                                      ],
                                    })}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-100 transition"
                                    title="Void this advance (only allowed before any recovery)"
                                  >
                                    <Ban size={12} /> Void
                                  </button>
                                )}
                                {canDeleteAdvance && (
                                  <button
                                    onClick={() => setVoidTarget({
                                      kind: 'delete-advance',
                                      id: a._id,
                                      title: `Delete advance — ${a.employee?.name || ''}`,
                                      subtitle: `${fmt(a.amount)} given on ${a.advanceDate ? new Date(a.advanceDate).toLocaleDateString('en-PK') : '—'}`,
                                    })}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800 bg-white hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition"
                                    title="Review removal of this advance and its accounting effects"
                                  >
                                    <Trash2 size={12} /> Delete
                                  </button>
                                )}
                              </div>);
  };
  const renderRepayments = (a) => {
    const liveRepayments = (a.repayments || []).filter((r) => !r.voidedAt);
    return (                                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                  <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                                    Direct Repayments ({liveRepayments.length} active)
                                  </div>
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-white border-b border-slate-100 text-slate-500">
                                      <tr>
                                        <th className="px-4 py-2 text-left font-bold uppercase tracking-wider">Date</th>
                                        <th className="px-4 py-2 text-right font-bold uppercase tracking-wider">Amount</th>
                                        <th className="px-4 py-2 text-left font-bold uppercase tracking-wider">Mode</th>
                                        <th className="px-4 py-2 text-left font-bold uppercase tracking-wider">Ref</th>
                                        <th className="px-4 py-2 text-left font-bold uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-2 text-center font-bold uppercase tracking-wider">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {(a.repayments || []).map((r) => {
                                        const rVoid = !!r.voidedAt;
                                        return (
                                          <tr key={r._id} className={rVoid ? 'text-slate-400' : ''}>
                                            <td className={`px-4 py-2 ${rVoid ? 'line-through' : ''}`}>{r.repaymentDate ? new Date(r.repaymentDate).toLocaleDateString('en-PK') : '—'}</td>
                                            <td className={`px-4 py-2 text-right tabular-nums font-semibold ${rVoid ? 'line-through' : 'text-emerald-700'}`}>{fmt(r.amount)}</td>
                                            <td className="px-4 py-2 capitalize">{r.paymentMode?.replace('_', ' ')}</td>
                                            <td className="px-4 py-2 font-mono text-[10px] text-slate-400">{r.transactionRef || '—'}</td>
                                            <td className="px-4 py-2">
                                              {rVoid ? (
                                                <span
                                                  title={r.voidReason ? `Reason: ${r.voidReason}` : ''}
                                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700"
                                                >
                                                  <Ban size={9} /> Voided
                                                </span>
                                              ) : (
                                                <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">Active</span>
                                              )}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              {canManage && !rVoid && (
                                                <button
                                                  onClick={() => setVoidTarget({
                                                    kind: 'repayment',
                                                    id: r._id,
                                                    advanceId: a._id,
                                                    title: `Void repayment — ${a.employee?.name || ''}`,
                                                    subtitle: `${fmt(r.amount)} on ${r.repaymentDate ? new Date(r.repaymentDate).toLocaleDateString('en-PK') : '—'}`,
                                                    consequences: [
                                                      'The repayment journal entry will be reversed in the GL.',
                                                      `Advance recovered amount will go back from ${fmt(a.recoveredAmount)} to ${fmt(a.recoveredAmount - r.amount)}.`,
                                                      'The repayment row stays for audit but is marked Voided.',
                                                    ],
                                                  })}
                                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 hover:text-rose-900 transition"
                                                  title="Void this repayment"
                                                >
                                                  <Ban size={10} /> Void
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={DollarSign}
        eyebrow="Payroll"
        title="Salaries & Advances"
        subtitle="Run monthly payroll, give advances, and track repayment cycles for your team."
        accent="indigo"
        compact
        actions={
          <>
            {tab === 'payments' && canManage && (
              <Button variant="primary" icon={DollarSign} onClick={() => openSalaryPage('/salaries/pay')}>
                Pay Salary
              </Button>
            )}
            {tab === 'advances' && canManage && (
              <Button variant="primary" icon={TrendingDown} onClick={() => setAdvModal(true)}>
                Give Advance
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Active Staff"          value={employeeCount}          icon={UsersIcon}    gradient="indigo" />
        <StatTile label="Net Paid (visible)"    value={fmtPKR(totalNetPaid)}   icon={WalletIcon}   gradient="emerald" />
        <StatTile label="Outstanding (filtered)"  value={fmtPKR(outstandingTotal)} icon={AlertTriIcon} gradient="amber" />
        <StatTile label="Pending (filtered)"      value={advancePending}         icon={TrendingDown} gradient="rose" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'payments', label: 'Salary Payments', icon: DollarSign },
          { value: 'advances', label: 'Advances',   icon: TrendingDown },
        ]}
      />

      {/* ── Payments Tab ───────────────────────────────────────────────────── */}
      {tab === 'payments' && (
        <div className="space-y-5">
          <FilterBar autoAdvanced={false}>
            <div className="flex w-full flex-wrap items-center gap-2">
              <label className="relative min-w-[240px] flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={paySearch}
                  onChange={(event) => setPaySearch(event.target.value)}
                  placeholder="Search employee, period, reference, or notes…"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowPayAdvanced((value) => !value)}
                aria-expanded={showPayAdvanced}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
              >
                <SlidersHorizontal size={15} /> Advanced Filters
                {payAdvancedFilterCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-bold text-indigo-700">{payAdvancedFilterCount}</span>
                )}
                <ChevronDown size={14} className={`transition-transform ${showPayAdvanced ? 'rotate-180' : ''}`} />
              </button>
              {(paySearch || payAdvancedFilterCount > 0) && (
                <button type="button" onClick={clearPaymentFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                  <X size={14} /> Clear all
                </button>
              )}
              <span className="text-xs text-slate-400">{payments.length} matching payment{payments.length === 1 ? '' : 's'}</span>
            </div>

            {showPayAdvanced && (
              <div className="w-full space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Salary period</span>
                    <input
                      type="month"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-indigo-400"
                      value={payPeriod}
                      onChange={(e) => setPayPeriod(e.target.value)}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Employee</span>
                    <SearchableSelect options={employeeFilterOptions} value={payEmployeeId} onChange={setPayEmployeeId} searchPlaceholder="Search employees…" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment mode</span>
                    <SearchableSelect options={[
                      { value: '', label: 'All payment modes' }, { value: 'cash', label: 'Cash' },
                      { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'cheque', label: 'Cheque' },
                    ]} value={payMode} onChange={setPayMode} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</span>
                    <SearchableSelect options={[
                      { value: '', label: 'All statuses' }, { value: 'paid', label: 'Paid' }, { value: 'voided', label: 'Voided' },
                    ]} value={payStatus} onChange={setPayStatus} />
                  </label>
                </div>

                <div className="space-y-4 rounded-xl bg-slate-50 p-4">
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment date</p>
                  <DateRangePicker from={payDateFrom} to={payDateTo} onChange={(from, to) => { setPayDateFrom(from); setPayDateTo(to); }} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Minimum net paid</span>
                    <input type="number" min="0" step="0.01" value={payMinAmount} onChange={(event) => setPayMinAmount(event.target.value)} placeholder="Rs. 0.00" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Maximum net paid</span>
                    <input type="number" min="0" step="0.01" value={payMaxAmount} onChange={(event) => setPayMaxAmount(event.target.value)} placeholder="No maximum" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sort by</span>
                    <SearchableSelect options={[
                      { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' },
                      { value: 'amountHigh', label: 'Highest net paid' }, { value: 'amountLow', label: 'Lowest net paid' },
                    ]} value={paySort} onChange={setPaySort} />
                  </label>
                </div>
                </div>
              </div>
            )}
          </FilterBar>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Salary Payments</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {loading ? 'Loading…' : `${payments.length} payment${payments.length === 1 ? '' : 's'} · ${fmtPKR(totalNetPaid)} net paid`}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
            ) : payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <DollarSign size={36} strokeWidth={1.5} className="text-gray-300" />
                <p className="text-sm font-medium text-slate-500">No salary payments found.</p>
                <p className="text-xs text-gray-400 -mt-2">
                  {payPeriod ? `Try clearing the period filter to see all payments.` : `Click "Pay Salary" to process a payroll run.`}
                </p>
              </div>
            ) : (
              <PayrollRecords kind="payments" records={payments} renderActions={renderPaymentsActions} onEmployeeAdvances={(employeeId) => { clearAdvanceFilters(); setAdvEmployeeId(employeeId); setTab('advances'); }} />
            )}
          </div>
        </div>
      )}

      {/* ── Advances Tab ───────────────────────────────────────────────────── */}
      {tab === 'advances' && (
        <div className="space-y-5">
          <FilterBar autoAdvanced={false}>
            <div className="flex w-full flex-wrap items-center gap-2">
              <label className="relative min-w-[240px] flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={advSearch}
                  onChange={(event) => setAdvSearch(event.target.value)}
                  placeholder="Search employee, reference, override reason, or notes…"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowAdvAdvanced((value) => !value)}
                aria-expanded={showAdvAdvanced}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
              >
                <SlidersHorizontal size={15} /> Advanced Filters
                {advAdvancedFilterCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-bold text-indigo-700">{advAdvancedFilterCount}</span>
                )}
                <ChevronDown size={14} className={`transition-transform ${showAdvAdvanced ? 'rotate-180' : ''}`} />
              </button>
              {(advSearch || advAdvancedFilterCount > 0) && (
                <button type="button" onClick={clearAdvanceFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                  <X size={14} /> Clear all
                </button>
              )}
              <span className="text-xs text-slate-400">{advances.length} matching advance{advances.length === 1 ? '' : 's'}</span>
            </div>

            {showAdvAdvanced && (
              <div className="w-full space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Period · issue month</span>
                    <input type="month" aria-label="Advance period" value={advPeriod} onChange={(event) => { setAdvPeriod(event.target.value); setAdvDateFrom(''); setAdvDateTo(''); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Employee</span>
                    <SearchableSelect options={employeeFilterOptions} value={advEmployeeId} onChange={setAdvEmployeeId} searchPlaceholder="Search employees…" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</span>
                    <SearchableSelect options={[
                      { value: '', label: 'All statuses' }, { value: 'pending', label: 'Pending' },
                      { value: 'partially_recovered', label: 'Partially recovered' }, { value: 'recovered', label: 'Fully recovered' },
                      { value: 'voided', label: 'Voided' },
                    ]} value={advStatus} onChange={setAdvStatus} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Advance type</span>
                    <SearchableSelect options={[
                      { value: '', label: 'All types' }, { value: 'cash', label: 'Cash advance' }, { value: 'cts', label: 'Charge to Salary (CTS)' },
                    ]} value={advType} onChange={setAdvType} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment mode</span>
                    <SearchableSelect options={[
                      { value: '', label: 'All payment modes' }, { value: 'cash', label: 'Cash' },
                      { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'cheque', label: 'Cheque' },
                    ]} value={advPaymentMode} onChange={setAdvPaymentMode} />
                  </label>
                </div>

                <div className="space-y-4 rounded-xl bg-slate-50 p-4">
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Issue date</p>
                  <DateRangePicker from={advanceIssueRange(advPeriod, advDateFrom, advDateTo).dateFrom || ''} to={advanceIssueRange(advPeriod, advDateFrom, advDateTo).dateTo || ''} onChange={(from, to) => { setAdvPeriod(''); setAdvDateFrom(from); setAdvDateTo(to); }} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Override state</span>
                    <SearchableSelect options={[
                      { value: '', label: 'Any override state' }, { value: 'true', label: 'Owner override used' }, { value: 'false', label: 'No override used' },
                    ]} value={advOverrideUsed} onChange={setAdvOverrideUsed} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Minimum amount</span>
                    <input type="number" min="0" step="0.01" value={advMinAmount} onChange={(event) => setAdvMinAmount(event.target.value)} placeholder="Rs. 0.00" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Maximum amount</span>
                    <input type="number" min="0" step="0.01" value={advMaxAmount} onChange={(event) => setAdvMaxAmount(event.target.value)} placeholder="No maximum" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sort by</span>
                    <SearchableSelect options={[
                      { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' },
                      { value: 'amountHigh', label: 'Highest amount' }, { value: 'amountLow', label: 'Lowest amount' },
                    ]} value={advSort} onChange={setAdvSort} />
                  </label>
                </div>
                </div>
              </div>
            )}
          </FilterBar>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Advances</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {loading ? 'Loading…' : `${advances.length} advance${advances.length === 1 ? '' : 's'}${advStatus ? ` · ${advStatus.replace('_', ' ')}` : ''}`}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
            ) : advances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <TrendingDown size={36} strokeWidth={1.5} className="text-gray-300" />
                <p className="text-sm font-medium text-slate-500">No advances recorded.</p>
                <p className="text-xs text-gray-400 -mt-2">
                  Click "Give Advance" to issue one to an employee.
                </p>
              </div>
            ) : (
              <PayrollRecords kind="advances" records={advances} renderActions={renderAdvancesActions} renderRepayments={renderRepayments} onAdvanceDetails={setDetailAdvance} />
            )}
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {advModal && (
        <AdvanceModal
          employees={employees.filter((employee) => employee.isActive !== false)}
          onClose={() => setAdvModal(false)}
          onGiven={() => {}}
        />
      )}
      {repayModal && (
        <RepayModal
          advance={repayModal}
          onClose={() => setRepayModal(null)}
          onRepaid={() => {}}
        />
      )}
      {detailAdvance && (
        <AdvanceDetailDrawer
          advance={detailAdvance}
          onClose={() => setDetailAdvance(null)}
        />
      )}
      {editTarget?.kind === 'advance' && (
        <EditSalaryRecordModal
          target={editTarget}
          employees={employees}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setDetailAdvance(null);
            dispatch(baseApi.util.invalidateTags(['SalaryPayment', 'Advance', 'Report', 'Accounting']));
          }}
        />
      )}
      <VoidReasonModal
        open={!!voidTarget}
        target={voidTarget}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleVoidConfirm}
      />
    </div>
  );
};

export default SalaryManager;
