import api from './axios';

// Current sales-tax rates (standard / card) for the terminal's outlet. Used to
// mirror the server's payment-method-aware tax maths for display. Pass the
// session's outlet so each outlet shows its own rates (server stays authoritative).
export const getTaxConfig = (outletId) =>
  api.get('/api/tax/config', { params: outletId ? { outlet: outletId } : {} })
    .then((r) => r.data?.data ?? r.data);
