import { describe, expect, it } from 'vitest';
import { isDevicePresentAttendance, isPayableAttendance } from './salaryAttendance';

describe('salary attendance rules', () => {
  it.each([
    ['present', true],
    ['incomplete', true],
    ['off', true],
    ['leave', false],
    ['absent', false],
  ])('treats %s payable=%s', (attendanceState, expected) => {
    expect(isPayableAttendance({ attendanceState })).toBe(expected);
  });

  it('keeps off-duty days out of biometric check-in totals', () => {
    expect(isDevicePresentAttendance({ attendanceState: 'off' })).toBe(false);
    expect(isDevicePresentAttendance({ attendanceState: 'present' })).toBe(true);
    expect(isDevicePresentAttendance({ attendanceState: 'incomplete' })).toBe(true);
  });

  it('keeps legacy attendance records without a state payable', () => {
    expect(isPayableAttendance({})).toBe(true);
    expect(isDevicePresentAttendance({})).toBe(true);
  });

  it('does not treat a missing attendance record as payable', () => {
    expect(isPayableAttendance(null)).toBe(false);
    expect(isDevicePresentAttendance(undefined)).toBe(false);
  });
});
