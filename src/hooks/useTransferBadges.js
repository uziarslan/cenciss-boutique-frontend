import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useGetTransferPendingCountsQuery, baseApi, listQueryOpts } from '../store/baseApi';
import usePermissions from './usePermissions';
import { getOpsSocket, joinOpsRoom } from '../utils/opsSocket';

/**
 * Counts of in-transit transfers awaiting the current user's acceptance, split
 * by side, kept LIVE via socket.io:
 *   - storePending   → kitchen→store transfers the STORE must accept  (store.manage)
 *   - kitchenPending → store→kitchen transfers the KITCHEN must accept (inventory.manage)
 *
 * Counts come from a cheap uncapped countDocuments endpoint (not a truncated
 * list), then a `transfer:changed` socket event (create/accept/reject, from any
 * user in the tenant) invalidates the StockIssue cache so counts + open lists refetch.
 */
const useTransferBadges = () => {
  const dispatch = useDispatch();
  const { has } = usePermissions();

  const canStore = has('store.manage');
  const canKitchen = has('inventory.manage');
  // View access is enough to subscribe (so open lists live-update for viewers);
  // the badge counts themselves are gated to the side the user can actually act on.
  const canView = canStore || canKitchen || has('store.view') || has('inventory.view');

  const { data } = useGetTransferPendingCountsQuery(undefined, { skip: !canView, ...listQueryOpts });

  const storePending = canStore ? (data?.storePending ?? 0) : 0;
  const kitchenPending = canKitchen ? (data?.kitchenPending ?? 0) : 0;

  useEffect(() => {
    if (!canView) return undefined;
    const sock = getOpsSocket();
    const cleanupJoin = joinOpsRoom();
    const onChanged = () => dispatch(baseApi.util.invalidateTags(['StockIssue', 'Stock', 'Report']));
    sock.on('transfer:changed', onChanged);
    // Re-seed after a reconnect in case events were missed while offline.
    sock.on('connect', onChanged);
    return () => {
      cleanupJoin();
      sock.off('transfer:changed', onChanged);
      sock.off('connect', onChanged);
    };
  }, [canView, dispatch]);

  return { storePending, kitchenPending, total: storePending + kitchenPending };
};

export default useTransferBadges;
