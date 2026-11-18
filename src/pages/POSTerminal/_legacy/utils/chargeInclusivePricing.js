export const normalizePriceMode = (value) => value === 'inclusive' ? 'inclusive' : 'exclusive';
export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const calculateLineCharges = ({
  listedUnitPrice,
  qty,
  priceMode,
  taxable,
  taxRate,
  serviceChargeRate,
}) => {
  const quantity = Math.max(0, Number(qty) || 0);
  const listed = Math.max(0, Number(listedUnitPrice) || 0);
  const listedLineTotal = roundMoney(listed * quantity);
  const effectiveTaxRate = taxable ? Math.max(0, Number(taxRate) || 0) : 0;
  const effectiveServiceRate = Math.max(0, Number(serviceChargeRate) || 0);
  const mode = normalizePriceMode(priceMode);
  if (mode === 'inclusive') {
    const divisor = 100 + effectiveTaxRate + effectiveServiceRate;
    const taxAmount = divisor > 0 ? roundMoney(listedLineTotal * effectiveTaxRate / divisor) : 0;
    const serviceChargeAmount = divisor > 0 ? roundMoney(listedLineTotal * effectiveServiceRate / divisor) : 0;
    const lineTotal = roundMoney(listedLineTotal - taxAmount - serviceChargeAmount);
    return {
      priceMode: mode,
      listedUnitPrice: listed,
      listedLineTotal,
      unitPrice: quantity > 0 ? lineTotal / quantity : 0,
      lineTotal,
      taxAmount,
      serviceChargeAmount,
      grossLineTotal: listedLineTotal,
    };
  }
  const lineTotal = listedLineTotal;
  const taxAmount = roundMoney(lineTotal * effectiveTaxRate / 100);
  const serviceChargeAmount = roundMoney(lineTotal * effectiveServiceRate / 100);
  return {
    priceMode: mode,
    listedUnitPrice: listed,
    listedLineTotal,
    unitPrice: listed,
    lineTotal,
    taxAmount,
    serviceChargeAmount,
    grossLineTotal: roundMoney(lineTotal + taxAmount + serviceChargeAmount),
  };
};

export const calculateCartCharges = (items, { taxRate = 0, serviceChargeRate = 0 } = {}) => {
  let subtotal = 0;
  let taxAmount = 0;
  let serviceChargeAmount = 0;
  const pricedItems = (items || []).map((item) => {
    const priced = calculateLineCharges({
      listedUnitPrice: item.listedUnitPrice ?? item.unitPrice ?? item.price,
      qty: item.qty,
      priceMode: item.priceMode,
      taxable: Number(item.taxRate || 0) > 0 || item.taxable === true,
      taxRate,
      serviceChargeRate,
    });
    subtotal += priced.lineTotal;
    taxAmount += priced.taxAmount;
    serviceChargeAmount += priced.serviceChargeAmount;
    return { ...item, ...priced, taxRate: (Number(item.taxRate || 0) > 0 || item.taxable === true) ? taxRate : 0, serviceChargeRate };
  });
  return {
    items: pricedItems,
    subtotal: roundMoney(subtotal),
    taxAmount: roundMoney(taxAmount),
    serviceChargeAmount: roundMoney(serviceChargeAmount),
  };
};
