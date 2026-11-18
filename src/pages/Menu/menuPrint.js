const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const money = (value) => {
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      maximumFractionDigits: 2,
    }).format(Number(value ?? 0));
  } catch {
    return `PKR ${Number(value ?? 0).toFixed(2)}`;
  }
};

const printStyles = `
  @page { size: A4; margin: 11mm; }
  * { box-sizing: border-box; }
  html { background: #edf1f5; }
  body { margin: 0; color: #172033; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .document { overflow: hidden; background: #fff; }
  .empty { padding: 28px; border: 1px dashed #cbd5e1; border-radius: 12px; color: #64748b; text-align: center; }
  .brand-header { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 26px 30px; background: #111827; color: white; }
  .brand-header:after { content: ""; position: absolute; right: -42px; top: -70px; width: 220px; height: 220px; border: 34px solid rgba(245, 158, 11, .14); border-radius: 50%; }
  .brand-lockup { position: relative; z-index: 1; display: flex; align-items: center; gap: 15px; }
  .brand-mark { display: flex; width: 48px; height: 48px; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.28); border-radius: 50%; background: #f59e0b; color: #111827; font-family: Georgia, serif; font-size: 21px; font-weight: 800; }
  .eyebrow { margin-bottom: 4px; color: #fbbf24; font-size: 8px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
  .brand-title { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 29px; font-weight: 700; line-height: 1.05; letter-spacing: -.02em; }
  .brand-details { position: relative; z-index: 1; max-width: 260px; color: #d1d5db; font-size: 9px; line-height: 1.65; text-align: right; }
  .document-body { padding: 24px 30px 28px; }
  .section-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 19px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
  .section-intro h2 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 19px; }
  .section-intro p { margin: 3px 0 0; color: #64748b; font-size: 9px; }
  .count-pill, .status-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 9px; font-size: 8px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .count-pill { background: #fff7ed; color: #9a3412; }
  .status-pill { background: #dcfce7; color: #166534; }
  .status-pill.off { background: #f1f5f9; color: #475569; }
  .menu-grid { column-count: 2; column-gap: 18px; }
  .menu-category-page { min-height: 275mm; display: flex; flex-direction: column; break-after: page; background: #fff; }
  .menu-category-page:last-child { break-after: auto; }
  .menu-page-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 24px; background: #111827; color: #fff; }
  .menu-page-header .brand-lockup { gap: 10px; }
  .menu-page-header .brand-mark { width: 35px; height: 35px; font-size: 15px; }
  .menu-page-header .brand-title { font-size: 20px; }
  .menu-page-header .eyebrow { font-size: 6px; }
  .menu-page-header .brand-details { font-size: 7px; }
  .menu-page-body { display: flex; flex: 1; flex-direction: column; padding: 24px 28px 18px; }
  .menu-category-heading { position: relative; margin-bottom: 18px; padding: 17px 19px; overflow: hidden; border-left: 5px solid var(--accent, #f59e0b); border-radius: 0 12px 12px 0; background: #f8fafc; }
  .menu-category-heading:after { content: ""; position: absolute; right: -20px; top: -35px; width: 110px; height: 110px; border: 18px solid color-mix(in srgb, var(--accent, #f59e0b) 15%, transparent); border-radius: 50%; }
  .menu-category-heading .eyebrow { color: #9a3412; }
  .menu-category-heading h2 { margin: 0; color: #111827; font-family: Georgia, "Times New Roman", serif; font-size: 27px; line-height: 1.1; }
  .menu-category-heading p { margin: 5px 0 0; color: #64748b; font-size: 9px; }
  .category-items { column-count: 1; column-gap: 22px; }
  .category-items.two-column { column-count: 2; }
  .category-items .menu-item { display: inline-block; width: 100%; padding: 11px 2px; }
  .menu-category-page.dense .category-items .menu-item { padding: 8px 2px; }
  .menu-category-page.dense .item-name { font-size: 9.5px; }
  .menu-category-page.dense .description { font-size: 7.5px; line-height: 1.3; }
  .menu-category-page.ultra-dense .category-items .menu-item { padding: 5px 2px; }
  .menu-category-page.ultra-dense .item-name { font-size: 8.5px; }
  .menu-category-page.ultra-dense .description { font-size: 6.8px; line-height: 1.2; }
  .menu-category-page .document-footer { margin-top: auto; }
  .category-card { display: inline-block; width: 100%; break-inside: avoid; margin: 0 0 17px; padding: 14px 15px 8px; border: 1px solid #e5e7eb; border-top: 3px solid var(--accent, #f59e0b); border-radius: 10px; background: #fff; }
  .category-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 7px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; }
  .category-title h3 { margin: 0; color: #111827; font-family: Georgia, "Times New Roman", serif; font-size: 15px; }
  .category-title span { color: #94a3b8; font-size: 8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .menu-item { break-inside: avoid; padding: 8px 0; border-bottom: 1px dotted #dbe2ea; }
  .menu-item:last-child { border-bottom: 0; }
  .menu-item-top { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 10px; }
  .item-name { color: #1f2937; font-size: 10.5px; font-weight: 750; }
  .description { margin-top: 3px; color: #7c8798; font-size: 8.5px; line-height: 1.45; }
  .price { color: #9a3412; font-size: 9.5px; font-weight: 800; white-space: nowrap; }
  .variation-prices { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 4px; color: #475569; font-size: 8px; }
  .variation-prices b { color: #9a3412; }
  .unavailable { margin-left: 5px; padding: 2px 4px; border-radius: 3px; background: #fee2e2; color: #991b1b; font-size: 6.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
  .document-footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; color: #94a3b8; font-size: 8px; }
  .recipe-hero { padding: 24px 30px; background: linear-gradient(125deg, #312e81, #4f46e5 62%, #7c3aed); color: #fff; }
  .recipe-hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
  .recipe-label { margin-bottom: 6px; color: #c4b5fd; font-size: 8px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
  .recipe-hero h1 { margin: 0; font-size: 27px; line-height: 1.1; }
  .recipe-outlet { margin-top: 6px; color: #ddd6fe; font-size: 10px; }
  .confidential { padding: 6px 9px; border: 1px solid rgba(255,255,255,.3); border-radius: 999px; background: rgba(255,255,255,.1); font-size: 7px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin: -14px 30px 20px; position: relative; }
  .summary-card { padding: 11px 13px; border: 1px solid #e5e7eb; border-radius: 9px; background: #fff; box-shadow: 0 4px 12px rgba(15,23,42,.06); }
  .summary-label { color: #94a3b8; font-size: 7px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .summary-value { margin-top: 3px; color: #1e293b; font-size: 11px; font-weight: 750; }
  .recipe-content { padding: 0 30px 28px; }
  .recipe-block { break-inside: avoid; margin-bottom: 20px; }
  .recipe-block + .recipe-block { break-before: page; }
  .recipe-block-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .recipe-block-title h2 { margin: 0; color: #312e81; font-size: 17px; }
  .size-badge { padding: 5px 8px; border-radius: 6px; background: #eef2ff; color: #4338ca; font-size: 8px; font-weight: 800; text-transform: uppercase; }
  table { width: 100%; overflow: hidden; border: 1px solid #dbe2ea; border-radius: 9px; border-collapse: separate; border-spacing: 0; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { padding: 8px 9px; border-bottom: 1px solid #dbe2ea; background: #f8fafc; color: #64748b; font-size: 7px; letter-spacing: .09em; text-align: left; text-transform: uppercase; }
  td { padding: 9px; border-bottom: 1px solid #edf2f7; color: #334155; vertical-align: top; }
  tbody tr:last-child td { border-bottom: 0; }
  .row-number { display: inline-flex; width: 19px; height: 19px; align-items: center; justify-content: center; margin-right: 7px; border-radius: 5px; background: #eef2ff; color: #4338ca; font-size: 8px; font-weight: 800; }
  .ingredient-name { color: #172033; font-weight: 750; }
  .qty-cell { color: #312e81; font-size: 11px; font-weight: 800; white-space: nowrap; }
  .muted { color: #94a3b8; font-size: 8px; }
  .recipe-notes { min-width: 130px; color: #64748b; font-size: 9px; line-height: 1.4; }
  .approval-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; }
  .approval { padding-top: 22px; border-bottom: 1px solid #94a3b8; color: #94a3b8; font-size: 8px; }
  @media screen { body { max-width: 850px; margin: 28px auto; } .document { border-radius: 14px; box-shadow: 0 18px 50px rgba(15,23,42,.14); } .menu-category-page + .menu-category-page { margin-top: 28px; border-top: 12px solid #edf1f5; } }
  @media print { html { background: #fff; } .document { border-radius: 0; box-shadow: none; } }
`;

