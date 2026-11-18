import api from './axios';

export const getProductionSetup = (outletId) => api.get('/api/production/setup', { params: outletId ? { outletId } : {} });
export const getBillsOfMaterials = () => api.get('/api/production/boms');
export const saveBillOfMaterials = (payload, id) => id ? api.put(`/api/production/boms/${encodeURIComponent(id)}`, payload) : api.post('/api/production/boms', payload);
export const getProductionOrders = (outletId) => api.get('/api/production/orders', { params: outletId ? { outletId } : {} });
export const releaseProductionOrder = (payload) => api.post('/api/production/orders', payload);
export const completeProductionOrder = (id, payload) => api.patch(`/api/production/orders/${encodeURIComponent(id)}/complete`, payload);
