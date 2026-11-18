import { useEffect } from 'react';
import useQueryState from './useQueryState';

// URLs use one-based pages; list slicing uses zero-based pages.
export default function useQueryPagination(key, total, pageSize = 20) {
  const [rawPage, setRawPage] = useQueryState(key, '1');
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requested = /^[1-9]\d*$/.test(rawPage) && Number.isSafeInteger(Number(rawPage))
    ? Number(rawPage) : 1;
  const current = Math.min(requested, pageCount);

  useEffect(() => {
    if (rawPage !== String(current)) setRawPage(String(current));
  }, [rawPage, current, setRawPage]);

  return [current - 1, (page) => setRawPage(String(Math.max(1, Math.min(page + 1, pageCount))))];
}