export const openPrintWindow = (title) => {
  const popup = window.open('', '_blank');
  if (!popup) return null;
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>${printStyles}</style></head><body><div class="document"><div class="brand-header"><div class="brand-lockup"><div class="brand-mark">C</div><div><div class="eyebrow">Print Studio</div><h1 class="brand-title">Preparing document</h1></div></div></div><div class="document-body"><p class="empty">Building your print-ready layout…</p></div></div></body></html>`);
  popup.document.close();
  return popup;
};

const finishPrintWindow = (popup, title, content) => {
  if (!popup || popup.closed) return;
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${printStyles}</style></head><body>${content}<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 150); });</script></body></html>`);
  popup.document.close();
};

export const renderMenuPrint = (popup, outlet, categories, items) => {
  const categoryOrder = new Map(categories.map((category, index) => [String(category._id), index]));
  const grouped = new Map();
  items.forEach((item) => {
    const id = String(item.category?._id ?? item.category ?? 'uncategorized');
    const name = item.category?.name
      ?? categories.find((category) => String(category._id) === id)?.name
      ?? 'Uncategorized';
    if (!grouped.has(id)) grouped.set(id, { id, name, items: [] });
    grouped.get(id).items.push(item);
  });

  const outletName = outlet?.name || 'Outlet';
  const initials = outletName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const address = [outlet?.address?.street, outlet?.address?.city, outlet?.address?.country].filter(Boolean).join(', ');
  const details = [address, outlet?.phone].filter(Boolean);
  const printedAt = escapeHtml(new Date().toLocaleString());
  const sections = [...grouped.values()]
    .sort((a, b) => (categoryOrder.get(a.id) ?? 9999) - (categoryOrder.get(b.id) ?? 9999))
    .map((group) => {
      const category = categories.find((entry) => String(entry._id) === group.id);
      const accent = /^#[0-9a-f]{6}$/i.test(category?.color || '') ? category.color : '#f59e0b';
      const density = group.items.length > 28 ? 'ultra-dense' : (group.items.length > 18 ? 'dense' : '');
      const columns = group.items.length > 10 ? 'two-column' : '';
      return `
      <section class="menu-category-page ${density}" style="--accent:${escapeHtml(accent)}">
        <header class="menu-page-header">
          <div class="brand-lockup"><div class="brand-mark">${escapeHtml(initials || 'M')}</div><div><div class="eyebrow">Food · Crafted with care</div><h1 class="brand-title">${escapeHtml(outletName)}</h1></div></div>
          ${details.length ? `<div class="brand-details">${details.map(escapeHtml).join('<br>')}</div>` : ''}
        </header>
        <div class="menu-page-body">
          <div class="menu-category-heading"><div class="eyebrow">Our menu</div><h2>${escapeHtml(group.name)}</h2><p>${group.items.length} freshly prepared selection${group.items.length === 1 ? '' : 's'}</p></div>
          <div class="category-items ${columns}">
            ${group.items.map((item) => {
              const variations = Array.isArray(item.variations) ? item.variations : [];
              const variationPrices = variations.map((variation) => `<span>${escapeHtml(variation.name)} <b>${escapeHtml(money(variation.price))}</b></span>`).join('');
              return `<div class="menu-item"><div class="menu-item-top"><div><span class="item-name">${escapeHtml(item.name)}</span>${item.isAvailable ? '' : '<span class="unavailable">Unavailable</span>'}</div>${variations.length ? '' : `<div class="price">${escapeHtml(money(item.price))}</div>`}</div>${item.description ? `<div class="description">${escapeHtml(item.description)}</div>` : ''}${variations.length ? `<div class="variation-prices">${variationPrices}</div>` : ''}</div>`;
            }).join('')}
          </div>
          <footer class="document-footer"><span>${escapeHtml(group.name)} · Prices in Pakistani Rupees</span><span>Printed ${printedAt}</span></footer>
        </div>
      </section>
    `;
    }).join('');

  finishPrintWindow(popup, `${outletName} Menu`, `
    <main class="document">
      ${sections || '<div class="document-body"><div class="empty">No menu items to print.</div></div>'}
    </main>
  `);
};

