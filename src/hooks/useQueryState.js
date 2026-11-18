import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

// Synchronous setters in one event (for example Clear filters calling five
// setters) must compose before React Router commits the navigation.
const pendingSearchByPath = new Map();

const deserialize = (raw, fallback) => {
  if (raw == null) return fallback;
  if (typeof fallback === 'boolean') return raw === 'true';
  if (typeof fallback === 'number') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return raw;
};

/**
 * Drop-in URL-backed replacement for useState for page-level filters.
 *
 * The query parameter is omitted when its value equals the supplied default,
 * keeping default URLs clean. Updates replace the current history entry: when
 * users navigate elsewhere, Back/Forward restores the complete filtered URL
 * without adding one browser-history entry per keystroke.
 */
export default function useQueryState(key, defaultValue = '') {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;
  const defaultRef = useRef();
  if (!defaultRef.current) {
    defaultRef.current = {
      value: typeof defaultValue === 'function' ? defaultValue() : defaultValue,
    };
  }
  const resolvedDefault = defaultRef.current.value;
  const params = new URLSearchParams(location.search);
  const value = deserialize(params.get(key), resolvedDefault);

  const setValue = useCallback((nextValueOrUpdater) => {
    const currentLocation = locationRef.current;
    const pathKey = currentLocation.pathname;
    const baseSearch = pendingSearchByPath.get(pathKey) ?? currentLocation.search;
    const nextParams = new URLSearchParams(baseSearch);
    const current = deserialize(nextParams.get(key), resolvedDefault);
    const nextValue = typeof nextValueOrUpdater === 'function'
      ? nextValueOrUpdater(current)
      : nextValueOrUpdater;

    if (
      nextValue == null
      || nextValue === ''
      || String(nextValue) === String(resolvedDefault)
    ) {
      nextParams.delete(key);
    } else {
      nextParams.set(key, String(nextValue));
    }

    const nextSearch = nextParams.toString() ? `?${nextParams.toString()}` : '';
    if (nextSearch === baseSearch) return;
    pendingSearchByPath.set(pathKey, nextSearch);
    navigate(
      { pathname: currentLocation.pathname, search: nextSearch, hash: currentLocation.hash },
      { replace: true },
    );
    queueMicrotask(() => {
      if (pendingSearchByPath.get(pathKey) === nextSearch) {
        pendingSearchByPath.delete(pathKey);
      }
    });
  }, [key, navigate, resolvedDefault]);

  return [value, setValue];
}

// Object-shaped drop-in for pages that already keep all filters in one state
// object. Existing `setFilters(old => ({ ...old, key: value }))` calls continue
// to work while every field is serialized independently in the URL.
export function useQueryFilters(defaultValues, keyMap = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;
  const defaultsRef = useRef(defaultValues);
  const keysRef = useRef(keyMap);
  const filters = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return Object.fromEntries(Object.entries(defaultsRef.current).map(([key, fallback]) => [
      key,
      deserialize(params.get(keysRef.current[key] || key), fallback),
    ]));
  }, [location.search]);

  const setFilters = useCallback((nextOrUpdater) => {
    const currentLocation = locationRef.current;
    const pathKey = currentLocation.pathname;
    const baseSearch = pendingSearchByPath.get(pathKey) ?? currentLocation.search;
    const nextParams = new URLSearchParams(baseSearch);
    const current = Object.fromEntries(Object.entries(defaultsRef.current).map(([key, fallback]) => [
      key,
      deserialize(nextParams.get(keysRef.current[key] || key), fallback),
    ]));
    const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(current) : nextOrUpdater;
    for (const [key, fallback] of Object.entries(defaultsRef.current)) {
      const paramKey = keysRef.current[key] || key;
      const value = next?.[key] ?? fallback;
      if (value == null || value === '' || String(value) === String(fallback)) {
        nextParams.delete(paramKey);
      } else {
        nextParams.set(paramKey, String(value));
      }
    }
    const nextSearch = nextParams.toString() ? `?${nextParams.toString()}` : '';
    if (nextSearch === baseSearch) return;
    pendingSearchByPath.set(pathKey, nextSearch);
    navigate(
      { pathname: currentLocation.pathname, search: nextSearch, hash: currentLocation.hash },
      { replace: true },
    );
    queueMicrotask(() => {
      if (pendingSearchByPath.get(pathKey) === nextSearch) pendingSearchByPath.delete(pathKey);
    });
  }, [navigate]);

  return [filters, setFilters];
}
