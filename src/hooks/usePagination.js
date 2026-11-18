import { useState, useCallback } from 'react';

const usePagination = (initialPageSize = 20) => {
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total,    setTotal]    = useState(0);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const goTo     = useCallback((n)  => setPage(Math.max(1, Math.min(n, pages))), [pages]);
  const next     = useCallback(()   => goTo(page + 1), [goTo, page]);
  const prev     = useCallback(()   => goTo(page - 1), [goTo, page]);
  const reset    = useCallback(()   => setPage(1), []);

  const changePageSize = useCallback((n) => {
    setPageSize(n);
    setPage(1);
  }, []);

  return {
    page,
    pageSize,
    total,
    pages,
    setTotal,
    goTo,
    next,
    prev,
    reset,
    changePageSize,
    hasPrev: page > 1,
    hasNext: page < pages,
  };
};

export default usePagination;
