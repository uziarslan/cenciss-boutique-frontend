import api from './axios';

// Owner-only audit trail.
export const getAuditLogs = (params = {}) => api.get('/api/audit-logs', { params });
