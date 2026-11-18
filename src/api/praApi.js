import api from './axios';

export const getPraConfig = (params = {}) => api.get('/api/pra/config', { params });
export const updatePraConfig = (data, params = {}) => api.patch('/api/pra/config', data, { params });
export const checkPraSetup = (data, params = {}) => api.post('/api/pra/check', data, { params });
export const retryPra = (saleId) => api.post(`/api/pra/retry/${saleId}`);
