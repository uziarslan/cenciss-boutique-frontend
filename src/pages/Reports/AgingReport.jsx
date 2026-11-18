import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, CheckCircle, Clock, Wallet, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useGetAgingQuery, useGetOutletsQuery, reportQueryOpts } from '../../store/baseApi';
import { getExcessReport, settleExcess } from '../../api/allowanceApi';
import { getUsers } from '../../api/userApi';
import { exportToCSV } from '../../utils/exportCSV';
import {
  fmt, StatCard, ReportSkeleton, ReportEmpty,
  ExportButton, ReportCard, ReportSectionHeader, ReportThead,
} from './ReportShared';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../config/permissions';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import PremiumModal, { SecondaryButton, PrimaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';
import useQueryState from '../../hooks/useQueryState';

const roleLabel = (key) => ROLES.find((r) => r.key === key)?.label ?? key;

// ── Bucket config ─────────────────────────────────────────────────────────────
const BUCKETS = [
  { key: 'current',      label: 'Current',     tone: 'slate',  textCls: 'text-slate-700'  },
  { key: 'bucket1to30',  label: '1–30 days',   tone: 'amber',  textCls: 'text-amber-700'  },
  { key: 'bucket31to60', label: '31–60 days',  tone: 'orange', textCls: 'text-orange-700' },
  { key: 'bucket61to90', label: '61–90 days',  tone: 'rose',   textCls: 'text-rose-600'   },
  { key: 'bucket90plus', label: '90+ days',    tone: 'rose',   textCls: 'text-rose-700 font-bold' },
];

const PAYMENT_MODES = [
  { value: 'cash',            label: 'Cash' },
  { value: 'online_transfer', label: 'Online Transfer' },
];

const MODE_LABELS = { cash: 'Cash', online_transfer: 'Online Transfer' };

