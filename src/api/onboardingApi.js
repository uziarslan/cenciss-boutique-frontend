import api from './axios';

export const completeOutletWizard = (payload) =>
  api.post('/api/onboarding/outlet', payload);
