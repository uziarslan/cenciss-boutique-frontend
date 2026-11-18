import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, ArrowLeft, CheckCircle, Download, Clock3 } from 'lucide-react';
import clsx from 'clsx';
import { getAttendanceByEmployee, markAttendanceRecordsApproved } from '../../api/attendanceApi';
import { baseApi, useGetOutletsQuery } from '../../store/baseApi';
import usePermissions from '../../hooks/usePermissions';
import useAuth from '../../hooks/useAuth';
import AttendanceShiftCorrectionForm from './AttendanceShiftCorrectionForm';
import { exportToCSV } from '../../utils/exportCSV';
import { formatDateOnly, formatTimeInTimeZone, formatTimeOfDay } from '../../utils/datetime';
import { getOutletBusinessDate } from '../../utils/businessDate';
import { AttendanceBadge, arrivalOf, checkInOf, departureOf, differenceOf, formatHours, formatMinutes, sourceOf } from './attendanceDisplay';
import { AttendanceDayMetrics, AttendanceReviewCalendar, AttendanceReviewSummary, TimingNote } from './attendanceReview';
import { isLateAttendance } from '../../utils/attendanceGrace';

const fmtDate = (v) => formatDateOnly(v) || '—';
const fmtTime = (v, timezone) => formatTimeInTimeZone(v, timezone) || '—';

const monthLabel = (yyyymm) => formatDateOnly(`${yyyymm}-01`, { month: 'short', year: 'numeric' }) || yyyymm;

