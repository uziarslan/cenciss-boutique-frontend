export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const shiftPeriod = (period, offset = 1) => {
  const [year, month] = String(period || '').split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return '';
  const shifted = new Date(year, month - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

export const shiftDurationHours = (shiftStart, shiftEnd) => {
  const parseMinutes = (value) => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return (hours * 60) + minutes;
  };

  const startMinutes = parseMinutes(shiftStart);
  const endMinutes = parseMinutes(shiftEnd);
  if (startMinutes === null || endMinutes === null) return null;
  let durationMinutes = endMinutes - startMinutes;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  return durationMinutes / 60;
};

export const calculatePayrollBreakdown = ({
  period,
  monthlySalary,
  paidOffDutyDays = 4,
  paidOffDutyLimit = paidOffDutyDays,
  workedDays = 0,
  prepaidDates = [],
  overtimeMinutes = 0,
  shiftStart,
  shiftEnd,
}) => {
  const [year, month] = String(period || '').split('-').map(Number);
  const periodDays = Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12
    ? new Date(year, month, 0).getDate()
    : 0;
  const normalizedOffDayLimit = Math.max(
    0,
    Math.min(Number(paidOffDutyLimit) || 0, Math.max(0, periodDays - 1)),
  );
  const normalizedOffDays = Math.max(
    0,
    Math.min(Number(paidOffDutyDays) || 0, normalizedOffDayLimit),
  );
  // The entitlement sets the monthly work requirement. Taking fewer days off
  // must not increase that requirement and erase pay for working those days.
  const workingDays = Math.max(0, periodDays - normalizedOffDayLimit);
  const normalizedWorkedDays = Math.max(0, Math.min(Number(workedDays) || 0, periodDays));
  const normalizedOvertimeMinutes = Math.max(0, Math.round(Number(overtimeMinutes) || 0));
  const salary = Math.max(0, Number(monthlySalary) || 0);
  const shiftHours = shiftDurationHours(shiftStart, shiftEnd);
  const dailyRateRaw = workingDays ? salary / workingDays : 0;
  const hourlyRateRaw = shiftHours ? dailyRateRaw / shiftHours : 0;
  const regularPaidDays = Math.min(normalizedWorkedDays, workingDays);
  const holidayWorkedDays = Math.max(0, normalizedWorkedDays - workingDays);
  const unpaidDays = Math.max(0, workingDays - normalizedWorkedDays);
  const baseEarned = normalizedWorkedDays >= workingDays
    ? roundMoney(salary)
    : roundMoney(dailyRateRaw * regularPaidDays);
  const holidayWorkPay = roundMoney(dailyRateRaw * holidayWorkedDays);
  const overtimePay = roundMoney((normalizedOvertimeMinutes / 60) * hourlyRateRaw);
  const prepaidPeriod = shiftPeriod(period, 1);
  const normalizedPrepaidDates = [...new Set(
    (Array.isArray(prepaidDates) ? prepaidDates : [])
      .filter((date) => String(date).startsWith(`${prepaidPeriod}-`)),
  )];
  const [prepaidYear, prepaidMonth] = prepaidPeriod.split('-').map(Number);
  const prepaidPeriodDays = prepaidPeriod
    ? new Date(prepaidYear, prepaidMonth, 0).getDate()
    : 0;
  const prepaidWorkingDays = Math.max(0, prepaidPeriodDays - normalizedOffDayLimit);
  const prepaidDailyRateRaw = prepaidWorkingDays ? salary / prepaidWorkingDays : 0;
  const prepaidPay = roundMoney(prepaidDailyRateRaw * normalizedPrepaidDates.length);

  return {
    periodDays,
    paidOffDutyDays: normalizedOffDays,
    paidOffDutyLimit: normalizedOffDayLimit,
    workingDays,
    workedDays: normalizedWorkedDays,
    regularPaidDays,
    holidayWorkedDays,
    unpaidDays,
    dailyRate: roundMoney(dailyRateRaw),
    baseEarned,
    attendanceDeduction: roundMoney(salary - baseEarned),
    holidayWorkPay,
    prepaidPeriod,
    prepaidDates: normalizedPrepaidDates,
    prepaidDays: normalizedPrepaidDates.length,
    prepaidDailyRate: roundMoney(prepaidDailyRateRaw),
    prepaidPay,
    shiftHours: shiftHours || 0,
    hourlyRate: roundMoney(hourlyRateRaw),
    overtimeMinutes: normalizedOvertimeMinutes,
    overtimePay,
    grossAmount: roundMoney(baseEarned + holidayWorkPay + prepaidPay + overtimePay),
  };
};
