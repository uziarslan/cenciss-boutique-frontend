import { createSlice } from '@reduxjs/toolkit';

const orderSlice = createSlice({
    name: 'order',
    initialState: {
        // 'dine-in' | 'takeaway' | 'delivery' | 'foodpanda'
        orderType: 'dine-in',
        // Order number is required; customer name is optional. Both are printed
        // on kitchen/customer slips when available.
        foodPandaOrderNumber: '',
        foodPandaCustomerName: '',
        // Resolved customer object: { _id, name, phone, email, addresses }
        customer: null,
        // Selected delivery address (snapshot from customer.addresses or newly added)
        deliveryAddress: null,
        // Dining table identifier (free text — e.g. "12", "T-3", "Patio 2")
        tableNumber: '',
        // When the cart was resumed from a held order, these tags persist
        // until payment so the next sale can flag them and the held record
        // can be cleaned up. Only one of the two will ever be set.
        resumedFromHoldId: null,        // server-side held SaleTransaction _id
        resumedFromOfflineId: null,     // local hold's clientTransactionId
        // Date string or null. When null, the kitchen never printed the
        // ticket for this resumed order, so the cart should expose a
        // Send-to-Kitchen action.
        resumedKitchenPrintedAt: null,
        // Quantities already communicated to the kitchen, keyed by item +
        // variation. Kept separate from resumedItemQtyMap (the last saved hold)
        // so update tickets contain only positive additions.
        resumedKitchenPrintedQtyMap: {},
        resumedKds: null,
        // Map of menuItemId -> qty captured at resume time. Used by the menu
        // tiles to avoid double-subtracting items that the held order
        // already reserves on the server.
        resumedItemQtyMap: {},
        // Membership / Rewards: points the cashier wants to redeem on this sale.
        redeemPoints: 0,
    },
    reducers: {
        setOrderType(state, action) {
            state.orderType = action.payload;
            // Foodpanda uses the dedicated customer name captured from the
            // platform order. Do not accidentally retain a previous loyalty
            // customer or redemption when the cashier changes the order type.
            if (action.payload === 'foodpanda') {
                state.customer = null;
                state.redeemPoints = 0;
            }
            // Clear delivery address when switching away from delivery
            if (action.payload !== 'delivery') {
                state.deliveryAddress = null;
            }
            // Table only applies to dine-in
            if (action.payload !== 'dine-in') {
                state.tableNumber = '';
            }
            if (action.payload !== 'foodpanda') {
                state.foodPandaOrderNumber = '';
                state.foodPandaCustomerName = '';
            }
        },
        setFoodPandaOrderNumber(state, action) {
            state.foodPandaOrderNumber = action.payload || '';
        },
        setFoodPandaCustomerName(state, action) {
            state.foodPandaCustomerName = action.payload || '';
        },
        setTableNumber(state, action) {
            state.tableNumber = action.payload;
        },
        setResumedFromHoldId(state, action) {
            const payload = action.payload || {};
            // Accept either a plain id string (legacy callsites) or
            // { id, kitchenPrintedAt } so we can hydrate the print flag.
            if (typeof payload === 'string') {
                state.resumedFromHoldId = payload;
                state.resumedKitchenPrintedAt = null;
            } else {
                state.resumedFromHoldId = payload.id || null;
                state.resumedKitchenPrintedAt = payload.kitchenPrintedAt || null;
            }
            state.resumedFromOfflineId = null;
            state.resumedKds = typeof payload === 'object' ? (payload.kds || null) : null;
            state.resumedKitchenPrintedQtyMap = {};
        },
        setResumedFromOfflineId(state, action) {
            // Local holds have no server record, so we don't know their print
            // history — assume not printed so the cashier can re-send.
            state.resumedFromOfflineId = action.payload || null;
            state.resumedFromHoldId = null;
            state.resumedKds = null;
            state.resumedKitchenPrintedAt = null;
            state.resumedKitchenPrintedQtyMap = {};
        },
        markResumedKitchenPrinted(state, action) {
            state.resumedKitchenPrintedAt = action.payload || new Date().toISOString();
        },
        setResumedKitchenPrintedQtyMap(state, action) {
            state.resumedKitchenPrintedQtyMap = action.payload || {};
        },
        setResumedItemQtyMap(state, action) {
            state.resumedItemQtyMap = action.payload || {};
        },
        setResumedKds(state, action) {
            state.resumedKds = action.payload || null;
        },
        clearResumeTag(state) {
            state.resumedKds = null;
            state.resumedFromHoldId = null;
            state.resumedFromOfflineId = null;
            state.resumedKitchenPrintedAt = null;
            state.resumedKitchenPrintedQtyMap = {};
            state.resumedItemQtyMap = {};
        },
        setCustomer(state, action) {
            const next = action.payload;
            // Only clear the chosen delivery address when the customer actually
            // CHANGES. An inline edit of the same customer (e.g. renaming) must not
            // wipe an address the cashier already selected for this order.
            const prevId = state.customer?._id ?? state.customer?.id ?? null;
            const nextId = next?._id ?? next?.id ?? null;
            if (prevId !== nextId) {
                state.deliveryAddress = null;
            }
            state.customer = next;
        },
        clearCustomer(state) {
            state.customer = null;
            state.deliveryAddress = null;
            state.redeemPoints = 0;
        },
        setRedeemPoints(state, action) {
            const n = Math.max(0, Math.floor(Number(action.payload) || 0));
            state.redeemPoints = n;
        },
        clearRedeemPoints(state) {
            state.redeemPoints = 0;
        },
        setDeliveryAddress(state, action) {
            state.deliveryAddress = action.payload;
        },
        resetOrder(state) {
            state.resumedKds = null;
            state.orderType = 'dine-in';
            state.foodPandaOrderNumber = '';
            state.foodPandaCustomerName = '';
            state.customer = null;
            state.deliveryAddress = null;
            state.tableNumber = '';
            state.resumedFromHoldId = null;
            state.resumedFromOfflineId = null;
            state.resumedKitchenPrintedAt = null;
            state.resumedKitchenPrintedQtyMap = {};
            state.resumedItemQtyMap = {};
            state.redeemPoints = 0;
        },
        // Merge updated address list back into customer (after adding a new address)
        updateCustomerAddresses(state, action) {
            if (state.customer) {
                state.customer = { ...state.customer, addresses: action.payload };
            }
        },
    },
});

export const {
    setOrderType,
    setFoodPandaOrderNumber,
    setFoodPandaCustomerName,
    setCustomer,
    clearCustomer,
    setDeliveryAddress,
    setTableNumber,
    setResumedFromHoldId,
    setResumedFromOfflineId,
    markResumedKitchenPrinted,
    setResumedKitchenPrintedQtyMap,
    setResumedItemQtyMap,
    setResumedKds,
    clearResumeTag,
    resetOrder,
    updateCustomerAddresses,
    setRedeemPoints,
    clearRedeemPoints,
} = orderSlice.actions;

export default orderSlice.reducer;
