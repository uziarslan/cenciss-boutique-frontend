import api from './axios';

const unwrap = (response) => response.data?.data ?? response.data;

export const getKdsConfig = (outletId) =>
  api.get('/api/kds/config', { params: { outletId } }).then(unwrap);

export const getKdsOrders = (outletId) =>
  api.get('/api/kds/orders', { params: { outletId } }).then(unwrap);

export const transitionKdsOrder = (id, action) =>
  api.patch(`/api/kds/orders/${encodeURIComponent(id)}/${action}`).then(unwrap);

export const cancelKdsOrder = (id, payload) =>
  api.post(`/api/kds/orders/${encodeURIComponent(id)}/cancel`, payload).then(unwrap);

export const getKdsWastePreview = (id) =>
  api.get(`/api/kds/orders/${encodeURIComponent(id)}/waste-preview`).then(unwrap);

export const acknowledgeKdsReady = (id) =>
  api.patch(`/api/kds/orders/${encodeURIComponent(id)}/acknowledge`).then(unwrap);

export const getKdsReadyCounts = (outletId) =>
  api.get('/api/kds/ready-counts', { params: { outletId } }).then(unwrap);

export const getKdsLifecycleReport = (params) =>
  api.get('/api/kds/reports/lifecycle', { params }).then(unwrap);

export const getKitchenCounterReport = (params) =>
  api.get('/api/kds/reports/kitchen-counter', { params }).then(unwrap);

export const getKdsItemCancellationPreview = (id, itemIndex, params) =>
  api.get(`/api/kds/orders/${encodeURIComponent(id)}/items/${itemIndex}/cancellation-preview`, { params }).then(unwrap);

export const cancelKdsOrderItem = (id, itemIndex, payload) =>
  api.post(`/api/kds/orders/${encodeURIComponent(id)}/items/${itemIndex}/cancel`, payload).then(unwrap);
