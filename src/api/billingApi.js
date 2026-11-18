import api from './axios';

export const getSubscriptionBillingStatus = () => api.get('/api/billing/status');
export const getSubscriptionInvoices = () => api.get('/api/billing/invoices');
export const downloadSubscriptionDocument = (invoiceId, kind = 'invoice') =>
  api.get(
    `/api/billing/invoices/${invoiceId}/${kind === 'receipt' ? 'receipt' : 'pdf'}`,
    { responseType: 'blob' },
  );
