const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase();

const ingredientName = (ingredient) => (
  ingredient?.product?.name
  || ingredient?.productName
  || (typeof ingredient?.product === 'string' ? ingredient.product : '')
);

/** Filter the already outlet-scoped prep list without making another request. */
export const filterPrepRecipes = (preps, query) => {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return preps || [];

  return (preps || []).filter((prep) => {
    const searchable = normalize([
      prep?.name,
      prep?.category,
      prep?.yieldQty,
      prep?.yieldUnit,
      prep?.product?.name,
      ...(prep?.ingredients || []).map(ingredientName),
    ].filter(Boolean).join(' '));
    return tokens.every((token) => searchable.includes(token));
  });
};

export default filterPrepRecipes;
