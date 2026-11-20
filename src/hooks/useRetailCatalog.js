import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import useDebounce from './useDebounce';

export const EMPTY_CATALOG_OPTIONS = { types: [], vendors: [], tags: [], sizes: [], colors: [], optionValues: [] };

// Filter values remain in the URL. Only network timing and results live here.
export default function useRetailCatalog({ outletId, search, page, filters, setOutletId, setPage }) {
  const [options, setOptions] = useState({ outlets: [], filterOptions: EMPTY_CATALOG_OPTIONS });
  const [optionsReady, setOptionsReady] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const setters = useRef({ setOutletId, setPage });
  setters.current = { setOutletId, setPage };
  const outletRef = useRef(outletId);
  outletRef.current = outletId;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsError('');
    setOptionsLoading(true);
    api.get('/api/shopify/catalog/options', { params: { includeInactive: true }, signal: controller.signal, timeout: 15000 })
      .then((response) => {
        if (controller.signal.aborted) return;
        const data = response.data?.data || {};
        const outlets = data.outlets || [];
        setOptions({ outlets, filterOptions: { ...EMPTY_CATALOG_OPTIONS, ...data.filterOptions } });
        if (!outletRef.current && outlets.length === 1) setters.current.setOutletId(String(outlets[0]._id));
        setOptionsReady(true);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setOptionsError('Could not load filter choices. Please try again.');
        setOptionsReady(true);
      })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [revision]);

  // Primitive keys prevent URL updates or new object identities from issuing
  // duplicate requests. Text and price fields wait until typing pauses.
  const textKey = JSON.stringify({ q: search.trim(), minPrice: filters.minPrice, maxPrice: filters.maxPrice });
  const debouncedText = useDebounce(textKey, 300);
  const waitingForInput = textKey !== debouncedText;
  const queryKey = JSON.stringify({
    ...filters, ...JSON.parse(debouncedText), outletId: outletId || undefined,
    page, limit: 50, includeInactive: true, summary: true,
  });
  const ready = Boolean(outletId) || (optionsReady && options.outlets.length !== 1);

  useEffect(() => {
    if (!ready || waitingForInput) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = JSON.parse(queryKey);
    api.get('/api/shopify/catalog', { params, signal: controller.signal, timeout: 15000 })
      .then((response) => {
        if (controller.signal.aborted) return;
        const data = response.data?.data || {};
        setResult({ items: data.items || [], total: data.total || 0, pages: Math.max(1, data.totalPages || 1), pageSize: data.pageSize || 50, page: data.page || 1 });
        if (data.page && data.page !== params.page) setters.current.setPage(data.page);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.code === 'ECONNABORTED' ? 'The catalog is taking longer than expected. Please retry.' : failure.response?.status >= 500 ? 'The catalog is temporarily unavailable. Please retry.' : failure.response?.data?.message || 'Could not load finished goods. Please try again.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [queryKey, ready, waitingForInput, revision]);

  return { ...options, optionsReady, optionsLoading, optionsError, result, error, loading: loading || waitingForInput, refresh };
}
