const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundTo = (value, decimals) => {
  const factor = 10 ** decimals;
  return Math.round((finiteNumber(value) + Number.EPSILON) * factor) / factor;
};

export const roundPrice = (value) => roundTo(value, 6);

export const editableNumber = (value, decimals = 6) => {
  const number = finiteNumber(value);
  return String(roundTo(number, decimals));
};

export const grossLineAmount = (line) => (
  Math.max(0, finiteNumber(line?.qty)) * Math.max(0, finiteNumber(line?.unitPrice))
);

export const netLineAmount = (line) => (
  Math.max(0, grossLineAmount(line) - Math.max(0, finiteNumber(line?.lineDiscount)))
);

export const receivedBaseQuantity = (line) => {
  const quantity = Math.max(0, finiteNumber(line?.qty));
  if (line?.entryMode !== 'pack') return quantity;
  return quantity * Math.max(0, finiteNumber(line?.packSize));
};

export const receivedBaseUnitCost = (line) => {
  const units = receivedBaseQuantity(line);
  return units > 0 ? netLineAmount(line) / units : 0;
};

export const changePriceEntryMode = (line, priceEntryMode) => {
  if (priceEntryMode === line.priceEntryMode) return line;
  if (priceEntryMode === 'total') {
    return {
      ...line,
      priceEntryMode: 'total',
      enteredLineTotal: editableNumber(grossLineAmount(line), 2),
    };
  }
  return { ...line, priceEntryMode: 'unit' };
};

export const changeLineQuantity = (line, qty) => {
  if (line.priceEntryMode !== 'total') return { ...line, qty };
  const numericQty = finiteNumber(qty);
  const enteredTotal = finiteNumber(line.enteredLineTotal);
  return {
    ...line,
    qty,
    unitPrice: numericQty > 0 ? editableNumber(roundPrice(enteredTotal / numericQty)) : 0,
  };
};

export const changeEnteredLineTotal = (line, enteredLineTotal) => {
  const quantity = finiteNumber(line.qty);
  const total = finiteNumber(enteredLineTotal);
  return {
    ...line,
    enteredLineTotal,
    unitPrice: quantity > 0 ? editableNumber(roundPrice(total / quantity)) : 0,
  };
};

export const changeEntryMode = (line, entryMode, nextPackSize) => {
  if (entryMode === line.entryMode) return line;
  const previousPackSize = Math.max(0, finiteNumber(line.packSize));
  const packSize = entryMode === 'pack' ? nextPackSize : 1;

  if (line.priceEntryMode === 'total') {
    const quantity = finiteNumber(line.qty);
    const total = finiteNumber(line.enteredLineTotal);
    return {
      ...line,
      entryMode,
      packSize,
      unitPrice: quantity > 0 ? editableNumber(roundPrice(total / quantity)) : 0,
    };
  }

  const currentPrice = Math.max(0, finiteNumber(line.unitPrice));
  const numericNextPackSize = finiteNumber(nextPackSize);
  const unitPrice = entryMode === 'pack'
    ? (numericNextPackSize > 1 ? currentPrice * numericNextPackSize : 0)
    : (previousPackSize > 1 ? currentPrice / previousPackSize : currentPrice);

  return {
    ...line,
    entryMode,
    packSize,
    unitPrice: editableNumber(roundPrice(unitPrice)),
  };
};

