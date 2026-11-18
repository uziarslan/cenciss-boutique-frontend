const normalize = (value) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const collectValues = (value, output) => {
  if (value == null || value === '') return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectValues(entry, output));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((entry) => collectValues(entry, output));
    return;
  }
  output.push(value);
};

const searchableOrderValues = (order = {}, { offline = false } = {}) => {
  const customer = offline ? order._customer : order.customer;
  const values = [];
  const tableReferences = [
    order.tableNumber,
    order.tableName,
    order.tableLabel,
    order.qrOrder?.tableLabel,
    order.qrOrder?.tableCode,
  ].filter(Boolean);

  collectValues({
    // Keep the search future-proof: every value returned with a held order is
    // searchable, including newer customer, table, modifier, and integration
    // fields that are not yet represented by a dedicated card label below.
    rawOrder: order,
    references: {
      transactionNumber: order.transactionNumber,
      clientTransactionId: order.clientTransactionId,
      orderId: order._id,
      foodPandaOrderNumber: order.foodPandaOrderNumber || order.foodPandaReference,
    },
    order: {
      orderType: order.orderType,
      source: order.source,
      status: order.status,
      kitchenPrintStatus: order.kitchenPrintStatus,
      tableNumber: order.tableNumber,
      tableName: order.tableName || order.tableLabel,
      tableAliases: tableReferences.flatMap((reference) => [`table ${reference}`, `t ${reference}`]),
      qrTable: order.qrOrder && {
        tableCode: order.qrOrder.tableCode,
        tableLabel: order.qrOrder.tableLabel,
        customerName: order.qrOrder.customerName,
        customerPhone: order.qrOrder.customerPhone,
      },
      heldAt: order.heldAt || order.queuedAt || order.createdAt,
      businessDate: order.businessDate,
    },
    customer,
    foodPandaCustomerName: order.foodPandaCustomerName,
    deliveryAddress: order.deliveryAddress,
    items: (order.items || []).map((item) => ({
      menuItem: item.menuItem || item.menuItemId || item.id,
      name: item.name,
      variation: item.variation?.name || item.variationName,
      category: item.categoryName,
      quantity: item.qty,
      notes: item.notes,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    notes: order.notes,
    cashierNotes: order.cashierNotes,
    cashier: order.cashier,
    assignedRider: order.assignedRider,
    staffOrder: order.staffOrder,
    amounts: {
      subtotal: order.subtotal,
      tax: order.taxAmount,
      serviceCharge: order.serviceChargeAmount,
      deliveryCharge: order.deliveryChargeAmount,
      discount: order.discountAmount,
      total: order.totalAmount,
    },
  }, values);

  return values;
};

export const heldOrderMatchesSearch = (order, query, options) => {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalize(searchableOrderValues(order, options).join(' '));
  return tokens.every((token) => haystack.includes(token));
};

export { normalize as normalizeHeldOrderSearch };
