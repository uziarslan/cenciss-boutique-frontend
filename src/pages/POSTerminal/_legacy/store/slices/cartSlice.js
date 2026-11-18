import { createSlice, createSelector } from '@reduxjs/toolkit';
import { calculateCartCharges } from '../../utils/chargeInclusivePricing';
import { dealSelectionSignature } from '../../utils/dealPricing';

// A cart line is identified by its menu item AND its chosen size, so a Small and
// a Large of the same item are separate lines (different price + recipe).
const lineKeyOf = (id, variationId, dealSelections = []) => {
    const base = `${id}::${variationId ?? ''}`;
    const signature = dealSelectionSignature(dealSelections);
    return signature ? `${base}::${signature}` : base;
};

// Convert the live POS menu into the compact lookup consumed by
// `syncMenuRates`. Keep this in one place so ordinary cart refreshes, held-order
// resumes and checkout all apply the exact same current tax marker and prices.
export const buildMenuRateLookup = (categories = [], orderType = 'dine-in') => {
    const menuById = {};
    for (const category of (categories || [])) {
        for (const item of (category.items || [])) {
            const itemId = item._id || item.id;
            if (!itemId) continue;
            menuById[String(itemId)] = {
                categoryId: category._id || category.id || null,
                categoryName: category.name || '',
                // A menu item's tax rate is a taxable/exempt marker. Normalize
                // missing/disabled values to zero so no legacy/default rate can
                // survive when the current menu says the item is exempt.
                taxRate: Number(item.taxRate) > 0 ? Number(item.taxRate) : 0,
                serviceCharge: Number(item.serviceCharge) || 0,
                priceMode: item.priceMode === 'inclusive' ? 'inclusive' : 'exclusive',
                price: orderType === 'foodpanda' && item.foodPandaPrice != null
                    ? item.foodPandaPrice
                    : item.price,
                variations: Object.fromEntries((item.variations || []).map((variation) => [
                    String(variation._id || variation.id),
                    orderType === 'foodpanda' && variation.foodPandaPrice != null
                        ? variation.foodPandaPrice
                        : variation.price,
                ])),
                dealOptionAdjustments: Object.fromEntries(
                    (item.dealConfig?.choiceGroups || []).flatMap((group) => (group.options || []).map((option) => [
                        String(option._id),
                        Number(option.priceAdjustment) || 0,
                    ])),
                ),
            };
        }
    }
    return menuById;
};

