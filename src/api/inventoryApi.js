import api from './axios';

// ── Stock ─────────────────────────────────────────────────────────────────────
export const getAllStock = (params = {}) => api.get('/api/inventory', { params });
export const updateStockItem = (productId, data) => api.put(`/api/inventory/${productId}`, data);
export const getStockDetail = (productId, params = {}) => api.get(`/api/inventory/${productId}/detail`, { params });

// ── Stock Count ───────────────────────────────────────────────────────────────
export const submitStockCount = (data) => api.post('/api/inventory/stock-count', data);
export const getVarianceReport = (params = {}) => api.get('/api/inventory/variance-report', { params });

// Create a new product and add initial stock without a purchase document.
export const createNewStock = (data) => api.post('/api/inventory/create-new-stock', data);

// ── Waste Log ─────────────────────────────────────────────────────────────────
export const getWasteLogs = (params = {}) => api.get('/api/inventory/waste-log', { params });
export const logWaste = (data) => api.post('/api/inventory/waste-log', data);
export const getSaleTransactionsForWaste = (params = {}) => api.get('/api/inventory/waste-log/sale-transactions', { params });
export const getSaleWasteCostPreview = (id) => api.get(`/api/inventory/waste-log/sale-transactions/${id}/cost-preview`);
export const logWasteFromSale = (data) => api.post('/api/inventory/waste-log/from-sale', data);
export const cancelSaleTransaction = (id, payload) => (
  api.post(`/api/inventory/waste-log/sale-transactions/${encodeURIComponent(id)}/cancel`, payload)
);

// ── Inventory Insights & Adaptive Variance ────────────────────────────────────
export const getInventoryInsights = (params = {}) => api.get('/api/inventory/insights', { params });
export const getDetailedIngredients = (params = {}) => api.get('/api/inventory/insights/detailed', { params });
export const getIngredientUsageHistory = (productId, params = {}) => api.get(`/api/inventory/usage-history/${productId}`, { params });
