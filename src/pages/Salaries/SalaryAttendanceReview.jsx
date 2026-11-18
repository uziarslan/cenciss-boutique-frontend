import { useEffect, useRef, useState } from 'react';
import { AttendanceBadge } from '../Attendance/attendanceDisplay';
import { AttendanceDayMetrics, AttendanceReviewCalendar } from '../Attendance/attendanceReview';
import { normalizeSalaryAttendanceOverride, salaryAttendanceDisplayState } from './salaryAttendance';
import { formatDateOnly } from '../../utils/datetime';

const payLabels = { on_time: 'On time', late: 'Late', off: 'Off duty (paid)', absent: 'Unpaid' };

export default function SalaryAttendanceReview({ month, records, overrides, onToggle, todayKey, selectionOnly = false }) {
  const [editing, setEditing] = useState(false);
  const detailRef = useRef(null);
  const [inspectionCount, setInspectionCount] = useState(0);
  useEffect(() => {
    if (inspectionCount) detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [inspectionCount]);
  const [selectedDate, setSelectedDate] = useState(() => [...records].sort((a, b) => b.date.localeCompare(a.date))[0]?.date || `${month}-01`);
  const record = records.find((r) => r.date === selectedDate);
  const override = normalizeSalaryAttendanceOverride(overrides[selectedDate]);
  const label = (date, row) => {
    const manual = normalizeSalaryAttendanceOverride(overrides[date]);
    if (manual) return `Pay: ${payLabels[manual]} · edited`;
    if (selectionOnly) return 'Pay: not selected';
    const state = salaryAttendanceDisplayState(row);
    return `Pay: ${payLabels[state]}`;
  };
  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
      <div><p className="text-sm font-semibold text-slate-800">{editing ? 'Edit paid days' : 'Review attendance'}</p><p className="mt-1 text-xs text-slate-500">{editing ? 'Click a date to cycle On time → Late → Off duty → Unpaid. Recorded attendance stays unchanged.' : 'Select a date to inspect its times. Reviewing a day does not change salary.'}</p></div>
      <button type="button" aria-pressed={editing} onClick={() => setEditing((value) => !value)} className="shrink-0 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{editing ? 'Done editing days' : 'Edit paid days'}</button>
    </div>
    <AttendanceReviewCalendar month={month} records={records} todayKey={todayKey} selectedDate={selectedDate} payrollLabel={label} onSelect={(date) => {
      setSelectedDate(date);
      if (editing) onToggle(date);
      else setInspectionCount((count) => count + 1);
    }} />
    <section ref={detailRef} aria-label="Salary day attendance details" className="mt-4 rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">{formatDateOnly(selectedDate)}</h4>
        {record ? <AttendanceBadge record={record} /> : <span className="text-xs text-slate-500">{selectedDate > todayKey ? 'Upcoming' : 'No record'}</span>}
      </div>
      {record ? <AttendanceDayMetrics record={record} /> : <p className="text-sm text-slate-500">No recorded times for this date. A payroll selection does not create attendance.</p>}
      {record?.manualReason && <p className="mt-3 text-xs text-slate-600">Entry reason: {record.manualReason}{record.manualNotes ? ` · ${record.manualNotes}` : ''}</p>}
      {record?.recommendationReason && ['review', 'not_recommended'].includes(record.recommendation) && <p className="mt-3 text-xs text-amber-800">Review suggested: {record.recommendationReason}</p>}
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs font-semibold text-indigo-700">{label(selectedDate, record)}{override ? ' · Payroll choice only' : ''}</p>
    </section>
  </div>;
}
