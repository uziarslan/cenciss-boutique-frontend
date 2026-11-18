// Unit families + helpers shared by purchasing and recipe editors.
//
// Every product is measured in ONE family (weight, volume, or count). The base
// unit lives on the product (product.unit). Recipes only offer units from that
// product's family, so you never see "kg" for a bottled drink or "litres" for
// meat.

export const UNIT_FAMILIES = {
  weight: ['kg', 'g', 'mg', 'lb', 'oz'],
  volume: ['L', 'mL', 'fl oz', 'cup', 'tbsp', 'tsp'],
  count:  ['pcs', 'piece', 'each', 'dozen', 'bottle', 'can', 'portion'],
  length: ['m', 'meter', 'metre', 'cm', 'yard', 'yd', 'ft', 'in'],
};

// Units offered in recipes per family (the practical subset a cook would use).
const RECIPE_UNITS = {
  weight: ['kg', 'g', 'oz', 'lb'],
  volume: ['L', 'mL', 'cup', 'tbsp', 'tsp'],
  count:  ['pcs', 'portion'],
  length: ['m', 'cm', 'yard', 'ft', 'in'],
};

// Everything, used as a fallback when a product's unit isn't recognised.
export const ALL_RECIPE_UNITS = ['kg', 'g', 'L', 'mL', 'pcs', 'portion', 'cup', 'tbsp', 'tsp', 'oz', 'lb'];

// Common units a product can be stocked in (the base unit picker on items / new
// ingredients). Grouped by family for a tidy dropdown.
export const BASE_UNIT_GROUPS = [
  { family: 'weight', label: 'Weight', units: ['kg', 'g', 'lb', 'oz'] },
  { family: 'volume', label: 'Volume', units: ['L', 'mL'] },
  { family: 'length', label: 'Length', units: ['m', 'cm', 'yard', 'ft', 'in'] },
  { family: 'count',  label: 'Count',  units: ['pcs', 'piece', 'bottle', 'can', 'each'] },
];

// Flat option list for base-unit pickers (groups shown via `meta`).
export const BASE_UNIT_OPTIONS = BASE_UNIT_GROUPS.flatMap(({ label, units }) =>
  units.map((u) => ({ value: u, label: u, meta: label }))
);

const _lookup = (() => {
  const map = {};
  Object.entries(UNIT_FAMILIES).forEach(([family, units]) => {
    units.forEach((u) => { map[u.toLowerCase()] = family; });
  });
  // A few aliases.
  map.l = 'volume'; map.litre = 'volume'; map.liter = 'volume'; map.ml = 'volume';
  map.gram = 'weight'; map.grams = 'weight'; map.kilogram = 'weight';
  map.pc = 'count'; map.unit = 'count'; map.pack = 'count'; map.box = 'count'; map.case = 'count'; map.bag = 'count';
  map.meter = 'length'; map.meters = 'length'; map.metre = 'length'; map.metres = 'length'; map.yd = 'length'; map.yards = 'length'; map.feet = 'length'; map.inch = 'length'; map.inches = 'length';
  return map;
})();

// Family of a unit string, or null if unknown.
export const unitFamily = (unit) => {
  if (!unit) return null;
  return _lookup[String(unit).toLowerCase().trim()] ?? null;
};

// The recipe units to offer for a product, based on its base unit's family.
// Falls back to all units when the family can't be determined.
export const recipeUnitsForProduct = (productUnit) => {
  const fam = unitFamily(productUnit);
  return fam ? RECIPE_UNITS[fam] : ALL_RECIPE_UNITS;
};

// ── Unit conversion (mirrors backend src/utils/unitConversion.js) ─────────────
// Each unit maps to a canonical base + factor. Conversion only works within one
// base. Weight → g, Volume → ml, counts are 1:1 within their own base.
const CONVERSIONS = {
  kg: { base: 'g', factor: 1000 }, kgs: { base: 'g', factor: 1000 },
  kilogram: { base: 'g', factor: 1000 }, kilograms: { base: 'g', factor: 1000 },
  g: { base: 'g', factor: 1 }, gm: { base: 'g', factor: 1 }, gms: { base: 'g', factor: 1 },
  gram: { base: 'g', factor: 1 }, grams: { base: 'g', factor: 1 },
  mg: { base: 'g', factor: 0.001 }, milligram: { base: 'g', factor: 0.001 }, milligrams: { base: 'g', factor: 0.001 },
  lb: { base: 'g', factor: 453.59237 }, lbs: { base: 'g', factor: 453.59237 },
  pound: { base: 'g', factor: 453.59237 }, pounds: { base: 'g', factor: 453.59237 },
  oz: { base: 'g', factor: 28.349523125 }, ounce: { base: 'g', factor: 28.349523125 }, ounces: { base: 'g', factor: 28.349523125 },
  l: { base: 'ml', factor: 1000 }, lt: { base: 'ml', factor: 1000 }, ltr: { base: 'ml', factor: 1000 },
  liter: { base: 'ml', factor: 1000 }, liters: { base: 'ml', factor: 1000 },
  litre: { base: 'ml', factor: 1000 }, litres: { base: 'ml', factor: 1000 },
  ml: { base: 'ml', factor: 1 }, milliliter: { base: 'ml', factor: 1 }, milliliters: { base: 'ml', factor: 1 },
  millilitre: { base: 'ml', factor: 1 }, millilitres: { base: 'ml', factor: 1 },
  cup: { base: 'ml', factor: 236.5882365 }, cups: { base: 'ml', factor: 236.5882365 },
  tbsp: { base: 'ml', factor: 14.78676478125 }, tsp: { base: 'ml', factor: 4.92892159375 },
  'fl oz': { base: 'ml', factor: 29.5735295625 },
  pcs: { base: 'pcs', factor: 1 }, pc: { base: 'pcs', factor: 1 }, piece: { base: 'pcs', factor: 1 }, pieces: { base: 'pcs', factor: 1 },
  each: { base: 'pcs', factor: 1 }, ea: { base: 'pcs', factor: 1 }, unit: { base: 'pcs', factor: 1 }, units: { base: 'pcs', factor: 1 },
  portion: { base: 'portion', factor: 1 }, portions: { base: 'portion', factor: 1 },
};

// Convert qty from one unit to another. Returns { qty, converted }.
export const convertQty = (qty, fromUnit, toUnit) => {
  const numQty = Number(qty);
  if (!Number.isFinite(numQty)) return { qty: 0, converted: false };
  const from = String(fromUnit ?? '').trim().toLowerCase();
  const to = String(toUnit ?? '').trim().toLowerCase();
  if (!from || !to || from === to) return { qty: numQty, converted: true };
  const f = CONVERSIONS[from];
  const t = CONVERSIONS[to];
  if (!f || !t || f.base !== t.base) return { qty: numQty, converted: false };
  return { qty: (numQty * f.factor) / t.factor, converted: true };
};

// Units to offer when issuing/entering a quantity for a product. Weight & volume
// expose their family's sub-units (all inter-convertible); count/unknown bases
// have no convertible sub-units, so only the base unit itself is offered.
export const entryUnitsForProduct = (baseUnit) => {
  const fam = unitFamily(baseUnit);
  if (fam === 'weight' || fam === 'volume' || fam === 'length') {
    return Array.from(new Set([baseUnit, ...RECIPE_UNITS[fam]]));
  }
  return baseUnit ? [baseUnit] : [];
};
