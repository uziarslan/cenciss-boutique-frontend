import api from './axios';

export const listTables  = (params = {}) => api.get('/api/tables', { params });
export const createTable = (data)        => api.post('/api/tables', data);
export const updateTable = (id, data)    => api.put(`/api/tables/${id}`, data);
export const deleteTable = (id)          => api.delete(`/api/tables/${id}`);
export const reactivateTable = (id)      => api.post(`/api/tables/${id}/reactivate`);
export const updateQrSettings = (outletId, data) => api.patch(`/api/tables/settings/${outletId}`, data);
export const getQrMenuCategories = (outletId) => api.get(`/api/tables/settings/${outletId}/menu-categories`);
