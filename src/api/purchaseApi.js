import api from './axios';

export const getPurchases = (params = {}) => api.get('/api/purchases', { params });
export const getPurchaseAssetOptions = () => api.get('/api/purchases/asset-options');
export const getPurchase = (id) => api.get(`/api/purchases/${id}`);
export const createPurchase = (data) => api.post('/api/purchases', data);
export const updatePurchaseDraft = (id, data) => api.put(`/api/purchases/${id}`, data);
export const postPurchase = (id, data = {}) => api.post(`/api/purchases/${id}/post`, data);
export const correctPurchase = (id, data) => api.post(`/api/purchases/${id}/corrections`, data);
export const payPurchase = (id, data) => api.post(`/api/purchases/${id}/payments`, data);
export const deletePurchase = (id, reason, inventoryAction = 'keep') =>
  api.delete(`/api/purchases/${id}`, { data: { reason, inventoryAction } });
export const getPurchaseAging = (params = {}) => api.get('/api/purchases/aging', { params });
