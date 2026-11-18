export const dealIdOf = (value) => value?._id || value || '';

export const dealSelectionSignature = (selections = []) => selections
  .map((selection) => `${dealIdOf(selection.groupId)}:${(selection.optionIds || []).map(dealIdOf).sort().join(',')}`)
  .sort()
  .join('|');

const componentSnapshot = (configured, source, group = null) => {
  const menuItem = configured.menuItem;
  const menuItemId = dealIdOf(menuItem);
  if (!menuItemId || typeof menuItem !== 'object') return null;
  if (menuItem.isAvailable === false) return null;
  const variation = configured.variationId
    ? (menuItem.variations || []).find((row) => String(row._id) === String(configured.variationId))
    : null;
  return {
    source,
    groupId: group?._id || null,
    groupName: group?.name || null,
    optionId: source === 'choice' ? configured._id : null,
    menuItem: menuItemId,
    categoryId: dealIdOf(menuItem.category) || null,
    categoryName: menuItem.category?.name || '',
    variation: variation ? { id: variation._id, name: variation.name } : undefined,
    name: menuItem.name,
    qtyPerDeal: Math.max(1, Number(configured.qty) || 1),
    priceAdjustment: source === 'choice' ? Math.max(0, Number(configured.priceAdjustment) || 0) : 0,
  };
};

export const resolveClientDeal = (item, selections = []) => {
  if ((item?.itemType || 'regular') !== 'deal') {
    return { ok: true, priceAdjustment: 0, dealSelections: [], dealComponents: [], summary: [] };
  }

  const fixedItems = item.dealConfig?.fixedItems || [];
  const groups = item.dealConfig?.choiceGroups || [];
  const selectedByGroup = new Map(selections.map((selection) => [
    String(dealIdOf(selection.groupId)),
    (selection.optionIds || []).map((id) => String(dealIdOf(id))),
  ]));
  const dealComponents = [];
  const summary = [];

  for (const configured of fixedItems) {
    const snapshot = componentSnapshot(configured, 'fixed');
    if (!snapshot) return { ok: false, message: 'A fixed item in this deal is unavailable.' };
    dealComponents.push(snapshot);
    summary.push(`${snapshot.qtyPerDeal}× ${snapshot.name}${snapshot.variation?.name ? ` (${snapshot.variation.name})` : ''}`);
  }

  let priceAdjustment = 0;
  const cleanSelections = [];
  for (const group of groups) {
    const groupId = String(dealIdOf(group));
    const optionIds = selectedByGroup.get(groupId) || [];
    const min = Math.max(0, Number(group.minSelections) || 0);
    const max = Math.max(1, Number(group.maxSelections) || 1);
    if (optionIds.length < min || optionIds.length > max) {
      return { ok: false, message: `${group.name}: choose ${min === max ? min : `${min}–${max}`} option${max === 1 ? '' : 's'}.` };
    }
    const optionById = new Map((group.options || []).map((option) => [String(option._id), option]));
    const optionCounts = new Map();
    for (const optionId of optionIds) optionCounts.set(optionId, (optionCounts.get(optionId) || 0) + 1);
    for (const [optionId, selectionCount] of optionCounts) {
      const option = optionById.get(optionId);
      const baseSnapshot = option && componentSnapshot(option, 'choice', group);
      if (!baseSnapshot) return { ok: false, message: `A choice in ${group.name} is unavailable.` };
      const snapshot = {
        ...baseSnapshot,
        qtyPerDeal: baseSnapshot.qtyPerDeal * selectionCount,
        priceAdjustment: baseSnapshot.priceAdjustment * selectionCount,
      };
      dealComponents.push(snapshot);
      priceAdjustment += snapshot.priceAdjustment;
      summary.push(`${group.name}: ${snapshot.qtyPerDeal > 1 ? `${snapshot.qtyPerDeal}× ` : ''}${snapshot.name}${snapshot.variation?.name ? ` (${snapshot.variation.name})` : ''}`);
    }
    cleanSelections.push({ groupId: group._id, optionIds });
  }

  return {
    ok: true,
    priceAdjustment,
    dealSelections: cleanSelections,
    dealComponents,
    summary,
  };
};

export const expandClientDealItemsForKitchen = (items = []) => items.flatMap((item) => {
  if (!item.dealComponents?.length) return [item];
  return item.dealComponents.map((component) => ({
    menuItemId: component.menuItem,
    categoryId: component.categoryId,
    categoryName: component.categoryName,
    variation: component.variation,
    variationName: component.variation?.name,
    name: `${component.name} [${item.name}]`,
    qty: (Number(item.qty) || 0) * (Number(component.qtyPerDeal) || 1),
    notes: item.notes || '',
  }));
});