const toYyyyMm = (date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const shiftMonth = (yyyymm, delta) => {
  const [y, m] = yyyymm.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return toYyyyMm(dt);
};

const AttendanceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { has } = usePermissions();
  const { role } = useAuth();
  const { data: outlets = [] } = useGetOutletsQuery();
  const canManage = has('attendance.manage');

  const decoded = decodeURIComponent(id || '');
  const parts = decoded.split(':');
  const employeeId = parts[0] || null;
  const initialDateKey = parts.slice(1).join(':') || null;

  const defaultMonth = initialDateKey ? initialDateKey.slice(0, 7) : toYyyyMm(new Date());

  const [month, setMonth] = useState(defaultMonth);
  const [rows, setRows] = useState([]);
  const [employeeMeta, setEmployeeMeta] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedDate, setSelectedDate] = useState(initialDateKey || `${defaultMonth}-01`);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [marking, setMarking] = useState(false);
  const [correctingShift, setCorrectingShift] = useState(false);
  const reportClock = selected || rows[0]
    || outlets.find((outlet) => outlet.code === employeeMeta?.outletCode);
  const todayKey = getOutletBusinessDate(reportClock);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!employeeId) {
        toast.error('Invalid attendance id');
        navigate('/attendance');
        return;
      }
      try {
        setLoading(true);
        setLoadError(false);
        const res = await getAttendanceByEmployee(employeeId, { month });
        if (cancelled) return;
        const data = res.data?.data || [];
        setRows(data);
        setEmployeeMeta(res.data?.meta?.employee || null);
        const date = initialDateKey?.startsWith(month) ? initialDateKey : (data[0]?.date || `${month}-01`);
        const found = data.find((r) => r.date === date) || null;
        setSelected(found);
        setSelectedDate(date);
      } catch (e) {
        if (!cancelled) { setLoadError(true); setRows([]); setSelected(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [employeeId, month, initialDateKey, navigate, retryCount]);

  const selectDate = (date) => {
    setSelectedDate(date);
    setSelected(rows.find((row) => row.date === date) || null);
    document.getElementById('attendance-day')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const handlePrev = () => setMonth((m) => shiftMonth(m, -1));
  const handleNext = () => setMonth((m) => shiftMonth(m, 1));
  const handleExport = () => {
    if (!rows.length) return toast.error('No attendance records to export.');
    exportToCSV(rows.map((row) => ({
      BusinessDate: row.date,
      Employee: row.employeeName,
      Outlet: row.outletName,
      ShiftStart: row.shiftStart,
      ShiftEnd: row.shiftEnd,
      CheckIn: row.checkInAt ? fmtTime(row.checkInAt, row.timezone) : '',
      Checkout: row.checkOutAt ? fmtTime(row.checkOutAt, row.timezone) : '',
      State: row.attendanceState,
      LateMinutes: row.lateMinutes ?? '',
      GraceMinutes: row.graceMinutes ?? '',
      LateBeyondGrace: row.lateMinutes == null ? '' : isLateAttendance(row),
      EarlyDepartureMinutes: row.earlyDepartureMinutes ?? '',
      OvertimeMinutes: row.overtimeMinutes ?? '',
      WorkedHours: row.workedHours ?? '',
      DifferenceMinutes: differenceOf(row).minutes ?? '',
      Arrival: arrivalOf(row).label,
      Departure: departureOf(row).label,
      MissingCheckout: row.missingCheckout ? 'Yes' : 'No',
      Source: row.manualOverride ? 'Manual override' : row.recognitionMethod,
      Reason: row.manualReason || '',
      ShiftCorrectionReason: row.shiftCorrection?.reason || '',
    })), `attendance-${String(rows[0]?.employeeName || 'employee').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${month}`);
  };

  const handleMarkApproved = async () => {
    if (!selected) return;
    try {
      setMarking(true);
      await markAttendanceRecordsApproved([{ attendanceIds: selected.attendanceIds || [] }]);
      dispatch(baseApi.util.invalidateTags(['Attendance']));
      toast.success('Marked approved');
      const res = await getAttendanceByEmployee(employeeId, { month });
      setRows(res.data?.data || []);
      setEmployeeMeta(res.data?.meta?.employee || null);
      setSelected((prev) => (res.data?.data || []).find((r) => r.id === prev?.id) || null);
    } catch (e) {
      toast.error('Failed to mark approved');
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return <div role="alert" className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><p className="font-semibold text-slate-800">Attendance could not be loaded.</p><p className="mt-1 text-sm text-slate-500">Try again before reviewing this employee’s records.</p><button type="button" onClick={() => setRetryCount((value) => value + 1)} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Try again</button></div>;
  }

  const person = selected || rows[0];
  const employeeName = employeeMeta?.name || person?.employeeName || 'Employee attendance';
  const outletName = selected?.outletName || employeeMeta?.outletName || person?.outletName;
  const selectedIsFuture = selectedDate > todayKey;
  const outlet = outlets.find((item) => item.code === (selected?.outletCode || employeeMeta?.outletCode || person?.outletCode));
  const backTo = location.state?.attendanceReturnTo;
  const entryUrl = '/attendance/entry?mode=bulk&month=' + month + (outlet ? '&outlet=' + encodeURIComponent(outlet._id) : '');
  const approvalCount = rows.filter((row) => row.status === 'approved').length;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button type="button" onClick={() => navigate(backTo?.startsWith('/attendance?') ? backTo : '/attendance')} className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500"><ArrowLeft size={16} /> Back to Attendance</button>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleExport} disabled={!rows.length} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40"><Download size={14} /> Export month</button>
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1">
            <button type="button" onClick={handlePrev} aria-label="Previous month" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronLeft size={16} /></button>
            <span className="min-w-28 px-3 text-center text-sm font-semibold text-slate-700">{monthLabel(month)}</span>
            <button type="button" onClick={handleNext} aria-label="Next month" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Employee attendance</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{employeeName}</h1>
          <p className="mt-1 text-sm text-slate-500">{[employeeMeta?.designation || person?.designation, employeeMeta?.department || person?.department, outletName].filter(Boolean).join(' · ')}</p>
        </div>
        {canManage && <button type="button" onClick={() => navigate(entryUrl)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Open attendance sheet</button>}
      </header>

      <section id="attendance-day" aria-label="Selected day details" className="scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><p className="text-xs text-slate-500">Selected date</p><h2 className="mt-0.5 text-lg font-semibold text-slate-900">{fmtDate(selectedDate)}</h2></div>
          <div className="flex flex-wrap items-center gap-2">
            {selected && role === 'owner' && <button type="button" onClick={() => setCorrectingShift(true)} disabled={marking} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"><Clock3 size={14} />Use updated shift time</button>}
            {selected ? <><AttendanceBadge record={selected} /><span className="text-xs text-slate-500">{selected.status === 'approved' ? 'Approved' : 'Pending approval'}</span></> : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{selectedIsFuture ? 'Upcoming' : 'No record'}</span>}
            {selected && canManage && selected.status !== 'approved' && <button type="button" disabled={marking} onClick={handleMarkApproved} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle size={14} />{marking ? 'Approving…' : 'Approve record'}</button>}
          </div>
        </div>
        {selected ? <div className="p-5">
          <AttendanceDayMetrics record={selected} />
          {selected.shiftCorrection && <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800"><p className="font-semibold">Shift corrected for this day</p><p className="mt-1">{selected.shiftCorrection.reason}</p></div>}
          {selected.selfieUrl && <a href={selected.selfieUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-indigo-600 hover:underline">View check-in photo</a>}
          {['review', 'not_recommended'].includes(selected.recommendation) && selected.recommendationReason && <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span className="font-semibold">Review suggested: </span>{selected.recommendationReason.replace(/(\d+) minutes/g, (_, minutes) => formatMinutes(minutes))}</div>}
          {selected.manualOverride && <div className="mt-4 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600"><p><span className="font-semibold text-slate-800">Entry reason: </span>{selected.manualReason || 'Not provided'}</p>{selected.manualNotes && <p className="mt-1">{selected.manualNotes}</p>}</div>}
          <p className="mt-4 text-xs text-slate-500">Check-in and checkout dates are shown in the outlet’s local time. An overnight shift belongs to its business date.</p>
        </div> : <div className="px-5 py-8">
          <p className="font-semibold text-slate-800">{selectedIsFuture ? 'No attendance recorded yet for this upcoming date.' : 'No attendance entry for this date.'}</p>
          <p className="mt-1 text-sm text-slate-500">{selectedIsFuture ? 'Choose a recorded day from the calendar to review its times.' : 'This is not a confirmed absence. Select another day, or use the attendance sheet to record the correct details.'}</p>
          {employeeMeta?.shiftStart && employeeMeta?.shiftEnd && <p className="mt-4 text-sm text-slate-600">Employee’s current shift: {formatTimeOfDay(employeeMeta.shiftStart)} – {formatTimeOfDay(employeeMeta.shiftEnd)}{employeeMeta.shiftEnd <= employeeMeta.shiftStart ? ' (ends next day)' : ''}</p>}
        </div>}
      </section>

      {correctingShift && selected && role === 'owner' && <AttendanceShiftCorrectionForm
        employeeId={employeeId} businessDate={selectedDate} onClose={() => setCorrectingShift(false)}
        onSaved={(record) => {
          setRows((current) => current.map((row) => row.id === record.id ? record : row));
          setSelected(record);
          setCorrectingShift(false);
          dispatch(baseApi.util.invalidateTags(['Attendance', 'SalaryPayment', 'Report']));
        }}
      />}

      <section aria-label="Monthly attendance summary" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="font-semibold text-slate-900">Month overview · {monthLabel(month)}</h2><p className="mt-1 text-xs text-slate-500">{approvalCount} of {rows.length} records approved</p></div>
        </div>
        <AttendanceReviewSummary records={rows} month={month} todayKey={todayKey} />
        <div className="mt-6 space-y-6">
          <div><h3 className="text-sm font-semibold text-slate-800">Choose a day</h3><p className="mb-4 mt-1 text-xs text-slate-500">Arrival, departure and net difference for each recorded day.</p><AttendanceReviewCalendar month={month} records={rows} todayKey={todayKey} selectedDate={selectedDate} onSelect={selectDate} /></div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">Daily records</h3><p className="mb-3 mt-1 text-xs text-slate-500">Check-in, checkout and worked time for each business date.</p>
            {rows.length ? <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr>{['Date', 'Check-in', 'Checkout', 'Worked / difference', 'Attendance'].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{[...rows].sort((a, b) => b.date.localeCompare(a.date)).map((row) => <tr key={row.id} className={clsx('cursor-pointer hover:bg-slate-50', selectedDate === row.date && 'bg-indigo-50/60')} onClick={() => selectDate(row.date)}>
                <td className="px-3 py-3 align-top"><button type="button" aria-pressed={selectedDate === row.date} aria-label={'View ' + fmtDate(row.date)} onClick={(event) => { event.stopPropagation(); selectDate(row.date); }} className="whitespace-nowrap rounded font-semibold text-indigo-700 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500">{formatDateOnly(row.date, { day: 'numeric', month: 'short' })}</button><p className="mt-1 text-xs text-slate-500">{sourceOf(row)}</p></td>
                <td className="px-3 py-3 align-top tabular-nums"><p>{fmtTime(checkInOf(row), row.timezone)}</p><TimingNote timing={arrivalOf(row)} /></td>
                <td className="px-3 py-3 align-top tabular-nums"><p>{fmtTime(row.checkOutAt, row.timezone)}</p><TimingNote timing={departureOf(row)} /></td>
                <td className="px-3 py-3 align-top font-medium tabular-nums">{formatHours(row.workedHours)}<TimingNote timing={differenceOf(row)} /></td>
                <td className="px-3 py-3 align-top"><AttendanceBadge record={row} /></td>
              </tr>)}</tbody>
            </table></div> : <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">No recorded attendance in {monthLabel(month)}.</div>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AttendanceDetail;
