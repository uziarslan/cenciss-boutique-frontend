// Client-side store for the recipe-unlock token. The token is issued by the
// backend only after the correct recipe password is verified, and it is what
// lets the API return locked recipes' ingredients. We keep it in sessionStorage
// so it is cleared when the tab closes (a soft "session" scope); the token also
// carries a hard server-side expiry, enforced here too so a stale token is never
// sent.

const KEY = 'recipeUnlockToken';

// Header name must match the backend (utils/recipeLock.js UNLOCK_HEADER).
export const RECIPE_UNLOCK_HEADER = 'x-recipe-unlock';

// Notify listeners (badges, buttons) when the unlock state flips.
const EVENT = 'recipe-unlock-changed';

const expOf = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
};

// Returns the token if present AND not expired; otherwise clears it and returns null.
export const getRecipeUnlockToken = () => {
  let token;
  try {
    token = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!token) return null;
  const exp = expOf(token);
  if (!exp || exp <= Date.now()) {
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    return null;
  }
  return token;
};

export const isRecipeUnlocked = () => !!getRecipeUnlockToken();

export const setRecipeUnlockToken = (token) => {
  try { sessionStorage.setItem(KEY, token); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* ignore */ }
};

export const clearRecipeUnlockToken = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* ignore */ }
};

// Subscribe to unlock-state changes; returns an unsubscribe fn.
export const onRecipeUnlockChange = (handler) => {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
};
