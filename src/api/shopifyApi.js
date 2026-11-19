import api from './axios';

export const getShopifySettings = () => api.get('/api/shopify/settings');
export const connectShopify = (payload) => api.post('/api/shopify/connect', payload);
export const registerShopifyWebhooks = () => api.post('/api/shopify/webhooks/register');
export const getShopifyLocations = () => api.get('/api/shopify/locations');
export const saveShopifyLocationMappings = (payload) => api.put('/api/shopify/mappings', payload);
export const syncShopifyCatalog = () => api.post('/api/shopify/catalog/sync');
export const cancelShopifyCatalogSync = () => api.post('/api/shopify/catalog/sync/cancel');
export const reconcileShopifyOrders = () => api.post('/api/shopify/orders/reconcile');
export const getShopifyEvents = (params = {}) => api.get('/api/shopify/events', { params });
export const retryShopifyEvent = (eventId) => api.post(`/api/shopify/events/${encodeURIComponent(eventId)}/retry`);
export const getShopifyInventoryConflicts = () => api.get('/api/shopify/inventory-conflicts');
export const retryShopifyInventoryMovement = (movementId) => api.post(`/api/shopify/inventory-conflicts/${encodeURIComponent(movementId)}/retry`);
export const searchRetailCatalog = (q) => api.get('/api/shopify/catalog', { params: { q, limit: 100 } });
export const createManualRetailProduct = (payload) => api.post('/api/shopify/catalog/manual', payload);
export const updateRetailBarcode = (variantId, barcode) => api.patch(`/api/shopify/variants/${encodeURIComponent(variantId)}/barcode`, { barcode });
export const getRetailProduct = (productId) => api.get(`/api/shopify/catalog/products/${encodeURIComponent(productId)}`);
export const updateRetailProduct = (productId, payload) => api.put(`/api/shopify/catalog/products/${encodeURIComponent(productId)}`, payload);
