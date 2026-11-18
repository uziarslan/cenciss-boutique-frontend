import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { format } from 'date-fns';
import clsx from 'clsx';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Grid3X3,
  Loader2,
  Save,
  UserRound,
  UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import usePermissions from '../../hooks/usePermissions';
import useQueryState from '../../hooks/useQueryState';
import { useGetOutletsQuery } from '../../store/baseApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import Button from '../../components/UI/Button';
import {
  bulkUpsertManualAttendance,
  getManualAttendanceSheet,
  upsertManualAttendance,
} from '../../api/attendanceApi';
import { resolveBusinessDate } from '../../utils/businessDate';
import { formatDateOnly } from '../../utils/datetime';

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100 disabled:text-slate-400';
const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500';
const EMPTY_CELL = { attendanceState: '', checkInTime: '', checkOutTime: '' };
const NON_WORKING_STATES = new Set(['absent', 'leave', 'off']);

const dateKeysInMonth = (month) => {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return [];
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
};

const dateLabel = (dateKey) => formatDateOnly(dateKey, { weekday: 'short', day: '2-digit', month: 'short' }) || dateKey;

const timeInZone = (value, timeZone) => {
  if (!value) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const hour = parts.find((part) => part.type === 'hour')?.value;
    const minute = parts.find((part) => part.type === 'minute')?.value;
    return hour && minute ? `${hour}:${minute}` : '';
  } catch { return ''; }
};

const cellKey = (employeeId, businessDate) => `${employeeId}:${businessDate}`;
const comparableCell = (cell = EMPTY_CELL) => ({
  attendanceState: cell.attendanceState || '',
  checkInTime: cell.checkInTime || '',
  checkOutTime: cell.checkOutTime || '',
});
const cellsEqual = (left, right) => JSON.stringify(comparableCell(left)) === JSON.stringify(comparableCell(right));

