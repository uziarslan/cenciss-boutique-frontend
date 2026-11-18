import api from './axios';

// ── Chart of Accounts ─────────────────────────────────────────────────────────
export const getAccounts    = (params = {}) => api.get('/api/accounting/chart-of-accounts', { params });
export const createAccount  = (data)        => api.post('/api/accounting/chart-of-accounts', data);
export const updateAccount  = (id, data)    => api.put(`/api/accounting/chart-of-accounts/${id}`, data);
export const deactivateAccount = (id)       => api.delete(`/api/accounting/chart-of-accounts/${id}`);
export const deleteAccount     = (id)       => api.delete(`/api/accounting/chart-of-accounts/${id}/permanent`);

// ── Journal Entries ───────────────────────────────────────────────────────────
export const getJournalEntries  = (params = {}) => api.get('/api/accounting/journal-entries', { params });
export const getJournalEntryById = (id)          => api.get(`/api/accounting/journal-entries/${id}`);
export const createJournalEntry  = (data)         => api.post('/api/accounting/journal-entries', data);
export const updateJournalEntry  = (id, data)     => api.put(`/api/accounting/journal-entries/${id}`, data);
export const getOrderSalaryChargeContext = (id) => api.get(`/api/accounting/journal-entries/${id}/charge-to-salary`);
export const getOrderSalaryCreditSummary = (employeeId) => api.get(`/api/accounting/salary-charge/employees/${employeeId}/credit-summary`);
export const chargeJournalOrderToSalary = (id, data) => api.post(`/api/accounting/journal-entries/${id}/charge-to-salary`, data);
export const reverseJournalEntry = (id)           => api.post(`/api/accounting/journal-entries/${id}/reverse`);
export const deleteJournalEntry  = (id)           => api.delete(`/api/accounting/journal-entries/${id}`);
export const getCustomParties    = ()             => api.get('/api/accounting/custom-parties');
export const updateCustomParty   = (id, data)     => api.put(`/api/accounting/custom-parties/${id}`, data);
export const deleteCustomParty   = (id)           => api.delete(`/api/accounting/custom-parties/${id}`);

// ── Ledger & Reports ──────────────────────────────────────────────────────────
export const getLedger         = (accountId, params = {}) => api.get(`/api/accounting/ledger/${accountId}`, { params });
export const getTrialBalance   = (params = {})             => api.get('/api/accounting/trial-balance',   { params });
export const getProfitAndLoss  = (params = {})             => api.get('/api/accounting/profit-and-loss', { params });
export const getBalanceSheet   = (params = {})             => api.get('/api/accounting/balance-sheet',   { params });
