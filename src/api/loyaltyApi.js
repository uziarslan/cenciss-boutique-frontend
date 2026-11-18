import api from './axios';

// ── Config ────────────────────────────────────────────────────────────────────
export const getLoyaltyConfig    = ()      => api.get('/api/loyalty/config');
export const updateLoyaltyConfig = (data)  => api.patch('/api/loyalty/config', data);

// ── Members ───────────────────────────────────────────────────────────────────
export const listMembers      = (params = {}) => api.get('/api/loyalty/members', { params });
export const getMember        = (id)           => api.get(`/api/loyalty/members/${encodeURIComponent(id)}`);
export const issueMemberCard  = (id, body)     => api.post(`/api/loyalty/members/${encodeURIComponent(id)}/issue-card`, body || {});
export const adjustMemberPoints = (id, body)   => api.post(`/api/loyalty/members/${encodeURIComponent(id)}/adjust`, body);

// ── Transactions ──────────────────────────────────────────────────────────────
export const listLoyaltyTransactions = (params = {}) => api.get('/api/loyalty/transactions', { params });

// ── Reporting ─────────────────────────────────────────────────────────────────
export const getLoyaltyDashboard = ()           => api.get('/api/loyalty/dashboard');
export const getLoyaltyReports   = (params = {}) => api.get('/api/loyalty/reports', { params });

// ── Expiry sweep (manual trigger) ────────────────────────────────────────────
export const runLoyaltyExpiry    = ()           => api.post('/api/loyalty/expiry/run');