const cartSlice = createSlice({
    name: 'cart',
    initialState: {
        items: [],
        discount: 0,
        discountMode: 'amount', // 'amount' | 'percent'
        discountPercent: 0,     // raw % value when mode is 'percent'
        deliveryCharge: 0,      // order-level delivery fee (delivery orders only)
        note: '',
        cashierNote: '',
        sourceHeldOrderId: null,
        kdsItemCancellationVersion: 0,
        // Cancellation answers keyed by stable item/variation/deal identity.
        // Keep legacy reasons for restored carts; new cancellations also require
        // an explicit boolean preparation choice. The server derives quantities.
        heldItemCancellationReasons: {},
        heldItemCancellationDetails: {},
    },
    reducers: {
        addItem: (state, action) => {
            // payload is the menu item, optionally with a chosen `variation`
            // ({ _id, name, price }) attached when the item has sizes.
            const menuItem = action.payload;
            const itemId = menuItem._id || menuItem.id;
            const variation = menuItem.variation || null;
            const variationId = variation?._id ?? variation?.id ?? null;
            const dealSelections = menuItem.dealSelections || [];
            const key = lineKeyOf(itemId, variationId, dealSelections);
            const existing = state.items.find((item) => item.lineKey === key);
            if (existing) {
                existing.qty += 1;
            } else {
                state.items.push({
                    id: itemId,
                    lineKey: key,
                    variationId,
                    variationName: variation?.name ?? null,
                    name: menuItem.name,
                    categoryId: menuItem.categoryId || menuItem.category?._id || menuItem.category || null,
                    categoryName: menuItem.categoryName || menuItem.category?.name || '',
                    unitPrice: variation ? (variation.price ?? 0) : (menuItem.price ?? 0),
                    listedUnitPrice: variation ? (variation.price ?? 0) : (menuItem.price ?? 0),
                    priceMode: menuItem.priceMode === 'inclusive' ? 'inclusive' : 'exclusive',
                    taxRate: menuItem.taxRate ?? 0,
                    serviceCharge: menuItem.serviceCharge ?? 0,
                    isAvailable: menuItem.isAvailable ?? true,
                    dealSelections,
                    dealComponents: menuItem.dealComponents || [],
                    dealSummary: menuItem.summary || [],
                    dealPriceAdjustment: Number(menuItem.priceAdjustment) || 0,
                    qty: 1,
                });
            }
        },
        removeItem: (state, action) => {
            state.items = state.items.filter((item) => item.lineKey !== action.payload);
        },
        incrementQty: (state, action) => {
            const item = state.items.find((item) => item.lineKey === action.payload);
            if (item) item.qty += 1;
        },
        decrementQty: (state, action) => {
            const item = state.items.find((item) => item.lineKey === action.payload);
            if (item && item.qty > 1) item.qty -= 1;
        },
        setItemQty: (state, action) => {
            const { lineKey, qty } = action.payload;
            const item = state.items.find((item) => item.lineKey === lineKey);
            if (item && qty >= 1) {
                item.qty = qty;
            }
        },
        recordHeldItemCancellation: (state, action) => {
            const { lineKey, reason, prepared } = action.payload || {};
            const normalizedReason = String(reason || '').trim();
            if (!lineKey || normalizedReason.length < 3 || typeof prepared !== 'boolean') return;
            if (!state.heldItemCancellationReasons) state.heldItemCancellationReasons = {};
            state.heldItemCancellationReasons[lineKey] = normalizedReason;
            state.heldItemCancellationDetails ||= {};
            state.heldItemCancellationDetails[lineKey] = { reason: normalizedReason, prepared };
        },
        clearHeldItemCancellationReasons: (state) => {
            state.heldItemCancellationReasons = {};
            state.heldItemCancellationDetails = {};
        },
        clearCart: (state) => {
            state.items = [];
            state.discount = 0;
            state.discountMode = 'amount';
            state.discountPercent = 0;
            state.deliveryCharge = 0;
            state.note = '';
            state.cashierNote = '';
            state.sourceHeldOrderId = null;
            state.kdsItemCancellationVersion = 0;
            state.heldItemCancellationReasons = {};
            state.heldItemCancellationDetails = {};
        },
        setDiscount: (state, action) => {
            state.discount = Number(action.payload) || 0;
        },
        setDiscountMode: (state, action) => {
            state.discountMode = action.payload || 'amount';
        },
        setDiscountPercent: (state, action) => {
            state.discountPercent = Number(action.payload) || 0;
        },
        setDeliveryCharge: (state, action) => {
            state.deliveryCharge = Math.max(0, Number(action.payload) || 0);
        },
        setNote: (state, action) => {
            state.note = action.payload || '';
        },
        setCashierNote: (state, action) => {
            state.cashierNote = action.payload || '';
        },
        loadHeldOrder: (state, action) => {
            // action.payload: { items, discountAmount?, discountMode?, discountPercent? } or array of items (legacy)
            const payload = action.payload;
            const rawItems = Array.isArray(payload) ? payload : (payload.items ?? []);
            const restoredDiscount = Array.isArray(payload) ? 0 : (payload.discountAmount ?? 0);
            const restoredMode = Array.isArray(payload) ? 'amount' : (payload.discountMode ?? 'amount');
            const restoredPercent = Array.isArray(payload) ? 0 : (payload.discountPercent ?? 0);
            state.items = rawItems.map((item) => {
                const id = item.menuItem || item.menuItemId || item.id || item._id;
                const variationId = item.variation?.id ?? item.variationId ?? null;
                const dealSelections = (item.dealSelections || []).map((selection) => ({
                    groupId: selection.groupId,
                    optionIds: selection.optionIds || [],
                }));
                return {
                    id,
                    lineKey: lineKeyOf(id, variationId, dealSelections),
                    variationId,
                    variationName: item.variation?.name ?? item.variationName ?? null,
                    name: item.name,
                    categoryId: item.categoryId || item.category?._id || item.category || null,
                    categoryName: item.categoryName || item.category?.name || '',
                    unitPrice: item.listedUnitPrice ?? item.unitPrice ?? 0,
                    listedUnitPrice: item.listedUnitPrice ?? item.unitPrice ?? 0,
                    priceMode: item.priceMode === 'inclusive' ? 'inclusive' : 'exclusive',
                    taxRate: item.taxRate ?? 0,
                    serviceCharge: item.serviceCharge ?? item.serviceChargeRate ?? 0,
                    isAvailable: true,
                    dealSelections,
                    dealComponents: item.dealComponents || [],
                    dealSummary: (item.dealComponents || []).map((component) => (
                        `${component.groupName ? `${component.groupName}: ` : ''}${component.name}`
                    )),
                    dealPriceAdjustment: (item.dealComponents || []).reduce(
                        (sum, component) => sum + (Number(component.priceAdjustment) || 0),
                        0,
                    ),
                    qty: item.qty,
                };
            });
            state.discount = restoredDiscount;
            state.discountMode = restoredMode;
            state.discountPercent = restoredPercent;
            state.deliveryCharge = Array.isArray(payload) ? 0 : (payload.deliveryChargeAmount ?? 0);
            state.note = Array.isArray(payload) ? '' : (payload.notes ?? '');
            state.cashierNote = Array.isArray(payload) ? '' : (payload.cashierNotes ?? '');
            state.sourceHeldOrderId = Array.isArray(payload) ? null : (payload.sourceHeldOrderId ?? null);
            state.kdsItemCancellationVersion = Array.isArray(payload) ? 0 : (payload.kdsItemCancellationVersion || 0);
            state.heldItemCancellationReasons = {};
            state.heldItemCancellationDetails = {};
        },
        // Reconcile each line's tax / service-charge rate and unit price against the
        // CURRENT menu — the same source the server recomputes from at checkout.
        // Without this, a line added before a rate/price was set (or rehydrated
        // stale from localStorage) makes the cart total diverge from the server
        // total and the sale gets rejected at payment.
        // payload: { [menuItemId]: { taxRate, serviceCharge, price, variations: { [variationId]: price } } }
        syncMenuRates: (state, action) => {
            const menuById = action.payload || {};
            state.items.forEach((line) => {
                const mi = menuById[String(line.id)];
                if (!mi) return; // not in current menu (e.g. deleted) — leave the line as-is
                if (mi.taxRate != null) line.taxRate = mi.taxRate;
                if (mi.serviceCharge != null) line.serviceCharge = mi.serviceCharge;
                line.priceMode = mi.priceMode === 'inclusive' ? 'inclusive' : 'exclusive';
                if (line.dealSelections?.length) {
                    line.dealPriceAdjustment = line.dealSelections.reduce(
                        (total, selection) => total + (selection.optionIds || []).reduce(
                            (sum, optionId) => sum + (Number(mi.dealOptionAdjustments?.[String(optionId)]) || 0),
                            0,
                        ),
                        0,
                    );
                }
                if (mi.categoryId != null) line.categoryId = mi.categoryId;
                if (mi.categoryName != null) line.categoryName = mi.categoryName;
                if (line.variationId) {
                    const vp = mi.variations?.[line.variationId];
                    if (vp != null) {
                        line.unitPrice = Number(vp) + (Number(line.dealPriceAdjustment) || 0);
                        line.listedUnitPrice = line.unitPrice;
                    }
                } else if (mi.price != null) {
                    line.unitPrice = Number(mi.price) + (Number(line.dealPriceAdjustment) || 0);
                    line.listedUnitPrice = line.unitPrice;
                }
            });
        },
    },
});

