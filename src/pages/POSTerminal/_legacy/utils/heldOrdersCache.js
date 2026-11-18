const CACHE_PREFIX = 'pos_held_orders_cache_v1';

export const HELD_ORDERS_CACHE_EVENT = 'pos-held-orders-cache-updated';

const parseJson = (raw, fallback) => {
  try {
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
};

const activeCacheIdentity = (outletCode) => {
  const cashier = parseJson(localStorage.getItem('pos_cashier'), null);
  const cashierId = String(cashier?._id || cashier?.id || '');
  const outlet = String(outletCode || localStorage.getItem('pos_outlet_code') || '');
  const tenant = cashier?.tenant;
  const tenantKey = String(
    cashier?.tenantSlug
    || tenant?.slug
    || tenant?._id
    || tenant?.id
    || (typeof tenant === 'string' ? tenant : '')
    || 'default'
  );

  if (!cashierId || !outlet) return null;
  return { cashierId, outletCode: outlet, tenantKey };
};

const storageKey = (identity) => [
  CACHE_PREFIX,
  identity.tenantKey,
  identity.outletCode,
  identity.cashierId,
].map(encodeURIComponent).join(':');

export const isHeldOrdersCacheKey = (key) => (
  typeof key === 'string' && key.startsWith(`${encodeURIComponent(CACHE_PREFIX)}:`)
);

const notify = (outletCode) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HELD_ORDERS_CACHE_EVENT, {
    detail: { outletCode: String(outletCode || '') },
  }));
};

const orderTime = (order) => {
  const value = order?.heldAt || order?.createdAt || 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const sortedOrders = (orders) => (
  (Array.isArray(orders) ? orders : [])
    .filter((order) => order?._id)
    .sort((a, b) => orderTime(b) - orderTime(a))
);

export const getCachedHeldOrders = (outletCode) => {
  const identity = activeCacheIdentity(outletCode);
  if (!identity) return [];

  try {
    const record = parseJson(localStorage.getItem(storageKey(identity)), null);
    if (
      !record
      || record.owner?.cashierId !== identity.cashierId
      || record.owner?.outletCode !== identity.outletCode
      || record.owner?.tenantKey !== identity.tenantKey
    ) {
      return [];
    }
    return sortedOrders(record.orders);
  } catch {
    return [];
  }
};

export const setCachedHeldOrders = (outletCode, orders) => {
  const identity = activeCacheIdentity(outletCode);
  if (!identity) return false;

  try {
    localStorage.setItem(storageKey(identity), JSON.stringify({
      owner: identity,
      cachedAt: new Date().toISOString(),
      orders: sortedOrders(orders),
    }));
    notify(identity.outletCode);
    return true;
  } catch {
    return false;
  }
};

const populatedOrExisting = (incoming, existing) => {
  if (incoming && typeof incoming === 'object') return incoming;
  if (existing && typeof existing === 'object') return existing;
  return incoming ?? existing ?? null;
};

export const upsertCachedHeldOrder = (outletCode, order) => {
  if (!order?._id) return false;

  const orders = getCachedHeldOrders(outletCode);
  const id = String(order._id);
  const existing = orders.find((candidate) => String(candidate._id) === id);
  const nextOrder = {
    ...(existing || {}),
    ...order,
    customer: populatedOrExisting(order.customer, existing?.customer),
    cashier: populatedOrExisting(order.cashier, existing?.cashier),
    assignedRider: populatedOrExisting(order.assignedRider, existing?.assignedRider),
  };
  return setCachedHeldOrders(
    outletCode,
    [nextOrder, ...orders.filter((candidate) => String(candidate._id) !== id)],
  );
};

export const updateCachedHeldOrder = (outletCode, orderId, patch) => {
  const orders = getCachedHeldOrders(outletCode);
  const id = String(orderId || '');
  const existing = orders.find((candidate) => String(candidate._id) === id);
  if (!existing) return false;
  return upsertCachedHeldOrder(outletCode, { ...existing, ...(patch || {}), _id: existing._id });
};

export const removeCachedHeldOrder = (outletCode, orderId) => {
  const id = String(orderId || '');
  return setCachedHeldOrders(
    outletCode,
    getCachedHeldOrders(outletCode).filter((order) => String(order._id) !== id),
  );
};
