import { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { listQrOrders } from '../api/qrOrderApi';
import { getQrSocket, joinCashierRoom, getPosTenantSlug } from '../utils/qrSocket';
import { playOrderAlert } from '../utils/orderAlertSound';

/**
 * Tracks the count of pending-approval QR orders for the cashier's outlet,
 * driven by socket events. We do ONE initial REST fetch on mount to seed
 * the count, then maintain it incrementally via socket events:
 *   - qr-order:new       → new pending → count + 1
 *   - qr-order:updated   → status change → recompute (any non-pending
 *                          status removes from the pending bucket)
 *
 * No polling. The socket reconnection logic in qrSocket.js handles dropouts.
 */
const useQrPendingCount = (enabled = true) => {
  const session = useSelector((s) => s.session.session);
  const outletId = session?.outlet?._id || session?.outlet || null;
  const sessionOpen = session?.status === 'open';
  const tenantSlug = getPosTenantSlug();
  // Track the actual order numbers in pending state so duplicate updates
  // (e.g. the same order moving pending→held then held→completed) don't
  // double-decrement. The badge shows the size of this set.
  const [pendingSet, setPendingSet] = useState(() => new Set());

  // Seed via one REST call; thereafter updates come from sockets.
  const seed = useCallback(async () => {
    if (!enabled || !sessionOpen) { setPendingSet(new Set()); return; }
    try {
      const orders = await listQrOrders(outletId);
      const keys = [];
      (orders || []).forEach((order) => {
        if (order.status === 'pending-approval' || (order.qrOrder?.pendingAddOn?.items || []).length > 0) {
          keys.push(`approval:${order.transactionNumber}`);
        }
        if (order.qrOrder?.billRequest?.status === 'pending') {
          keys.push(`bill:${order.transactionNumber}`);
        }
      });
      setPendingSet(new Set(keys));
    } catch {
      // Silent — header shouldn't toast on transient errors.
    }
  }, [enabled, sessionOpen, outletId]);

  useEffect(() => {
    // Feature off → no seed, no socket, no cashier-room join.
    if (!enabled || !sessionOpen) { setPendingSet(new Set()); return; }
    seed();
    const sock = getQrSocket();
    const cleanupJoin = joinCashierRoom(tenantSlug, outletId);

    const onNew = (payload) => {
      if (!payload?.orderNumber) return;
      playOrderAlert('qr');
      setPendingSet((prev) => {
        const key = `approval:${payload.orderNumber}`;
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    };
    const onUpdated = (payload) => {
      if (!payload?.orderNumber) return;
      // Any transition out of pending removes from the set. Re-pending is
      // impossible, so we never re-add here.
      setPendingSet((prev) => {
        const approvalKey = `approval:${payload.orderNumber}`;
        const billKey = `bill:${payload.orderNumber}`;
        if (!prev.has(approvalKey) && (payload.status === 'held' || !prev.has(billKey))) return prev;
        const next = new Set(prev);
        next.delete(approvalKey);
        if (payload.status && !['pending-approval', 'held'].includes(payload.status)) next.delete(billKey);
        return next;
      });
    };
    const onBillRequested = (payload) => {
      if (!payload?.orderNumber) return;
      setPendingSet((prev) => new Set(prev).add(`bill:${payload.orderNumber}`));
    };
    const onBillAcknowledged = (payload) => {
      if (!payload?.orderNumber) return;
      setPendingSet((prev) => {
        const next = new Set(prev);
        next.delete(`bill:${payload.orderNumber}`);
        return next;
      });
    };
    const onResolvedLocally = (event) => {
      const orderNumber = event.detail?.orderNumber;
      if (!orderNumber) return;
      const type = event.detail?.type || 'approval';
      const key = `${type}:${orderNumber}`;
      setPendingSet((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    };
    // If the socket reconnects after a long disconnect we may have missed
    // events — re-seed to be safe.
    const onConnect = () => seed();

    sock.on('qr-order:new', onNew);
    sock.on('qr-order:updated', onUpdated);
    sock.on('qr-order:bill-requested', onBillRequested);
    sock.on('qr-order:bill-acknowledged', onBillAcknowledged);
    sock.on('connect', onConnect);
    window.addEventListener('pos-qr-pending-resolved', onResolvedLocally);

    return () => {
      cleanupJoin();
      sock.off('qr-order:new', onNew);
      sock.off('qr-order:updated', onUpdated);
      sock.off('qr-order:bill-requested', onBillRequested);
      sock.off('qr-order:bill-acknowledged', onBillAcknowledged);
      sock.off('connect', onConnect);
      window.removeEventListener('pos-qr-pending-resolved', onResolvedLocally);
    };
  }, [enabled, sessionOpen, outletId, tenantSlug, seed]);

  return pendingSet.size;
};

export default useQrPendingCount;
