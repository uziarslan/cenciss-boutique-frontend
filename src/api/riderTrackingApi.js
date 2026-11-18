import api from './axios';

export const getRiderLive = (outletId) =>
  api.get('/api/rider-tracking/live', { params: { outletId } });

export const getRiderHistory = (params) =>
  api.get('/api/rider-tracking/history', { params });

export const getRiderOrderRoute = (orderId) =>
  api.get(`/api/rider-tracking/orders/${orderId}/route`);

export const getRiderPerformance = (params) =>
  api.get('/api/rider-tracking/performance', { params });

export const saveRiderDeliveryReview = (orderId, data) =>
  api.put(`/api/rider-tracking/orders/${orderId}/review`, data);

export const overrideRiderReturn = (assignmentId, data) =>
  api.patch(`/api/rider-tracking/assignments/${assignmentId}/return`, data);

export const updateRiderTrackingConfig = (outletId, data) =>
  api.patch(`/api/rider-tracking/outlets/${outletId}/config`, data);

export const notifyRiderAssignment = (assignmentId) =>
  api.post(`/api/rider-tracking/assignments/${assignmentId}/notify`);
