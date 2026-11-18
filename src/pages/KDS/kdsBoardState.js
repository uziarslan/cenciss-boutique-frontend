const sameOrder = (left, right) => String(left?._id || left?.id || '') === String(right?._id || right?.id || '');

export const shouldRemoveKdsOrder = (order, businessDate) => (
  (businessDate && order?.businessDate !== businessDate)
  || order?.currentStatus === 'cancelled'
  || (order?.currentStatus === 'dispatched' && Boolean(order?.finalSaleTransaction))
);

export const removeKdsOrder = (orders, target) => (
  (orders || []).filter((order) => !sameOrder(order, target))
);

export const reconcileKdsOrders = (orders, incoming, businessDate) => {
  const current = (orders || []).filter((order) => !shouldRemoveKdsOrder(order, businessDate));
  if (!incoming) return current;
  if (shouldRemoveKdsOrder(incoming, businessDate)) return removeKdsOrder(current, incoming);
  return current.some((order) => sameOrder(order, incoming))
    ? current.map((order) => sameOrder(order, incoming) ? incoming : order)
    : [...current, incoming];
};
