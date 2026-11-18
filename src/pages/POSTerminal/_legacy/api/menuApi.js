import api from './axios';

export const getMenu = async (outletCode) => {
    const response = await api.get(`/api/pos/menu/${encodeURIComponent(outletCode)}`);
    return response.data?.data ?? response.data;
};

export const getMenuAvailability = async (outletCode) => {
    const response = await api.get(`/api/pos/menu/${encodeURIComponent(outletCode)}/availability`);
    return response.data?.availability ?? {};
};
