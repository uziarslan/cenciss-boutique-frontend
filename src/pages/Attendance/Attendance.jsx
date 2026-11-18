import { useEffect, useMemo, useState, useRef } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router';
import { format } from 'date-fns';
import clsx from 'clsx';
import { ScanFace, RefreshCw, CheckCircle2, AlertCircle, Clock, Wifi, CalendarPlus, Download } from 'lucide-react';
import { io as ioClient } from 'socket.io-client';
import toast from 'react-hot-toast';
import usePermissions from '../../hooks/usePermissions';
import { useGetOutletsQuery, useGetAttendanceRecordsQuery, listQueryOpts } from '../../store/baseApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import Button from '../../components/UI/Button';
import FilterBar from '../../components/UI/FilterBar';
import useQueryState from '../../hooks/useQueryState';
import { getAttendanceEmployees } from '../../api/attendanceApi';
import { exportToCSV } from '../../utils/exportCSV';
import { resolveBusinessDate } from '../../utils/businessDate';
import { formatDateOnly, formatInTimeZone } from '../../utils/datetime';
import { AttendanceBadge, ScanTime, ShiftTime, arrivalOf, checkInOf, departureOf, differenceOf, formatHours, hasMissingCheckout, isWorkingRecord, sourceOf } from './attendanceDisplay';
import { TimingNote } from './attendanceReview';
import { isLateAttendance } from '../../utils/attendanceGrace';

const formatDateTime = (value, timezone) => formatInTimeZone(value, timezone, {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
}) || '—';

const validBusinessDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const dateInputClass = 'min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition';

