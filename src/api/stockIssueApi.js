import api from './axios';

// ── Stock Transfers (Store ⇄ Kitchen, approval-gated) ───────────────────────────
export const createStockIssue = (data) => api.post('/api/stock-issues', data);
export const getStockIssues = (params = {}) => api.get('/api/stock-issues', { params });
export const getStockIssue = (id) => api.get(`/api/stock-issues/${id}`);
// Receiver actions on an in-transit transfer.
export const acceptStockIssue = (id) => api.post(`/api/stock-issues/${id}/accept`);
export const rejectStockIssue = (id, reason) => api.post(`/api/stock-issues/${id}/reject`, { reason });
