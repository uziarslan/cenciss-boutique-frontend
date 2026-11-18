import { isLateAttendance } from '../../utils/attendanceGrace';

export const PAYABLE_ATTENDANCE_STATES = new Set(['present', 'incomplete', 'off']);

export const DEVICE_PRESENT_ATTENDANCE_STATES = new Set(['present', 'incomplete']);

export const SALARY_ATTENDANCE_OVERRIDE_STATES = ['on_time', 'late', 'off', 'absent'];

export const formatAttendanceDuration = (value) => {
  const totalMinutes = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
};

export const normalizeSalaryAttendanceOverride = (value) => {
  // Boolean values are retained for salary payments saved before the
  // four-state calendar was introduced.
  if (value === true) return 'on_time';
  if (value === false) return 'absent';
  return SALARY_ATTENDANCE_OVERRIDE_STATES.includes(value) ? value : null;
};

export const nextSalaryAttendanceOverride = (value) => {
  const current = normalizeSalaryAttendanceOverride(value);
  if (!current) return SALARY_ATTENDANCE_OVERRIDE_STATES[0];
  const index = SALARY_ATTENDANCE_OVERRIDE_STATES.indexOf(current);
  return SALARY_ATTENDANCE_OVERRIDE_STATES[(index + 1) % SALARY_ATTENDANCE_OVERRIDE_STATES.length];
};

export const isWorkedSalaryAttendanceOverride = (value) => {
  const state = normalizeSalaryAttendanceOverride(value);
  return state === 'on_time' || state === 'late';
};

export const isPaidSalaryAttendanceOverride = (value) => {
  const state = normalizeSalaryAttendanceOverride(value);
  return state === 'on_time' || state === 'late' || state === 'off';
};

export const salaryAttendanceDisplayState = (record, override) => {
  const manualState = normalizeSalaryAttendanceOverride(override);
  if (manualState) return manualState;
  if (record?.attendanceState === 'off') return 'off';
  if (!record || ['absent', 'leave'].includes(record.attendanceState)) return 'absent';
  if (isDevicePresentAttendance(record) && isLateAttendance(record, 15)) return 'late';
  return isDevicePresentAttendance(record) ? 'on_time' : 'absent';
};

export const summarizeSalaryAttendance = ({
  period,
  records = [],
  overrides = {},
  paidOffDutyLimit = 0,
}) => {
  if (!/^\d{4}-\d{2}$/.test(period || '')) {
    return {
      periodDays: 0,
      workedDays: 0,
      devicePresentDays: 0,
      selectedOffDutyDays: 0,
      paidOffDutyDays: 0,
      paidOffDutyLimit: 0,
      manualChanges: 0,
    };
  }

  const [year, month] = period.split('-').map(Number);
  const periodDays = new Date(year, month, 0).getDate();
  const normalizedLimit = Math.max(
    0,
    Math.min(Number(paidOffDutyLimit) || 0, Math.max(0, periodDays - 1)),
  );
  const recordsByDate = new Map(
    records
      .filter((record) => record?.date?.startsWith(`${period}-`))
      .map((record) => [record.date, record]),
  );

  let workedDays = 0;
  let selectedOffDutyDays = 0;
  for (let day = 1; day <= periodDays; day += 1) {
    const date = `${period}-${String(day).padStart(2, '0')}`;
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, date);
    const displayState = salaryAttendanceDisplayState(
      recordsByDate.get(date),
      hasOverride ? overrides[date] : null,
    );
    if (isWorkedSalaryAttendanceOverride(displayState)) workedDays += 1;
    if (displayState === 'off') selectedOffDutyDays += 1;
  }

  return {
    periodDays,
    workedDays,
    devicePresentDays: [...recordsByDate.values()].filter(isDevicePresentAttendance).length,
    selectedOffDutyDays,
    paidOffDutyDays: Math.min(selectedOffDutyDays, normalizedLimit),
    paidOffDutyLimit: normalizedLimit,
    manualChanges: Object.keys(overrides)
      .filter((date) => date.startsWith(`${period}-`)).length,
  };
};

const attendanceState = (record) => record == null
  ? null
  : (record.attendanceState || 'present');

export const isPayableAttendance = (record) =>
  PAYABLE_ATTENDANCE_STATES.has(attendanceState(record));

export const isDevicePresentAttendance = (record) =>
  DEVICE_PRESENT_ATTENDANCE_STATES.has(attendanceState(record));

const localDateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export const buildSalaryAttendanceHighlights = ({
  period,
  records = [],
  overrides = {},
  today = new Date(),
}) => {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return [];

  const [year, month] = period.split('-').map(Number);
  const periodDays = new Date(year, month, 0).getDate();
  const todayKey = typeof today === 'string' ? today : localDateKey(today);
  const recordsByDate = new Map(
    records
      .filter((record) => record?.date?.startsWith(`${period}-`))
      .map((record) => [record.date, record]),
  );
  const highlights = [];

  for (let day = periodDays; day >= 1; day -= 1) {
    const date = `${period}-${String(day).padStart(2, '0')}`;
    if (date > todayKey) continue;

    const record = recordsByDate.get(date);
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, date);
    const manualState = hasOverride ? normalizeSalaryAttendanceOverride(overrides[date]) : null;
    const overtimeMinutes = Math.max(0, Number(record?.overtimeMinutes || 0));
    const addOvertimeHighlight = () => {
      if (overtimeMinutes > 0) {
        highlights.push({
          date,
          type: 'overtime',
          record,
          manual: false,
          overtimeMinutes,
        });
      }
    };

    if (manualState === 'absent') {
      highlights.push({ date, type: 'absent', record, manual: true });
      continue;
    }
    if (manualState === 'off') {
      highlights.push({ date, type: 'off', record, manual: true });
      continue;
    }
    if (manualState === 'late') {
      highlights.push({
        date,
        type: 'late',
        record,
        manual: true,
        lateMinutes: Number(record?.lateMinutes || 0),
      });
      addOvertimeHighlight();
      continue;
    }
    if (manualState === 'on_time') {
      addOvertimeHighlight();
      continue;
    }

    if (record?.attendanceState === 'off') {
      highlights.push({ date, type: 'off', record, manual: false });
    } else if (!record || ['absent', 'leave'].includes(record.attendanceState)) {
      highlights.push({ date, type: 'absent', record, manual: false });
    } else if (isDevicePresentAttendance(record) && isLateAttendance(record, 15)) {
      highlights.push({
        date,
        type: 'late',
        record,
        manual: false,
        lateMinutes: Number(record.lateMinutes || 0),
      });
    }
    if (isDevicePresentAttendance(record)) addOvertimeHighlight();
  }

  return highlights;
};
