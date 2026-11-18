import fetchAllProductPages from './fetchAllProductPages';

describe('fetchAllProductPages', () => {
  it('loads every catalog page and preserves active standard-item filters', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      _id: `product-${index + 1}`,
    }));
    const secondPage = Array.from({ length: 20 }, (_, index) => ({
      _id: `product-${index + 101}`,
    }));
    const fetchWithBQ = vi.fn()
      .mockResolvedValueOnce({
        data: { data: { products: firstPage, pages: 2 } },
      })
      .mockResolvedValueOnce({
        data: { data: { products: secondPage, pages: 2 } },
      });

    const result = await fetchAllProductPages(
      {
        page: 7,
        limit: 500,
        isActive: true,
        kind: 'standard',
        sortBy: 'name',
        sortOrder: 'asc',
      },
      fetchWithBQ,
    );

    expect(fetchWithBQ).toHaveBeenNthCalledWith(1, {
      url: '/api/products',
      method: 'get',
      params: {
        isActive: true,
        kind: 'standard',
        sortBy: 'name',
        sortOrder: 'asc',
        page: 1,
        limit: 100,
      },
    });
    expect(fetchWithBQ).toHaveBeenNthCalledWith(2, {
      url: '/api/products',
      method: 'get',
      params: {
        isActive: true,
        kind: 'standard',
        sortBy: 'name',
        sortOrder: 'asc',
        page: 2,
        limit: 100,
      },
    });
    expect(result.data).toHaveLength(120);
    expect(result.data.at(-1)._id).toBe('product-120');
  });

  it('returns the request error without fetching later pages', async () => {
    const error = { status: 500, data: { message: 'Failed' } };
    const fetchWithBQ = vi.fn().mockResolvedValue({ error });

    await expect(fetchAllProductPages({}, fetchWithBQ)).resolves.toEqual({ error });
    expect(fetchWithBQ).toHaveBeenCalledTimes(1);
  });
});
