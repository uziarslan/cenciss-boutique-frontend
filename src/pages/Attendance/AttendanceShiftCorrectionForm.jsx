import { useEffect, useRef, useState } from 'react';
import { Clock3, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAttendanceShiftCorrection, postAttendanceShiftCorrection } from '../../api/attendanceApi';
import { formatDateOnly, formatTimeOfDay } from '../../utils/datetime';
import PremiumModal, { PrimaryButton, SecondaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const shiftLabel = (shift) => TIME_RE.test(shift?.shiftStart || '') && TIME_RE.test(shift?.shiftEnd || '')
  ? `${formatTimeOfDay(shift.shiftStart)} – ${formatTimeOfDay(shift.shiftEnd)}${shift.shiftEnd <= shift.shiftStart ? ' (ends next day)' : ''}`
  : 'Not set';

export default function AttendanceShiftCorrectionForm({ employeeId, businessDate, onClose, onSaved }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [source, setSource] = useState('employee');
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getAttendanceShiftCorrection(employeeId, businessDate).then((response) => {
      if (!active) return;
      const data = response.data.data;
      setContext(data);
      const current = data.currentShift;
      const matchesSaved = data.savedShifts.every((shift) => shift.shiftStart === current.shiftStart && shift.shiftEnd === current.shiftEnd);
      const valid = TIME_RE.test(current.shiftStart) && TIME_RE.test(current.shiftEnd);
      setSource(valid && !matchesSaved ? 'employee' : 'custom');
      setShiftStart(current.shiftStart || data.savedShifts[0]?.shiftStart || '');
      setShiftEnd(current.shiftEnd || data.savedShifts[0]?.shiftEnd || '');
    }).catch((requestError) => {
      if (active) { setContext(null); setError(requestError.response?.data?.message || 'Could not load shift times.'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [employeeId, businessDate, reload]);

  const currentValid = context && TIME_RE.test(context.currentShift.shiftStart) && TIME_RE.test(context.currentShift.shiftEnd);
  const currentMatches = context?.savedShifts.every((shift) => shift.shiftStart === context.currentShift.shiftStart && shift.shiftEnd === context.currentShift.shiftEnd);
  const chosenStart = source === 'employee' ? context?.currentShift.shiftStart : shiftStart;
  const chosenEnd = source === 'employee' ? context?.currentShift.shiftEnd : shiftEnd;
  const canSave = context && !loading && TIME_RE.test(chosenStart || '') && TIME_RE.test(chosenEnd || '') && reason.trim().length >= 5;

  const submit = async (event) => {
    event?.preventDefault();
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await postAttendanceShiftCorrection(employeeId, {
        businessDate, source, version: context.version, reason: reason.trim(),
        ...(source === 'custom' ? { shiftStart, shiftEnd } : {}),
      });
      onSaved(response.data.data.record);
      toast.success('Shift corrected. Attendance timings have been recalculated.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not post the shift correction.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return <PremiumModal open onClose={saving ? undefined : onClose} icon={Clock3} accent="indigo" size="lg"
    eyebrow={formatDateOnly(businessDate)} title="Use updated shift time"
    subtitle="Correct the saved shift for this attendance day."
    footer={<>
      <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
      <PrimaryButton onClick={submit} disabled={!canSave || saving} accent="indigo">{saving ? 'Posting…' : 'Post correction'}</PrimaryButton>
    </>}
  >
    {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {loading ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Loading the latest employee shift…</p> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {context && <p className="font-semibold text-slate-800">{context.employeeName}</p>}
        <button type="button" onClick={() => setReload((value) => value + 1)} disabled={saving} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 disabled:opacity-50"><RefreshCw size={13} />Reload current shift</button>
      </div>
      {context && <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">Saved shift for {formatDateOnly(businessDate)}</p>
          {context.savedShifts.map((shift, index) => <p key={index} className="mt-1 text-sm font-semibold text-slate-800">{shiftLabel(shift)}</p>)}
          <p className="mt-2 text-xs text-slate-500">Times are in {context.timezone}.</p>
        </div>
        <fieldset disabled={saving} className="space-y-3">
          <legend className={labelCls}>Shift to use</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input type="radio" name="shift-source" value="employee" checked={source === 'employee'} onChange={() => setSource('employee')} disabled={!currentValid || saving} className="mt-1" />
            <span><span className="block text-sm font-semibold text-slate-800">Use employee’s current shift</span><span className="mt-1 block text-xs text-slate-500">{shiftLabel(context.currentShift)}</span></span>
          </label>
          {currentMatches && <p className="text-xs text-amber-700">The employee’s current shift matches the saved shift. Enter the revised times below if the employee profile has not been updated.</p>}
          {!currentValid && <p className="text-xs text-amber-700">No current employee shift is set. Enter the times for this day below.</p>}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3">
            <input type="radio" name="shift-source" value="custom" checked={source === 'custom'} onChange={() => setSource('custom')} />
            <span className="text-sm font-semibold text-slate-800">Enter shift times for this day</span>
          </label>
          {source === 'custom' && <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="corrected-shift-start" className={labelCls}>Shift start</label><input id="corrected-shift-start" type="time" value={shiftStart} onChange={(event) => setShiftStart(event.target.value)} className={inputCls} /></div>
            <div><label htmlFor="corrected-shift-end" className={labelCls}>Shift end</label><input id="corrected-shift-end" type="time" value={shiftEnd} onChange={(event) => setShiftEnd(event.target.value)} className={inputCls} /></div>
            {TIME_RE.test(shiftStart) && TIME_RE.test(shiftEnd) && shiftEnd <= shiftStart && <p className="col-span-2 text-xs text-indigo-600">This shift ends the next day.</p>}
          </div>}
          <div><label htmlFor="shift-correction-reason" className={labelCls}>Correction reason</label>
            <textarea id="shift-correction-reason" className={`${inputCls} resize-none`} rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: Covering the morning shift on a colleague’s day off" />
            <p className="mt-1 text-xs text-slate-400">At least 5 characters. Saved with the owner’s correction history.</p>
          </div>
        </fieldset>
        <p className="rounded-xl bg-indigo-50 p-3 text-xs leading-relaxed text-indigo-700">Applies only to {formatDateOnly(businessDate)}. Late arrival, early checkout, overtime and scheduled hours are recalculated from the recorded check-in and checkout. Terminal scans and the employee’s default shift are preserved.</p>
      </form>}
    </>}
  </PremiumModal>;
}