export const {
    addItem,
    removeItem,
    incrementQty,
    decrementQty,
    setItemQty,
    recordHeldItemCancellation,
    clearHeldItemCancellationReasons,
    clearCart,
    setDiscount,
    setDiscountMode,
    setDiscountPercent,
    setDeliveryCharge,
    setNote,
    setCashierNote,
    loadHeldOrder,
    syncMenuRates,
} = cartSlice.actions;

const selectCart = (state) => state.cart;

export const selectCartItemCount = createSelector([selectCart], (cart) =>
    cart.items.reduce((total, item) => total + item.qty, 0)
);

const selectTaxConfig = (state) => state.taxConfig;
const selectOrderType = (state) => state.order?.orderType ?? 'dine-in';
const selectServiceChargeOrderTypes = (state) => state.taxConfig?.serviceChargeOrderTypes;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const selectServiceChargeEnabled = createSelector(
    [selectServiceChargeOrderTypes, selectOrderType],
    (types, orderType) => (Array.isArray(types) ? types : ['dine-in']).includes(orderType)
);

// Standard/cash quote used by the cart before a payment method is selected.
// Inclusive lines are reverse-calculated here so tax/service are displayed as
// components without being added to the authored menu price a second time.
export const selectCartPricing = createSelector(
    [selectCart, selectTaxConfig, selectOrderType],
    (cart, cfg, orderType) => {
        const serviceTypes = Array.isArray(cfg?.serviceChargeOrderTypes)
            ? cfg.serviceChargeOrderTypes
            : ['dine-in'];
        const serviceChargeRate = serviceTypes.includes(orderType)
            ? Number(cfg?.serviceChargeRate || 0)
            : 0;
        return calculateCartCharges(cart.items, {
            taxRate: orderType === 'foodpanda' ? 0 : Number(cfg?.standardRate || 0),
            serviceChargeRate,
        });
    }
);

export const selectCartSubtotal = createSelector([selectCartPricing], (pricing) => pricing.subtotal);
export const selectCartTax = createSelector([selectCartPricing], (pricing) => pricing.taxAmount);
export const selectCartServiceCharge = createSelector([selectCartPricing], (pricing) => pricing.serviceChargeAmount);
export const selectCartTaxableSubtotal = createSelector([selectCartPricing], (pricing) =>
    round2(pricing.items.reduce((total, item) => total + (Number(item.taxRate || 0) > 0 ? item.lineTotal : 0), 0))
);

// Order-level delivery charge — only applied to delivery orders (mirrors the
// server, which ignores it for dine-in/takeaway). Stored value persists across
// order-type toggles but only counts toward the bill while type is 'delivery'.
export const selectCartDeliveryCharge = createSelector(
    [selectCart, selectOrderType],
    (cart, orderType) => (orderType === 'delivery' ? round2(cart.deliveryCharge || 0) : 0)
);

export const selectCartTotal = createSelector(
    [
        selectCartSubtotal,
        selectCartTax,
        selectCartServiceCharge,
        selectCartDeliveryCharge,
        (state) => state.cart.discount,
        selectOrderType,
    ],
    (subtotal, tax, serviceCharge, deliveryCharge, discount, orderType) =>
        Math.max(
            0,
            subtotal + tax + serviceCharge + deliveryCharge
                - (orderType === 'foodpanda' ? 0 : discount)
        )
);

export default cartSlice.reducer;
