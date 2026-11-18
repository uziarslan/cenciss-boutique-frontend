import api from './axios';

export const getUsers = () => api.get('/api/users');
export const updateUser = (id, data) => api.patch(`/api/users/${id}`, data);
export const inviteUserLink = (data) => api.post('/api/users/invite', data);
export const generateInviteForUser = (id) => api.post(`/api/users/${id}/invite`);
export const createUser = (data) => api.post('/api/users', data);
export const deleteUser = (id, { hard } = {}) => api.delete(`/api/users/${id}${hard ? '?hard=true' : ''}`);
export const getMe = () => api.get('/api/auth/me');
export const updateMySidebarPreferences = (hiddenTabs) =>
  api.patch('/api/users/me/sidebar-preferences', { hiddenTabs });
export const updateMyProfile = (data) => api.patch('/api/users/me/profile', data);
export const changeMyPassword = (data) => api.post('/api/users/me/change-password', data);
