// Product dropdowns must contain the complete catalog. The products API caps a
// single request at 100 records, so asking it for an arbitrarily large `limit`
// still truncates the list. Walk every reported page instead and return the same
// bare array shape that the dropdown hooks have always exposed.
const fetchAllProductPages = async (params = {}, fetchWithBQ) => {
  // Pagination is owned by this helper; callers may only supply filters/sort.
  const filters = { ...(params || {}) };
  delete filters.page;
  delete filters.limit;

  const pageSize = 100;
  const products = [];
  let page = 1;
  let pages = 1;

  do {
    const result = await fetchWithBQ({
      url: '/api/products',
      method: 'get',
      params: { ...filters, page, limit: pageSize },
    });
    if (result.error) return { error: result.error };

    const payload = result.data?.data ?? {};
    const batch = Array.isArray(payload.products) ? payload.products : [];
    products.push(...batch);

    const reportedPages = Number(payload.pages);
    pages = Number.isFinite(reportedPages) && reportedPages > 0
      ? reportedPages
      : (batch.length === pageSize ? page + 1 : page);
    page += 1;
  } while (page <= pages);

  return { data: products };
};

export default fetchAllProductPages;
