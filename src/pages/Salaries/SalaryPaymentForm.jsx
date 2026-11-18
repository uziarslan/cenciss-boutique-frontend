import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { ArrowLeft, Banknote, User as UserIcon, Wallet, CalendarDays, CheckCircle2, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight as ChevronRightIcon, Copy, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { paySalary, updateSalaryPayment, getOutstandingAdvance, getOutstandingAllowanceExcess } from '../../api/salaryApi';
import { getAttendanceByEmployee } from '../../api/attendanceApi';
import { baseApi } from '../../store/baseApi';
import AmountInput from '../../components/UI/AmountInput';
import SearchableSelect from '../../components/UI/SearchableSelect';
import { ModalSection, inputCls, labelCls, PrimaryButton, SecondaryButton } from '../../components/UI/PremiumModal';
import { isPaidSalaryAttendanceOverride, isDevicePresentAttendance, isWorkedSalaryAttendanceOverride, nextSalaryAttendanceOverride, normalizeSalaryAttendanceOverride, summarizeSalaryAttendance, formatAttendanceDuration } from './salaryAttendance';
import { calculatePayrollBreakdown, shiftPeriod } from './payrollCalculation';
import { AttendanceReviewSummary } from '../Attendance/attendanceReview';
import SalaryAttendanceReview from './SalaryAttendanceReview';
import { getOutletBusinessDate } from '../../utils/businessDate';

const fmt = (v) =>
  `PKR ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const fmtRate = (v) =>
  `PKR ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Date inputs represent the user's calendar date. UTC serialization shows the
// previous day in Pakistan between midnight and 05:00, so use local components.
const localDateInputValue = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const savedDateInputValue = (value) => {
  const saved = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : localDateInputValue();
};

const currentPeriod = () => localDateInputValue().slice(0, 7);

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

export const SalaryPaymentForm = ({ employees, onClose, onPaid, payment = null }) => {
  const dispatch = useDispatch();
  const isEditing = Boolean(payment?._id);
  const originalEmployeeId = payment?.employee?._id || payment?.employee || '';
  const savedAttendance = payment?.attendanceCalculation;
  const savedAutomaticDeduction = Number(payment?.advanceDeducted || 0)
    + Number(payment?.allowanceExcessDeducted || 0);
  const [empId, setEmpId] = useState(originalEmployeeId);
  const [period, setPeriod] = useState(payment?.period || currentPeriod());
  const [gross, setGross] = useState(String(
    savedAttendance?.baseSalary ?? payment?.grossAmount ?? '',
  ));
  const [advanceDed, setAdvanceDed] = useState(
    savedAutomaticDeduction > 0 ? String(savedAutomaticDeduction) : '',
  );
  const [outstanding, setOutstanding] = useState(Number(payment?.advanceDeducted || 0)); // outstanding salary advances (cash + CTS)
  const [outstandingCts, setOutstandingCts] = useState(0);  // portion of the above that is charge-to-salary
  const [outstandingExcess, setOutstandingExcess] = useState(Number(payment?.allowanceExcessDeducted || 0)); // unsettled allowance excess
  const [outstandingAdvanceRecords, setOutstandingAdvanceRecords] = useState([]);
  const [outstandingExcessRecords, setOutstandingExcessRecords] = useState([]);
  const [showDeductionDetails, setShowDeductionDetails] = useState(false);
  const [paymentMode, setPaymentMode] = useState(payment?.paymentMode || 'cash');
  const [transactionRef, setTransactionRef] = useState(payment?.transactionRef || '');
  const [notes, setNotes] = useState(payment?.notes || '');
  const [paymentDate, setPaymentDate] = useState(
    payment?.paymentDate ? savedDateInputValue(payment.paymentDate) : localDateInputValue,
  );
  const [saving, setSaving] = useState(false);
  const [attendance, setAttendance] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState(false);
  const [attendanceRetry, setAttendanceRetry] = useState(0);
  const [aheadAttendance, setAheadAttendance] = useState({ key: '', records: [], loading: false, error: false });
  const [calendarMonth, setCalendarMonth] = useState(payment?.period || currentPeriod);
  const [attendanceOverrides, setAttendanceOverrides] = useState(() => {
    const overrides = Object.fromEntries(
      (savedAttendance?.manualOverrides || []).map((item) => [
        item.date,
        normalizeSalaryAttendanceOverride(item.state ?? item.present),
      ]),
    );
    (savedAttendance?.prepaidDates || []).forEach((date) => {
      if (!overrides[date]) overrides[date] = 'on_time';
    });
    return overrides;
  });
  const [deductionManuallyEdited, setDeductionManuallyEdited] = useState(isEditing);
  const [penalty, setPenalty] = useState(
    Number(payment?.penaltyDeducted || 0) > 0 ? String(payment.penaltyDeducted) : '',
  );
  const [payOvertime, setPayOvertime] = useState(savedAttendance?.overtimeEnabled === true);
  const [overtimeHours, setOvertimeHours] = useState(
    Number(savedAttendance?.overtimeMinutes || 0) > 0
      ? String(Math.round((savedAttendance.overtimeMinutes / 60) * 100) / 100)
      : '',
  );
  const [overtimeManuallyEdited, setOvertimeManuallyEdited] = useState(isEditing);
  const [correctionReason, setCorrectionReason] = useState('');
  const previousEmployeeId = useRef(originalEmployeeId);
  const previousAttendanceKey = useRef(`${originalEmployeeId}|${payment?.period || currentPeriod()}`);

  const selectedEmp = employees.find((e) => e._id === empId);

  useEffect(() => {
    if (previousEmployeeId.current === empId) return;
    previousEmployeeId.current = empId;
    if (selectedEmp) setGross(String(selectedEmp.salary));
    else setGross('');
    setDeductionManuallyEdited(false);
    setPenalty('');
    setPayOvertime(false);
    setOvertimeHours('');
    setOvertimeManuallyEdited(false);
    setShowDeductionDetails(false);
  }, [empId]);

  useEffect(() => {
    if (!empId) {
      setOutstanding(0);
      setOutstandingCts(0);
      setOutstandingExcess(0);
      setOutstandingAdvanceRecords([]);
      setOutstandingExcessRecords([]);
      setShowDeductionDetails(false);
      setAdvanceDed('');
      return;
    }
    let active = true;
    // Fetch outstanding advances (cash + CTS) + unsettled allowance excess, then
    // pre-fill the combined deduction — capped at the gross salary (owner can edit
    // it down; any remainder above the salary carries forward to the next payslip).
    Promise.all([
      getOutstandingAdvance(empId, { asOf: paymentDate })
        .then((r) => ({ total: r.data.data.outstanding || 0, records: r.data.data.records || [] }))
        .catch(() => ({ total: 0, records: [] })),
      getOutstandingAllowanceExcess(empId)
        .then((r) => ({ total: r.data.data.outstanding || 0, records: r.data.data.records || [] }))
        .catch(() => ({ total: 0, records: [] })),
    ]).then(([adv, exc]) => {
      if (!active) return;
      const editingOriginalEmployee = isEditing && empId === originalEmployeeId;
      const currentAdvanceAllocation = editingOriginalEmployee
        ? Number(payment?.advanceDeducted || 0)
        : 0;
      const currentAllowanceAllocation = editingOriginalEmployee
        ? Number(payment?.allowanceExcessDeducted || 0)
        : 0;
      const cts = Math.round(
        adv.records
          .filter((a) => a.type === 'cts')
          .reduce((s, a) => s + Math.max(0, (a.amount || 0) - (a.recoveredAmount || 0)), 0) * 100,
      ) / 100;
      // The outstanding endpoints exclude the portion already recovered by
      // this payment. Add that portion back while editing so an unchanged edit
      // preserves the existing allocation and can be safely re-applied.
      setOutstanding(Math.round((adv.total + currentAdvanceAllocation) * 100) / 100);
      setOutstandingCts(cts);
      setOutstandingExcess(Math.round((exc.total + currentAllowanceAllocation) * 100) / 100);
      setOutstandingAdvanceRecords(adv.records);
      setOutstandingExcessRecords(exc.records);
    });
    return () => { active = false; };
  }, [empId, paymentDate, isEditing, originalEmployeeId, payment?.advanceDeducted, payment?.allowanceExcessDeducted]);

  // Load attendance for selected employee + period.
  useEffect(() => {
    let active = true;
    const attendanceKey = `${empId}|${period}`;
    if (previousAttendanceKey.current !== attendanceKey) {
      previousAttendanceKey.current = attendanceKey;
      setAttendanceOverrides({});
      setCalendarMonth(period);
      setDeductionManuallyEdited(false);
      setPenalty('');
      setPayOvertime(false);
      setOvertimeHours('');
      setOvertimeManuallyEdited(false);
    }
    if (!empId || !period) { setAttendance([]); setAttendanceLoading(false); setAttendanceError(false); return; }
    setAttendanceLoading(true);
    setAttendanceError(false);
    setAttendance([]);
    getAttendanceByEmployee(empId, { month: period })
      .then((r) => { if (active) setAttendance(r.data.data || []); })
      .catch(() => { if (active) setAttendanceError(true); })
      .finally(() => { if (active) setAttendanceLoading(false); });
    return () => { active = false; };
  }, [empId, period, attendanceRetry]);

  const attendanceCalculation = useMemo(() => {
    return summarizeSalaryAttendance({
      period,
      records: attendance,
      overrides: attendanceOverrides,
      paidOffDutyLimit: selectedEmp?.paidOffDutyDays ?? 4,
    });
  }, [period, attendance, attendanceOverrides, selectedEmp?.paidOffDutyDays]);

  const handleAttendanceToggle = useCallback((dateKey) => {
    setAttendanceOverrides((current) => {
      const currentState = Object.prototype.hasOwnProperty.call(current, dateKey)
        ? current[dateKey]
        : null;
      return { ...current, [dateKey]: nextSalaryAttendanceOverride(currentState) };
    });
  }, []);

  const suggestedOvertimeMinutes = useMemo(() => attendance.reduce((total, record) => {
    if (!record.date?.startsWith(`${period}-`)
      || !isDevicePresentAttendance(record)
      || (Object.prototype.hasOwnProperty.call(attendanceOverrides, record.date)
        && !isWorkedSalaryAttendanceOverride(attendanceOverrides[record.date]))) return total;
    return total + Math.max(0, Number(record.overtimeMinutes) || 0);
  }, 0), [attendance, period, attendanceOverrides]);

  useEffect(() => {
    if (!payOvertime) {
      setOvertimeHours('');
      setOvertimeManuallyEdited(false);
      return;
    }
    if (overtimeManuallyEdited) return;
    const suggestedHours = Math.round((suggestedOvertimeMinutes / 60) * 100) / 100;
    setOvertimeHours(suggestedHours > 0 ? String(suggestedHours) : '');
  }, [payOvertime, suggestedOvertimeMinutes, overtimeManuallyEdited]);

  const periodLabel = (() => {
    if (!period) return '';
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  })();
  const prepaidPeriod = shiftPeriod(period, 1);
  const prepaidDates = Object.entries(attendanceOverrides)
    .filter(([date, state]) => date.startsWith(`${prepaidPeriod}-`)
      && isPaidSalaryAttendanceOverride(state))
    .map(([date]) => date)
    .sort();
  const calendarMonthLabel = (() => {
    const [y, m] = calendarMonth.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  })();
  const canShowPreviousMonth = calendarMonth > period;
  const canShowNextMonth = calendarMonth < prepaidPeriod;
  const aheadKey = `${empId}|${calendarMonth}`;
  const displayedAttendance = calendarMonth === period ? attendance : aheadAttendance.key === aheadKey ? aheadAttendance.records : [];
  const calendarLoading = calendarMonth !== period && (aheadAttendance.key !== aheadKey || aheadAttendance.loading);
  const calendarError = calendarMonth !== period && aheadAttendance.key === aheadKey && aheadAttendance.error;
  const attendanceToday = getOutletBusinessDate(attendance[0] || selectedEmp?.outlet);
  useEffect(() => {
    if (!empId || calendarMonth === period) return;
    let active = true;
    const key = `${empId}|${calendarMonth}`;
    setAheadAttendance({ key, records: [], loading: true, error: false });
    getAttendanceByEmployee(empId, { month: calendarMonth })
      .then((r) => { if (active) setAheadAttendance({ key, records: r.data.data || [], loading: false, error: false }); })
      .catch(() => { if (active) setAheadAttendance({ key, records: [], loading: false, error: true }); });
    return () => { active = false; };
  }, [empId, calendarMonth, period]);
  const hasCalendarChanges = Object.keys(attendanceOverrides).length > 0;

  // The "Deductions" field is a single combined figure the owner controls. It is
  // capped at the gross salary and split — advances first, then allowance excess —
  // into the two amounts the API records against 1102 / 1101.
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const monthlySalary = parseFloat(gross) || 0;
  const overtimeMinutes = payOvertime
    ? Math.max(0, Math.round((parseFloat(overtimeHours) || 0) * 60))
    : 0;
  const payrollBreakdown = calculatePayrollBreakdown({
    period,
    monthlySalary,
    paidOffDutyDays: attendanceCalculation.paidOffDutyDays,
    paidOffDutyLimit: attendanceCalculation.paidOffDutyLimit,
    workedDays: attendanceCalculation.workedDays,
    prepaidDates,
    overtimeMinutes,
    shiftStart: selectedEmp?.shiftStart,
    shiftEnd: selectedEmp?.shiftEnd,
  });
  const grossNum = payrollBreakdown.grossAmount;
  const attendanceDeduction = payrollBreakdown.attendanceDeduction;
  const penaltyNum = r2(Math.max(0, parseFloat(penalty) || 0));
  const automaticDeductionCapacity = Math.max(0, r2(grossNum - penaltyNum));
  const deduction = Math.min(parseFloat(advanceDed) || 0, automaticDeductionCapacity);
  const advancePortion = r2(Math.min(outstanding, deduction));
  const allowancePortion = r2(Math.min(outstandingExcess, Math.max(0, deduction - advancePortion)));
  const totalDeducted = r2(advancePortion + allowancePortion);
  const net = Math.max(0, r2(grossNum - totalDeducted - penaltyNum));
  const carryForward = r2(Math.max(0, (outstanding + outstandingExcess) - totalDeducted));

  // Keep the advance/allowance deduction prefill aligned with the attendance-
  // adjusted gross until the owner explicitly edits that field.
  useEffect(() => {
    if (!empId || deductionManuallyEdited) return;
    const owed = Math.round((Number(outstanding + outstandingExcess) || 0) * 100) / 100;
    const prefill = automaticDeductionCapacity > 0 ? Math.min(owed, automaticDeductionCapacity) : 0;
    setAdvanceDed(prefill > 0 ? String(prefill) : '');
  }, [empId, outstanding, outstandingExcess, automaticDeductionCapacity, deductionManuallyEdited]);

  const handlePay = async () => {
    if (!empId) return toast.error('Select an employee.');
    if (attendanceLoading || attendanceError) return toast.error('Wait for attendance to load successfully before paying.');
    if (!gross || isNaN(gross)) return toast.error('Monthly salary is required.');
    if (attendanceCalculation.workedDays < 1) {
      return toast.error('Mark at least one worked attendance day before paying salary.');
    }
    if (overtimeMinutes > 0 && payrollBreakdown.shiftHours <= 0) {
      return toast.error('Set this employee’s shift start and end times before paying overtime.');
    }
    if (penaltyNum > grossNum) {
      return toast.error('Penalty cannot exceed the gross salary.');
    }
    if (isEditing && correctionReason.trim().length < 5) {
      return toast.error('Enter a correction reason of at least 5 characters.');
    }
    setSaving(true);
    try {
      const payload = {
        employeeId: empId,
        period,
        grossAmount: grossNum,
        attendanceCalculation: {
          calculationVersion: 2,
          baseSalary: monthlySalary,
          periodDays: attendanceCalculation.periodDays,
          paidOffDutyDays: payrollBreakdown.paidOffDutyDays,
          paidOffDutyLimit: attendanceCalculation.paidOffDutyLimit,
          devicePresentDays: attendanceCalculation.devicePresentDays,
          payableDays: attendanceCalculation.workedDays,
          workedDays: attendanceCalculation.workedDays,
          overtimeEnabled: payOvertime,
          overtimeMinutes,
          prepaidDates,
          manualOverrides: Object.entries(attendanceOverrides)
            .filter(([date]) => date.startsWith(`${period}-`))
            .map(([date, state]) => ({
              date,
              state: normalizeSalaryAttendanceOverride(state),
              present: isWorkedSalaryAttendanceOverride(state),
            })),
        },
        advanceDeducted: advancePortion,
        allowanceExcessDeducted: allowancePortion,
        penaltyDeducted: penaltyNum,
        paymentDate,
        paymentMode,
        transactionRef: paymentMode === 'cash' ? '' : transactionRef.trim(),
        notes: notes.trim(),
      };
      if (isEditing) {
        await updateSalaryPayment(payment._id, {
          ...payload,
          reason: correctionReason.trim(),
        });
      } else {
        await paySalary(payload);
      }
      dispatch(baseApi.util.invalidateTags(['SalaryPayment', 'Advance', 'Report', 'Accounting']));
      toast.success(isEditing
        ? 'Salary payment and its existing journal entries were updated.'
        : 'Salary paid and journal entry posted.');
      onPaid?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message ?? (isEditing
        ? 'Failed to update salary payment.'
        : 'Failed to pay salary.'));
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

  const heroStrip = selectedEmp && (
    <div className="flex items-center justify-between rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/20 px-4 py-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-100/80">{isEditing ? 'Updated Net Payable' : 'Net Payable'}</p>
        <p className="text-2xl font-extrabold tabular-nums mt-0.5">{fmt(net)}</p>
      </div>
      <div className="text-right text-[11px] text-indigo-100/80 leading-tight">
        <p>Monthly salary {fmt(monthlySalary)}</p>
        <p>{attendanceCalculation.workedDays} / {payrollBreakdown.workingDays} required working days</p>
        {attendanceDeduction > 0 && <p>Less attendance {fmt(attendanceDeduction)}</p>}
        {payrollBreakdown.holidayWorkPay > 0 && <p>Holiday work +{fmt(payrollBreakdown.holidayWorkPay)}</p>}
        {payrollBreakdown.prepaidPay > 0 && <p>Paid ahead +{fmt(payrollBreakdown.prepaidPay)}</p>}
        {payrollBreakdown.overtimePay > 0 && <p>Overtime +{fmt(payrollBreakdown.overtimePay)}</p>}
        {advancePortion > 0 && <p>Less advances / CTS {fmt(advancePortion)}</p>}
        {allowancePortion > 0 && <p>Less allowance excess {fmt(allowancePortion)}</p>}
        {penaltyNum > 0 && <p>Less penalty {fmt(penaltyNum)}</p>}
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-5">
      <button type="button" onClick={onClose} disabled={saving} className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50"><ArrowLeft size={16} /> Back to Salaries</button>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{isEditing ? 'Edit Salary Payment' : 'Pay Salary'}</p>
        <div className="mt-2 flex items-center gap-3">
          {selectedEmp && <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-700">{initials}</span>}
          <div><h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{selectedEmp?.name || 'Pay Salary'}</h1><p className="mt-1 text-sm text-slate-500">{selectedEmp ? `${selectedEmp.designation || 'Staff'} · ${periodLabel}` : 'Select an employee and review attendance before paying.'}</p></div>
        </div>
        {heroStrip && <div className="mt-5 rounded-2xl bg-indigo-600 text-white">{heroStrip}</div>}
      </header>
      <div className="space-y-5">
          {isEditing && (
            <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-3 text-xs text-indigo-800">
              This edits the existing salary payment and its posted journal entries in place. The original record IDs and journal numbers are retained; no reversal journal is created.
            </div>
          )}
          {/* Employee & Period */}
          <ModalSection icon={UserIcon} title="Employee & Period" subtitle="Select who's being paid and for which month">
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Employee <span className="text-rose-500">*</span></label>
                <SearchableSelect
                  options={employees.map((e) => ({ value: e._id, label: e.name, meta: e.designation || '' }))}
                  value={empId}
                  onChange={setEmpId}
                  placeholder="— Select employee —"
                  searchPlaceholder="Search employees…"
                />
              </div>
              {(outstanding > 0 || outstandingExcess > 0) && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1 text-xs text-amber-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <p>Pre-filled deductions (advances are limited to the selected payment date):</p>
                        {(outstanding - outstandingCts) > 0 && <p>• Cash advances: <strong>{fmt(outstanding - outstandingCts)}</strong></p>}
                        {outstandingCts > 0 && <p>• Charge to salary (CTS): <strong>{fmt(outstandingCts)}</strong></p>}
                        {outstandingExcess > 0 && <p>• Allowance excess: <strong>{fmt(outstandingExcess)}</strong></p>}
                        {carryForward > 0 && (
                          <p className="text-amber-700">Exceeds this salary — <strong>{fmt(carryForward)}</strong> will carry forward to the next payslip.</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDeductionDetails((value) => !value)}
                        aria-expanded={showDeductionDetails}
                        aria-controls="salary-deduction-details"
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 transition hover:bg-white"
                      >
                        {showDeductionDetails ? 'Hide details' : 'View details'}
                        <ChevronDown size={13} className={`transition-transform ${showDeductionDetails ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {showDeductionDetails && (
                      <div id="salary-deduction-details" className="mt-3 border-t border-amber-200 pt-2.5">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                          Included up to {formatRecordDate(paymentDate)}
                        </p>
                        <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                          {outstandingAdvanceRecords.map((record) => {
                            const recovered = Math.max(0, Number(record.recoveredAmount || 0));
                            const balance = Math.max(0, Number(record.amount || 0) - recovered);
                            return (
                              <div key={record._id} className="rounded-lg border border-amber-100 bg-white/70 px-2.5 py-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-800">
                                      {record.type === 'cts' ? 'Charge to salary (CTS)' : 'Cash advance'}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-slate-500">
                                      {formatRecordDate(record.businessDate || record.advanceDate)}
                                      {record.transactionRef ? ` · ${record.transactionRef}` : ''}
                                    </p>
                                  </div>
                                  <p className="shrink-0 font-bold tabular-nums text-amber-900">{fmt(balance)}</p>
                                </div>
                                <p className="mt-1 text-[10px] text-slate-500">
                                  Original {fmt(record.amount)} · Recovered {fmt(recovered)} · Remaining {fmt(balance)}
                                </p>
                              </div>
                            );
                          })}
                          {outstandingExcessRecords.map((record) => {
                            const recovered = Math.max(0, Number(record.excessRecoveredAmount || 0));
                            const balance = Math.max(0, Number(record.excessAmount || 0) - recovered);
                            return (
                              <div key={record._id} className="rounded-lg border border-amber-100 bg-white/70 px-2.5 py-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-slate-800">Allowance excess</p>
                                    <p className="mt-0.5 text-[10px] text-slate-500">Period {record.period || '—'}</p>
                                  </div>
                                  <p className="shrink-0 font-bold tabular-nums text-amber-900">{fmt(balance)}</p>
                                </div>
                                <p className="mt-1 text-[10px] text-slate-500">
                                  Original {fmt(record.excessAmount)} · Recovered {fmt(recovered)} · Remaining {fmt(balance)}
                                </p>
                              </div>
                            );
                          })}
                          {outstandingAdvanceRecords.length === 0 && outstandingExcessRecords.length === 0 && (
                            <p className="rounded-lg bg-white/60 px-2.5 py-2 text-[11px] text-amber-700">
                              This total belongs to the existing salary payment recovery.
                            </p>
                          )}
                        </div>
                        {isEditing && (
                          <p className="mt-2 text-[10px] text-amber-700">
                            Existing payment allocations are included in the totals shown above.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Period <span className="text-rose-500">*</span></label>
                  <input type="month" className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Payment Date <span className="text-rose-500">*</span></label>
                  <input type="date" className={inputCls} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
              </div>
            </div>
          </ModalSection>

          {/* Attendance breakdown — only when employee + period selected */}
          {empId && (
            <ModalSection
              icon={CalendarDays}
              title={`Attendance — ${periodLabel}`}
              subtitle={`Monthly salary covers ${payrollBreakdown.workingDays} required working days with ${attendanceCalculation.paidOffDutyLimit} paid off-duty days entitled. Days worked above this requirement earn holiday-work pay. Future days can be selected for advance payment.`}
              accent="cyan"
            >
              {attendanceLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-slate-400">
                  <span className="animate-pulse">Loading attendance…</span>
                </div>
              ) : attendanceError ? (
                <div role="alert" className="py-4 text-sm text-rose-700"><p>Attendance could not be loaded. Retry before paying.</p><button type="button" onClick={() => setAttendanceRetry((count) => count + 1)} className="mt-2 rounded-lg border border-rose-200 px-3 py-2 font-semibold">Retry attendance</button></div>
              ) : (
                <>
                  {/* Stat tiles */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
                    <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-emerald-50 to-white p-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        <CheckCircle2 size={11} /> Paid Days
                      </div>
                      <p className="text-2xl font-extrabold text-emerald-700 mt-1 tabular-nums leading-none">{attendanceCalculation.workedDays}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">of {payrollBreakdown.workingDays} required</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-cyan-50 to-white p-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-700">
                        <CalendarDays size={11} /> Paid Off
                      </div>
                      <p className="text-2xl font-extrabold text-cyan-700 mt-1 tabular-nums leading-none">{payrollBreakdown.paidOffDutyDays}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">of {attendanceCalculation.paidOffDutyLimit} entitled</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-blue-50 to-white p-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        <Wallet size={11} /> Holiday Work
                      </div>
                      <p className="text-2xl font-extrabold text-blue-700 mt-1 tabular-nums leading-none">{payrollBreakdown.holidayWorkedDays}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">extra paid days</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-rose-50 to-white p-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                        <AlertTriangle size={11} /> Unpaid
                      </div>
                      <p className="text-2xl font-extrabold text-rose-700 mt-1 tabular-nums leading-none">{payrollBreakdown.unpaidDays}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">days</p>
                    </div>
                  </div>

                  <div className="mb-5">
                    <h4 className="mb-3 text-sm font-semibold text-slate-800">Recorded attendance · {periodLabel}</h4>
                    <AttendanceReviewSummary records={attendance} month={period} todayKey={attendanceToday} />
                  </div>

                  <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setCalendarMonth(period)}
                      disabled={!canShowPreviousMonth}
                      aria-label="Show salary period month"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-800">{calendarMonthLabel}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {calendarMonth === period ? 'Salary period' : 'Paid ahead'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth(prepaidPeriod)}
                      disabled={!canShowNextMonth}
                      aria-label="Show next month for paid-ahead days"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronRightIcon size={17} />
                    </button>
                  </div>

                  <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2">
                    <p className="text-[11px] text-blue-700">Calendar labels show recorded attendance and the salary selection separately. Use “Edit paid days” to change salary selections.</p>
                    {hasCalendarChanges && (
                      <button
                        type="button"
                        onClick={() => setAttendanceOverrides({})}
                        className="shrink-0 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
                      >
                        Reset changes
                      </button>
                    )}
                  </div>

                  {calendarMonth === period
                    && attendanceCalculation.selectedOffDutyDays > attendanceCalculation.paidOffDutyLimit && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      <strong>{attendanceCalculation.selectedOffDutyDays}</strong> off-duty dates are selected, but this employee’s maximum is{' '}
                      <strong>{attendanceCalculation.paidOffDutyLimit}</strong>. Only the maximum is paid; mark any extra date as Absent or a worked state.
                    </div>
                  )}

                  {calendarLoading ? <p className="py-6 text-sm text-slate-500">Loading attendance…</p> : calendarError ? <p role="alert" className="py-4 text-sm text-rose-700">Attendance could not be loaded. Switch back and reopen this month to retry.</p> : <SalaryAttendanceReview
                    key={`${empId}|${calendarMonth}`}
                    month={calendarMonth}
                    records={displayedAttendance}
                    overrides={attendanceOverrides}
                    onToggle={handleAttendanceToggle}
                    todayKey={attendanceToday}
                    selectionOnly={calendarMonth !== period}
                  />}

                  {prepaidDates.length > 0 && (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5 text-xs text-indigo-800">
                      <span><strong>{prepaidDates.length}</strong> {prepaidDates.length === 1 ? 'day' : 'days'} selected in {payrollBreakdown.prepaidPeriod}</span>
                      <strong className="tabular-nums">+{fmt(payrollBreakdown.prepaidPay)}</strong>
                    </div>
                  )}

                  {attendance.length === 0 && (
                    <div className="text-center py-6 text-sm text-slate-400">
                      No attendance records for this period. Use the calendar to select the days included in this salary payment.
                    </div>
                  )}
                </>
              )}
            </ModalSection>
          )}

          {/* Compensation */}
          <ModalSection icon={Wallet} title="Compensation" subtitle="Base salary, paid days, penalties and optional overtime" accent="emerald">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <div className="sm:col-span-2 flex items-center justify-between gap-4 rounded-xl border border-cyan-100 bg-cyan-50/60 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Pay extra hours</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Off by default. Turn on to include attendance overtime in this salary.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={payOvertime}
                  aria-label="Pay extra hours"
                  onClick={() => setPayOvertime((enabled) => !enabled)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${payOvertime ? 'bg-cyan-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${payOvertime ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <div className="min-w-0">
                <label className={labelCls}>Monthly Salary (PKR) <span className="text-rose-500">*</span></label>
                <AmountInput className={inputCls} value={gross} onChange={setGross} />
              </div>
              <div className="min-w-0">
                <label className={labelCls}>Automatic Deductions (PKR)</label>
                <AmountInput
                  className={inputCls}
                  value={advanceDed}
                  onChange={(value) => {
                    setAdvanceDed(value);
                    setDeductionManuallyEdited(true);
                  }}
                  placeholder="0"
                />
                {totalDeducted > 0 && (advancePortion > 0 || allowancePortion > 0) && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {advancePortion > 0 && <>Advances / CTS {fmt(advancePortion)}</>}
                    {advancePortion > 0 && allowancePortion > 0 && ' + '}
                    {allowancePortion > 0 && <>Allowance excess {fmt(allowancePortion)}</>}
                  </p>
                )}
              </div>
              <div className="min-w-0">
                <label className={labelCls}>Penalty (PKR)</label>
                <AmountInput className={inputCls} value={penalty} onChange={setPenalty} placeholder="0" />
                <p className="mt-1 text-[10px] text-slate-500">Manual penalty; automatic recovery adjusts so the total never exceeds gross pay.</p>
              </div>
              {payOvertime && (
                <>
                  <div className="min-w-0">
                    <label className={labelCls}>Paid Overtime Hours</label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      className={inputCls}
                      value={overtimeHours}
                      onChange={(event) => {
                        setOvertimeHours(event.target.value);
                        setOvertimeManuallyEdited(true);
                      }}
                      placeholder="0"
                    />
                    <p className="mt-1 text-[10px] text-slate-500">
                      Suggested from attendance: {formatAttendanceDuration(suggestedOvertimeMinutes)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <label className={labelCls}>Salary Rates</label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-600">
                      <p><strong>{fmtRate(payrollBreakdown.dailyRate)}</strong> / working day</p>
                      <p><strong>{fmtRate(payrollBreakdown.hourlyRate)}</strong> / hour · {payrollBreakdown.shiftHours || 0}h shift</p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Base Earned</p>
                <p className="mt-0.5 font-bold tabular-nums text-emerald-900">{fmt(payrollBreakdown.baseEarned)}</p>
                <p className="mt-0.5 text-[10px] text-emerald-700/70">
                  {payrollBreakdown.regularPaidDays} of {payrollBreakdown.workingDays} working days
                </p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Attendance Deduction</p>
                <p className="mt-0.5 font-bold tabular-nums text-rose-900">{fmt(attendanceDeduction)}</p>
                <p className="mt-0.5 text-[10px] text-rose-700/70">{payrollBreakdown.unpaidDays} unpaid working days</p>
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Holiday Work Pay</p>
                <p className="mt-0.5 font-bold tabular-nums text-violet-900">{fmt(payrollBreakdown.holidayWorkPay)}</p>
                <p className="mt-0.5 text-[10px] text-violet-700/70">{payrollBreakdown.holidayWorkedDays} days above the monthly requirement</p>
              </div>
              {payrollBreakdown.prepaidDays > 0 && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Paid Ahead</p>
                  <p className="mt-0.5 font-bold tabular-nums text-indigo-900">{fmt(payrollBreakdown.prepaidPay)}</p>
                  <p className="mt-0.5 text-[10px] text-indigo-700/70">{payrollBreakdown.prepaidDays} days in {payrollBreakdown.prepaidPeriod}</p>
                </div>
              )}
              {payOvertime && (
                <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Overtime Pay</p>
                  <p className="mt-0.5 font-bold tabular-nums text-cyan-900">{fmt(payrollBreakdown.overtimePay)}</p>
                  <p className="mt-0.5 text-[10px] text-cyan-700/70">{formatAttendanceDuration(overtimeMinutes)} at {fmtRate(payrollBreakdown.hourlyRate)}/hour</p>
                </div>
              )}
            </div>
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Gross Pay</span>
              <span className="text-base font-extrabold text-emerald-900 tabular-nums">{fmt(grossNum)}</span>
            </div>
            <div className="mt-3 rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Net Payable</span>
              <span className="text-base font-extrabold text-indigo-900 tabular-nums">{fmt(net)}</span>
            </div>
          </ModalSection>

          {/* Payment Details */}
          <ModalSection icon={Banknote} title="Payment Details" subtitle="How and where the salary is paid">
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Payment Mode <span className="text-rose-500">*</span></label>
                <SearchableSelect
                  options={PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))}
                  value={paymentMode}
                  onChange={setPaymentMode}
                />
              </div>

              {paymentMode === 'bank_transfer' && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Employee Bank Details</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-slate-500">Bank Name</span>
                    <span className="font-medium text-slate-800">{selectedEmp?.bankName || <span className="text-slate-400 italic">Not set</span>}</span>
                    <span className="text-slate-500">Account No.</span>
                    <span className="flex items-center gap-1.5 font-medium text-slate-800 font-mono">
                      {selectedEmp?.bankAccount ? (
                        <>
                          {selectedEmp.bankAccount}
                          <button
                            type="button"
                            onClick={() => { navigator.clipboard.writeText(selectedEmp.bankAccount); toast.success('Account number copied!'); }}
                            className="text-blue-400 hover:text-blue-600 transition-colors shrink-0"
                            title="Copy account number"
                          >
                            <Copy size={12} />
                          </button>
                        </>
                      ) : <span className="text-slate-400 italic">Not set</span>}
                    </span>
                  </div>
                </div>
              )}

              {paymentMode !== 'cash' && (
                <div>
                  <label className={labelCls}>Transaction Reference</label>
                  <input className={inputCls} value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="Cheque # / Transfer ID" />
                </div>
              )}

              <div>
                <label className={labelCls}>Notes</label>
                <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>
          </ModalSection>
          {isEditing && (
            <ModalSection icon={Pencil} title="Correction Reason" subtitle="Required for the owner audit trail" accent="indigo">
              <textarea
                rows={3}
                className={`${inputCls} resize-none`}
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                placeholder="Explain why this salary payment is being corrected…"
              />
            </ModalSection>
          )}
      </div>
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <div><p className="text-xs text-slate-500">{isEditing ? 'Updated net payable' : 'Net payable'}</p><p className="text-lg font-bold tabular-nums text-slate-900">{fmt(net)}</p></div>
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handlePay} disabled={saving || attendanceLoading || attendanceError} accent="indigo">{saving ? (isEditing ? 'Updating…' : 'Processing…') : `${isEditing ? 'Update' : 'Pay'} ${fmt(net)}`}</PrimaryButton>
        </div>
      </div>
    </div>
  );
};
