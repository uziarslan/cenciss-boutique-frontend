import api from './axios';

export const getAttendanceRecords = (params = {}) =>
    api.get('/api/pos/attendance/records', { params });

export const markAttendanceRecordsApproved = (records) =>
    api.post('/api/pos/attendance/records/mark-approved', { records });

export const getAttendanceByEmployee = (employeeId, params = {}) =>
    api.get(`/api/pos/attendance/employee/${employeeId}/records`, { params });

export const getAttendanceShiftCorrection = (employeeId, businessDate) =>
    api.get(`/api/pos/attendance/employee/${employeeId}/shift-correction`, { params: { businessDate } });

export const postAttendanceShiftCorrection = (employeeId, data) =>
    api.post(`/api/pos/attendance/employee/${employeeId}/shift-correction`, data);

export const getAttendanceEmployees = (params = {}) =>
    api.get('/api/pos/attendance/employees', { params });

export const getManualAttendanceSheet = (params = {}) =>
    api.get('/api/pos/attendance/manual/sheet', { params });

export const upsertManualAttendance = (payload) =>
    api.put('/api/pos/attendance/manual', payload);

export const bulkUpsertManualAttendance = (payload) =>
    api.post('/api/pos/attendance/manual/bulk', payload);