const Section = ({ title, subtitle, icon: Icon, children, className }) => (
  <section className={clsx('overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
    <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
      {Icon && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon size={17} /></div>}
      <div>
        <h2 className="font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const AttendanceEntry = () => {
  const { has } = usePermissions();
  const canManage = has('attendance.manage');
  const navigate = useNavigate();
  const { data: outlets = [] } = useGetOutletsQuery();
  const [mode, setMode] = useQueryState('mode', 'bulk');
  const [outletId, setOutletId] = useQueryState('outlet', '');
  const [month, setMonth] = useQueryState('month', format(new Date(), 'yyyy-MM'));
  const [individualDate, setIndividualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [sheetData, setSheetData] = useState({ outlet: null, employees: [], records: [] });
  const [cells, setCells] = useState({});
  const initialCellsRef = useRef({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [reason, setReason] = useState('Historical attendance backfill');
  const [notes, setNotes] = useState('');
  const [conflictMode, setConflictMode] = useState('override');

  const [employeeId, setEmployeeId] = useState('');
  const [individualState, setIndividualState] = useState('present');
  const [individualCheckIn, setIndividualCheckIn] = useState('');
  const [individualCheckOut, setIndividualCheckOut] = useState('');
  const [useShiftTimes, setUseShiftTimes] = useState(true);

  useEffect(() => {
    if (outletId || !outlets.length) return;
    setOutletId(outlets[0]._id);
    setIndividualDate(resolveBusinessDate(outlets, outlets[0]._id));
  }, [outletId, outlets, setOutletId]);

  const loadMonth = mode === 'individual' ? individualDate.slice(0, 7) : month;

  const loadSheet = async () => {
    if (!outletId || !/^\d{4}-\d{2}$/.test(loadMonth)) return;
    setLoading(true);
    try {
      const response = await getManualAttendanceSheet({ outlet: outletId, month: loadMonth });
      const data = response.data?.data || { outlet: null, employees: [], records: [] };
      const nextCells = {};
      for (const record of data.records || []) {
        nextCells[cellKey(record.employeeId, record.businessDate)] = {
          attendanceState: record.attendanceState || 'present',
          checkInTime: timeInZone(record.checkInAt, data.outlet?.timezone),
          checkOutTime: timeInZone(record.checkOutAt, data.outlet?.timezone),
          existing: true,
          manualOverride: record.manualOverride === true,
          recognitionMethod: record.recognitionMethod,
        };
      }
      setSheetData(data);
      setCells(nextCells);
      initialCellsRef.current = nextCells;
      setEmployeeId((current) => current && data.employees.some((employee) => employee._id === current) ? current : '');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load the attendance sheet.');
      setSheetData({ outlet: null, employees: [], records: [] });
      setCells({});
      initialCellsRef.current = {};
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSheet(); }, [outletId, loadMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'individual' || !employeeId || !individualDate) return;
    const existing = initialCellsRef.current[cellKey(employeeId, individualDate)];
    if (existing) {
      setIndividualState(existing.attendanceState || 'present');
      setIndividualCheckIn(existing.checkInTime || '');
      setIndividualCheckOut(existing.checkOutTime || '');
      setUseShiftTimes(false);
    } else {
      setIndividualState('present');
      setIndividualCheckIn('');
      setIndividualCheckOut('');
      setUseShiftTimes(true);
    }
  }, [mode, employeeId, individualDate, sheetData.records]);

  const employees = useMemo(
    () => sheetData.employees.filter((employee) => showInactive || employee.isActive !== false),
    [sheetData.employees, showInactive],
  );
  const employeeOptions = useMemo(() => sheetData.employees.map((employee) => ({
    value: employee._id,
    label: employee.name,
    meta: `${employee.designation || 'Staff'} · ${employee.shiftStart || 'No shift'}${employee.shiftEnd ? `–${employee.shiftEnd}` : ''}${employee.isActive === false ? ' · Inactive' : ''}`,
  })), [sheetData.employees]);
  const dates = useMemo(() => dateKeysInMonth(month), [month]);

  const dirtyKeys = useMemo(() => {
    const keys = new Set([...Object.keys(initialCellsRef.current), ...Object.keys(cells)]);
    return [...keys].filter((key) => !cellsEqual(cells[key], initialCellsRef.current[key]));
  }, [cells]);

  const updateCell = (employeeIdValue, date, field, value) => {
    const key = cellKey(employeeIdValue, date);
    setCells((current) => {
      const baseline = initialCellsRef.current[key];
      if (field === 'attendanceState' && !value) {
        if (baseline) return { ...current, [key]: { ...baseline } };
        const next = { ...current };
        delete next[key];
        return next;
      }
      const nextCell = { ...(current[key] || baseline || EMPTY_CELL), [field]: value };
      if (field === 'attendanceState' && NON_WORKING_STATES.has(value)) {
        nextCell.checkInTime = '';
        nextCell.checkOutTime = '';
      }
      if (field === 'checkInTime' && value) {
        nextCell.attendanceState = nextCell.checkOutTime ? 'present' : 'incomplete';
      }
      if (field === 'checkOutTime' && value) nextCell.attendanceState = nextCell.checkInTime ? 'present' : nextCell.attendanceState;
      if (field === 'checkOutTime' && !value && nextCell.checkInTime) nextCell.attendanceState = 'incomplete';
      return { ...current, [key]: nextCell };
    });
  };

  const resetBulkChanges = () => setCells({ ...initialCellsRef.current });

  const saveBulk = async () => {
    if (!reason.trim()) return toast.error('Reason is required.');
    if (!dirtyKeys.length) return toast.error('Enter or change at least one attendance record.');
    const entries = [];
    for (const key of dirtyKeys) {
      const [entryEmployeeId, businessDate] = key.split(':');
      const cell = cells[key] || EMPTY_CELL;
      if (!cell.attendanceState) continue;
      if (cell.checkOutTime && !cell.checkInTime) return toast.error(`Time In is required before Time Out on ${businessDate}.`);
      entries.push({
        employeeId: entryEmployeeId,
        businessDate,
        attendanceState: cell.checkInTime && !cell.checkOutTime ? 'incomplete' : cell.attendanceState,
        checkInTime: cell.checkInTime || undefined,
        checkOutTime: cell.checkOutTime || undefined,
        useShiftTimes: false,
      });
    }
    if (!entries.length) return toast.error('No valid attendance entries to save.');

    setSaving(true);
    try {
      const totals = { created: 0, updated: 0, skipped: 0 };
      for (let index = 0; index < entries.length; index += 1000) {
        const response = await bulkUpsertManualAttendance({
          entries: entries.slice(index, index + 1000),
          reason: reason.trim(),
          notes: notes.trim() || undefined,
          conflictMode,
        });
        const result = response.data?.data || {};
        totals.created += result.created || 0;
        totals.updated += result.updated || 0;
        totals.skipped += result.skipped || 0;
      }
      toast.success(`Attendance saved: ${totals.created} created, ${totals.updated} updated, ${totals.skipped} skipped.`);
      await loadSheet();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save the attendance sheet.');
    } finally {
      setSaving(false);
    }
  };

  const saveIndividual = async () => {
    if (!employeeId) return toast.error('Select an employee.');
    if (!reason.trim()) return toast.error('Reason is required.');
    setSaving(true);
    try {
      await upsertManualAttendance({
        employeeId,
        businessDate: individualDate,
        attendanceState: individualState,
        checkInTime: !useShiftTimes && individualCheckIn ? individualCheckIn : undefined,
        checkOutTime: !useShiftTimes && individualState !== 'incomplete' && individualCheckOut ? individualCheckOut : undefined,
        useShiftTimes,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        conflictMode: 'override',
      });
      toast.success('Attendance saved.');
      await loadSheet();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return <Navigate to="/attendance" replace />;

  return (
    <div className="space-y-6 pb-10">
      <button type="button" onClick={() => navigate('/attendance')} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-indigo-600">
        <ArrowLeft size={16} /> Back to Attendance
      </button>

      <HeroBanner
        icon={CalendarDays}
        eyebrow="Attendance workspace"
        title="Enter Attendance"
        subtitle="Record exact Time In and Time Out values by restaurant business day. Device punches remain preserved for audit history."
        accent="indigo"
        compact
      />

      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:max-w-xl">
        <button type="button" onClick={() => setMode('individual')} className={clsx('rounded-xl px-4 py-3 text-sm font-bold transition', mode === 'individual' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50')}><UserRound size={16} className="mr-2 inline" />Individual</button>
        <button type="button" onClick={() => setMode('bulk')} className={clsx('rounded-xl px-4 py-3 text-sm font-bold transition', mode === 'bulk' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50')}><Grid3X3 size={16} className="mr-2 inline" />Bulk sheet</button>
      </div>

      {mode === 'individual' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <Section icon={UserRound} title="Employee attendance" subtitle="Add or correct one employee business day">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelCls}>Outlet</label><SearchableSelect options={outlets.map((outlet) => ({ value: outlet._id, label: outlet.name, meta: outlet.code }))} value={outletId} onChange={setOutletId} searchPlaceholder="Search outlets…" /></div>
              <div><label className={labelCls}>Employee</label><SearchableSelect options={employeeOptions} value={employeeId} onChange={setEmployeeId} searchPlaceholder="Search employees…" /></div>
              <div><label className={labelCls}>Business date</label><input type="date" value={individualDate} onChange={(event) => setIndividualDate(event.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Status</label><select value={individualState} onChange={(event) => setIndividualState(event.target.value)} className={inputCls}><option value="present">Present</option><option value="incomplete">Present · missing checkout</option><option value="absent">Absent</option><option value="leave">Leave</option><option value="off">Off duty</option></select></div>
            </div>

            {['present', 'incomplete'].includes(individualState) && (
              <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-indigo-900"><input type="checkbox" checked={useShiftTimes} onChange={(event) => setUseShiftTimes(event.target.checked)} className="rounded border-indigo-300 text-indigo-600" />Use this employee’s configured shift times</label>
                {!useShiftTimes && <div className="mt-4 grid grid-cols-2 gap-3"><div><label className={labelCls}>Time In</label><input type="time" value={individualCheckIn} onChange={(event) => setIndividualCheckIn(event.target.value)} className={inputCls} /></div><div><label className={labelCls}>Time Out</label><input type="time" value={individualCheckOut} onChange={(event) => setIndividualCheckOut(event.target.value)} disabled={individualState === 'incomplete'} className={inputCls} /></div></div>}
              </div>
            )}
          </Section>

          <Section icon={Check} title="Audit and save" subtitle="Every manual entry records who changed it and why">
            <div className="space-y-4">
              <div><label className={labelCls}>Reason</label><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} className={inputCls} /></div>
              <div><label className={labelCls}>Notes (optional)</label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={4} className={inputCls} placeholder="Additional context" /></div>
              <Button variant="primary" icon={saving ? Loader2 : Save} disabled={saving || loading} onClick={saveIndividual} className="w-full justify-center">{saving ? 'Saving…' : 'Save attendance'}</Button>
            </div>
          </Section>
        </div>
      ) : (
        <>
          <Section icon={UsersRound} title="Monthly employee attendance sheet" subtitle="Each employee has three columns: Time In, Time Out, and Status">
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_180px_auto_auto] lg:items-end">
              <div><label className={labelCls}>Outlet</label><SearchableSelect options={outlets.map((outlet) => ({ value: outlet._id, label: outlet.name, meta: outlet.code }))} value={outletId} onChange={setOutletId} searchPlaceholder="Search outlets…" /></div>
              <div><label className={labelCls}>Month</label><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={inputCls} /></div>
              <label className="flex h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="rounded border-slate-300 text-indigo-600" />Show inactive</label>
              <div className="rounded-xl bg-indigo-50 px-4 py-2.5 text-center text-sm font-bold text-indigo-700">{dirtyKeys.length} changed</div>
            </div>
          </Section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div><h2 className="font-bold text-slate-900">{sheetData.outlet?.name || 'Attendance sheet'}</h2><p className="mt-0.5 text-xs text-slate-500">Scroll horizontally to reach every employee. Blank cells are not saved.</p></div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Clock3 size={14} />{sheetData.outlet?.timezone || 'Outlet timezone'}</div>
            </div>

            {loading ? (
              <div className="flex min-h-80 items-center justify-center gap-2 text-sm font-semibold text-slate-500"><Loader2 size={18} className="animate-spin" />Loading attendance sheet…</div>
            ) : !employees.length ? (
              <div className="flex min-h-80 items-center justify-center text-sm text-slate-500">No employees were found for this outlet.</div>
            ) : (
              <div className="max-h-[68vh] overflow-auto overscroll-contain">
                <table className="min-w-max border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-30">
                    <tr>
                      <th rowSpan={2} className="sticky left-0 z-50 w-36 min-w-36 border-b border-r border-slate-200 bg-slate-900 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">Business date</th>
                      {employees.map((employee) => (
                        <th key={employee._id} colSpan={3} className="border-b border-r border-indigo-200 bg-indigo-600 px-3 py-2.5 text-center text-white">
                          <p className="font-bold">{employee.name}</p>
                          <p className="mt-0.5 text-[10px] font-medium text-indigo-100">Shift {employee.shiftStart || '—'}–{employee.shiftEnd || '—'}{employee.isActive === false ? ' · Inactive' : ''}</p>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {employees.flatMap((employee) => [
                        <th key={`${employee._id}-in`} className="w-28 min-w-28 border-b border-r border-indigo-100 bg-indigo-50 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-700">Time In</th>,
                        <th key={`${employee._id}-out`} className="w-28 min-w-28 border-b border-r border-indigo-100 bg-indigo-50 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-700">Time Out</th>,
                        <th key={`${employee._id}-state`} className="w-32 min-w-32 border-b border-r border-indigo-100 bg-indigo-50 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-700">Status</th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {dates.map((date, rowIndex) => (
                      <tr key={date} className={rowIndex % 2 ? 'bg-slate-50/60' : 'bg-white'}>
                        <th className="sticky left-0 z-20 border-b border-r border-slate-200 bg-inherit px-4 py-2.5 text-left">
                          <p className="font-bold text-slate-800">{dateLabel(date)}</p>
                          <p className="mt-0.5 text-[10px] font-medium text-slate-400">{date}</p>
                        </th>
                        {employees.flatMap((employee) => {
                          const key = cellKey(employee._id, date);
                          const cell = cells[key] || EMPTY_CELL;
                          const dirty = !cellsEqual(cell, initialCellsRef.current[key]);
                          const working = !NON_WORKING_STATES.has(cell.attendanceState);
                          const cellClass = clsx('border-b border-r px-1.5 py-1.5', dirty ? 'border-amber-200 bg-amber-50' : cell.existing ? 'border-violet-100 bg-violet-50/35' : 'border-slate-100');
                          return [
                            <td key={`${key}-in`} className={cellClass}><input aria-label={`${employee.name} Time In ${date}`} type="time" value={cell.checkInTime || ''} disabled={!working} onChange={(event) => updateCell(employee._id, date, 'checkInTime', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs tabular-nums outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100" /></td>,
                            <td key={`${key}-out`} className={cellClass}><input aria-label={`${employee.name} Time Out ${date}`} type="time" value={cell.checkOutTime || ''} disabled={!working} onChange={(event) => updateCell(employee._id, date, 'checkOutTime', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs tabular-nums outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100" /></td>,
                            <td key={`${key}-state`} className={cellClass}><select aria-label={`${employee.name} Status ${date}`} value={cell.attendanceState || ''} onChange={(event) => updateCell(employee._id, date, 'attendanceState', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="">No entry</option><option value="present">Present</option><option value="incomplete">No checkout</option><option value="absent">Absent</option><option value="leave">Leave</option><option value="off">Off duty</option></select></td>,
                          ];
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <Section icon={Check} title="Review and save changes" subtitle="Only amber cells are submitted; unchanged device and manual records stay untouched">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_220px_auto] lg:items-end">
              <div><label className={labelCls}>Reason</label><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} className={inputCls} /></div>
              <div><label className={labelCls}>Notes (optional)</label><input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} className={inputCls} placeholder="Additional context" /></div>
              <div><label className={labelCls}>Existing records</label><select value={conflictMode} onChange={(event) => setConflictMode(event.target.value)} className={inputCls}><option value="override">Apply exact sheet values</option><option value="fill_missing">Only fill missing</option><option value="skip">Skip existing</option></select></div>
              <div className="flex gap-2"><Button variant="secondary" disabled={!dirtyKeys.length || saving} onClick={resetBulkChanges}>Reset</Button><Button variant="primary" icon={saving ? Loader2 : Save} disabled={!dirtyKeys.length || saving} onClick={saveBulk}>{saving ? 'Saving…' : `Save ${dirtyKeys.length}`}</Button></div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
};

export default AttendanceEntry;
