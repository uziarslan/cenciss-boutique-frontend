import { createApi } from '@reduxjs/toolkit/query/react';
import axiosBaseQuery from '../api/axiosBaseQuery';
import fetchAllProductPages from './fetchAllProductPages';

// Central RTK Query API. Reference/lookup data is cached and reused across the
// whole app (no refetch on every page), with stale-while-revalidate. Mutations
// elsewhere can invalidate these tags to refresh the cache when data changes.
//
// keepUnusedDataFor is in SECONDS — how long a cache entry survives after the
// last component using it unmounts. Reference data is set high so navigating
// between pages reuses it instead of re-hitting the server.

const TEN_MIN = 600;
const FIVE_MIN = 300;
const TWO_MIN = 120;

// Reports change as new sales/purchases land, but those happen elsewhere (POS,
// purchasing). For perceived speed we serve the last result instantly on revisit
// and revalidate in the background — see `reportQueryOpts` used at the call sites.
const reportPayload = (res) => res?.data?.data ?? res?.data ?? null;
// List endpoints return a paginated envelope `{ data: { rows, total, ... } }`.
// `res` here is the response body, so `res.data` is that inner payload object.
const listPayload = (res) => res?.data ?? null;

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    'Outlet', 'Vendor', 'Product', 'MenuCategory', 'Report',
    'Purchase', 'Payment',
    'Stock', 'StockIssue', 'WasteLog', 'Account', 'JournalEntry', 'Accounting',
    'MenuItem', 'PrepRecipe', 'Session', 'Allowance', 'Attendance',
    'Employee', 'SalaryPayment', 'Advance', 'Table',
    'LoyaltyMember', 'LoyaltyTransaction', 'LoyaltyReport', 'LoyaltyConfig', 'User',
    'CustomParty',
  ],
  // Don't auto-refetch just because a component remounted — serve cache.
  refetchOnMountOrArgChange: false,
  refetchOnFocus: false,
  refetchOnReconnect: true,
  endpoints: (builder) => ({
    // ── Outlets ── single shared cache entry (no args) reused by every page ──
    getOutlets: builder.query({
      query: () => ({ url: '/api/outlets', method: 'get', params: { limit: 500 } }),
      transformResponse: (res) => res?.data?.outlets ?? res?.data ?? [],
      providesTags: ['Outlet'],
      keepUnusedDataFor: TEN_MIN,
    }),

    // ── Vendors ── cached by params (e.g. { status:'active', limit:200 }) ────
    getVendors: builder.query({
      query: (params = { limit: 200, status: 'active' }) => ({ url: '/api/vendors', method: 'get', params }),
      transformResponse: (res) => res?.data?.vendors ?? res?.data ?? [],
      providesTags: ['Vendor'],
      keepUnusedDataFor: TEN_MIN,
    }),

    // ── Products / Items ── complete catalog, cached by filters ──────────────
    getProducts: builder.query({
      queryFn: (params, _queryApi, _extraOptions, fetchWithBQ) => (
        fetchAllProductPages(params, fetchWithBQ)
      ),
      providesTags: ['Product'],
      keepUnusedDataFor: TEN_MIN,
    }),

    // ── Menu categories ── cached per outlet ─────────────────────────────────
    getMenuCategories: builder.query({
      query: (outlet) => ({ url: '/api/menu/categories', method: 'get', params: { outlet } }),
      transformResponse: (res) => res?.data?.categories ?? res?.data ?? [],
      providesTags: ['MenuCategory'],
      keepUnusedDataFor: TEN_MIN,
    }),

    // ── Reports ── cached by their filter params; revalidated in background ───
    getSalesSummary: builder.query({
      query: (params = {}) => ({ url: '/api/reports/sales-summary', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getSalesByItem: builder.query({
      query: (params = {}) => ({ url: '/api/reports/sales-by-item', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getSalesByCashier: builder.query({
      query: (params = {}) => ({ url: '/api/reports/sales-by-cashier', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getHourlyBreakdown: builder.query({
      query: (params = {}) => ({ url: '/api/reports/hourly-breakdown', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getCogs: builder.query({
      query: (params = {}) => ({ url: '/api/reports/cogs', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getCogsByItem: builder.query({
      query: (params = {}) => ({ url: '/api/reports/cogs/by-item', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getCogsItemDetail: builder.query({
      query: ({ itemId, ...params }) => ({
        url: `/api/reports/cogs/by-item/${itemId}`,
        method: 'get',
        params,
      }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getSpend: builder.query({
      query: (params = {}) => ({ url: '/api/reports/spend', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getPriceChanges: builder.query({
      query: (params = {}) => ({ url: '/api/reports/price-changes', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getVendorPerformance: builder.query({
      query: (params = {}) => ({ url: '/api/reports/vendor-performance', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getAging: builder.query({
      query: (params = {}) => ({ url: '/api/purchases/aging', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    // Drill-down behind a Sales Summary / By Item / By Cashier row.
    getSalesTransactions: builder.query({
      query: (params = {}) => ({ url: '/api/reports/sales/transactions', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getAllSalesTransactions: builder.query({
      query: (params = {}) => ({ url: '/api/reports/sales-transactions', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getSalesTransactionById: builder.query({
      query: (id) => ({ url: `/api/reports/sales-transactions/${id}`, method: 'get' }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getCancelledOrders: builder.query({
      query: (params = {}) => ({ url: '/api/reports/cancelled-orders', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getDashboard: builder.query({
      query: () => ({ url: '/api/reports/dashboard', method: 'get' }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getInventoryInsights: builder.query({
      query: (params = { days: 14 }) => ({ url: '/api/inventory/insights', method: 'get', params }),
      transformResponse: reportPayload,
      providesTags: ['Report'],
      keepUnusedDataFor: FIVE_MIN,
    }),

    // ── List pages ── cached by filter/page params; refreshed on mutation via
    //    invalidateTags (see TAG_MAP comment below). Shorter retention than
    //    reference data since lists turn over more often.
    getPurchases: builder.query({
      query: (params = {}) => ({ url: '/api/purchases', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Purchase'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getPurchase: builder.query({
      query: (id) => ({ url: `/api/purchases/${id}`, method: 'get' }),
      transformResponse: listPayload,
      providesTags: ['Purchase'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getPayments: builder.query({
      query: (params = {}) => ({ url: '/api/payments', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Payment'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getPaymentById: builder.query({
      query: (id) => ({ url: `/api/payments/${id}`, method: 'get' }),
      transformResponse: listPayload,
      providesTags: ['Payment'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getStock: builder.query({
      query: (params = {}) => ({ url: '/api/inventory', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Stock'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getWasteLogs: builder.query({
      query: (params = {}) => ({ url: '/api/inventory/waste-log', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['WasteLog'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getStockIssues: builder.query({
      query: (params = {}) => ({ url: '/api/stock-issues', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['StockIssue'],
      keepUnusedDataFor: TWO_MIN,
    }),
    // Cheap, uncapped pending-transfer counts for the badges → { storePending, kitchenPending }.
    getCustomParties: builder.query({
      query: () => ({ url: '/api/accounting/custom-parties', method: 'get' }),
      transformResponse: (res) => res?.data ?? [],
      providesTags: ['CustomParty'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getTransferPendingCounts: builder.query({
      query: (params = {}) => ({ url: '/api/stock-issues/pending-counts', method: 'get', params }),
      transformResponse: (res) => res?.data ?? { storePending: 0, kitchenPending: 0 },
      providesTags: ['StockIssue'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getStockMovementSummary: builder.query({
      query: (params = {}) => ({ url: '/api/inventory/stock-movement-summary', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Stock'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getStockMovements: builder.query({
      query: (params = {}) => ({ url: '/api/inventory/stock-movements', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Stock'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getVarianceReport: builder.query({
      query: (params = {}) => ({ url: '/api/inventory/variance-report', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Stock'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getAccounts: builder.query({
      query: (params = {}) => ({ url: '/api/accounting/chart-of-accounts', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Account'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getJournalEntries: builder.query({
      query: (params = {}) => ({ url: '/api/accounting/journal-entries', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['JournalEntry'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getLedger: builder.query({
      // accountId omitted → 'all' sentinel = cross-account party statement
      // within the requested AP/AR scope (requires a `party` param). Otherwise
      // a single account, optionally filtered to `party`.
      query: ({ accountId, ...params }) => ({ url: `/api/accounting/ledger/${accountId || 'all'}`, method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Accounting'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getTrialBalance: builder.query({
      query: (params = {}) => ({ url: '/api/accounting/trial-balance', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Accounting'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getProfitAndLoss: builder.query({
      query: (params = {}) => ({ url: '/api/accounting/profit-and-loss', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Accounting'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getBalanceSheet: builder.query({
      query: (params = {}) => ({ url: '/api/accounting/balance-sheet', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Accounting'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getApAging: builder.query({
      query: (params = {}) => ({ url: '/api/accounting/ap-aging', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Accounting'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getArAging: builder.query({
      query: (params = {}) => ({ url: '/api/accounting/ar-aging', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Accounting'],
      keepUnusedDataFor: TWO_MIN,
    }),

    // ── Paginated list variants (full envelope incl. total) ──────────────────
    // The getVendors/getProducts hooks above return a BARE ARRAY for dropdowns.
    // List pages need the { vendors|products, total } envelope for server-side
    // pagination, so they use these dedicated endpoints (same tags → same
    // invalidation refreshes both).
    getVendorsList: builder.query({
      query: (params = {}) => ({ url: '/api/vendors', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Vendor'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getProductsList: builder.query({
      query: (params = {}) => ({ url: '/api/products', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Product'],
      keepUnusedDataFor: TWO_MIN,
    }),

    // ── Menu ──────────────────────────────────────────────────────────────────
    // NOTE: /menu/items returns `{ data: [...], pagination: {...} }` — pagination
    // is a SIBLING of data, so we keep the FULL body (no transformResponse) and
    // the page reads `payload.data` + `payload.pagination`. Same for sessions and
    // the loyalty lists below.
    getMenuItems: builder.query({
      query: (params = {}) => ({ url: '/api/menu/items', method: 'get', params }),
      providesTags: ['MenuItem'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    // Outlet-wide menu counts for the stat cards (total / available / tracked).
    // Tagged 'MenuItem' so any item create/delete/toggle refreshes it too.
    getMenuItemStats: builder.query({
      query: (params = {}) => ({ url: '/api/menu/items/stats', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['MenuItem'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getPrepRecipes: builder.query({
      query: (params = {}) => ({ url: '/api/menu/prep-recipes', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['PrepRecipe'],
      keepUnusedDataFor: FIVE_MIN,
    }),

    // ── POS sessions ──────────────────────────────────────────────────────────
    getSessions: builder.query({
      query: (params = {}) => ({ url: '/api/pos/sessions', method: 'get', params }),
      // sibling pagination — keep full body (payload.data + payload.pagination)
      providesTags: ['Session'],
      keepUnusedDataFor: TWO_MIN,
    }),

    // ── Allowances ────────────────────────────────────────────────────────────
    getAllowances: builder.query({
      query: (period) => ({ url: '/api/allowances', method: 'get', params: period ? { period } : {} }),
      transformResponse: listPayload,
      providesTags: ['Allowance'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getExcessReport: builder.query({
      query: () => ({ url: '/api/allowances/excess', method: 'get' }),
      transformResponse: listPayload,
      providesTags: ['Allowance'],
      keepUnusedDataFor: TWO_MIN,
    }),

    // ── Attendance ────────────────────────────────────────────────────────────
    getAttendanceRecords: builder.query({
      query: (params = {}) => ({ url: '/api/pos/attendance/records', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Attendance'],
      keepUnusedDataFor: TWO_MIN,
    }),

    // ── Salary / Employees ────────────────────────────────────────────────────
    getEmployees: builder.query({
      query: (params = {}) => ({ url: '/api/salary/employees', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Employee'],
      keepUnusedDataFor: FIVE_MIN,
    }),
    getSalaryPayments: builder.query({
      query: (params = {}) => ({ url: '/api/salary/payments', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['SalaryPayment'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getAdvances: builder.query({
      query: (params = {}) => ({ url: '/api/salary/advances', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Advance'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getAdvanceById: builder.query({
      query: (id) => ({ url: `/api/salary/advances/${id}`, method: 'get' }),
      transformResponse: listPayload,
      providesTags: ['Advance'],
      keepUnusedDataFor: TWO_MIN,
    }),

    // ── Tables ────────────────────────────────────────────────────────────────
    getTables: builder.query({
      query: (params = {}) => ({ url: '/api/tables', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['Table'],
      keepUnusedDataFor: FIVE_MIN,
    }),

    // ── Loyalty ───────────────────────────────────────────────────────────────
    getLoyaltyMembers: builder.query({
      query: (params = {}) => ({ url: '/api/loyalty/members', method: 'get', params }),
      // sibling pagination — keep full body (payload.data + payload.pagination)
      providesTags: ['LoyaltyMember'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getLoyaltyTransactions: builder.query({
      query: (params = {}) => ({ url: '/api/loyalty/transactions', method: 'get', params }),
      // sibling pagination — keep full body (payload.data + payload.pagination)
      providesTags: ['LoyaltyTransaction'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getLoyaltyDashboard: builder.query({
      query: () => ({ url: '/api/loyalty/dashboard', method: 'get' }),
      transformResponse: listPayload,
      providesTags: ['LoyaltyReport'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getLoyaltyReports: builder.query({
      query: (params = {}) => ({ url: '/api/loyalty/reports', method: 'get', params }),
      transformResponse: listPayload,
      providesTags: ['LoyaltyReport'],
      keepUnusedDataFor: TWO_MIN,
    }),
    getLoyaltyConfig: builder.query({
      query: () => ({ url: '/api/loyalty/config', method: 'get' }),
      transformResponse: listPayload,
      providesTags: ['LoyaltyConfig'],
      keepUnusedDataFor: TEN_MIN,
    }),

    // ── Users ─────────────────────────────────────────────────────────────────
    getUsers: builder.query({
      query: () => ({ url: '/api/users', method: 'get' }),
      transformResponse: listPayload,
      providesTags: ['User'],
      keepUnusedDataFor: FIVE_MIN,
    }),
  }),
});

// Shared option for report hooks: keep showing the cached result instantly on
// revisit, but kick off a background refetch if the cached data is older than
// 30s. Spread into the second arg of any report hook — e.g.
// useGetSalesSummaryQuery(params, reportQueryOpts).
export const reportQueryOpts = { refetchOnMountOrArgChange: 30 };

// List pages turn over faster than reports; revalidate if the cached page is
// older than 15s, but still render it instantly while the refetch runs.
export const listQueryOpts = { refetchOnMountOrArgChange: 15 };

export const {
  useGetOutletsQuery,
  useGetVendorsQuery,
  useGetProductsQuery,
  useGetMenuCategoriesQuery,
  useGetSalesSummaryQuery,
  useGetSalesByItemQuery,
  useGetSalesByCashierQuery,
  useGetHourlyBreakdownQuery,
  useGetCancelledOrdersQuery,
  useGetCogsQuery,
  useGetCogsByItemQuery,
  useGetCogsItemDetailQuery,
  useGetSpendQuery,
  useGetPriceChangesQuery,
  useGetVendorPerformanceQuery,
  useGetSalesTransactionsQuery,
  useGetAllSalesTransactionsQuery,
  useGetSalesTransactionByIdQuery,
  useGetAgingQuery,
  useGetDashboardQuery,
  useGetInventoryInsightsQuery,
  useGetPurchasesQuery,
  useGetPurchaseQuery,
  useGetPaymentsQuery,
  useGetPaymentByIdQuery,
  useGetStockQuery,
  useGetStockIssuesQuery,
  useGetTransferPendingCountsQuery,
  useGetCustomPartiesQuery,
  useGetStockMovementSummaryQuery,
  useGetStockMovementsQuery,
  useGetWasteLogsQuery,
  useGetVarianceReportQuery,
  useGetAccountsQuery,
  useGetJournalEntriesQuery,
  useGetLedgerQuery,
  useGetTrialBalanceQuery,
  useGetProfitAndLossQuery,
  useGetBalanceSheetQuery,
  useGetApAgingQuery,
  useGetArAgingQuery,
  useGetVendorsListQuery,
  useGetProductsListQuery,
  useGetMenuItemsQuery,
  useGetMenuItemStatsQuery,
  useGetPrepRecipesQuery,
  useGetSessionsQuery,
  useGetAllowancesQuery,
  useGetExcessReportQuery,
  useGetAttendanceRecordsQuery,
  useGetEmployeesQuery,
  useGetSalaryPaymentsQuery,
  useGetAdvancesQuery,
  useGetAdvanceByIdQuery,
  useGetTablesQuery,
  useGetLoyaltyMembersQuery,
  useGetLoyaltyTransactionsQuery,
  useGetLoyaltyDashboardQuery,
  useGetLoyaltyReportsQuery,
  useGetLoyaltyConfigQuery,
  useGetUsersQuery,
} = baseApi;
