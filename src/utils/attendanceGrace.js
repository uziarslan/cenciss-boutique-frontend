// Legacy reports keep their existing thresholds; an explicit terminal value,
// including zero, takes precedence wherever attendance is displayed.
export const hasAttendanceGrace = (record) => typeof record?.graceMinutes === 'number'
  && Number.isFinite(record.graceMinutes) && record.graceMinutes >= 0;

export const isLateAttendance = (record, legacyTolerance = 0) => {
  if (hasAttendanceGrace(record) && typeof record.isLate === 'boolean') return record.isLate;
  return Number(record?.lateMinutes || 0) > (hasAttendanceGrace(record) ? record.graceMinutes : legacyTolerance);
};

export const arrivalWithinGrace = (record) => hasAttendanceGrace(record)
  && Number(record.lateMinutes) > 0 && !isLateAttendance(record);

export const departureWithinGrace = (record) => hasAttendanceGrace(record)
  && Number(record.earlyDepartureMinutes) > 0
  && Number(record.earlyDepartureMinutes) <= record.graceMinutes;
