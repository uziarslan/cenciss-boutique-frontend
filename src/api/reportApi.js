import api from './axios';

// GET /api/reports/cogs?from=&to=&outlet=
export const getCOGSReport = (params = {}) =>
  api.get('/api/reports/cogs', { params });

// GET /api/reports/cogs/by-item?from=&to=&outlet= (theoretical food cost per menu item)
export const getCOGSByItem = (params = {}) =>
  api.get('/api/reports/cogs/by-item', { params });

// GET /api/reports/spend?from=&to=&groupBy=vendor|category
export const getSpendReport = (params = {}) =>
  api.get('/api/reports/spend', { params });

// GET /api/reports/price-changes?from=&to=&vendorId=
export const getPriceChangeReport = (params = {}) =>
  api.get('/api/reports/price-changes', { params });

// GET /api/reports/vendor-performance?from=&to=
export const getVendorPerformanceReport = (params = {}) =>
  api.get('/api/reports/vendor-performance', { params });

export const getSalesSummary = (params = {}) =>
  api.get('/api/reports/sales-summary', { params });

export const getSalesTransactionsReport = (params = {}) =>
  api.get('/api/reports/sales-transactions', { params });

export const getSalesByItem = (params = {}) =>
  api.get('/api/reports/sales-by-item', { params });

export const getSalesByCashier = (params = {}) =>
  api.get('/api/reports/sales-by-cashier', { params });

export const getHourlyBreakdown = (params = {}) =>
  api.get('/api/reports/hourly-breakdown', { params });

export const getAgingReport = () =>
  api.get('/api/purchases/aging');