const Attendance = () => {
  const { has } = usePermissions();
  const [selectedDate, setSelectedDate] = useQueryState('date', () => format(new Date(), 'yyyy-MM-dd'));
  const [period, setPeriod] = useQueryState('period', 'day');
  const [endDate, setEndDate] = useQueryState('to', '');
  const [selectedOutlet, setSelectedOutlet] = useQueryState('outlet', '');
  const [search, setSearch] = useQueryState('search', '');
  const [recommendationFilter, setRecommendationFilter] = useQueryState('recommendation', '');
  const [arrivalFilter, setArrivalFilter] = useQueryState('arrival', '');
  const [sort, setSort] = useQueryState('sort', 'time');
  const [recordFilter, setRecordFilter] = useQueryState('records', '');
  const { data: outlets = [] } = useGetOutletsQuery();

  const canView = has('attendance.view') || has('attendance.manage');
  const canManage = has('attendance.manage');
  const navigate = useNavigate();
  const location = useLocation();
  const openReport = (id) => navigate(`/attendance/${encodeURIComponent(id)}`, { state: { attendanceReturnTo: `${location.pathname}${location.search}` } });

  const [liveRefresh, setLiveRefresh] = useState(true);
  const [reportEmployees, setReportEmployees] = useState([]);
  const socketRef = useRef(null);
  const businessDefaultApplied = useRef(false);

  const periodMode = ['month', 'range'].includes(period) ? period : 'day';
  const rangeStart = periodMode === 'month' ? `${selectedDate.slice(0, 7)}-01` : selectedDate;
  const rangeEnd = useMemo(() => {
    if (periodMode === 'range') return endDate || selectedDate;
    if (periodMode !== 'month' || !validBusinessDate(rangeStart)) return selectedDate;
    const lastDay = new Date(`${rangeStart}T00:00:00.000Z`);
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
    return lastDay.toISOString().slice(0, 10);
  }, [periodMode, selectedDate, endDate, rangeStart]);
  const dateError = !validBusinessDate(rangeStart) || !validBusinessDate(rangeEnd)
    ? 'Choose valid dates.'
    : rangeStart > rangeEnd ? 'End date must be on or after start date.' : '';
  const multipleDays = rangeStart !== rangeEnd;
  const periodLabel = dateError ? 'Select a valid period' : periodMode === 'month'
    ? formatDateOnly(rangeStart, { month: 'long', year: 'numeric' })
    : multipleDays ? `${formatDateOnly(rangeStart)} – ${formatDateOnly(rangeEnd)}`
      : formatDateOnly(rangeStart, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  useEffect(() => {
    if (businessDefaultApplied.current || !outlets.length) return;
    businessDefaultApplied.current = true;
    if (!new URLSearchParams(location.search).has('date')) {
      setSelectedDate(resolveBusinessDate(outlets, selectedOutlet));
    }
  }, [outlets, selectedOutlet, setSelectedDate, location.search]);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    getAttendanceEmployees(selectedOutlet ? { outlet: selectedOutlet } : {})
      .then((response) => { if (!cancelled) setReportEmployees(response.data?.data || []); })
      .catch(() => { if (!cancelled) setReportEmployees([]); });
    return () => { cancelled = true; };
  }, [canView, selectedOutlet]);

  const queryParams = useMemo(() => {
    const params = periodMode === 'day' ? { date: selectedDate } : { from: rangeStart, to: rangeEnd };
    if (selectedOutlet) params.outlet = selectedOutlet;
    return params;
  }, [selectedDate, selectedOutlet, periodMode, rangeStart, rangeEnd]);

  const { currentData: payload, isFetching, isError, refetch } = useGetAttendanceRecordsQuery(
    queryParams,
    { ...listQueryOpts, skip: !canView || Boolean(dateError) },
  );
  const loading = isFetching && !payload;
  // /attendance/records returns `{ data: [...] }`; the cached payload is that
  // inner array directly.
  const rows = useMemo(() => dateError ? [] : payload ?? [], [payload, dateError]);
  const visibleRows = useMemo(() => rows.filter((row) => {
    const q = search.trim().toLowerCase();
    const late = isLateAttendance(row);
    const early = Number(row.earlyArrivalMinutes || 0);
    return (!q || `${row.employee?.name || row.employeeName || row.name || ''} ${row.employee?.employeeNumber || row.employeeNumber || ''} ${row.outlet?.name || row.outletName || ''}`.toLowerCase().includes(q))
      && (!recommendationFilter || row.recommendation === recommendationFilter)
      && (!arrivalFilter || (isWorkingRecord(row) && checkInOf(row) && (arrivalFilter === 'late' ? late : arrivalFilter === 'early' ? early > 0 : row.lateMinutes != null && !late && early <= 0)))
      && (!recordFilter || (recordFilter === 'missing' ? hasMissingCheckout(row) : recordFilter === 'manual' ? row.manualOverride : row.attendanceState === recordFilter));
  }).sort((a, b) => {
    if (sort === 'name') return String(a.employee?.name || a.employeeName || a.name || '').localeCompare(String(b.employee?.name || b.employeeName || b.name || ''));
    if (sort === 'lateHigh') return Number(b.lateMinutes || 0) - Number(a.lateMinutes || 0);
    return new Date(a.firstCapturedAt || 0) - new Date(b.firstCapturedAt || 0);
  }), [rows, search, recommendationFilter, arrivalFilter, sort, recordFilter]);

  useEffect(() => {
    if (!canView || !liveRefresh || dateError) return undefined;

    const socketUrl = process.env.REACT_APP_API_URL || window.location.origin;
    const socket = ioClient(socketUrl, { withCredentials: true });
    socketRef.current = socket;

    socket.on('attendance:created', (event) => {
      try {
        const eventDate = event?.businessDate || (event?.capturedAt ? new Date(event.capturedAt).toISOString().slice(0, 10) : null);
        if (eventDate >= rangeStart && eventDate <= rangeEnd) refetch();
      } catch (e) { /* ignore */ }
    });
    socket.on('attendance:updated', (event) => {
      if (event?.businessDate >= rangeStart && event?.businessDate <= rangeEnd) refetch();
    });

    return () => {
      try {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      } catch (e) {}
    };
  }, [canView, rangeStart, rangeEnd, dateError, liveRefresh, refetch]);

  const summary = useMemo(() => {
    const present = rows.filter(isWorkingRecord).length;
    const late = rows.filter((row) => isWorkingRecord(row) && checkInOf(row) && isLateAttendance(row)).length;
    const incomplete = rows.filter(hasMissingCheckout).length;
    const manual = rows.filter((row) => row.manualOverride).length;
    return { present, late, incomplete, manual };
  }, [rows]);

  const handleRefresh = () => {
    if (!dateError) refetch();
  };
  const hasFilters = Boolean(search || recommendationFilter || arrivalFilter || recordFilter);
  const clearFilters = () => { setSearch(''); setRecommendationFilter(''); setArrivalFilter(''); setRecordFilter(''); };

  const handleExport = () => {
    if (!visibleRows.length) return toast.error('No attendance records to export.');
    exportToCSV(visibleRows.map((row) => ({
      BusinessDate: row.date,
      Employee: row.employeeName,
      Outlet: row.outletName,
      ShiftStart: row.shiftStart,
      ShiftEnd: row.shiftEnd,
      CheckIn: row.checkInAt ? formatDateTime(row.checkInAt, row.timezone) : '',
      Checkout: row.checkOutAt ? formatDateTime(row.checkOutAt, row.timezone) : '',
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
      OverrideReason: row.manualReason || '',
    })), `attendance-${rangeStart}${multipleDays ? `-to-${rangeEnd}` : ''}`);
  };

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={ScanFace}
        eyebrow="Team"
        title="Attendance"
        subtitle="Review attendance by day, month or date range, and follow up on missing entries."
        accent="indigo"
        compact
        actions={(
          <div className="flex items-center gap-2 flex-wrap">
            {canManage && <Button variant="secondary" icon={CalendarPlus} onClick={() => navigate(`/attendance/entry?mode=bulk${selectedOutlet ? `&outlet=${encodeURIComponent(selectedOutlet)}` : ''}&month=${encodeURIComponent(selectedDate.slice(0, 7))}`)}>Enter attendance</Button>}
            <Button variant="secondary" icon={Download} disabled={Boolean(dateError) || loading} onClick={handleExport}>Export</Button>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 px-3 py-2 rounded-xl bg-white border border-gray-200 shadow-sm cursor-pointer">
              <Wifi size={13} className={clsx(liveRefresh ? 'text-emerald-500' : 'text-gray-400')} />
              <input
                type="checkbox"
                checked={liveRefresh}
                onChange={() => setLiveRefresh((v) => !v)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Auto-refresh
            </label>
            <Button variant="primary" icon={RefreshCw} disabled={isFetching || Boolean(dateError)} onClick={handleRefresh}>
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        )}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: multipleDays ? 'Present days' : 'Present', value: summary.present, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Late arrivals', value: summary.late, icon: Clock, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'Missing Checkout', value: summary.incomplete, icon: AlertCircle,  color: 'text-amber-600',   bg: 'bg-amber-50'   },
          { label: 'Manual entries', value: summary.manual,     icon: CalendarPlus, color: 'text-indigo-600',    bg: 'bg-indigo-50'    },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon size={16} className={s.color} />
            </div>
            <div className="min-w-0">
              <p className={clsx('text-xl font-bold leading-tight tabular-nums', s.color)}>
                {loading || isError || dateError ? '—' : s.value}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-widest">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <FilterBar>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee or outlet…" className="min-w-[240px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <div data-filter-always-visible className="flex flex-col gap-1">
          <label htmlFor="attendance-period" className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Period</label>
          <select id="attendance-period" value={periodMode} onChange={(event) => setPeriod(event.target.value)} className={dateInputClass}>
            <option value="day">Single day</option>
            <option value="month">Whole month</option>
            <option value="range">Date range</option>
          </select>
        </div>
        <div data-filter-always-visible className="flex flex-col gap-1">
          <label htmlFor="attendance-date" className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{periodMode === 'month' ? 'Month' : periodMode === 'range' ? 'From' : 'Date'}</label>
          <input
            id="attendance-date"
            type={periodMode === 'month' ? 'month' : 'date'}
            value={periodMode === 'month' ? selectedDate.slice(0, 7) : selectedDate}
            onChange={(event) => { if (event.target.value) setSelectedDate(periodMode === 'month' ? `${event.target.value}-01` : event.target.value); }}
            className={dateInputClass}
          />
        </div>
        {periodMode === 'range' && <div data-filter-always-visible className="flex flex-col gap-1">
          <label htmlFor="attendance-end-date" className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">To</label>
          <input id="attendance-end-date" type="date" min={rangeStart} value={rangeEnd} onChange={(event) => { if (event.target.value) setEndDate(event.target.value); }} className={dateInputClass} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? 'attendance-date-error' : undefined} />
        </div>}
        <div className="min-w-[190px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'All recommendations' }, { value: 'approve', label: 'Recommended' }, { value: 'review', label: 'Needs review' }, { value: 'not_recommended', label: 'Not recommended' }]} value={recommendationFilter} onChange={setRecommendationFilter} /></div>
        <div className="min-w-[170px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'Any arrival timing' }, { value: 'late', label: 'Late arrivals' }, { value: 'early', label: 'Early arrivals' }, { value: 'on-time', label: 'On time' }]} value={arrivalFilter} onChange={setArrivalFilter} /></div>
        <div className="min-w-[170px]"><SearchableSelect searchable={false} options={[{ value: 'time', label: 'Check-in time' }, { value: 'name', label: 'Employee name' }, { value: 'lateHigh', label: 'Most late first' }]} value={sort} onChange={setSort} /></div>
        <div data-filter-always-visible className="flex flex-col gap-1 min-w-[200px]">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Outlet</label>
          <SearchableSelect
            options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
            value={selectedOutlet}
            onChange={setSelectedOutlet}
            searchPlaceholder="Search outlets…"
          />
        </div>
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'All records' }, { value: 'missing', label: 'Missing checkout' }, { value: 'manual', label: 'Manual entries' }, { value: 'absent', label: 'Marked absent' }, { value: 'leave', label: 'Leave' }, { value: 'off', label: 'Off duty' }]} value={recordFilter} onChange={setRecordFilter} /></div>
        <div data-filter-always-visible className="flex min-w-[210px] flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Employee report</label>
          <SearchableSelect
            options={reportEmployees.map((employee) => ({ value: employee._id, label: employee.name, meta: employee.designation || '' }))}
            value=""
            onChange={(employeeId) => employeeId && openReport(`${employeeId}:${selectedDate}`)}
            placeholder="Open employee report…"
            searchPlaceholder="Search employees…"
          />
        </div>
        {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
      </FilterBar>

      {/* Records table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Attendance Records</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {periodLabel} · {dateError ? 'Check dates' : loading ? 'Loading…' : isError ? 'Could not load records' : `${visibleRows.length} of ${rows.length} records`}
            </p>
            <p className="mt-1 text-xs text-slate-500">Times are local to each outlet. Overnight check-ins stay with their attendance day.</p>
            {multipleDays && <p className="mt-1 text-xs text-slate-500">Totals count attendance days across employees, not unique employees.</p>}
          </div>
        </div>

        {dateError ? (
          <p id="attendance-date-error" role="alert" className="px-5 py-12 text-center text-sm text-rose-600">{dateError}</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          </div>
        ) : isError ? (
          <div role="alert" className="px-5 py-12 text-center"><p className="text-sm text-slate-600">Attendance could not be loaded.</p><Button variant="secondary" className="mt-3" onClick={handleRefresh}>Try again</Button></div>
        ) : visibleRows.length === 0 ? (
          <div className="px-5 py-16 text-center text-gray-400">
            <ScanFace size={36} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-slate-500">{hasFilters ? 'No records match these filters.' : multipleDays ? 'No attendance recorded for this period.' : 'No attendance recorded for this date.'}</p>
            <p className="text-xs mt-1">{hasFilters ? 'Clear filters to see all records for the selected period and outlet.' : 'No record does not mean absent. Open an employee report or enter attendance when the details are available.'}</p>
            {hasFilters && <Button variant="secondary" className="mt-3" onClick={clearFilters}>Show all records</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  {['Employee / Outlet', 'Scheduled shift', 'Check-in', 'Checkout', 'Worked time', 'Attendance', 'Difference', ''].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => {
                  const isReview = ['review', 'not_recommended'].includes(row.recommendation);
                  const arrival = arrivalOf(row);
                  const difference = differenceOf(row);

                  return (
                    <tr
                      key={row.id}
                      className={clsx(
                        'cursor-pointer transition-colors',
                        isReview ? 'bg-amber-50/40 hover:bg-amber-50/60' : 'hover:bg-slate-50/60'
                      )}
                      onClick={() => openReport(row.id)}
                    >
                      <td className="px-5 py-3 align-top">
                        <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                          {row.employeeName}
                          {row.recognitionMethod === 'device' && (
                            <span className="inline-flex rounded-full bg-cyan-50 text-cyan-700 border border-cyan-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                              Terminal
                            </span>
                          )}
                          {row.manualOverride && <span className="inline-flex rounded-full border border-violet-100 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">Manual</span>}
                        </p>
                        {multipleDays && <p className="mt-1 text-xs font-medium text-slate-700"><time dateTime={row.date}>{formatDateOnly(row.date)}</time></p>}
                        <p className="text-xs text-gray-500 mt-0.5">{row.designation || '—'} · {row.department || '—'}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.outletName || row.outletCode || '—'}</p>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <ShiftTime start={row.shiftStart} end={row.shiftEnd} />
                      </td>
                      <td className="px-5 py-3 align-top">
                        <ScanTime value={checkInOf(row)} timezone={row.timezone} date={row.date} />
                        <TimingNote timing={arrival} />
                      </td>
                      <td className="px-5 py-3 align-top"><ScanTime value={row.checkOutAt} timezone={row.timezone} date={row.date} empty={hasMissingCheckout(row) ? 'Missing checkout' : 'Not recorded'} /><TimingNote timing={departureOf(row)} /></td>
                      <td className="px-5 py-3 align-top whitespace-nowrap"><p className="font-semibold tabular-nums text-gray-800">{formatHours(row.workedHours)}</p><p className="mt-1 text-xs text-gray-500">{row.scheduledHours != null ? `of ${formatHours(row.scheduledHours)} scheduled` : 'No scheduled duration'}</p></td>
                      <td className="px-5 py-3 align-top">
                        <AttendanceBadge record={row} />
                        <p className="mt-1.5 text-xs text-slate-500">{row.status === 'approved' ? 'Approved' : 'Pending approval'}</p>
                        <p className="mt-1 text-xs text-slate-500">{sourceOf(row)}</p>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <p className={clsx('text-sm font-semibold', difference.tone)}>{difference.label}</p>
                        {isReview && <p className="mt-1 text-xs text-amber-700" title={row.recommendationReason}>Review suggested</p>}
                      </td>
                      <td className="px-5 py-3 align-top">
                        <div className="flex flex-col items-start gap-2">
                          <button type="button" aria-label={`View ${row.employeeName} attendance`} onClick={(event) => { event.stopPropagation(); openReport(row.id); }} className="rounded text-xs font-semibold text-indigo-600 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500">View details</button>
                          {row.selfieUrl && (
                            <a
                              href={row.selfieUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              View Selfie
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Attendance;
