import { useState } from 'react';
import useQueryPagination from '../../hooks/useQueryPagination';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export const advanceIssueRange = (period, from, to) => {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) {
    const [year, month] = period.split('-').map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { dateFrom: `${period}-01`, dateTo: `${period}-${days}` };
  }
  return { ...(from ? { dateFrom: from } : {}), ...(to ? { dateTo: to } : {}) };
};
const money = (v) => `PKR ${Number(v || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const date = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const mode = (v) => v?.replaceAll('_', ' ') || '—';
const periodName = (v) => /^\d{4}-\d{2}$/.test(v || '') ? new Date(`${v}-15T12:00:00`).toLocaleDateString('en-PK', { month: 'short', year: 'numeric' }) : v || '—';
const Field = ({ label, children }) => <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{children ?? '—'}</dd></div>;
const totalDeductions = (r) => Number(r.advanceDeducted || 0) + Number(r.allowanceExcessDeducted || 0) + Number(r.penaltyDeducted || 0);

function SalaryDetails({ record: r }) {
  const c = r.attendanceCalculation;
  return <>
    <h3 className="font-semibold text-sm text-slate-800">Payment breakdown</h3>
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      <Field label="Gross salary">{money(r.grossAmount)}</Field>
      <Field label="Advances / CTS deducted">{money(r.advanceDeducted)}</Field>
      <Field label="Allowance excess deducted">{money(r.allowanceExcessDeducted)}</Field>
      <Field label="Penalty deducted">{money(r.penaltyDeducted)}</Field>
      <Field label="Net paid">{money(r.netAmount)}</Field>
      <Field label="Paid by">{r.createdBy?.name}</Field>
      <Field label="Reference">{r.transactionRef}</Field>
      <Field label="Recorded">{date(r.createdAt)}</Field>
    </dl>
    {c ? <>
      <h4 className="font-semibold text-sm text-slate-800">Attendance saved with this payment</h4>
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <Field label="Monthly salary">{money(c.baseSalary)}</Field>
        <Field label="Worked days">{c.workedDays ?? c.payableDays}</Field>
        <Field label="Paid off-duty days">{c.paidOffDutyDays ?? 'Not recorded'}</Field>
        <Field label="Unpaid days">{c.unpaidDays}</Field>
        <Field label="Attendance deduction">{money(c.attendanceDeduction)}</Field>
        <Field label="Overtime pay">{money(c.overtimePay)}</Field>
        <Field label="Holiday work pay">{money(c.holidayWorkPay)}</Field>
        <Field label="Prepaid salary">{money(c.prepaidPay)}{c.prepaidPeriod && ` · ${periodName(c.prepaidPeriod)} · ${c.prepaidDays || 0} days`}</Field>
      </dl>
      {c.prepaidDates?.length > 0 && <p className="text-xs text-slate-600">Prepaid dates: {c.prepaidDates.join(', ')}</p>}
      {c.manualOverrides?.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-indigo-700">Paid-day adjustments ({c.manualOverrides.length})</summary><ul className="mt-2 grid gap-2 sm:grid-cols-3">{c.manualOverrides.map((d) => <li key={d.date}>{d.date} · {mode(d.state || (d.present ? 'on_time' : 'absent'))}</li>)}</ul></details>}
    </> : <p className="text-sm text-slate-500">No attendance breakdown was saved with this payment.</p>}
    {r.accrualEntries?.length > 1 && <div><h4 className="font-semibold text-sm">Salary by earned month</h4><ul className="mt-2 flex flex-wrap gap-4 text-sm">{r.accrualEntries.map((entry) => <li key={entry.period}>{periodName(entry.period)}: {money(entry.grossAmount)} gross · {money(entry.penaltyDeducted)} penalty</li>)}</ul></div>}
    <Field label="Notes">{r.notes || 'No notes'}</Field>
  </>;
}

export function PayrollRecords({ kind, records, renderActions, renderRepayments, onAdvanceDetails, onEmployeeAdvances }) {
  const [expanded, setExpanded] = useState(null);
  const pageSize = 20;
  const [page, setPage] = useQueryPagination(kind === 'payments' ? 'payPage' : 'advancePage', records.length, pageSize);
  const isSalary = kind === 'payments';
  const active = records.filter((r) => !r.voidedAt && r.status !== 'voided');
  const sum = (getter) => active.reduce((total, r) => total + Number(getter(r) || 0), 0);
  const summaries = isSalary
    ? [['Gross salary', sum((r) => r.grossAmount)], ['Deductions', sum(totalDeductions)], ['Net paid', sum((r) => r.netAmount)]]
    : [['Issued', sum((r) => r.amount)], ['Recovered', sum((r) => r.recoveredAmount)], ['Outstanding', sum((r) => Math.max(0, (r.amount || 0) - (r.recoveredAmount || 0)))]];
  const grid = 'grid grid-cols-2 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]';
  return <div>
    <div className="px-5 py-4 bg-slate-50/60 border-b border-slate-100">
      <dl className="grid gap-3 sm:grid-cols-3">{summaries.map(([label, value]) => <Field key={label} label={label}><span className="tabular-nums">{money(value)}</span></Field>)}</dl>
      <p className="mt-3 text-xs text-slate-500">Totals for matching records · voided entries excluded</p>
    </div>
    <div className={`${grid} hidden lg:grid px-5 py-3 text-xs font-semibold text-slate-500 border-b border-slate-100`} aria-hidden="true">
      <span>Employee / {isSalary ? 'salary period' : 'issued'}</span><span>{isSalary ? 'Salary breakdown' : 'Recovery'}</span><span>Payment / reference</span><span>{isSalary ? 'Net paid / status' : 'Balance / status'}</span><span>Details</span>
    </div>
    <div className="divide-y divide-slate-100">{records.slice(page * pageSize, (page + 1) * pageSize).map((r) => {
      const isVoid = !!r.voidedAt || r.status === 'voided';
      const open = expanded === r._id;
      const balance = Math.max(0, Number(r.amount || 0) - Number(r.recoveredAmount || 0));
      return <article key={r._id} className={isVoid ? 'bg-rose-50/30' : ''}>
        <div className={`${grid} items-start px-5 py-5`}>
          <div className="min-w-0"><p className="font-semibold text-sm text-slate-900 break-words">{r.employee?.name || 'Unavailable employee'}</p><p className="mt-1 text-xs text-slate-500">{r.employee?.designation}</p><p className="mt-2 text-sm text-slate-600">{isSalary ? periodName(r.period) : date(r.advanceDate)}</p>{!isSalary && <span className="text-xs text-indigo-600">{r.type === 'cts' ? 'Charge to salary' : 'Cash advance'}</span>}</div>
          <dl className="space-y-2 text-sm tabular-nums"><div><dt className="text-xs text-slate-500">{isSalary ? 'Gross' : 'Issued'}</dt><dd>{money(isSalary ? r.grossAmount : r.amount)}</dd></div><div><dt className="text-xs text-slate-500">{isSalary ? 'Deductions' : 'Recovered'}</dt><dd>{money(isSalary ? totalDeductions(r) : r.recoveredAmount)}</dd></div></dl>
          <div className="min-w-0 text-sm"><p className="capitalize">{r.type === 'cts' ? 'POS charge' : mode(r.paymentMode)}</p>{isSalary && <p className="mt-1 text-xs text-slate-500">{date(r.paymentDate)}</p>}<p className="mt-2 break-words text-xs text-slate-500">{r.transactionRef || 'No reference'}</p>{r.notes && <p className="mt-1 line-clamp-2 break-words text-xs text-slate-500">{r.notes}</p>}</div>
          <div><p className={`text-sm font-semibold tabular-nums ${isVoid ? 'text-slate-400 line-through' : isSalary || balance === 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{money(isSalary ? r.netAmount : balance)}</p><span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium capitalize ${isVoid ? 'bg-rose-100 text-rose-700' : isSalary || balance === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{isVoid ? 'Voided' : isSalary ? 'Paid' : mode(r.status)}</span>{!isSalary && r.repayments?.length > 0 && <p className="mt-2 text-xs text-slate-500">{r.repayments.filter((x) => !x.voidedAt).length} active repayments</p>}</div>
          <button type="button" aria-expanded={open} aria-controls={`payroll-${r._id}`} onClick={() => setExpanded(open ? null : r._id)} className="col-span-2 lg:col-span-1 inline-flex items-center gap-1 justify-self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50" aria-label={`${open ? 'Hide' : 'View'} details for ${r.employee?.name || 'employee'}`}>{open ? 'Close' : 'Details'}<ChevronDown size={14} className={open ? 'rotate-180' : ''} /></button>
        </div>
        {open && <section id={`payroll-${r._id}`} aria-label={`Details for ${r.employee?.name || 'employee'}`} className="mx-5 mb-5 space-y-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          {isSalary ? <SalaryDetails record={r} /> : <>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-5"><Field label="Issued by">{r.createdBy?.name}</Field><Field label="Reference">{r.transactionRef}</Field><Field label="Notes">{r.notes || 'No notes'}</Field><Field label="Recovered via salary">{money(Math.max(0, Number(r.recoveredAmount || 0) - (r.repayments || []).filter((x) => !x.voidedAt).reduce((total, x) => total + Number(x.amount || 0), 0)))}</Field><Field label="Owner override">{r.creditPolicySnapshot?.overrideUsed ? r.creditPolicySnapshot.overrideReason || 'Yes' : 'No'}</Field></dl>
            <button type="button" onClick={() => onAdvanceDetails(r)} className="text-sm font-semibold text-indigo-700 underline underline-offset-4">{r.type === 'cts' ? 'View purchase items & credit details' : 'View full advance details'}</button>
            {r.repayments?.length > 0 ? <div className="overflow-x-auto">{renderRepayments(r)}</div> : <p className="text-sm text-slate-500">{Number(r.recoveredAmount) > 0 ? 'Recovery applied through salary deduction.' : 'No repayments recorded yet.'}</p>}
          </>}
          {isSalary && r.employee?._id && onEmployeeAdvances && <button type="button" onClick={() => onEmployeeAdvances(r.employee._id)} className="text-sm font-semibold text-indigo-700 underline underline-offset-4">View this employee’s advances</button>}
          {isVoid && <p className="text-sm text-rose-700">Voided {date(r.voidedAt)} · {r.voidReason || 'No reason recorded'}</p>}
          <div className="border-t border-slate-200 pt-3">{renderActions(r)}</div>
        </section>}
      </article>;
    })}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500"><span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, records.length)} of {records.length} records</span><div className="flex items-center gap-3"><button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronLeft size={16} /></button><span>Page {page + 1} of {Math.ceil(records.length / pageSize)}</span><button type="button" aria-label="Next page" disabled={(page + 1) * pageSize >= records.length} onClick={() => setPage(page + 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronRight size={16} /></button></div></div>
  </div>;
}
