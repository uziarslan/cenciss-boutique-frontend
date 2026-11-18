const safeQuantity = (value) => {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
};

const plainQuantityMap = (value) => {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value && typeof value === 'object' ? value : {};
};

export const lineMenuId = (item = {}) => String(
  item.menuItem?._id || item.menuItem || item.menuItemId || item.id || item._id || '',
);

export const lineVariationId = (item = {}) => (
  item.variation?.id?._id
  || item.variation?.id
  || item.variationId
  || null
);

export const kitchenLineKey = (item = {}) => (
  `${lineMenuId(item)}::${String(lineVariationId(item) || '')}${item.dealSelections?.length ? `::${item.dealSelections
    .map((selection) => `${String(selection.groupId)}:${(selection.optionIds || []).map(String).sort().join(',')}`)
    .sort()
    .join('|')}` : ''}`
);

export const buildItemQuantityMap = (items = []) => (
  (items || []).reduce((quantities, item) => {
    const key = kitchenLineKey(item);
    if (!key.startsWith('::')) {
      quantities[key] = safeQuantity(quantities[key]) + safeQuantity(item?.qty);
    }
    return quantities;
  }, {})
);

export const normalizePrintedQuantityMap = (
  items,
  printedQuantityMap,
  { assumeAllPrinted = false } = {},
) => {
  const currentQuantities = buildItemQuantityMap(items);
  const requested = plainQuantityMap(printedQuantityMap);
  // Preserve explicit zeroes. They distinguish an intentionally unprinted
  // remainder from a legacy timestamp-only order whose empty map means that all
  // then-current lines were printed.
  const hasRecordedBaseline = Object.keys(requested).length > 0;
  const baseline = assumeAllPrinted && !hasRecordedBaseline ? currentQuantities : requested;

  return Object.fromEntries(
    Object.entries(currentQuantities)
      .map(([key, currentQuantity]) => [
        key,
        Math.min(safeQuantity(currentQuantity), safeQuantity(baseline[key])),
      ])
      .filter(([, printedQuantity]) => printedQuantity > 0 || hasRecordedBaseline),
  );
};

export const transferPrintedQuantity = ({
  sourceBaseline = {},
  targetBaseline = {},
  nextSourceItems = [],
  nextTargetItems = [],
  lineKey,
  movedQuantity,
}) => {
  const source = { ...plainQuantityMap(sourceBaseline) };
  const target = { ...plainQuantityMap(targetBaseline) };
  const printedQuantityTransferred = Math.min(
    safeQuantity(movedQuantity),
    safeQuantity(source[lineKey]),
  );

  source[lineKey] = Math.max(0, safeQuantity(source[lineKey]) - printedQuantityTransferred);
  target[lineKey] = safeQuantity(target[lineKey]) + printedQuantityTransferred;

  return {
    sourcePrintedQuantityMap: normalizePrintedQuantityMap(nextSourceItems, source),
    targetPrintedQuantityMap: normalizePrintedQuantityMap(nextTargetItems, target),
    printedQuantityTransferred,
  };
};

// Return one delta line per item+variation key. The quantity map is aggregated
// first so duplicate legacy lines cannot produce duplicate KOT rows.
export const getKitchenDeltaItems = (items = [], printedQuantityMap = {}) => {
  const currentQuantities = buildItemQuantityMap(items);
  const printed = plainQuantityMap(printedQuantityMap);
  const emitted = new Set();

  return (items || []).reduce((delta, item) => {
    const key = kitchenLineKey(item);
    if (emitted.has(key)) return delta;
    emitted.add(key);
    const pendingQuantity = Math.max(
      0,
      safeQuantity(currentQuantities[key]) - safeQuantity(printed[key]),
    );
    return pendingQuantity > 0 ? [...delta, { ...item, qty: pendingQuantity }] : delta;
  }, []);
};
