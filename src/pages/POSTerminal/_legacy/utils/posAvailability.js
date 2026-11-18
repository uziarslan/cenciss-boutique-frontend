// Live, cart-aware availability that models the SHARED ingredient pool.
//
// The server tells us, per item, the effective stock for each ingredient (on-hand
// minus held-order reservations) and each size's per-unit consumption. Consumption
// across ALL sizes draws down the SAME stock, so adding any size lowers every
// size's remaining count — e.g. 1L Pepsi makes 4 Small (250ml) OR ~2 Large (450ml),
// and ordering 1 Large leaves 550ml → 2 Small / 1 Large.
//
// `info`              — availability entry for THIS item: { available, bottleneck?,
//                        recipe?, variations?: { [vId]: { available, recipe:[{product,name,qty}] } },
//                        stock: { [productId]: { available, name, unit } } }
// `cartItems`         — the WHOLE cart (all items): [{ id, lineKey, variationId, qty }]
// `resumedMap`        — { [lineKey]: qty } already reserved server-side (resumed held
//                        order); excluded so it isn't double-counted.
// `availabilityMap`   — the full availability map (menuItemId -> entry), so each cart
//                        line's recipe can be resolved — a product shared across
//                        DIFFERENT menu items draws from the same pool.
//
// Returns:
//   itemAvailable — best case across sizes (how many MORE can be added); null = unlimited
//   perSize       — { [vId]: { makeable: number|null, bottleneck: string|null } }
//   bottleneck    — limiting ingredient name for the best size / the item
export const computeItemAvailability = (info, cartItems = [], resumedMap = {}, availabilityMap = {}, itemId = null) => {
  if (!info) return { itemAvailable: null, perSize: {}, bottleneck: null };

  const stock = info.stock || {};
  const remaining = {};
  for (const pid of Object.keys(stock)) remaining[pid] = stock[pid].available;

  // Resolve a cart line's per-unit recipe from its OWN item's availability entry,
  // so consumption of a shared product by other menu items is also deducted.
  const recipeForLine = (line) => {
    const li = availabilityMap[line.id];
    if (!li) return [];
    if (line.variationId && li.variations) return li.variations[line.variationId]?.recipe || [];
    return li.recipe || [];
  };

  // Draw the WHOLE cart's (non-resumed) consumption down from the shared pool.
  // `remaining` only holds this item's products, so lines that don't touch them
  // are naturally ignored; lines from other items that DO touch them are counted.
  for (const line of cartItems) {
    const used = Math.max(0, (line.qty || 0) - (resumedMap[line.lineKey] || 0));
    if (used <= 0) continue;
    for (const r of recipeForLine(line)) {
      if (remaining[r.product] == null) continue;
      remaining[r.product] -= used * (r.qty || 0);
    }
  }

  // How many MORE units of a recipe can be made from what's left, and which
  // ingredient runs out first. An empty recipe means unlimited (no tracking).
  const makeableOf = (recipe) => {
    if (!recipe || recipe.length === 0) return { makeable: null, bottleneck: null };
    let min = Infinity;
    let bottleneck = null;
    for (const r of recipe) {
      if (r.unconvertible || !(r.qty > 0)) return { makeable: 0, bottleneck: r.name };
      const rem = remaining[r.product];
      if (rem == null) continue;
      const m = Math.floor(rem / r.qty);
      if (m < min) { min = m; bottleneck = r.name; }
    }
    return { makeable: Number.isFinite(min) ? Math.max(0, min) : null, bottleneck };
  };

  // Units of THIS item (optionally a specific size) already in the cart, net of
  // resumed reservations. Used for LOCKED items whose recipe the server withholds
  // (recipe-lock): we can't model the shared ingredient pool without the recipe,
  // so we self-decrement the server's count by what's in the cart. This keeps the
  // live "left" count honest for the common case without exposing the recipe.
  const ownCartUnits = (variationId) => {
    if (!itemId) return 0;
    let used = 0;
    for (const line of cartItems) {
      if (line.id !== itemId) continue;
      if (variationId !== undefined && (line.variationId ?? null) !== (variationId ?? null)) continue;
      used += Math.max(0, (line.qty || 0) - (resumedMap[line.lineKey] || 0));
    }
    return used;
  };

  if (info.variations) {
    const perSize = {};
    let best = -Infinity;
    let anyUnlimited = false;
    let bestBottleneck = null;
    for (const vId of Object.keys(info.variations)) {
      const vinfo = info.variations[vId];
      let makeable;
      let bottleneck = null;
      if (vinfo && vinfo.recipe) {
        ({ makeable, bottleneck } = makeableOf(vinfo.recipe));
      } else if (vinfo && vinfo.available != null) {
        // Locked size (recipe withheld) → self-decrement this size's count.
        makeable = Math.max(0, vinfo.available - ownCartUnits(vId));
      } else {
        makeable = null; // untracked / unlimited
      }
      perSize[vId] = { makeable, bottleneck };
      if (makeable == null) anyUnlimited = true;
      else if (makeable > best) { best = makeable; bestBottleneck = bottleneck; }
    }
    const itemAvailable = anyUnlimited ? null : (best === -Infinity ? null : best);
    return { itemAvailable, perSize, bottleneck: bestBottleneck };
  }

  if (info.recipe) {
    const { makeable, bottleneck } = makeableOf(info.recipe);
    return { itemAvailable: makeable, perSize: {}, bottleneck };
  }

  // Locked item (recipe withheld) but inventory-tracked → self-decrement the
  // server count by the units of this item already in the cart.
  if (info.hasRecipe && info.available != null) {
    return {
      itemAvailable: Math.max(0, info.available - ownCartUnits(null)),
      perSize: {},
      bottleneck: info.bottleneck ?? null,
    };
  }

  // Untracked / no recipe data — fall back to the server's number.
  return { itemAvailable: info.available ?? null, perSize: {}, bottleneck: info.bottleneck ?? null };
};
