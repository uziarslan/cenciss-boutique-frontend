import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useSession from './useSession';
import { getKdsReadyCounts } from '../api/sessionApi';
import { getQrSocket, joinOrderRoom } from '../utils/qrSocket';
import { playOrderAlert } from '../utils/orderAlertSound';

const EMPTY = { enabled: false, total: 0, byType: {} };

const useKdsReadyCount = (enabled = false) => {
  const { outletId } = useSession();
  const [state, setState] = useState(EMPTY);

  const refresh = useCallback(async () => {
    if (!enabled || !outletId || !navigator.onLine) return;
    try {
      const next = await getKdsReadyCounts(outletId);
      setState(next || EMPTY);
    } catch {
      // The KDS may be disabled or temporarily unreachable. Keep POS ordering
      // independent and let the next socket/reconnect refresh recover.
    }
  }, [enabled, outletId]);

  useEffect(() => {
    if (!enabled || !outletId) {
      setState(EMPTY);
      return undefined;
    }
    refresh();
    const socket = getQrSocket();
    const leave = joinOrderRoom(outletId);
    const onReady = (order = {}) => {
      playOrderAlert('qr');
      setState((current) => ({
        ...current,
        enabled: true,
        total: Math.min(999, Number(current.total || 0) + 1),
        byType: {
          ...(current.byType || {}),
          [order.orderType || 'dine-in']: Math.min(999, Number(current.byType?.[order.orderType || 'dine-in'] || 0) + 1),
        },
      }));
      const type = String(order.orderType || 'order').replace('-', ' ');
      const table = order.tableNumber ? ` · Table ${order.tableNumber}` : '';
      const displayNumber = order.finalTransactionNumber || order.orderNumber || '—';
      toast.success(`Food ready: #${displayNumber} · ${type}${table}`, {
        id: `kds-ready:${order.id || order.orderId || order.orderNumber}`,
        duration: 12000,
      });
      window.dispatchEvent(new CustomEvent('pos-kds-ready', { detail: order }));
    };
    const onChanged = () => {
      refresh();
      window.dispatchEvent(new Event('pos-kds-status-changed'));
    };
    const onStatus = (order = {}) => {
      if (order.currentStatus !== 'dispatched') refresh();
      window.dispatchEvent(new Event('pos-kds-status-changed'));
    };
    socket.on('kds-order:ready', onReady);
    socket.on('kds-order:status', onStatus);
    socket.on('kds-ready:acknowledged', onChanged);
    socket.on('kds-order:cancelled', onChanged);
    socket.on('connect', refresh);
    return () => {
      leave();
      socket.off('kds-order:ready', onReady);
      socket.off('kds-order:status', onStatus);
      socket.off('kds-ready:acknowledged', onChanged);
      socket.off('kds-order:cancelled', onChanged);
      socket.off('connect', refresh);
    };
  }, [enabled, outletId, refresh]);

  return state;
};

export default useKdsReadyCount;
