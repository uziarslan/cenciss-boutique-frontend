import clsx from 'clsx';
import { formatDateOnly, formatInTimeZone, formatTimeInTimeZone, formatTimeOfDay } from '../../utils/datetime';
import {
  arrivalOf, departureOf, differenceOf, durationDifference, checkInOf, hasMissingCheckout,
  formatMinutes, formatHours, stateOf, sourceOf, workedMinutesOf, summarizeAttendanceReview,
} from './attendanceDisplay';

export const TimingNote = ({ timing, prefix }) => timing.label !== '—' && (
  <p className={clsx('mt-1 text-xs font-medium', timing.tone)}>{prefix}{timing.label}</p>
);

export const AttendanceDayMetrics = ({ record }) => {
  const arrival = arrivalOf(record);
  const departure = departureOf(record);
  const difference = differenceOf(record);
  const time = (value) => formatTimeInTimeZone(value, record.timezone) || '—';
  const date = (value) => value ? formatInTimeZone(value, record.timezone, { day: 'numeric', month: 'short' }) : 'Not recorded';
  const cards = [
    { label: 'Saved shift', value: record.shiftStart && record.shiftEnd ? `${formatTimeOfDay(record.shiftStart)} – ${formatTimeOfDay(record.shiftEnd)}` : 'Not set', note: record.shiftStart && record.shiftEnd && record.shiftEnd <= record.shiftStart ? 'Ends next day' : 'Scheduled for this day' },
    { label: 'Check-in', value: time(checkInOf(record)), note: date(checkInOf(record)), timing: arrival },
    { label: 'Checkout', value: time(record.checkOutAt), note: hasMissingCheckout(record) ? 'Missing checkout' : date(record.checkOutAt), timing: departure },
    { label: 'Worked time', value: formatMinutes(workedMinutesOf(record)), note: record.scheduledHours == null ? 'No scheduled duration' : `${formatHours(record.scheduledHours)} scheduled` },
    { label: 'Difference', value: difference.label, note: 'Worked − scheduled time', tone: difference.tone },
  ];
  return <div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map((item) => <div key={item.label} className="min-w-0 rounded-xl bg-slate-50 p-3">
        <p className="text-xs font-medium text-slate-500">{item.label}</p>
        <p className={clsx('mt-2 text-sm font-bold tabular-nums', item.tone || 'text-slate-900')}>{item.value}</p>
        {item.timing && <TimingNote timing={item.timing} />}
        <p className="mt-1 text-xs text-slate-500">{item.note}</p>
      </div>)}
    </div>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
      <span>{sourceOf(record)}</span>
      <span>{record.status === 'approved' ? 'Approved' : 'Pending approval'}</span>
      {record.captureCount > 0 && <span>{record.captureCount} recorded {record.captureCount === 1 ? 'scan' : 'scans'}</span>}
      <span>{record.graceMinutes == null ? 'No recorded grace' : `Grace: ${formatMinutes(record.graceMinutes)}`}</span>
    </div>
    <p className="mt-2 text-xs text-slate-500">Difference compares total worked time with this day’s shift. Overtime measures time after shift end; grace does not change recorded hours.</p>
  </div>;
};

export const AttendanceReviewSummary = ({ records, month, todayKey }) => {
  const s = summarizeAttendanceReview(records, month, todayKey);
  const net = s.completed ? durationDifference(s.differenceMinutes).label : '—';
  const cards = [
    ['Present', s.present, `${s.missingCheckout} missing checkout`],
    ['Absent', s.absent, 'Explicitly recorded'],
    ['Leave / off', `${s.leave} / ${s.off}`, 'Recorded days'],
    ['No record', s.noRecord, 'Elapsed dates without an entry'],
    ['Late arrivals', s.late, `${formatMinutes(s.lateMinutes)} late · beyond grace`],
    ['Within grace', s.withinGrace, 'Late arrivals within allowance'],
    ['Early arrivals', s.earlyArrivals, `${formatMinutes(s.earlyArrivalMinutes)} before shift`],
    ['Early departures', s.earlyDepartures, `${formatMinutes(s.earlyDepartureMinutes)} before shift end`],
  ];
  return <div aria-label="Recorded attendance summary">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map(([label, value, note]) => <div key={label} className="rounded-xl border border-slate-100 p-3">
        <p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p>
      </div>)}
    </div>
    <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
      <p><span className="block text-xs text-slate-500">Worked time</span><strong>{formatMinutes(s.workedMinutes)}</strong></p>
      <p><span className="block text-xs text-slate-500">Overtime after shift</span><strong>{formatMinutes(s.overtimeMinutes)}</strong></p>
      <p><span className="block text-xs text-slate-500">Net difference</span><strong>{net}</strong></p>
    </div>
    <p className="mt-2 text-xs text-slate-500">Net difference covers {s.completed} completed {s.completed === 1 ? 'day' : 'days'} with a known shift. Missing times are excluded. No record does not confirm an absence.</p>
  </div>;
};

