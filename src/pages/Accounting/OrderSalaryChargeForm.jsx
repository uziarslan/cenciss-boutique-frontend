import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Utensils, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { chargeJournalOrderToSalary, getOrderSalaryChargeContext, getOrderSalaryCreditSummary } from '../../api/accountingApi';
import { baseApi } from '../../store/baseApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import PremiumModal, { ModalSection, PrimaryButton, SecondaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';

const fmt = (value) => `Rs. ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAYMENT_LABELS = { cash: 'Cash', card: 'Card', 'online-transfer': 'Online transfer', split: 'Split payment', 'split-bill': 'Split bill' };

export default function OrderSalaryChargeForm({ entry, onBack, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [context, setContext] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [summary, setSummary] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState('');
  const [reason, setReason] = useState('');
  const [overrideRequested, setOverrideRequested] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    getOrderSalaryChargeContext(entry._id).then((response) => {
      if (active) setContext(response.data.data);
    }).catch((error) => {
      if (active) setLoadError(error.response?.data?.message || 'Could not load the linked order.');
    });
    return () => { active = false; };
  }, [entry._id]);

  useEffect(() => {
    let active = true;
    if (!employeeId) return undefined;
    setCreditLoading(true);
    getOrderSalaryCreditSummary(employeeId).then((response) => {
      if (active) setSummary(response.data.data);
    }).catch((error) => {
      if (active) setCreditError(error.response?.data?.message || 'Could not verify employee credit limits.');
    }).finally(() => { if (active) setCreditLoading(false); });
    return () => { active = false; };
  }, [employeeId]);

  const selectEmployee = (value) => {
    setEmployeeId(value);
    setSummary(null);
    setCreditError('');
    setOverrideRequested(false);
    setOverrideReason('');
  };
  const amount = Number(context?.order?.totalAmount || 0);
  const enabled = summary?.limits?.chargeToSalaryEnabled !== false;
  const needsOverride = !!summary && amount > Number(summary.available) + 0.001;
  const hardBlocked = !!summary && !enabled;
  const canSave = context && employeeId && summary && !creditLoading && !creditError && !hardBlocked
    && reason.trim().length >= 5
    && (!needsOverride || (summary.canOverride && overrideRequested && overrideReason.trim().length >= 5));

  const submit = async (event) => {
    event?.preventDefault();
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await chargeJournalOrderToSalary(entry._id, {
        employeeId, reason: reason.trim(),
        creditLimitOverride: { requested: needsOverride && overrideRequested, reason: overrideReason.trim() },
      });
      dispatch(baseApi.util.invalidateTags(['JournalEntry', 'Accounting', 'Report', 'Advance', 'SalaryPayment', 'Session', 'CustomParty']));
      toast.success(`${context.order.transactionNumber} charged to salary. Order details are available in Advances.`);
      onSaved();
    } catch (error) {
      const data = error.response?.data;
      if (data?.creditSummary) setSummary((current) => ({ ...data.creditSummary, canOverride: current?.canOverride }));
      toast.error(data?.message || 'Could not charge the order to salary.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <PremiumModal open onClose={saving ? undefined : onClose} icon={Utensils} accent="indigo" size="lg"
      eyebrow={entry.entryNumber} title="Charge Order to Salary"
      subtitle="Link this order to an employee for recovery from salary."
      footer={<>
        <SecondaryButton onClick={onBack} disabled={saving}>Back</SecondaryButton>
        <PrimaryButton onClick={submit} disabled={!canSave || saving} accent="indigo">
          {saving ? 'Charging…' : 'Charge to Salary'}
        </PrimaryButton>
      </>}
    >
      {loadError ? <p role="alert" className="text-sm text-rose-600">{loadError}</p> : !context ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading order…</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{context.order.transactionNumber}</p>
                <p className="mt-1 text-xs text-slate-500">{context.order.businessDate} · Currently {PAYMENT_LABELS[context.order.paymentMethod]}</p>
              </div>
              <p className="text-lg font-bold text-indigo-700">{fmt(amount)}</p>
            </div>
            <div className="mt-3 space-y-1 border-t border-indigo-100 pt-3 text-sm text-slate-600">
              {context.order.items.map((item, index) => <p key={index}>{item.qty} × {item.name}{item.variation?.name ? ` (${item.variation.name})` : ''}</p>)}
            </div>
            <p className="mt-3 text-xs text-slate-600">The full payable amount and order details will appear in Salaries → Advances. Tax and discount amounts stay as recorded on the order.</p>
          </div>
          <div>
            <label htmlFor="salary-charge-employee" className={labelCls}>Employee</label>
            <SearchableSelect id="salary-charge-employee" value={employeeId} onChange={selectEmployee} disabled={saving}
              options={context.employees.filter((employee) => employee.chargeToSalaryEnabled).map((employee) => ({
                value: employee._id, label: employee.name, meta: [employee.designation, employee.department].filter(Boolean).join(' · '),
              }))} placeholder="Select employee…" searchPlaceholder="Search employees…" />
            {context.employees.every((employee) => !employee.chargeToSalaryEnabled) && <p className="mt-2 text-xs text-amber-700">No active employees have Charge to Salary enabled.</p>}
            {creditLoading && <p className="mt-2 text-xs text-slate-500">Checking credit limits…</p>}
            {creditError && <p role="alert" className="mt-2 text-xs text-rose-600">{creditError}</p>}
            {summary && <p className="mt-2 text-xs text-slate-600">Available credit: {fmt(summary.available)} · Outstanding: {fmt(summary.usage?.outstanding)}</p>}
            {hardBlocked && <p role="alert" className="mt-2 text-xs text-rose-600">Charge to Salary is disabled for this employee.</p>}
            {needsOverride && !hardBlocked && !summary.canOverride && <p role="alert" className="mt-2 text-xs text-rose-600">This order exceeds the employee’s credit limits. An owner can authorize an override.</p>}
          </div>
          {needsOverride && !hardBlocked && summary.canOverride && (
            <ModalSection icon={AlertTriangle} title="Owner Override Required"
              subtitle={`The order is above the normal ${fmt(summary.available)} available limit`} accent="amber">
              <div className="space-y-3">
                <button type="button" onClick={() => setOverrideRequested((current) => !current)} disabled={saving}
                  aria-pressed={overrideRequested} aria-label="Use owner override"
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition ${overrideRequested ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">Use owner override</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">Approve this order above daily, seven-day, outstanding or salary-cycle credit limits.</span>
                  </span>
                  <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition ${overrideRequested ? 'bg-amber-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${overrideRequested ? 'left-[22px]' : 'left-0.5'}`} />
                  </span>
                </button>
                {overrideRequested && <div>
                  <label htmlFor="salary-charge-override-reason" className={labelCls}>Override Reason <span className="text-rose-500">*</span></label>
                  <textarea id="salary-charge-override-reason" className={`${inputCls} resize-none`} rows={2}
                    value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} disabled={saving}
                    placeholder="Explain why this exception is being approved…" maxLength={500} />
                  <p className="mt-1 text-xs text-slate-400">At least 5 characters. The owner, reason and overridden limits are saved in the audit history.</p>
                </div>}
              </div>
            </ModalSection>
          )}
          <div>
            <label htmlFor="salary-charge-reason" className={labelCls}>Correction reason</label>
            <textarea id="salary-charge-reason" className={inputCls} value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} rows={2} maxLength={500} placeholder="For example: Cashier selected cash instead of salary" />
            <p className="mt-1 text-xs text-slate-400">At least 5 characters. Saved in the audit history.</p>
          </div>
        </form>
      )}
    </PremiumModal>
  );
}
