import { useMemo } from 'react';
import { useGetVendorsQuery, useGetCustomPartiesQuery } from '../store/baseApi';

/**
 * Party dropdown options shared by the Ledger + Journal Entries party filters —
 * the exact keys AP Aging groups by: vendors (`v:<id>`) + saved custom parties
 * (`n:<lowercased name>`). A custom party whose name collides (case-insensitively)
 * with a vendor is KEPT: `n:<name>` is a DISTINCT aging group from that vendor's
 * `v:<id>`, so both must be selectable (tagged Custom vs Vendor).
 *
 * @param {string} party      active party key (so a URL-arrived party that isn't a
 *                            saved vendor/custom party still shows selected)
 * @param {string} partyName  its display name (label for the injected option)
 * @param {{ includeUnspecified?: boolean }} opts  add an "Unspecified" option
 *                            (useful for the Ledger, not the JE list)
 */
export default function usePartyOptions(party, partyName, { includeUnspecified = false } = {}) {
  const { data: vendors = [] } = useGetVendorsQuery();
  const { data: customParties = [] } = useGetCustomPartiesQuery();

  return useMemo(() => {
    const opts = customParties
      .filter((cp) => cp.isSystem && cp.name)
      .map((cp) => ({ value: `n:${cp.name.toLowerCase()}`, label: cp.name, meta: 'System party' }));
    opts.push(...vendors.map((v) => ({ value: `v:${v._id}`, label: v.name, meta: 'Vendor' })));
    const seen = new Set(opts.map((o) => o.value));
    for (const cp of customParties) {
      if (!cp.name || cp.isSystem) continue;
      const value = `n:${cp.name.toLowerCase()}`;
      if (seen.has(value)) continue;
      seen.add(value);
      opts.push({ value, label: cp.name, meta: 'Custom' });
    }
    if (includeUnspecified) opts.push({ value: 'unspecified', label: 'Unspecified', meta: 'No vendor / note' });
    // Inject the active party if it isn't a saved vendor/custom party (e.g. a
    // legacy notes-derived party reached via a link).
    if (party && !opts.some((o) => o.value === party)) {
      opts.unshift({ value: party, label: partyName || party, meta: 'Party' });
    }
    return opts;
  }, [vendors, customParties, party, partyName, includeUnspecified]);
}
