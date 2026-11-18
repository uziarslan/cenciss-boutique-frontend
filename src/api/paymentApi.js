import api from './axios';

export const getAllPayments = (params = {}) => api.get('/api/payments', { params });
export const getPaymentById = (id) => api.get(`/api/payments/${id}`);
export const recordPayment = (data) => api.post('/api/payments', data);
export const updatePayment = (id, changes) =>
  api.patch(`/api/payments/${id}/date`, changes);
export const updatePaymentDate = (id, paymentDate) =>
  updatePayment(id, { paymentDate });
export const reversePayment = (id, reason) => api.delete(`/api/payments/${id}`, { data: { reason } });
export const getPaymentsByVendor = (vendorId, params = {}) =>
  api.get('/api/payments', { params: { ...params, vendor: vendorId } });