export const AttendanceReviewCalendar = ({ month, records, todayKey, selectedDate, onSelect, payrollLabel }) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(year, monthNumber - 1, 1).getDay();
  const days = new Date(year, monthNumber, 0).getDate();
  const byDate = new Map(records.map((record) => [record.date, record]));
  return <div>
    <div className="grid grid-cols-7 gap-1">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day} className="pb-2 text-center text-[10px] font-semibold text-slate-500">{day}</span>)}
      {Array.from({ length: start }, (_, i) => <div key={`empty-${i}`} />)}
      {Array.from({ length: days }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`;
        const record = byDate.get(date);
        const state = stateOf(record);
        const status = !record && date > todayKey ? 'Upcoming' : state.label;
        const arrival = arrivalOf(record);
        const departure = departureOf(record);
        const difference = differenceOf(record);
        const pay = payrollLabel?.(date, record);
        const compactStatus = { Present: 'P', Absent: 'A', Leave: 'L', 'Off duty': 'Off', 'Missing checkout': 'No out', 'No record': '—', Upcoming: 'Next' }[status] || status;
        const compactPay = pay?.replace('Pay: ', '').replace(' · edited', '*').replace('not selected', '—').replace('Off duty (paid)', 'Off').replace('On time', 'Paid');
        const title = [formatDateOnly(date), status, record && `In: ${arrival.label}`, record && `Out: ${departure.label}`, record && `Difference: ${difference.label}`, pay].filter(Boolean).join(' · ');
        return <button type="button" key={date} aria-label={title} title={title} aria-pressed={selectedDate === date} onClick={() => onSelect(date)}
          className={clsx('min-w-0 rounded-lg border px-1 py-2 text-left transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:px-2', state.style, selectedDate === date && 'ring-2 ring-indigo-500 ring-offset-1')}>
          <span className={clsx('block text-center text-xs font-bold sm:text-left', date === todayKey && 'underline underline-offset-4')}>{i + 1}</span>
          <span className="mt-1 block text-center text-[9px] font-semibold leading-tight sm:hidden">{compactStatus}</span>
          <span className="mt-1 hidden text-[11px] font-semibold leading-tight sm:block">{status}</span>
          {record && arrival.label !== '—' && <span className={clsx('mt-1 block text-center text-[8px] sm:hidden', arrival.tone)}>{record.lateMinutes > 0 ? 'Late' : record.earlyArrivalMinutes > 0 ? 'Early' : arrival.label === 'On time' ? 'On time' : '—'}</span>}
          {record && <div className="mt-1 hidden space-y-0.5 text-[10px] leading-snug sm:block">
            {arrival.label !== '—' && <p className={arrival.tone}>In: {arrival.label}</p>}
            {departure.label !== '—' && <p className={departure.tone}>Out: {departure.label}</p>}
            {difference.minutes != null && <p className={clsx('font-semibold', difference.tone)}>{difference.label}</p>}
          </div>}
          {pay && <span className="mt-1 block border-t border-current/10 pt-1 font-semibold leading-tight text-indigo-700"><span className="block text-center text-[8px] sm:hidden">{compactPay}</span><span className="hidden text-[10px] sm:block">{pay}</span></span>}
        </button>;
      })}
    </div>
    <p className="mt-2 text-[10px] text-slate-500 sm:hidden">P = present · A = absent · L = leave · No out = missing checkout · — = no record · Next = upcoming.{payrollLabel && ' Blue text shows the pay selection.'}</p>
    <p className="mt-3 text-xs text-slate-500">Choose a date for its full details. In = arrival · Out = departure. Today is underlined.</p>
  </div>;
};
