import api from './axios';

export const getAssetMeta = () => api.get('/api/assets/meta');
export const getAssetAccountOptions = () => api.get('/api/assets/account-options');

export const getAssetCategories = (params = {}) =>
  api.get('/api/assets/categories', { params });
export const createAssetCategory = (body) =>
  api.post('/api/assets/categories', body);
export const updateAssetCategory = (id, body) =>
  api.put(`/api/assets/categories/${id}`, body);

export const getAssets = (params = {}) =>
  api.get('/api/assets', { params });
export const getAsset = (id) =>
  api.get(`/api/assets/${id}`);
export const createAsset = (body) =>
  api.post('/api/assets', body);
export const updateAsset = (id, body) =>
  api.put(`/api/assets/${id}`, body);
export const transferAsset = (id, body) =>
  api.post(`/api/assets/${id}/transfer`, body);
export const deactivateAsset = (id, reason) =>
  api.post(`/api/assets/${id}/deactivate`, { reason });

export const getAssetAudits = (params = {}) =>
  api.get('/api/assets/audits', { params });
export const getAssetAudit = (id) =>
  api.get(`/api/assets/audits/${id}`);
export const createAssetAudit = (body) =>
  api.post('/api/assets/audits', body);
export const startAssetAudit = (id) =>
  api.post(`/api/assets/audits/${id}/start`);
export const countAssetAuditLine = (auditId, lineId, body) =>
  api.patch(`/api/assets/audits/${auditId}/lines/${lineId}/count`, body);
export const addUnregisteredAuditLine = (auditId, body) =>
  api.post(`/api/assets/audits/${auditId}/unregistered-lines`, body);
export const submitAssetAudit = (id, markUncountedMissing = false) =>
  api.post(`/api/assets/audits/${id}/submit`, { markUncountedMissing });
export const reviewAssetAudit = (id, lines) =>
  api.post(`/api/assets/audits/${id}/review`, { lines });
export const requestAssetAuditRecount = (id, body) =>
  api.post(`/api/assets/audits/${id}/recount`, body);
export const approveAssetAudit = (id, body) =>
  api.post(`/api/assets/audits/${id}/approve`, body);
export const rejectAssetAudit = (id, reason) =>
  api.post(`/api/assets/audits/${id}/reject`, { reason });

export const getDepreciationRuns = (outlet) =>
  api.get('/api/assets/depreciation-runs', { params: { outlet } });
export const getDepreciationRun = (id) =>
  api.get(`/api/assets/depreciation-runs/${id}`);
export const createDepreciationRun = (body) =>
  api.post('/api/assets/depreciation-runs', body);
export const postDepreciationRun = (id) =>
  api.post(`/api/assets/depreciation-runs/${id}/post`);
export const getAssetReconciliation = (outlet) =>
  api.get('/api/assets/reconciliation', { params: { outlet } });
