const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const clampQty = (value, maximum) => Math.max(
  0,
  Math.min(Number(maximum) || 0, Math.round(Number(value) || 0)),
);

export const calculateWasteValues = (preview, mode = 'whole', selectedQty = {}) => {
  const items = Array.isArray(preview?.items) ? preview.items : [];
  let ingredientCost = 0;
  let orderValue = 0;
  let units = 0;

  for (const item of items) {
    const availableQty = Number(item.remainingQty ?? item.qty) || 0;
    const qty = mode === 'whole'
      ? availableQty
      : clampQty(selectedQty[item.index], availableQty);
    const previewQty = Number(item.qty) || availableQty;
    const ratio = previewQty > 0 ? qty / previewQty : 0;

    ingredientCost += (Number(item.ingredientCost) || 0) * ratio;
    orderValue += (Number(item.orderValue) || 0) * ratio;
    units += qty;
  }

  return {
    ingredientCost: round2(ingredientCost),
    orderValue: round2(orderValue),
    units,
  };
};

export const buildWasteSelection = (preview, mode = 'whole', selectedQty = {}) => {
  if (mode === 'whole') return null;
  return (preview?.items || [])
    .map((item) => ({
      index: Number(item.index),
      qty: clampQty(selectedQty[item.index], item.remainingQty ?? item.qty),
    }))
    .filter((item) => item.qty > 0);
};

export const preferredWasteValuation = (preview) => (
  calculateWasteValues(preview).ingredientCost > 0 ? 'ingredientCost' : 'orderValue'
);

