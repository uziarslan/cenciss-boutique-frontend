import { createSlice } from '@reduxjs/toolkit';
import {
    addToQueue,
    getQueue,
    updateQueueEntry,
    removeFromQueue,
    clearQueue,
    getOfflineHolds,
    addOfflineHold,
    updateOfflineHold,
    removeOfflineHold,
    setOfflineHolds,
    clearOfflineHolds,
    resolveOfflineCashAmount,
} from '../../utils/offlineQueue';
import {
    kitchenLineKey,
    normalizePrintedQuantityMap,
    transferPrintedQuantity,
} from '../../utils/kitchenPrintedQuantity';
import { calculateLineCharges } from '../../utils/chargeInclusivePricing';
import { dealSelectionSignature } from '../../utils/dealPricing';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Recompute an offline hold's line + header totals from its stored prices.
// Mirrors the backend recompute used by the move-item endpoint so the locally
// held order shows the same numbers it will once it syncs to the server.
const recomputeHold = (hold, scConfig = {}) => {
    // Service charge is the outlet's central rate, applied to every line, only for
    // the enabled order types — gated by this hold's own order type.
    const types = Array.isArray(scConfig.serviceChargeOrderTypes) ? scConfig.serviceChargeOrderTypes : ['dine-in'];
    const scRate = types.includes(hold.orderType || 'dine-in') ? Number(scConfig.serviceChargeRate || 0) : 0;
    const items = (hold.items || []).map((it) => {
        const priced = calculateLineCharges({
            listedUnitPrice: it.listedUnitPrice ?? it.unitPrice,
            qty: it.qty,
            priceMode: it.priceMode,
            taxable: hold.orderType !== 'foodpanda' && Number(it.taxRate || 0) > 0,
            taxRate: hold.orderType === 'foodpanda' ? 0 : Number(it.taxRate || 0),
            serviceChargeRate: scRate,
        });
        return {
            ...it,
            ...priced,
            serviceChargeRate: scRate,
            serviceChargeAmount: priced.serviceChargeAmount,
        };
    });
    const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
    const tax = round2(items.reduce((s, i) => s + (i.taxAmount || 0), 0));
    const serviceCharge = round2(items.reduce((s, i) => s + (i.serviceChargeAmount || 0), 0));
    const itemDisc = round2(items.reduce((s, i) => s + (i.discountAmount || 0), 0));
    let orderDisc;
    if (hold.orderType === 'foodpanda') {
        items.forEach((item) => { item.discountAmount = 0; });
        orderDisc = 0;
    } else if (hold.discountMode === 'percent') {
        orderDisc = round2(subtotal * ((hold.discountPercent || 0) / 100));
    } else {
        const prevOrderDisc = Math.max(0, round2((hold.discountAmount || 0) - itemDisc));
        orderDisc = Math.max(0, Math.min(prevOrderDisc, round2(subtotal + tax + serviceCharge - itemDisc)));
    }
    const combined = hold.orderType === 'foodpanda' ? 0 : round2(itemDisc + orderDisc);
    // Delivery charge counts toward the bill only for delivery orders (mirrors the server).
    const delivery = (hold.orderType === 'delivery') ? round2(hold.deliveryChargeAmount || 0) : 0;
    hold.items = items;
    hold.subtotal = subtotal;
    hold.taxAmount = tax;
    hold.serviceChargeAmount = serviceCharge;
    hold.deliveryChargeAmount = delivery;
    hold.discountAmount = combined;
    if (hold.orderType === 'foodpanda') {
        hold.discountMode = 'amount';
        hold.discountPercent = 0;
        hold.pointsRedeemed = 0;
    }
    hold.totalAmount = round2(Math.max(0, subtotal + tax + serviceCharge + delivery - combined));
};

const itemMenuId = (it) => String(it.menuItemId || it.menuItem || it.id || it._id || '');
const itemVariationId = (it) => (it.variationId ?? it.variation?.id ?? null);
// A line matches on item AND size, so two sizes of one item stay distinct.
const itemMatches = (it, menuItemId, variationId, dealSelections = []) =>
    itemMenuId(it) === String(menuItemId)
    && (itemVariationId(it) ?? null) === (variationId ?? null)
    && dealSelectionSignature(it.dealSelections || []) === dealSelectionSignature(dealSelections);

