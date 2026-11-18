import clsx from 'clsx';
import { formatDateOnly, formatInTimeZone, formatTimeInTimeZone, formatTimeOfDay } from '../../utils/datetime';
import { arrivalWithinGrace, departureWithinGrace, isLateAttendance } from '../../utils/attendanceGrace';

export const isWorkingRecord = (row) => Boolean(row) && ['present', 'incomplete'].includes(row.attendanceState || 'present');
export const checkInOf = (row) => row?.checkInAt || row?.firstCapturedAt;
export const hasMissingCheckout = (row) => isWorkingRecord(row) && Boolean(row?.missingCheckout || row?.attendanceState === 'incomplete' || (checkInOf(row) && !row?.checkOutAt));

export const formatMinutes = (value) => {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const minutes = Math.max(0, Math.round(Number(value)));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
};
export const formatHours = (value) => value == null ? '—' : formatMinutes(Number(value) * 60);

export const arrivalOf = (row) => {
  if (!isWorkingRecord(row) || !checkInOf(row)) return { label: '—', tone: 'text-slate-400' };
  if (!row.shiftStart || (row.lateMinutes == null && row.earlyArrivalMinutes == null)) return { label: 'Shift unavailable', tone: 'text-slate-500' };
  if (arrivalWithinGrace(row)) return { label: `${formatMinutes(row.lateMinutes)} late · within grace`, tone: 'text-emerald-700' };
  if (row.lateMinutes > 0) return { label: `${formatMinutes(row.lateMinutes)} late`, tone: 'text-rose-600' };
  if (row.earlyArrivalMinutes > 0) return { label: `${formatMinutes(row.earlyArrivalMinutes)} early`, tone: 'text-emerald-700' };
  return { label: 'On time', tone: 'text-slate-700' };
};

export const departureLabel = (row) => row?.earlyDepartureMinutes > 0
  ? `Left ${formatMinutes(row.earlyDepartureMinutes)} early${departureWithinGrace(row) ? ' · within grace' : ''}`
  : '';

export const departureOf = (row) => {
  if (!isWorkingRecord(row) || !row.checkOutAt) return { label: '—', tone: 'text-slate-400' };
  if (!row.shiftEnd || (row.earlyDepartureMinutes == null && row.overtimeMinutes == null)) return { label: 'Shift unavailable', tone: 'text-slate-500' };
  if (row.earlyDepartureMinutes > 0) return {
    label: `${formatMinutes(row.earlyDepartureMinutes)} early${departureWithinGrace(row) ? ' · within grace' : ''}`,
    tone: departureWithinGrace(row) ? 'text-emerald-700' : 'text-amber-700',
  };
  if (row.overtimeMinutes > 0) return { label: `${formatMinutes(row.overtimeMinutes)} overtime`, tone: 'text-cyan-700' };
  return { label: 'On time', tone: 'text-slate-700' };
};

const finiteMinutes = (value) => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
export const workedMinutesOf = (row) => {
  if (!isWorkingRecord(row) || !checkInOf(row) || !row.checkOutAt || hasMissingCheckout(row)) return null;
  if (finiteMinutes(row.workedMinutes)) return Math.round(Number(row.workedMinutes));
  if (finiteMinutes(row.workedHours)) return Math.round(Number(row.workedHours) * 60);
  return null;
};
export const differenceOf = (row) => {
  const worked = workedMinutesOf(row);
  if (worked == null) return { minutes: null, label: hasMissingCheckout(row) ? 'Awaiting checkout' : '—', tone: 'text-slate-500' };
  if (!finiteMinutes(row.scheduledHours) || Number(row.scheduledHours) <= 0) return { minutes: null, label: 'Shift unavailable', tone: 'text-slate-500' };
  return durationDifference(worked - Math.round(Number(row.scheduledHours) * 60));
};
export const durationDifference = (minutes) => ({
  minutes,
  label: minutes === 0 ? 'As scheduled' : `${formatMinutes(Math.abs(minutes))} ${minutes > 0 ? 'extra' : 'short'}`,
  tone: minutes < 0 ? 'text-rose-600' : minutes > 0 ? 'text-cyan-700' : 'text-emerald-700',
});

