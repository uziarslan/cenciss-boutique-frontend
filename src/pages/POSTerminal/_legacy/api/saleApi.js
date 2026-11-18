import api from './axios';

export const processSale = async (payload) => {
    const response = await api.post('/api/pos/sale', payload);
    return response.data?.data ?? response.data;
};

export const buildHoldOrderBody = (payload) => {
    const {
        clientTransactionId,
        items,
        notes,
        cashierNotes,
        discountAmount,
        discountMode,
        discountPercent,
        orderType,
        customerId,
        deliveryAddress,
        deliveryChargeAmount,
        tableNumber,
        foodPandaOrderNumber,
        foodPandaCustomerName,
        redeemPoints,
        outletCode,
        sessionId,
        cashierId,
        queuedAt,
        kitchenPrintedAt,
        kitchenPrintedQtyMap,
    } = payload;
    return {
        items: items.map(({ menuItemId, variationId, dealSelections, qty, discountAmount: itemDiscount }) => ({
            menuItemId,
            ...(variationId != null && { variationId }),
            ...(dealSelections?.length && { dealSelections }),
            qty,
            ...(itemDiscount != null && { discountAmount: itemDiscount }),
        })),
        ...(discountAmount != null && discountAmount > 0 && { discountAmount }),
        ...(discountMode && discountMode !== 'amount' && { discountMode }),
        ...(discountPercent != null && discountPercent > 0 && { discountPercent }),
        ...(clientTransactionId && { clientTransactionId }),
        ...(queuedAt && { queuedAt, outletCode, sessionId, cashierId }),
        ...(kitchenPrintedAt && { kitchenPrintedAt }),
        ...(kitchenPrintedQtyMap && typeof kitchenPrintedQtyMap === 'object' && { kitchenPrintedQtyMap }),
        ...(notes && { notes }),
        ...(cashierNotes && { cashierNotes }),
        orderType: orderType || 'dine-in',
        ...(orderType === 'foodpanda' && { foodPandaOrderNumber, foodPandaCustomerName }),
        ...(customerId && { customerId }),
        ...((orderType || 'dine-in') === 'dine-in' && tableNumber && { tableNumber }),
        ...(orderType === 'delivery' && deliveryAddress && { deliveryAddress }),
        ...(orderType === 'delivery' && deliveryChargeAmount > 0 && { deliveryChargeAmount }),
        ...(customerId && redeemPoints > 0 && { redeemPoints }),
    };
};

export const holdOrder = async (payload) => {
    const body = buildHoldOrderBody(payload);
    const response = await api.post('/api/pos/sale/new/hold', body);
    return response.data?.data ?? response.data;
};

export const updateHeldOrder = async (id, payload) => {
    const { items, notes, cashierNotes, discountAmount, discountMode, discountPercent, orderType, customerId, deliveryAddress, deliveryChargeAmount, tableNumber, foodPandaOrderNumber, foodPandaCustomerName, redeemPoints, heldItemCancellationReasons, heldItemCancellationDetails } = payload;
    const body = {
        items: items.map(({ menuItemId, variationId, dealSelections, qty, discountAmount: itemDiscount }) => ({
            menuItemId,
            ...(variationId != null && { variationId }),
            ...(dealSelections?.length && { dealSelections }),
            qty,
            ...(itemDiscount != null && { discountAmount: itemDiscount }),
        })),
        discountAmount: Number(discountAmount || 0),
        discountMode: discountMode || 'amount',
        discountPercent: Number(discountPercent || 0),
        notes: notes || '',
        cashierNotes: cashierNotes || '',
        orderType: orderType || 'dine-in',
        ...(orderType === 'foodpanda' && { foodPandaOrderNumber, foodPandaCustomerName }),
        ...(customerId && { customerId }),
        ...((orderType || 'dine-in') === 'dine-in' && tableNumber && { tableNumber }),
        ...(orderType === 'delivery' && deliveryAddress && { deliveryAddress }),
        ...(orderType === 'delivery' && deliveryChargeAmount > 0 && { deliveryChargeAmount }),
        ...(customerId && redeemPoints > 0 && { redeemPoints }),
        ...(heldItemCancellationDetails && { heldItemCancellationDetails }),
        ...(heldItemCancellationReasons && Object.keys(heldItemCancellationReasons).length > 0 && { heldItemCancellationReasons }),
    };
    const response = await api.patch(`/api/pos/held-orders/${encodeURIComponent(id)}`, body);
    return response.data?.data ?? response.data;
};

export const voidTransaction = async (id, voidReason, prepared, wasteOptions = {}) => {
    const response = await api.post(`/api/pos/sale/${encodeURIComponent(id)}/void`, { voidReason, prepared, ...wasteOptions });
    return response.data?.data ?? response.data;
};

export const getDeliveryRiders = async () => {
    const response = await api.get('/api/pos/deliveries/riders');
    return {
        rows: response.data?.data ?? [],
        riderTrackingMode: response.data?.mode === 'riderTracking',
    };
};

export const searchChargeToSalaryEmployees = async (q = '') => {
    const response = await api.get('/api/pos/charge-to-salary/employees', { params: { q } });
    return response.data?.data ?? [];
};

export const getChargeToSalaryCreditSummary = async (employeeId) => {
    const response = await api.get(
        `/api/pos/charge-to-salary/employees/${encodeURIComponent(employeeId)}/credit-summary`
    );
    return response.data?.data ?? response.data;
};

export const assignDeliveryRider = async (id, riderId, riderType = 'user') => {
    const response = await api.patch(`/api/pos/deliveries/${encodeURIComponent(id)}/rider`, { riderId, riderType });
    return response.data?.data ?? response.data;
};

export const getRiderDispatchLive = async (outletId) => {
    const response = await api.get('/api/rider-tracking/live', { params: { outletId } });
    return response.data?.data ?? null;
};

export const getRiderPerformance = async (params) => {
    const response = await api.get('/api/rider-tracking/performance', { params });
    return response;
};

export const saveRiderDeliveryReview = async (orderId, data) => {
    const response = await api.put(`/api/rider-tracking/orders/${encodeURIComponent(orderId)}/review`, data);
    return response;
};

export const overrideRiderReturn = async (assignmentId, data) => {
    const response = await api.patch(`/api/rider-tracking/assignments/${encodeURIComponent(assignmentId)}/return`, data);
    return response;
};

export const refundTransaction = async (id, reason) => {
    const response = await api.post(`/api/pos/sale/${encodeURIComponent(id)}/refund`, { reason });
    return response.data?.data ?? response.data;
};
