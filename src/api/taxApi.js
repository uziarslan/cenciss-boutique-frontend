import api from './axios';

export const getTaxConfig = (params = {}) => api.get('/api/tax/config', { params });
export const updateTaxConfig = (data, params = {}) => api.patch('/api/tax/config', data, { params });
