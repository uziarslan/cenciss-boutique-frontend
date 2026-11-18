export const POS_MENU_UPDATED_EVENT = 'cenciss:pos-menu-updated';
const POS_MENU_CACHE_PREFIX = 'pos_menu_cache_v2';
const POS_MENU_REVISION_PREFIX = 'pos_menu_revision_v1';

const normalizedCode = (outletCode) => String(outletCode || '').trim();

export const posMenuCacheKey = (outletCode) =>
  `${POS_MENU_CACHE_PREFIX}:${normalizedCode(outletCode) || 'unknown'}`;

export const posMenuRevisionKey = (outletCode) =>
  `${POS_MENU_REVISION_PREFIX}:${normalizedCode(outletCode) || 'unknown'}`;

export const isPosMenuRevisionKey = (key) =>
  String(key || '').startsWith(`${POS_MENU_REVISION_PREFIX}:`);

export const outletCodeFromRevisionKey = (key) =>
  isPosMenuRevisionKey(key) ? String(key).slice(POS_MENU_REVISION_PREFIX.length + 1) : '';

/** Invalidate the lightweight POS cache in this tab and every other open tab. */
export const notifyPosMenuUpdated = (outletCode) => {
  const code = normalizedCode(outletCode);
  if (!code || typeof window === 'undefined') return;

  try {
    localStorage.removeItem(posMenuCacheKey(code));
    // Unlike removing an already-missing cache entry, a unique revision value
    // reliably emits a storage event in other tabs/windows.
    localStorage.setItem(posMenuRevisionKey(code), `${Date.now()}:${Math.random()}`);
  } catch { /* POS will still receive the same-tab event below. */ }

  window.dispatchEvent(new CustomEvent(POS_MENU_UPDATED_EVENT, {
    detail: { outletCode: code },
  }));
};
