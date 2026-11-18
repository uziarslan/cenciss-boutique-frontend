import { useState, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { DollarSign, Edit2, CheckCircle, Clock, AlertTriangle, RefreshCw, Wallet as WalletIcon, Users as UsersIcon, TrendingUp, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  setUserAllowanceLimit,
  settleExcess,
} from '../../api/allowanceApi';
import { getUsers } from '../../api/userApi';
import {
  baseApi,
  useGetAllowancesQuery,
  useGetExcessReportQuery,
  listQueryOpts,
} from '../../store/baseApi';
import useAuth from '../../hooks/useAuth';
import usePermissions from '../../hooks/usePermissions';
import { ROLES } from '../../config/permissions';
import AmountInput from '../../components/UI/AmountInput';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import Button from '../../components/UI/Button';
import FilterBar from '../../components/UI/FilterBar';
import PremiumModal, { SecondaryButton, PrimaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';
import useQueryState from '../../hooks/useQueryState';

const roleLabel = (key) => ROLES.find((r) => r.key === key)?.label ?? key;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v) =>
  `PKR ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Subjects are either payroll Employees or system Users (owners).
const SUBJECT_LABELS = {
  employee: { label: 'Employee', cls: 'bg-emerald-100 text-emerald-700' },
  user:     { label: 'Owner',    cls: 'bg-indigo-100  text-indigo-700'  },
};
const SubjectBadge = ({ subjectType }) => {
  const { label, cls } = SUBJECT_LABELS[subjectType] ?? { label: subjectType, cls: 'bg-gray-100 text-gray-600' };
  return <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', cls)}>{label}</span>;
};

// On/off switch for whether the allowance is active for a subject.
const AllowanceToggle = ({ enabled, disabled, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    disabled={disabled}
    onClick={() => onChange(!enabled)}
    className={clsx(
      'inline-flex items-center gap-2 group',
      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
    )}
  >
    <span
      className={clsx(
        'relative w-9 h-5 rounded-full transition-colors shrink-0',
        enabled ? 'bg-indigo-600' : 'bg-gray-300'
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
          enabled && 'translate-x-4'
        )}
      />
    </span>
    <span className={clsx('text-xs font-semibold', enabled ? 'text-indigo-600' : 'text-gray-400')}>
      {enabled ? 'On' : 'Off'}
    </span>
  </button>
);

// ── Edit Limit Modal ──────────────────────────────────────────────────────────

const EditLimitModal = ({ entry, onClose, onSaved }) => {
  const dispatch = useDispatch();
  const [limit, setLimit] = useState(String(entry.monthlyLimit || ''));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const val = parseFloat(limit);
    if (isNaN(val) || val < 0) {
      toast.error('Please enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await setUserAllowanceLimit(entry.subjectId, {
        subjectType: entry.subjectType,
        monthlyLimit: val,
        notes: notes || undefined,
      });
      dispatch(baseApi.util.invalidateTags(['Allowance']));
      toast.success(`Allowance updated for ${entry.name}.`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Failed to update allowance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PremiumModal
      open
      onClose={saving ? undefined : onClose}
      icon={WalletIcon}
      eyebrow="Edit Allowance"
      title="Set Monthly Allowance"
      subtitle={`${entry.name} — ${entry.period}`}
      accent="indigo"
      size="sm"
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={handleSave} disabled={saving} accent="indigo">
            {saving ? 'Saving…' : 'Save'}
          </PrimaryButton>
        </>
      }
    >
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div>
          <label className={labelCls}>Monthly Limit (PKR)</label>
          <AmountInput
            value={limit}
            onChange={setLimit}
            className={inputCls}
            placeholder="e.g. 5,000"
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Notes <span className="text-slate-400 font-normal">(optional)</span></label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
            placeholder="Reason for change"
          />
        </div>
      </div>
    </PremiumModal>
  );
};

// ── Excess Tab ────────────────────────────────────────────────────────────────

const PAYMENT_MODES = [
  { value: 'cash',            label: 'Cash' },
  { value: 'online_transfer', label: 'Online Transfer' },
];
const MODE_LABELS = { cash: 'Cash', online_transfer: 'Online Transfer' };

const SettleExcessModal = ({ row, onClose, onSettled }) => {
  const dispatch = useDispatch();
  const [paymentMode, setPaymentMode]   = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [receiverUserId, setReceiverUserId] = useState('');
  const [users, setUsers]   = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUsers()
      .then((res) => setUsers(res.data?.data?.users ?? []))
      .catch(() => toast.error('Failed to load users.'));
  }, []);

  const handleSubmit = async () => {
    if (!paymentMode) { toast.error('Select a payment mode.'); return; }
    if (paymentMode === 'online_transfer' && !transactionId.trim()) {
      toast.error('Transaction ID is required for online transfers.'); return;
    }
    if (!receiverUserId) { toast.error('Select the receiver employee.'); return; }
    setSaving(true);
    try {
      await settleExcess(row.allowanceId, {
        paymentMode,
        transactionId: transactionId.trim() || undefined,
        receiverUserId,
      });
      dispatch(baseApi.util.invalidateTags(['Allowance', 'Report']));
      toast.success('Settlement recorded and posted.');
      onSettled();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Failed to record settlement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PremiumModal
      open
      onClose={saving ? undefined : onClose}
      icon={CheckCircle}
      eyebrow="Settle Excess"
      title="Record Settlement"
      subtitle={`${row.name} — ${row.period} · Excess: ${fmt(row.excessAmount)}`}
      accent="rose"
      size="md"
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={handleSubmit} disabled={saving} accent="emerald">
            {saving ? 'Recording…' : 'Confirm Settlement'}
          </PrimaryButton>
        </>
      }
    >
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div>
          <label className={labelCls}>Payment Mode <span className="text-rose-500">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setPaymentMode(m.value)}
                className={clsx(
                  'px-3 py-2.5 rounded-xl text-sm font-semibold border transition',
                  paymentMode === m.value
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {paymentMode === 'online_transfer' && (
          <div>
            <label className={labelCls}>Transaction ID <span className="text-rose-500">*</span></label>
            <input
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              className={inputCls}
              placeholder="e.g. TRX-20260421-001"
            />
          </div>
        )}

        <div>
          <label className={labelCls}>Received By (Employee) <span className="text-rose-500">*</span></label>
          <SearchableSelect
            options={users.map((u) => ({ value: u._id, label: u.name, meta: roleLabel(u.role) }))}
            value={receiverUserId}
            onChange={setReceiverUserId}
            placeholder="— Select employee —"
            searchPlaceholder="Search employees…"
          />
        </div>
      </div>
    </PremiumModal>
  );
};

const ExcessTab = ({ onSwitchToAllowances }) => {
  const [settleTarget, setSettleTarget] = useState(null);
  useAuth();
  const { has } = usePermissions();
  const canSettle = has('allowances.manage');

  const { data: payload, isLoading: loading } = useGetExcessReportQuery(undefined, listQueryOpts);
  const rows = useMemo(() => payload?.excess ?? [], [payload]);

  // ── Summary metrics ───────────────────────────────────────────────────────
  const unsettled       = rows.filter((r) => !r.excessSettled);
  const settled         = rows.filter((r) =>  r.excessSettled);
  const unsettledTotal  = unsettled.reduce((s, r) => s + (r.excessAmount ?? 0), 0);
  const lastSettlement  = settled
    .map((r) => r.excessSettledAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {settleTarget && (
        <SettleExcessModal
          row={settleTarget}
          onClose={() => setSettleTarget(null)}
          onSettled={() => setSettleTarget(null)}
        />
      )}

      {/* Excess stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Outstanding',
            value: fmt(unsettledTotal),
            icon:  AlertTriangle,
            color: unsettled.length > 0 ? 'text-rose-600' : 'text-emerald-600',
            bg:    unsettled.length > 0 ? 'bg-rose-50'    : 'bg-emerald-50',
          },
          {
            label: 'Unsettled',
            value: unsettled.length,
            icon:  Clock,
            color: unsettled.length > 0 ? 'text-amber-600' : 'text-emerald-600',
            bg:    unsettled.length > 0 ? 'bg-amber-50'    : 'bg-emerald-50',
          },
          {
            label: 'Settled',
            value: settled.length,
            icon:  CheckCircle,
            color: 'text-emerald-600',
            bg:    'bg-emerald-50',
          },
          {
            label: 'Last Settlement',
            value: lastSettlement ? new Date(lastSettlement).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
            icon:  Receipt,
            color: 'text-indigo-600',
            bg:    'bg-indigo-50',
          },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon size={16} className={s.color} />
            </div>
            <div className="min-w-0">
              <p className={clsx('text-xl font-bold leading-tight tabular-nums truncate', s.color)}>{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-widest">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Body: empty state OR table */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="relative px-6 py-12 text-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/30 pointer-events-none" />
            <div className="relative">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 ring-4 ring-emerald-50 flex items-center justify-center mb-4 shadow-sm">
                <CheckCircle size={26} className="text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-slate-800">All employees are within their allowance limits</h3>
              <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
                There's nothing to settle — every cashier and staff member spent within their monthly cap.
              </p>
              {onSwitchToAllowances && (
                <button
                  onClick={onSwitchToAllowances}
                  className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 transition shadow-sm"
                >
                  <WalletIcon size={13} /> Review allowances
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Outstanding banner — only when there are unsettled rows */}
          {unsettled.length > 0 && (
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-amber-50 border-amber-100">
              <AlertTriangle size={18} className="text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-700">
                  {unsettled.length} unsettled excess{unsettled.length === 1 ? '' : 'es'} totalling {fmt(unsettledTotal)}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Settle each excess once the employee has paid back the difference.
                </p>
              </div>
            </div>
          )}

          {/* Table card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Receipt size={15} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Excess Records</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {rows.length} record{rows.length === 1 ? '' : 's'} · {settled.length} settled · {unsettled.length} unsettled
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    {['Employee', 'Period', 'Excess', 'Status', 'Settlement Details', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rows.map((row) => (
                    <tr key={row.allowanceId} className={clsx('hover:bg-slate-50/60 transition-colors', row.excessSettled && 'opacity-70')}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{row.name}</p>
                        <p className="text-xs text-gray-400">
                          {row.subjectType === 'user' ? 'Owner' : 'Employee'}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{row.period}</td>
                      <td className="px-5 py-3 font-semibold text-rose-600 tabular-nums">{fmt(row.excessAmount)}</td>
                      <td className="px-5 py-3">
                        {row.excessSettled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            <CheckCircle size={10} /> Settled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                            <Clock size={10} /> Unsettled
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {row.excessSettled ? (
                          <div className="text-xs text-gray-600 space-y-0.5">
                            <p><span className="font-medium">Mode:</span> {MODE_LABELS[row.settlementPaymentMode] ?? row.settlementPaymentMode}</p>
                            {row.settlementTransactionId && (
                              <p><span className="font-medium">Ref:</span> {row.settlementTransactionId}</p>
                            )}
                            {row.settlementReceiverUser && (
                              <p><span className="font-medium">Received by:</span> {row.settlementReceiverUser.name}</p>
                            )}
                            {row.excessSettledAt && (
                              <p className="text-gray-400">{new Date(row.excessSettledAt).toLocaleDateString('en-PK')}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {!row.excessSettled && canSettle && (
                          <button
                            onClick={() => setSettleTarget(row)}
                            className="inline-flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-semibold border border-indigo-100 transition"
                          >
                            <CheckCircle size={12} /> Settle
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - i);
  return d.toISOString().slice(0, 7);
});

const AllowanceManager = () => {
  const dispatch = useDispatch();
  const { has } = usePermissions();
  // Dedicated allowances permission — independent of accounting.reports so
  // toggling P&L / Balance Sheet doesn't accidentally expose buttons here.
  const canManage = has('allowances.manage');
  const [tab, setTab] = useQueryState('tab', 'allowances'); // 'allowances' | 'excess'
  const [period, setPeriod] = useQueryState('period', MONTHS[0]);
  const [editEntry, setEditEntry] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const { data: payload, isLoading: loading } = useGetAllowancesQuery(period, listQueryOpts);
  const rows = useMemo(() => payload?.allowances ?? [], [payload]);

  const refresh = () => dispatch(baseApi.util.invalidateTags(['Allowance']));

  const handleToggle = async (row, next) => {
    const id = `${row.subjectType}:${row.subjectId}`;
    setTogglingId(id);
    try {
      await setUserAllowanceLimit(row.subjectId, {
        subjectType: row.subjectType,
        enabled: next,
      });
      dispatch(baseApi.util.invalidateTags(['Allowance']));
      toast.success(`Allowance ${next ? 'enabled' : 'disabled'} for ${row.name}.`);
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Failed to update allowance.');
    } finally {
      setTogglingId(null);
    }
  };

  const totalBudget   = rows.reduce((s, r) => s + r.monthlyLimit, 0);
  const totalUsed     = rows.reduce((s, r) => s + r.usedAmount, 0);
  const totalExcess   = rows.reduce((s, r) => s + r.excessAmount, 0);
  const employeeCount = rows.length;

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={WalletIcon}
        eyebrow="Staff Benefits"
        title="Staff Allowances"
        subtitle="Set monthly meal allowance limits for employees and owners, track usage, and settle excesses."
        accent="indigo"
        compact
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={refresh}
          >
            Refresh
          </Button>
        }
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Budget', value: fmt(totalBudget),  icon: WalletIcon, color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
          { label: 'Total Used',   value: fmt(totalUsed),    icon: TrendingUp, color: 'text-violet-600',  bg: 'bg-violet-50'  },
          { label: 'Total Excess', value: fmt(totalExcess),  icon: AlertTriangle,
            color: totalExcess > 0 ? 'text-rose-600' : 'text-emerald-600',
            bg:    totalExcess > 0 ? 'bg-rose-50'    : 'bg-emerald-50' },
          { label: 'Employees',    value: employeeCount,     icon: UsersIcon,  color: 'text-cyan-600',    bg: 'bg-cyan-50'    },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon size={16} className={s.color} />
            </div>
            <div className="min-w-0">
              <p className={clsx('text-xl font-bold leading-tight tabular-nums truncate', s.color)}>
                {loading ? '…' : s.value}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-widest">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'allowances', label: 'Allowances' },
          { id: 'excess',     label: 'Excess & Settlement' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition',
              tab === t.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'allowances' ? (
        <>
          {/* Period filter */}
          <FilterBar>
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Period</label>
              <SearchableSelect
                options={MONTHS.map((m) => ({ value: m, label: m }))}
                value={period}
                onChange={(v) => setPeriod(v)}
              />
            </div>
            <div className="ml-auto text-xs text-gray-400">
              Showing month: <span className="font-semibold text-gray-600">{period}</span>
            </div>
          </FilterBar>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Allowances</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {rows.length} {rows.length === 1 ? 'subject' : 'subjects'} (employees + owners) for {period}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/80 border-b border-slate-100">
                    <tr>
                      {['Name', 'Designation', 'Monthly Limit', 'Used', 'Remaining', 'Excess', 'Status', ''].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => {
                      const usePct = row.monthlyLimit > 0 ? Math.min(100, (row.usedAmount / row.monthlyLimit) * 100) : 0;
                      const off = !row.enabled;
                      return (
                        <tr
                          key={`${row.subjectType}:${row.subjectId}`}
                          className={clsx('hover:bg-slate-50/60 transition-colors', off && 'opacity-50')}
                        >
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900">{row.name}</p>
                            <p className="text-xs text-gray-400">{row.sub}</p>
                          </td>
                          <td className="px-5 py-3"><SubjectBadge subjectType={row.subjectType} /></td>
                          <td className="px-5 py-3 text-gray-700 font-semibold tabular-nums">
                            {row.monthlyLimit > 0 ? fmt(row.monthlyLimit) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3">
                            {row.monthlyLimit > 0 ? (
                              <div className="flex items-center gap-2.5">
                                <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div
                                    className={clsx(
                                      'h-1.5 rounded-full transition-all',
                                      usePct >= 100 ? 'bg-rose-500' :
                                      usePct >= 80  ? 'bg-amber-400' :
                                                       'bg-indigo-500'
                                    )}
                                    style={{ width: `${usePct}%` }}
                                  />
                                </div>
                                <span className="text-gray-700 tabular-nums">{fmt(row.usedAmount)}</span>
                              </div>
                            ) : '—'}
                          </td>
                          <td className="px-5 py-3 text-gray-700 tabular-nums">
                            {row.monthlyLimit > 0 ? fmt(row.remainingAmount) : '—'}
                          </td>
                          <td className="px-5 py-3">
                            {row.excessAmount > 0 ? (
                              <span className="font-semibold text-rose-600 inline-flex items-center gap-1 tabular-nums">
                                <AlertTriangle size={12} /> {fmt(row.excessAmount)}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3">
                            <AllowanceToggle
                              enabled={row.enabled}
                              disabled={!canManage || togglingId === `${row.subjectType}:${row.subjectId}`}
                              onChange={(next) => handleToggle(row, next)}
                            />
                          </td>
                          <td className="px-5 py-3">
                            {canManage && (
                              <button
                                onClick={() => setEditEntry(row)}
                                className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition font-semibold"
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!rows.length && (
                  <div className="text-center py-12 text-gray-400">
                    <DollarSign size={36} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">No subjects found.</p>
                    <p className="text-xs mt-1">Allowance limits will appear here once employees or owners are added.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <ExcessTab onSwitchToAllowances={() => setTab('allowances')} />
      )}

      {editEntry && (
        <EditLimitModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => setEditEntry(null)}
        />
      )}
    </div>
  );
};

export default AllowanceManager;
