import api from './axios';

export const listQrOrders = async (outletId) => {
  const params = {};
  if (outletId) params.outletId = outletId;
  const r = await api.get('/api/pos/qr-orders', { params });
  return r.data?.data ?? [];
};

export const approveQrOrder = async (id) => {
  const r = await api.post(`/api/pos/qr-orders/${encodeURIComponent(id)}/approve`);
  return r.data?.data;
};

export const declineQrOrder = async (id, reason, prepared) => {
  const r = await api.post(`/api/pos/qr-orders/${encodeURIComponent(id)}/decline`, { reason, prepared });
  return r.data?.data;
};

export const acknowledgeQrBillRequest = async (id) => {
  const r = await api.post(`/api/pos/qr-orders/${encodeURIComponent(id)}/bill-request/acknowledge`);
  return r.data?.data;
};