export const renderRecipePrint = (popup, outlet, item, recipes) => {
  const ingredientTotal = recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
  const recipeSections = recipes.map(({ name, price, ingredients }, recipeIndex) => `
    <section class="recipe-block">
      <div class="recipe-block-title"><h2>${recipes.length > 1 ? escapeHtml(name) : 'Ingredient specification'}</h2>${recipes.length > 1 ? `<span class="size-badge">Size ${recipeIndex + 1} of ${recipes.length}</span>` : ''}</div>
      ${ingredients.length ? `
        <table>
          <thead><tr><th># &nbsp; Ingredient</th><th>Qty / serving</th><th>Par stock</th><th>Variance</th><th>Kitchen notes</th></tr></thead>
          <tbody>${ingredients.map((ingredient, index) => `
            <tr>
              <td><span class="row-number">${index + 1}</span><span class="ingredient-name">${escapeHtml(ingredient.product?.name ?? 'Unknown ingredient')}</span>${ingredient.product?.sku ? `<div class="muted" style="margin-left:29px">SKU ${escapeHtml(ingredient.product.sku)}</div>` : ''}</td>
              <td class="qty-cell">${escapeHtml(ingredient.qty)} ${escapeHtml(ingredient.unit)}</td>
              <td>${Number(ingredient.parLevel || 0) > 0 ? `${escapeHtml(ingredient.parLevel)} ${escapeHtml(ingredient.unit)}` : '<span class="muted">Not set</span>'}</td>
              <td>${escapeHtml(ingredient.adaptiveVariance ?? ingredient.varianceBaseline ?? 0)}%</td>
              <td class="recipe-notes">${escapeHtml(ingredient.notes || '—')}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty">No ingredients have been added to this recipe.</div>'}
      ${price !== undefined ? `<div class="document-footer"><span>Sale price</span><strong class="price">${escapeHtml(money(price))}</strong></div>` : ''}
    </section>
  `).join('');

  const outletName = outlet?.name || 'Outlet';
  finishPrintWindow(popup, `${item.name} Recipe`, `
    <main class="document">
      <header class="recipe-hero"><div class="recipe-hero-top"><div><div class="recipe-label">Kitchen production sheet</div><h1>${escapeHtml(item.name)}</h1><div class="recipe-outlet">${escapeHtml(outletName)}</div></div><div class="confidential">Internal use</div></div></header>
      <div class="summary-grid">
        <div class="summary-card"><div class="summary-label">Recipe formats</div><div class="summary-value">${recipes.length} ${recipes.length === 1 ? 'standard' : 'sizes'}</div></div>
        <div class="summary-card"><div class="summary-label">Ingredient lines</div><div class="summary-value">${ingredientTotal} total</div></div>
        <div class="summary-card"><div class="summary-label">Inventory tracking</div><div class="summary-value"><span class="status-pill ${item.trackInventory ? '' : 'off'}">${item.trackInventory ? 'Enabled' : 'Disabled'}</span></div></div>
      </div>
      <div class="recipe-content">
        ${recipeSections}
        <div class="approval-grid"><div class="approval">Prepared by / date</div><div class="approval">Checked by / date</div></div>
        <footer class="document-footer"><span>Controlled recipe document · Keep in kitchen records</span><span>Printed ${escapeHtml(new Date().toLocaleString())}</span></footer>
      </div>
    </main>
  `);
};

export const renderPrintError = (popup, message) => {
  finishPrintWindow(popup, 'Print error', `<div class="empty">${escapeHtml(message)}</div>`);
};
