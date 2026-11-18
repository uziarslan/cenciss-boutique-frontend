import api from './axios';

export const getCategories = (params = {}) =>
    api.get('/api/menu/categories', { params });

export const createCategory = (data) =>
    api.post('/api/menu/categories', data);

export const updateCategory = (id, data) =>
    api.patch(`/api/menu/categories/${id}`, data);

export const deleteCategory = (id, options = {}) => {
    const qs = options.hard ? '?hard=true' : '';
    return api.delete(`/api/menu/categories/${id}${qs}`);
};

// Quick-create a catalog ingredient (product with no inventory yet) from the
// Recipe Editor. data: { name, unit, category?, defaultPrice? }
export const createIngredient = (data) =>
    api.post('/api/menu/ingredients', data);

export const getMenuItems = (params = {}) =>
    api.get('/api/menu/items', { params });

export const createMenuItem = (data) =>
    api.post('/api/menu/items', data);

export const updateMenuItem = (id, data) =>
    api.patch(`/api/menu/items/${id}`, data);

export const deleteMenuItem = (id, options = {}) => {
    const qs = options.hard ? '?hard=true' : '';
    return api.delete(`/api/menu/items/${id}${qs}`);
};

export const uploadMenuItemImage = (id, file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/api/menu/items/${id}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

export const deleteMenuItemImage = (id) =>
    api.delete(`/api/menu/items/${id}/image`);

export const bulkUpdateAvailability = (data) =>
    api.patch('/api/menu/items/bulk-availability', Array.isArray(data) ? { items: data } : data);

// ─── Recipe / Ingredient Linkage ──────────────────────────────────────────────
// variationId scopes the recipe to a specific size; omit it for the item recipe.
export const getRecipe = (itemId, variationId) =>
    api.get(`/api/menu/items/${itemId}/recipe`, { params: variationId ? { variationId } : {} });

export const saveRecipe = (itemId, ingredients, trackInventory, variationId) =>
    api.put(`/api/menu/items/${itemId}/recipe`, { ingredients, trackInventory, ...(variationId ? { variationId } : {}) });

export const deleteRecipeIngredient = (itemId, ingredientId, variationId) =>
    api.delete(`/api/menu/items/${itemId}/recipe/${ingredientId}`, { params: variationId ? { variationId } : {} });

export const recordIngredientUsage = (itemId, data) =>
    api.post(`/api/menu/items/${itemId}/recipe/usage`, data);

// Lock / unlock a menu item's recipe. { locked: true|false }. Unlocking needs a
// valid unlock token (attached automatically by the axios interceptor).
export const setMenuRecipeLock = (itemId, locked) =>
    api.put(`/api/menu/items/${itemId}/recipe/lock`, { locked });

// ─── Prep Recipes (reusable in-house preparations: marination, sauces…) ─────────
export const getPrepRecipes = (params = {}) =>
    api.get('/api/menu/prep-recipes', { params });

// Full prep incl. ingredients (locked ones require a valid unlock token).
export const getPrepRecipe = (id, params = {}) =>
    api.get(`/api/menu/prep-recipes/${id}`, { params });

export const createPrepRecipe = (data) =>
    api.post('/api/menu/prep-recipes', data);

export const updatePrepRecipe = (id, data) =>
    api.put(`/api/menu/prep-recipes/${id}`, data);

export const deletePrepRecipe = (id) =>
    api.delete(`/api/menu/prep-recipes/${id}`);

export const setPrepLock = (id, locked) =>
    api.put(`/api/menu/prep-recipes/${id}/lock`, { locked });

// data: { batches, outlet }
export const producePrepBatch = (id, data) =>
    api.post(`/api/menu/prep-recipes/${id}/produce`, data);

// ─── Recipe Lock (tenant-wide password) ─────────────────────────────────────────
export const getRecipeLockStatus = () =>
    api.get('/api/menu/recipe-lock/status');

export const verifyRecipeLockPassword = (password) =>
    api.post('/api/menu/recipe-lock/verify', { password });

export const setRecipeLockPassword = (newPassword, currentPassword) =>
    api.post('/api/menu/recipe-lock/password', {
        newPassword,
        ...(currentPassword ? { currentPassword } : {}),
    });

export const disableRecipeLock = (currentPassword) =>
    api.delete('/api/menu/recipe-lock/password', { data: { currentPassword } });

export const lockAllRecipes = () =>
    api.put('/api/menu/recipe-lock/all');

export const unlockAllRecipes = (currentPassword) =>
    api.put('/api/menu/recipe-lock/all/unlock', { currentPassword });
