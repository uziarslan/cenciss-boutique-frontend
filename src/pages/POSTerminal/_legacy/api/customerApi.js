import api from './axios';

/** Search customers by partial phone number */
export const searchCustomersByPhone = (phone) =>
    api.get('/api/customers/search', { params: { phone } });

/** Upsert a customer (create by phone, or update name/email) */
export const upsertCustomer = (data) =>
    api.post('/api/customers', data);

/** Add a new address to an existing customer */
export const addCustomerAddress = (customerId, address) =>
    api.post(`/api/customers/${encodeURIComponent(customerId)}/addresses`, address);

/** Update customer name / email */
export const updateCustomer = (customerId, data) =>
    api.patch(`/api/customers/${encodeURIComponent(customerId)}`, data);
