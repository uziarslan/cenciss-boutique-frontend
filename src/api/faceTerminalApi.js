import api from './axios';

// Hikvision face terminals. Mirrors attendanceDeviceApi but for on-premise
// face-recognition hardware. create/regenerate return a one-time `token` and
// the full `webhookUrl` to paste into the device's HTTP Listening host.
export const listFaceTerminals = () => api.get('/api/hikvision-terminals');
export const createFaceTerminal = ({ label, outletId, serialNo, graceMinutes = 0 } = {}) =>
  api.post('/api/hikvision-terminals', { label, outletId: outletId || null, serialNo: serialNo || '', graceMinutes });
export const updateFaceTerminal = (id, patch) =>
  api.patch(`/api/hikvision-terminals/${id}`, patch);
export const regenerateFaceTerminalToken = (id) =>
  api.post(`/api/hikvision-terminals/${id}/regenerate`);
export const revokeFaceTerminal = (id) =>
  api.delete(`/api/hikvision-terminals/${id}`);