// Use each day's reported shift and metrics; never substitute today's employee shift.
export const summarizeAttendanceReview = (records, month, todayKey) => {
  const rows = records.filter((row) => row.date?.startsWith(`${month}-`));
  const working = rows.filter(isWorkingRecord);
  const arrivals = working.filter(checkInOf);
  const departures = working.filter((row) => row.checkOutAt);
  const completed = working.filter((row) => differenceOf(row).minutes != null);
  const total = (list, field) => list.reduce((sum, row) => sum + Math.max(0, Number(row[field]) || 0), 0);
  const [year, monthNumber] = month.split('-').map(Number);
  const elapsed = month > todayKey.slice(0, 7) ? 0 : month === todayKey.slice(0, 7) ? Number(todayKey.slice(8, 10)) : new Date(year, monthNumber, 0).getDate();
  return {
    present: working.length,
    absent: rows.filter((r) => r.attendanceState === 'absent').length,
    leave: rows.filter((r) => r.attendanceState === 'leave').length,
    off: rows.filter((r) => r.attendanceState === 'off').length,
    noRecord: Math.max(0, elapsed - new Set(rows.filter((r) => r.date <= todayKey).map((r) => r.date)).size),
    missingCheckout: working.filter(hasMissingCheckout).length,
    late: arrivals.filter((r) => isLateAttendance(r)).length,
    lateMinutes: total(arrivals.filter((r) => isLateAttendance(r)), 'lateMinutes'),
    withinGrace: arrivals.filter(arrivalWithinGrace).length,
    earlyArrivals: arrivals.filter((r) => r.earlyArrivalMinutes > 0).length,
    earlyArrivalMinutes: total(arrivals, 'earlyArrivalMinutes'),
    earlyDepartures: departures.filter((r) => r.earlyDepartureMinutes > 0).length,
    earlyDepartureMinutes: total(departures, 'earlyDepartureMinutes'),
    overtimeMinutes: total(departures, 'overtimeMinutes'),
    workedMinutes: working.reduce((sum, r) => sum + (workedMinutesOf(r) ?? 0), 0),
    completed: completed.length,
    differenceMinutes: completed.reduce((sum, r) => sum + differenceOf(r).minutes, 0),
  };
};

export const stateOf = (row) => {
  if (!row) return { label: 'No record', style: 'bg-slate-100 text-slate-500 border-slate-200' };
  if (row.attendanceState === 'absent') return { label: 'Absent', style: 'bg-rose-50 text-rose-700 border-rose-200' };
  if (row.attendanceState === 'leave') return { label: 'Leave', style: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (row.attendanceState === 'off') return { label: 'Off duty', style: 'bg-slate-100 text-slate-600 border-slate-200' };
  if (hasMissingCheckout(row)) return { label: 'Missing checkout', style: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { label: 'Present', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
};

export const sourceOf = (row) => row?.manualOverride
  ? (row.recognitionMethod === 'mixed' ? 'Manual + scans' : 'Manual entry')
  : ({ device: 'Terminal', mixed: 'Mixed sources', manual: 'Manual entry', faceid: 'Face recognition' }[row?.recognitionMethod] || 'Recorded attendance');

export const AttendanceBadge = ({ record }) => {
  const state = stateOf(record);
  return <span className={clsx('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap', state.style)}>{state.label}</span>;
};

export const ScanTime = ({ value, timezone, date, empty = 'Not recorded' }) => (
  <div className="whitespace-nowrap">
    <p className="font-semibold tabular-nums text-slate-800">{formatTimeInTimeZone(value, timezone) || '—'}</p>
    <p className="mt-1 text-xs text-slate-500">{value ? (date ? formatDateOnly(date, { day: 'numeric', month: 'short' }) : formatInTimeZone(value, timezone, { day: 'numeric', month: 'short' })) : empty}</p>
  </div>
);

export const ShiftTime = ({ start, end }) => (
  <div className="whitespace-nowrap">
    <p className="font-medium tabular-nums text-slate-700">{start && end ? `${formatTimeOfDay(start)} – ${formatTimeOfDay(end)}` : 'Not set'}</p>
    <p className="mt-1 text-xs text-slate-500">{start && end && end <= start ? 'Ends next day' : 'Scheduled shift'}</p>
  </div>
);
