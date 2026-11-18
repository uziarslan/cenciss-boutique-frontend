import api from './axios';

// RTK Query baseQuery backed by our existing axios instance — so the auth-token
// request interceptor, the 401 single-flight refresh, and baseURL all keep
// working exactly as they do for direct api() calls. RTK Query only layers
// caching / dedup / stale-while-revalidate on top.
const axiosBaseQuery = () => async ({ url, method = 'get', params, data, headers }) => {
  try {
    const result = await api({ url, method, params, data, headers });
    return { data: result.data };
  } catch (axiosError) {
    return {
      error: {
        status: axiosError.response?.status,
        data: axiosError.response?.data || axiosError.message,
      },
    };
  }
};

export default axiosBaseQuery;
