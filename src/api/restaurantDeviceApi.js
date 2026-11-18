import api from './axios';

export const listRestaurantDevices = () => api.get('/api/restaurant-devices');
export const createRestaurantDevice = (payload) => api.post('/api/restaurant-devices', payload);
export const renameRestaurantDevice = (id, label) => api.patch(`/api/restaurant-devices/${id}`, { label });
export const updateRestaurantDevice = (id, payload) =>
  api.patch(`/api/restaurant-devices/${id}`, payload);
export const regenerateRestaurantDevice = (id) => api.post(`/api/restaurant-devices/${id}/regenerate`);
export const revokeRestaurantDevice = (id) => api.delete(`/api/restaurant-devices/${id}`);
export const getPrintStationConfig = (id) => api.get(`/api/restaurant-devices/${id}/printer-config`);
export const updatePrintStationConfig = (id, printers) =>
  api.put(`/api/restaurant-devices/${id}/printer-config`, { printers });
