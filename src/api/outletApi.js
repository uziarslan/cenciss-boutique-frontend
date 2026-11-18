import api from './axios';

export const getOutlets = (params = {}) =>
    api.get('/api/outlets', { params });

export const createOutlet = (data) =>
    api.post('/api/outlets', data);

export const updateOutlet = (id, data) =>
    api.patch(`/api/outlets/${id}`, data);

export const getOutletById = (id) =>
    api.get(`/api/outlets/${id}`);

export const getOutletSummary = (id) =>
    api.get(`/api/outlets/${id}/summary`);