const offlineSlice = createSlice({
    name: 'offline',
    initialState: {
        queue: [],
        holdQueue: [],
        isSyncing: false,
        lastSyncAttempt: null,
    },
    reducers: {
        loadQueue: (state) => {
            state.queue = getQueue();
        },
        addToOfflineQueue: (state, action) => {
            addToQueue(action.payload);
            state.queue = getQueue();
        },
        markSynced: (state, action) => {
            removeFromQueue(action.payload);
            state.queue = state.queue.filter((entry) => entry.clientTransactionId !== action.payload);
        },
        markSyncing: (state, action) => {
            const id = typeof action.payload === 'string' ? action.payload : action.payload?.id;
            if (!id) return;
            updateQueueEntry(id, {
                status: 'syncing',
                lastAttemptAt: new Date().toISOString(),
                lastError: null,
                errorCode: null,
                errorDetails: null,
            });
            state.queue = getQueue();
        },
        markFailed: (state, action) => {
            const payload = typeof action.payload === 'string'
                ? { id: action.payload }
                : (action.payload || {});
            const entry = state.queue.find((candidate) => candidate.clientTransactionId === payload.id);
            if (!entry) return;
            updateQueueEntry(payload.id, {
                status: 'failed',
                retries: (entry.retries || 0) + 1,
                lastAttemptAt: new Date().toISOString(),
                lastError: payload.error || 'Sync failed.',
                errorCode: payload.code || null,
                errorDetails: payload.details || null,
                retryable: payload.retryable !== false,
            });
            state.queue = getQueue();
        },
        repairOfflineCashAmount: (state, action) => {
            resolveOfflineCashAmount(action.payload);
            state.queue = getQueue();
        },
        discardOfflineSale: (state, action) => {
            removeFromQueue(action.payload);
            state.queue = getQueue();
        },
        clearOfflineSales: (state) => {
            clearQueue();
            state.queue = getQueue();
        },
        setSyncing: (state, action) => {
            state.isSyncing = action.payload;
        },
        setSyncAttempt: (state) => {
            state.lastSyncAttempt = new Date().toISOString();
        },

        // ── Hold queue ──────────────────────────────────────────────────────
        loadHoldQueue: (state) => {
            state.holdQueue = getOfflineHolds();
        },
        addToOfflineHoldQueue: (state, action) => {
            addOfflineHold(action.payload);
            state.holdQueue = getOfflineHolds();
        },
        updateQueuedOfflineHold: (state, action) => {
            const { id, changes } = action.payload || {};
            if (!id) return;
            const existing = getOfflineHolds().find((hold) => hold.clientTransactionId === id);
            const nextChanges = { ...(changes || {}) };
            if (existing && Array.isArray(nextChanges.items)) {
                const existingBaseline = normalizePrintedQuantityMap(
                    existing.items,
                    existing.kitchenPrintedQtyMap,
                    { assumeAllPrinted: Boolean(existing.kitchenPrintedAt || existing.kitchenPrintQueuedAt) },
                );
                nextChanges.kitchenPrintedQtyMap = normalizePrintedQuantityMap(
                    nextChanges.items,
                    existingBaseline,
                );
            }
            updateOfflineHold(id, {
                ...nextChanges,
                status: 'pending',
                retries: 0,
                lastAttemptAt: null,
                lastError: null,
                errorCode: null,
                retryable: true,
            });
            state.holdQueue = getOfflineHolds();
        },
        markHoldSynced: (state, action) => {
            removeOfflineHold(action.payload);
            state.holdQueue = state.holdQueue.filter((h) => h.clientTransactionId !== action.payload);
        },
        markHoldSyncing: (state, action) => {
            const id = typeof action.payload === 'string' ? action.payload : action.payload?.id;
            if (!id) return;
            updateOfflineHold(id, {
                status: 'syncing',
                lastAttemptAt: new Date().toISOString(),
                lastError: null,
                errorCode: null,
            });
            state.holdQueue = getOfflineHolds();
        },
        markHoldFailed: (state, action) => {
            const payload = typeof action.payload === 'string'
                ? { id: action.payload }
                : (action.payload || {});
            const entry = state.holdQueue.find((candidate) => candidate.clientTransactionId === payload.id);
            if (!entry) return;
            updateOfflineHold(payload.id, {
                status: 'failed',
                retries: (entry.retries || 0) + 1,
                lastAttemptAt: new Date().toISOString(),
                lastError: payload.error || 'Sync failed.',
                errorCode: payload.code || null,
                retryable: payload.retryable !== false,
            });
            state.holdQueue = getOfflineHolds();
        },
        discardOfflineHold: (state, action) => {
            removeOfflineHold(action.payload);
            state.holdQueue = getOfflineHolds();
        },
        clearOfflineHoldQueue: (state) => {
            clearOfflineHolds();
            state.holdQueue = getOfflineHolds();
        },

        // Move `qty` units of a menu item between two locally-held (offline)
        // orders. Both are identified by clientTransactionId. Totals are
        // recomputed and the queue is re-persisted to localStorage. An emptied
        // source hold is removed entirely.
        // payload: { sourceId, targetId, menuItemId, qty }
        moveOfflineHoldItem: (state, action) => {
            const { sourceId, targetId, menuItemId, variationId, dealSelections = [], qty, serviceChargeRate, serviceChargeOrderTypes } = action.payload;
            const scConfig = { serviceChargeRate, serviceChargeOrderTypes };
            const holds = getOfflineHolds();
            const source = holds.find((h) => h.clientTransactionId === sourceId);
            const target = holds.find((h) => h.clientTransactionId === targetId);
            if (!source || !target || sourceId === targetId) return;

            const line = (source.items || []).find((it) => itemMatches(it, menuItemId, variationId, dealSelections));
            if (!line || qty < 1 || qty > line.qty) return;

            const sourcePrintedBaseline = normalizePrintedQuantityMap(
                source.items,
                source.kitchenPrintedQtyMap,
                { assumeAllPrinted: Boolean(source.kitchenPrintedAt || source.kitchenPrintQueuedAt) },
            );
            const targetPrintedBaseline = normalizePrintedQuantityMap(
                target.items,
                target.kitchenPrintedQtyMap,
                { assumeAllPrinted: Boolean(target.kitchenPrintedAt || target.kitchenPrintQueuedAt) },
            );
            const movedLineKey = kitchenLineKey(line);

            const movedDisc = round2((line.discountAmount || 0) * (qty / line.qty));
            const moved = {
                menuItemId: line.menuItemId || line.menuItem || line.id,
                variationId: line.variationId,
                variationName: line.variationName,
                name: line.name,
                listedUnitPrice: line.listedUnitPrice ?? line.unitPrice,
                priceMode: line.priceMode || 'exclusive',
                unitPrice: line.unitPrice,
                taxRate: line.taxRate || 0,
                serviceCharge: line.serviceCharge || 0,
                dealSelections: line.dealSelections || [],
                dealComponents: line.dealComponents || [],
            };

            // Reduce / remove from source.
            line.qty -= qty;
            line.discountAmount = round2((line.discountAmount || 0) - movedDisc);
            if (line.qty <= 0) {
                source.items = source.items.filter((it) => !itemMatches(it, menuItemId, variationId, dealSelections));
            }

            // Merge into target (same item + size + price + tax) or add a new line.
            const tLine = (target.items || []).find((it) =>
                itemMatches(it, menuItemId, variationId, dealSelections) &&
                it.unitPrice === moved.unitPrice && (it.taxRate || 0) === moved.taxRate);
            if (tLine) {
                tLine.qty += qty;
                tLine.discountAmount = round2((tLine.discountAmount || 0) + movedDisc);
            } else {
                target.items = [...(target.items || []), { ...moved, qty, discountAmount: movedDisc }];
            }

            const printTransfer = transferPrintedQuantity({
                sourceBaseline: sourcePrintedBaseline,
                targetBaseline: targetPrintedBaseline,
                nextSourceItems: source.items,
                nextTargetItems: target.items,
                lineKey: movedLineKey,
                movedQuantity: qty,
            });
            source.kitchenPrintedQtyMap = printTransfer.sourcePrintedQuantityMap;
            target.kitchenPrintedQtyMap = printTransfer.targetPrintedQuantityMap;

            recomputeHold(target, scConfig);

            let next;
            if (source.items.length === 0) {
                next = holds.filter((h) => h.clientTransactionId !== sourceId);
            } else {
                recomputeHold(source, scConfig);
                next = holds;
            }

            setOfflineHolds(next);
            state.holdQueue = getOfflineHolds();
        },
    },
});

export const {
    loadQueue,
    addToOfflineQueue,
    markSynced,
    markSyncing,
    markFailed,
    repairOfflineCashAmount,
    discardOfflineSale,
    clearOfflineSales,
    setSyncing,
    setSyncAttempt,
    loadHoldQueue,
    addToOfflineHoldQueue,
    updateQueuedOfflineHold,
    markHoldSynced,
    markHoldSyncing,
    markHoldFailed,
    discardOfflineHold,
    clearOfflineHoldQueue,
    moveOfflineHoldItem,
} = offlineSlice.actions;
export default offlineSlice.reducer;
