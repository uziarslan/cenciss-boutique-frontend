import { useState } from 'react';
import useQueryPagination from '../../hooks/useQueryPagination';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const money = (value) => `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
export const shiftTime = (value) => {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return value || '—';
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
};
const Field = ({ label, children }) => <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{children ?? '—'}</dd></div>;

export default function EmployeeRoster({ employees, renderActions }) {
  const [expanded, setExpanded] = useState(null);
  const pageSize = 20;
  const [page, setPage] = useQueryPagination('employeePage', employees.length, pageSize);
  const grid = 'grid grid-cols-2 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]';
  return <div>
    <div className={`${grid} hidden lg:grid px-5 py-3 border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500`} aria-hidden="true"><span>Employee / outlet</span><span>Salary</span><span>Shift / attendance</span><span>Contact / status</span><span>Details</span></div>
    <div className="divide-y divide-slate-100">{employees.slice(page * pageSize, (page + 1) * pageSize).map((emp) => {
      const open = expanded === emp._id;
      const limits = emp.salaryCreditLimits || {};
      return <article key={emp._id}>
        <div className={`${grid} items-start px-5 py-5`}>
          <div className="min-w-0"><p className="text-sm font-semibold text-slate-900 break-words">{emp.name}</p><p className="mt-1 text-xs text-slate-500">{[emp.designation, emp.department].filter(Boolean).join(' · ') || 'Role not set'}</p><p className="mt-2 text-xs text-indigo-700">{emp.outlet?.name || 'No outlet assigned'}</p></div>
          <div className="text-xs text-slate-500"><p className="text-sm font-semibold text-slate-800 tabular-nums">{money(emp.salary)}</p><p className="mt-1">Monthly · paid on day {emp.salaryDate || '—'}</p><p className="mt-2">Up to {emp.paidOffDutyDays ?? 4} paid off-duty days</p></div>
          <div className="min-w-0 text-xs text-slate-500"><p className="text-sm text-slate-800">{emp.shiftStart && emp.shiftEnd ? `${shiftTime(emp.shiftStart)} – ${shiftTime(emp.shiftEnd)}` : 'Shift not set'}</p>{emp.shiftStart && emp.shiftEnd && emp.shiftEnd <= emp.shiftStart && <p className="mt-1">Ends next day</p>}<p className="mt-2 break-words">Device ID: <span className="font-medium text-slate-700">{emp.deviceEmployeeNo || 'Not linked'}</span></p><p className="mt-1">Face ID: {emp.isFaceEnrolled ? 'Enrolled' : 'Not enrolled'}</p></div>
          <div className="min-w-0"><p className="text-sm break-words text-slate-700">{emp.phone || 'No phone'}</p><span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${emp.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{emp.isActive ? 'Active' : 'Inactive'}</span></div>
          <button type="button" aria-expanded={open} aria-controls={`employee-${emp._id}`} aria-label={`${open ? 'Hide' : 'View'} details for ${emp.name}`} onClick={() => setExpanded(open ? null : emp._id)} className="col-span-2 lg:col-span-1 justify-self-start inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{open ? 'Close' : 'Details'}<ChevronDown size={14} className={open ? 'rotate-180' : ''} /></button>
        </div>
        {open && <section id={`employee-${emp._id}`} aria-label={`Details for ${emp.name}`} className="mx-5 mb-5 space-y-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h3 className="text-sm font-semibold text-slate-800">Employee information</h3>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <Field label="CNIC">{emp.cnic}</Field><Field label="Phone">{emp.phone || 'Not provided'}</Field><Field label="Joining date">{emp.joiningDate ? String(emp.joiningDate).slice(0, 10) : 'Not recorded'}</Field><Field label="Address">{emp.address || 'Not provided'}</Field>
            <Field label="Bank">{emp.bankName || 'Not provided'}</Field><Field label="Bank account">{emp.bankAccount || 'Not provided'}</Field><Field label="Outlet code">{emp.outlet?.code}</Field><Field label="Face enrollment date">{emp.faceEnrolledAt ? String(emp.faceEnrolledAt).slice(0, 10) : 'Not recorded'}</Field>
          </dl>
          <h3 className="text-sm font-semibold text-slate-800">Advance & credit limits</h3>
          <dl className="grid grid-cols-2 lg:grid-cols-5 gap-5">
            <Field label="Cash advances">{limits.cashAdvanceEnabled === false ? 'Disabled' : 'Enabled'}</Field><Field label="Charge to salary">{limits.chargeToSalaryEnabled === false ? 'Disabled' : 'Enabled'}</Field>
            <Field label="Daily limit">{limits.dailyLimitPercent ?? 10}% of salary</Field><Field label="Rolling 7-day limit">{limits.rollingSevenDayLimitPercent ?? 25}% of salary</Field><Field label="Maximum outstanding">{limits.maxOutstandingPercent ?? 60}% of salary</Field>
          </dl>
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3"><p className="text-xs text-slate-500">Manage employee</p>{renderActions(emp)}</div>
        </section>}
      </article>;
    })}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500"><span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, employees.length)} of {employees.length} employees</span><div className="flex items-center gap-3"><button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronLeft size={16} /></button><span>Page {page + 1} of {Math.ceil(employees.length / pageSize)}</span><button type="button" aria-label="Next page" disabled={(page + 1) * pageSize >= employees.length} onClick={() => setPage(page + 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronRight size={16} /></button></div></div>
  </div>;
}
