import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

// Opt-in features default to OFF on the backend (FEATURE_DEFAULT_OVERRIDES).
// On the frontend we mirror that: a missing or false value means hidden.
// All other features stay permissive — a key absent from the user payload
// for a legacy tenant shouldn't accidentally hide a feature that was
// always meant to be on (e.g. accounting on tenants created before the
// flag system existed).
const STRICT_FEATURES = new Set([
  'assetAudit',
  'membershipRewards',
  'qrOrdering',
  'kds',
  'riderTracking',
  // Attendance anti-spoofing add-ons — opt-in, default OFF for legacy tenants.
  'attendanceLiveness',
  'attendanceExternalDevice',
]);

export default function useFeatures() {
  const features = useSelector((state) => state.auth.user?.tenant?.features) ?? null;
  const outletFeatures = useSelector(
    (state) => state.auth.user?.tenant?.outletFeatures,
  ) ?? null;

  // Stable identity so consumers can list `hasFeature` in useEffect deps
  // without refiring every render.
  const map = useMemo(() => features ?? {}, [features]);
  const outletMap = useMemo(() => outletFeatures ?? {}, [outletFeatures]);

  const hasFeature = useCallback(
    (key, outletId) => {
      const scoped = outletId && outletMap[String(outletId)]
        ? outletMap[String(outletId)]
        : map;
      if (STRICT_FEATURES.has(key)) return scoped[key] === true;
      // Legacy permissive default — only false when explicitly set to false.
      return scoped[key] !== false;
    },
    [map, outletMap],
  );

  return { hasFeature, features: map, outletFeatures: outletMap };
}
