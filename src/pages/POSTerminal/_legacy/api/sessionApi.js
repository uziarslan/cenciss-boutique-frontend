import api from './axios';

const unwrap = (response) => response.data?.data ?? response.data;

export const getHeldOrders = (outletCode) =>
    api.get(`/api/pos/held-orders/${outletCode}`).then(unwrap);

export const getKdsReadyCounts = (outletId) =>
    api.get('/api/kds/ready-counts', { params: { outletId } }).then(unwrap);

export const acknowledgeKdsReady = (kdsOrderId) =>
    api.patch(`/api/kds/orders/${encodeURIComponent(kdsOrderId)}/acknowledge`).then(unwrap);

// Resumes a held transaction. The record stays in the DB (still 'held') so
// the cashier can find it again if they clear the cart by mistake. The
// matching SaleTransaction is removed when the resumed sale is paid.
export const resumeHeldOrder = (id) =>
    api.post(`/api/pos/held-orders/${encodeURIComponent(id)}/resume`).then(unwrap);

// Cancels a held order (keeps the record as 'void'). prepared=true also deducts
// the recipe from stock and logs it as waste. A reason is always required.
export const cancelHeldOrder = (
    id,
    { prepared, voidReason = '', selection = null, valuationMethod } = {},
) => api.post(`/api/pos/held-orders/${encodeURIComponent(id)}/cancel`, {
    prepared,
    voidReason,
    selection,
    ...(valuationMethod ? { valuationMethod } : {}),
}).then(unwrap);

// Stamps a held order as kitchen-printed.
export const markHeldOrderPrinted = (id, qtyMap = {}) =>
    api.patch(`/api/pos/held-orders/${encodeURIComponent(id)}/printed`, { qtyMap }).then(unwrap);

// Move `qty` units of a menu item from one (server) held order to another.
// payload: { targetHoldId, menuItemId, qty }
export const moveHeldOrderItem = (sourceId, payload) =>
    api.patch(`/api/pos/held-orders/${encodeURIComponent(sourceId)}/move-item`, payload).then(unwrap);

export const getTransactionsBySession = (sessionId) =>
    api.get(`/api/pos/transactions/${sessionId}`).then(unwrap);

// Shared outlet history. The server derives the outlet from the authenticated
// cashier, so a crafted request cannot expose another outlet's transactions.
export const getMyTransactions = (params = {}) =>
    api.get('/api/pos/transactions/me', { params }).then((r) => r.data);

export const closeSessionApi = (payload) =>
    api.post('/api/pos/sessions/close', payload).then(unwrap);

// Record a petty-cash drawer movement on the open session.
// payload: { type: 'payout' | 'cash_in', amount, reason? }
export const recordDrawerMovement = (payload) =>
    api.post('/api/pos/sessions/drawer-movement', payload).then(unwrap);
export const issueEmployeeAdvanceFromDrawer = (payload) =>
    api.post('/api/pos/sessions/employee-advance', payload).then(unwrap);
export const updateDrawerMovement = (id, payload) =>
    api.patch(`/api/pos/sessions/drawer-movement/${encodeURIComponent(id)}`, payload).then(unwrap);
export const deleteDrawerMovement = (id) =>
    api.delete(`/api/pos/sessions/drawer-movement/${encodeURIComponent(id)}`).then(unwrap);

// Log one of the cashier's own completed orders as waste (POS order history).
// payload: { reason?, notes?, rePrepare? } — rePrepare re-deducts stock for a re-cook.
export const logOrderAsWaste = (id, payload = {}) =>
    api.post(`/api/pos/transactions/${encodeURIComponent(id)}/waste`, payload).then(unwrap);

// Authoritative ingredient-cost and allocated order-value preview shared by
// held-order cancellation and paid-order history waste flows.
export const getOrderWastePreview = (id) =>
    api.get(`/api/pos/transactions/${encodeURIComponent(id)}/waste-preview`).then(unwrap);

// Retry a PRA sale/credit invoice (owner/financeManager only).
export const retryPraSubmission = (id) =>
    api.post(`/api/pra/retry/${encodeURIComponent(id)}`).then(unwrap);

// Outlet list for non-cashier roles (owner/manager) who pick which outlet's
// till to open. unwrap returns the array under `data`.
//
// Outlets almost never change during a shift, so we cache the result in-module
// for a few minutes (and dedupe concurrent calls via the in-flight promise) —
// the same stale-while-fresh philosophy the menu/loyalty-config caches use.
// This keeps the session-open screen instant when re-entered.
const OUTLETS_TTL = 5 * 60 * 1000;
let cachedOutlets = null;
let cachedOutletsAt = 0;
let cachedOutletsPromise = null;

export const getOutlets = () => {
    if (cachedOutlets && Date.now() - cachedOutletsAt < OUTLETS_TTL) {
        return Promise.resolve(cachedOutlets);
    }
    if (cachedOutletsPromise) return cachedOutletsPromise;
    cachedOutletsPromise = api
        .get('/api/outlets', { params: { limit: 100 } })
        .then(unwrap)
        .then((list) => {
            cachedOutlets = list;
            cachedOutletsAt = Date.now();
            cachedOutletsPromise = null;
            return list;
        })
        .catch((err) => {
            // Don't poison the cache on a transient failure — let the next
            // caller re-probe.
            cachedOutletsPromise = null;
            throw err;
        });
    return cachedOutletsPromise;
};
