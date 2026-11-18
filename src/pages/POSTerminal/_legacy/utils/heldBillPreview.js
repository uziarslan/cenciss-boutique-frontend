import { calculateLineCharges } from './chargeInclusivePricing';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const storedCashRate = (order) => {
  const headerRate = Number(order?.effectiveTaxRate);
  if (Number.isFinite(headerRate) && headerRate >= 0) return headerRate;
  const taxableLine = (order?.items || []).find((item) => Number(item.taxRate || 0) > 0);
  return Number(taxableLine?.taxRate || 0);
};

export const heldBillRate = (order, taxConfig, taxBasis = 'cash') => {
  const configLoaded = taxConfig?.loaded === true;
  const standardRate = configLoaded
    ? Number(taxConfig.standardRate || 0)
    : storedCashRate(order);

  if (taxBasis !== 'card') return standardRate;
  return configLoaded && taxConfig.cardReducedEnabled
    ? Number(taxConfig.cardRate ?? standardRate)
    : standardRate;
};

/**
 * Build an unpaid receipt quote for a held order without mutating or persisting
 * the order. Menu-item taxRate is a taxable marker (>0); the actual cash/card
 * percentage comes from the outlet tax configuration, exactly as at checkout.
 */
export const buildHeldBillPreview = (order, taxConfig, taxBasis = 'cash') => {
  // Receipt previews must never carry the POS-only cashier reminder into a
  // browser, USB, or Windows print connector payload.
  const publicOrder = { ...(order || {}) };
  delete publicOrder.cashierNotes;
  const isFoodPanda = order?.orderType === 'foodpanda';
  const effectiveRate = isFoodPanda ? 0 : heldBillRate(order, taxConfig, taxBasis);
  const items = (order?.items || []).map((item) => {
    const taxable = !isFoodPanda && Number(item.taxRate || 0) > 0;
    const priced = calculateLineCharges({
      listedUnitPrice: item.listedUnitPrice ?? item.unitPrice,
      qty: item.qty ?? item.quantity,
      priceMode: item.priceMode,
      taxable,
      taxRate: taxable ? effectiveRate : 0,
      serviceChargeRate: Number((item.serviceChargeRate ?? item.serviceCharge) || 0),
    });
    return {
      ...item,
      ...priced,
      taxRate: taxable ? effectiveRate : 0,
      taxAmount: priced.taxAmount,
    };
  });

  const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const taxableSubtotal = round2(items.reduce(
    (sum, item) => sum + (Number(item.taxRate || 0) > 0 ? item.lineTotal : 0), 0,
  ));
  const taxAmount = round2(items.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0));
  const serviceChargeAmount = round2(items.reduce(
    (sum, item) => sum + Number(item.serviceChargeAmount || 0), 0,
  ));
  const deliveryChargeAmount = round2(Number(order?.deliveryChargeAmount || 0));
  const discountAmount = isFoodPanda ? 0 : round2(Number(order?.discountAmount || 0));
  const totalAmount = round2(Math.max(
    0,
    subtotal + taxAmount + serviceChargeAmount + deliveryChargeAmount - discountAmount,
  ));

  return {
    ...publicOrder,
    items,
    subtotal,
    taxAmount,
    effectiveTaxRate: taxableSubtotal > 0 ? effectiveRate : 0,
    serviceChargeAmount,
    deliveryChargeAmount,
    discountAmount,
    totalAmount,
    // Receipt-only metadata. It is never sent to the held-order API.
    billTaxBasis: isFoodPanda ? 'foodpanda' : taxBasis,
  };
};

export default buildHeldBillPreview;
