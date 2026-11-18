import api from './axios';

// Search staff users by name for allowance selection at POS checkout
export const searchUsersForAllowance = (q) =>
    api.get('/api/allowances/search', { params: { q } });

// Get a specific subject's current-period allowance balance.
// subjectType: 'employee' (default) | 'user' (owner).
export const getUserAllowance = (subjectId, subjectType = 'employee') =>
    api.get(`/api/allowances/user/${subjectId}`, { params: { subjectType } });