// ── Settle Modal ──────────────────────────────────────────────────────────────
const SettleModal = ({ row, onClose, onSettled }) => {
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
      subtitle={`${row.name} — ${row.period} · Excess: Rs. ${fmt(row.excessAmount)}`}
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

// ── Staff Allowance Excess section ────────────────────────────────────────────
const AllowanceExcessSection = () => {
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [settleTarget, setSettleTarget] = useState(null);
  const { role } = useAuth();

  const load = useCallback(() => {
    setLoading(true);
    getExcessReport()
      .then((res) => setRows(res.data?.data?.excess ?? []))
      .catch(() => toast.error('Failed to load allowance excess.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const unsettledTotal = rows.filter((r) => !r.excessSettled).reduce((s, r) => s + r.excessAmount, 0);

  return (
    <div className="space-y-3">
      {settleTarget && (
        <SettleModal
          row={settleTarget}
          onClose={() => setSettleTarget(null)}
          onSettled={load}
        />
      )}

      {unsettledTotal > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-amber-50 border-amber-100">
          <AlertTriangle size={18} className="text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-700">
              Rs. {fmt(unsettledTotal)} unsettled allowance excess
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Owed to the business — settle each one once the employee has paid back.
            </p>
          </div>
        </div>
      )}

      <ReportCard>
        <ReportSectionHeader
          icon={AlertTriangle}
          iconAccent="amber"
          title="Staff Allowance Excess Receivable"
          subtitle="Employees who've exceeded their monthly allowance"
          right={(
            <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
              {rows.length} {rows.length === 1 ? 'record' : 'records'}
            </span>
          )}
        />

        {loading ? (
          <div className="p-6">
            <ReportSkeleton rows={3} cols={6} />
          </div>
        ) : !rows.length ? (
          <div className="px-6 py-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 ring-4 ring-emerald-50 flex items-center justify-center mb-3 shadow-sm">
              <CheckCircle size={26} className="text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-slate-700">All employees within their allowance limits</p>
            <p className="text-xs text-slate-400 mt-1">There's nothing to settle right now.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={['Employee', 'Period', 'Excess', 'Status', 'Settlement Details', 'Action']} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.allowanceId} className={clsx('hover:bg-slate-50/60 transition-colors', row.excessSettled && 'opacity-70')}>
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-400">
                        {row.subjectType === 'user' ? 'Owner' : 'Employee'}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{row.period}</td>
                    <td className="py-3 px-4 font-bold text-rose-600 tabular-nums">Rs. {fmt(row.excessAmount)}</td>
                    <td className="py-3 px-4">
                      {row.excessSettled ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                          <CheckCircle size={10} /> Settled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                          <Clock size={10} /> Unsettled
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
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
                    <td className="py-3 px-4 whitespace-nowrap">
                      {!row.excessSettled && role === 'owner' && (
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
        )}
      </ReportCard>
    </div>
  );
};

const AgingReport = () => {
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const { data: outlets = [] } = useGetOutletsQuery();
  const { data, isLoading: loading } = useGetAgingQuery(
    useMemo(() => ({ outlet: outlet || undefined }), [outlet]),
    reportQueryOpts,
  );

  useEffect(() => {
    if (outlets.length === 1 && !outlet) setOutlet(outlets[0]._id || '');
  }, [outlets, outlet, setOutlet]);

  const vendors = data?.vendors ?? [];
  const totals  = data?.totals  ?? {};

  const overdueTotalBalance = (totals.bucket1to30 ?? 0) +
    (totals.bucket31to60 ?? 0) + (totals.bucket61to90 ?? 0) + (totals.bucket90plus ?? 0);
  const grandTotal = totals.total ?? 0;
  const currentTotal = totals.current ?? 0;
  const overduePct = grandTotal > 0 ? (overdueTotalBalance / grandTotal) * 100 : 0;

  const handleExport = () => {
    if (!vendors.length) return;
    exportToCSV(
      vendors.map((v) => ({
        Vendor:           v.vendorName,
        Code:             v.vendorCode ?? '',
        'Current (Rs.)':  v.current.toFixed(2),
        '1-30 (Rs.)':     v.bucket1to30.toFixed(2),
        '31-60 (Rs.)':    v.bucket31to60.toFixed(2),
        '61-90 (Rs.)':    v.bucket61to90.toFixed(2),
        '90+ (Rs.)':      v.bucket90plus.toFixed(2),
        'Total (Rs.)':    v.total.toFixed(2),
      })),
      'aging-report'
    );
  };

  return (
    <div className="space-y-6 pb-8">
      {/* ── Filters ── */}
      <FilterBar>
        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
            value={outlet}
            onChange={setOutlet}
            searchPlaceholder="Search outlets…"
          />
        </div>
        <p className="text-xs text-gray-500 px-1 max-w-xs">
          Aging is calculated as of today. Includes open, partially paid, and overdue purchases.
        </p>
        <ExportButton onClick={handleExport} disabled={!vendors.length} />
        <div className="ml-auto text-xs text-gray-400">As of {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      </FilterBar>

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[88px] bg-gray-100 rounded-2xl animate-pulse" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Outstanding"
              value={`Rs. ${fmt(grandTotal)}`}
              sub={`${vendors.length} vendor${vendors.length === 1 ? '' : 's'}`}
              icon={Wallet}
              color="indigo"
              highlight
            />
            <StatCard
              label="Current"
              value={`Rs. ${fmt(currentTotal)}`}
              sub="Within terms"
              icon={CheckCircle}
              color="emerald"
            />
            <StatCard
              label="Overdue"
              value={`Rs. ${fmt(overdueTotalBalance)}`}
              sub={`${overduePct.toFixed(1)}% of total`}
              icon={AlertTriangle}
              color={overdueTotalBalance > 0 ? 'rose' : 'emerald'}
            />
            <StatCard
              label="90+ Days"
              value={`Rs. ${fmt(totals.bucket90plus ?? 0)}`}
              sub="Critical"
              icon={Clock}
              color={(totals.bucket90plus ?? 0) > 0 ? 'rose' : 'emerald'}
            />
          </>
        )}
      </div>

      {/* ── Bucket breakdown row ── */}
      {!loading && data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {BUCKETS.map(({ key, label, tone }) => {
            const value = totals[key] ?? 0;
            const pct = grandTotal > 0 ? (value / grandTotal) * 100 : 0;
            const tonesMap = {
              slate:  { bg: 'bg-slate-50',  text: 'text-slate-700',  bar: 'bg-slate-400' },
              amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  bar: 'bg-amber-500' },
              orange: { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-500' },
              rose:   { bg: 'bg-rose-50',   text: 'text-rose-700',   bar: 'bg-rose-500' },
            };
            const t = tonesMap[tone] || tonesMap.slate;
            return (
              <div key={key} className={clsx('rounded-2xl border border-gray-100 bg-white shadow-sm p-4 flex flex-col gap-2.5')}>
                <div className="flex items-center justify-between">
                  <span className={clsx('text-[10px] font-bold uppercase tracking-widest', t.text)}>{label}</span>
                  <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums', t.bg, t.text)}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <p className={clsx('text-xl font-bold tabular-nums', t.text)}>Rs. {fmt(value)}</p>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className={clsx('h-full rounded-full transition-all', t.bar)} style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Overdue summary ── */}
      {!loading && overdueTotalBalance > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-rose-50 border-rose-100">
          <AlertTriangle size={18} className="text-rose-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-rose-700">
              Rs. {fmt(overdueTotalBalance)} overdue across all aging buckets
            </p>
            <p className="text-xs text-rose-600 mt-0.5">
              {overduePct.toFixed(1)}% of total outstanding · review high-risk vendors below.
            </p>
          </div>
        </div>
      )}

      {/* ── Main table ── */}
      {loading ? (
        <ReportSkeleton rows={8} cols={7} />
      ) : !vendors.length ? (
        <ReportEmpty message="No outstanding purchases." />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={ShoppingCart}
            iconAccent="indigo"
            title="Vendor Aging"
            subtitle="Outstanding balance bucketed by days overdue"
            right={(
              <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                {vendors.length} {vendors.length === 1 ? 'vendor' : 'vendors'}
              </span>
            )}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4">Vendor</th>
                  {BUCKETS.map(({ key, label }) => (
                    <th key={key} className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4 whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                  <th className="text-right text-[11px] font-bold text-slate-700 uppercase tracking-[0.08em] py-3 px-4">Total (Rs.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => (
                  <tr key={v.vendorId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{v.vendorName}</p>
                      {v.vendorCode && <p className="text-xs font-mono text-gray-400">{v.vendorCode}</p>}
                    </td>
                    {BUCKETS.map(({ key, textCls }) => (
                      <td key={key} className={clsx('py-3 px-4 text-right tabular-nums', (v[key] ?? 0) > 0 ? textCls : 'text-gray-300')}>
                        {(v[key] ?? 0) > 0 ? fmt(v[key]) : '—'}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-right font-bold text-gray-900 tabular-nums">
                      {fmt(v.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                  <td className="py-3.5 px-4 font-bold text-slate-700 uppercase tracking-wide text-xs">Grand Total</td>
                  {BUCKETS.map(({ key, textCls }) => (
                    <td key={key} className={clsx('py-3.5 px-4 text-right font-bold tabular-nums', textCls)}>
                      {fmt(totals[key] ?? 0)}
                    </td>
                  ))}
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums text-base">
                    {fmt(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </ReportCard>
      )}

      {/* ── Allowance excess section ── */}
      <AllowanceExcessSection />
    </div>
  );
};

export default AgingReport;
