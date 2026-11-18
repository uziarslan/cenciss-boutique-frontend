import api from './axios';

// List all users with allowance summary for a given period (defaults to current month)
export const listAllowances = (period) =>
    api.get('/api/allowances', { params: period ? { period } : {} });

// Get a specific user's current-period allowance
export const getUserAllowance = (userId, period) =>
    api.get(`/api/allowances/user/${userId}`, { params: period ? { period } : {} });

// Set (or create) a user's monthly allowance limit
export const setUserAllowanceLimit = (userId, data) =>
    api.post(`/api/allowances/user/${userId}`, data);

// Get all users with excess amounts (settled + unsettled)
export const getExcessReport = () =>
    api.get('/api/allowances/excess');

// Settle excess — owner provides payment details
// data: { paymentMode, transactionId?, receiverUserId }
export const settleExcess = (allowanceId, data) =>
    api.post(`/api/allowances/${allowanceId}/settle`, data);

// Search users for allowance selection (POS)
export const searchUsersForAllowance = (q) =>
    api.get('/api/allowances/search', { params: { q } });
