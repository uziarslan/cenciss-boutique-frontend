import api from './axios';

export const getVendors = (params = {}) =>
  api.get('/api/vendors', { params });

export const getVendorById = (id) =>
  api.get(`/api/vendors/${id}`);

export const createVendor = (data) =>
  api.post('/api/vendors', data);

export const updateVendor = (id, data) =>
  api.put(`/api/vendors/${id}`, data);

export const deleteVendor = (id) =>
  api.delete(`/api/vendors/${id}`);

export const getVendorPriceHistory = (id) =>
  api.get(`/api/vendors/${id}/price-history`);
