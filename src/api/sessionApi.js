import api from './axios';

export const getSessions = (params = {}) =>
    api.get('/api/pos/sessions', { params });

export const getSessionById = (id) =>
    api.get(`/api/pos/sessions/${id}`);
