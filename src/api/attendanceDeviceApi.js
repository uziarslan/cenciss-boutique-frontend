import api from './axios';

export const listAttendanceDevices = () => api.get('/api/attendance-devices');
export const createAttendanceDevice = ({ label, outletId } = {}) =>
  api.post('/api/attendance-devices', { label, outletId: outletId || null });
export const updateAttendanceDeviceLabel = (id, label) =>
  api.patch(`/api/attendance-devices/${id}`, { label });
export const regenerateAttendanceDeviceToken = (id) =>
  api.post(`/api/attendance-devices/${id}/regenerate`);
export const revokeAttendanceDevice = (id) =>
  api.delete(`/api/attendance-devices/${id}`);
