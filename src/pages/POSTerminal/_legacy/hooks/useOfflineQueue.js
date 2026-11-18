import { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { holdOrder } from '../api/saleApi';
import {
    getQueue,
    getOfflineHolds,
    offlineQueueStorageKeys,
} from '../utils/offlineQueue';
import { upsertCachedHeldOrder } from '../utils/heldOrdersCache';
import {
    loadQueue,
    markSynced,
    markSyncing,
    markFailed,
    setSyncing,
    setSyncAttempt,
    loadHoldQueue,
    markHoldSynced,
    markHoldSyncing,
    markHoldFailed,
} from '../store/slices/offlineSlice';
import { fetchCurrentSession } from '../store/slices/sessionSlice';
import { fetchMenuAvailability } from '../store/slices/menuSlice';

const OFFLINE_TOAST_ID = 'pos-offline-toast';
const OFFLINE_SYNC_BATCH_SIZE = 3;

let syncInFlight = null;

const resultId = (result) => (
    typeof result === 'string' ? result : result?.clientTransactionId
);

export const normalizeOfflineSyncResult = (response) => {
    const data = response?.data?.data ?? response?.data ?? response ?? {};
    return {
        synced: Array.isArray(data.synced) ? data.synced : [],
        skipped: Array.isArray(data.skipped) ? data.skipped : [],
        failed: Array.isArray(data.failed) ? data.failed : [],
    };
};

export const chunkOfflineEntries = (
    entries,
    size = OFFLINE_SYNC_BATCH_SIZE,
) => {
    const safeSize = Math.max(1, Number(size) || OFFLINE_SYNC_BATCH_SIZE);
    const chunks = [];
    for (let index = 0; index < entries.length; index += safeSize) {
        chunks.push(entries.slice(index, index + safeSize));
    }
    return chunks;
};

const useOfflineQueue = ({ bootstrap = false } = {}) => {
    const dispatch = useDispatch();
    const { isSyncing, queue, holdQueue } = useSelector((state) => state.offline);
    const cashier = useSelector((state) => state.auth.cashier);
    const cashierId = cashier?._id || cashier?.id || null;
    const outletCode = useSelector(
        (state) => state.auth.outletCode || state.session.session?.outlet?.code || ''
    );
    const resumedFromOfflineId = useSelector((state) => state.order.resumedFromOfflineId);

    const runExclusive = useCallback(async (work) => {
        if (syncInFlight) {
            await syncInFlight;
            return runExclusive(work);
        }

        dispatch(setSyncing(true));
        const task = Promise.resolve().then(work);
        syncInFlight = task;
        try {
            return await task;
        } finally {
            if (syncInFlight === task) syncInFlight = null;
            dispatch(setSyncing(false));
            dispatch(setSyncAttempt());
        }
    }, [dispatch]);

    const syncQueue = useCallback(async (options = {}) => {
        const ids = Array.isArray(options?.ids) ? new Set(options.ids) : null;
        const silent = options?.silent === true;
        const allEntries = getQueue(cashierId);
        const entries = allEntries.filter((entry) => (
            !ids || ids.has(entry.clientTransactionId)
        ));
        if (!entries.length) return { synced: 0, failed: 0 };

        if (allEntries.length > 50 && !silent) {
            toast.error('Offline queue has over 50 items. Review it before closing the shift.');
        }

        return runExclusive(async () => {
            entries.forEach((entry) => dispatch(markSyncing(entry.clientTransactionId)));

            try {
                const results = { synced: [], skipped: [], failed: [] };
                const chunks = chunkOfflineEntries(entries);

                for (let index = 0; index < chunks.length; index += 1) {
                    const batch = chunks[index];
                    try {
                        const response = await api.post('/api/pos/sync-offline', {
                            transactions: batch,
                        });
                        const normalized = normalizeOfflineSyncResult(response);
                        results.synced.push(...normalized.synced);
                        results.skipped.push(...normalized.skipped);
                        results.failed.push(...normalized.failed);
                    } catch (error) {
                        const message = error.response?.data?.message || error.message || 'Connection failed.';
                        const retryable = !error.response || error.response.status >= 500;
                        const affected = retryable
                            ? chunks.slice(index).flat()
                            : batch;
                        results.failed.push(...affected.map((entry) => ({
                            clientTransactionId: entry.clientTransactionId,
                            error: message,
                            code: error.response ? `HTTP_${error.response.status}` : 'NETWORK_ERROR',
                            retryable,
                        })));
                        // A network/server failure is unlikely to improve during
                        // the same click. Keep later records queued instead of
                        // sending a burst of requests to a struggling server.
                        if (retryable) break;
                    }
                }

                const { synced, skipped, failed } = results;
                const completedIds = new Set(
                    [...synced, ...skipped].map(resultId).filter(Boolean)
                );
                const failedById = new Map(
                    failed.filter((item) => item?.clientTransactionId)
                        .map((item) => [item.clientTransactionId, item])
                );

                completedIds.forEach((id) => dispatch(markSynced(id)));
                entries.forEach((entry) => {
                    const id = entry.clientTransactionId;
                    if (completedIds.has(id)) return;
                    const failure = failedById.get(id);
                    dispatch(markFailed({
                        id,
                        error: failure?.error || 'The server did not return a result for this sale.',
                        code: failure?.code || 'MISSING_SYNC_RESULT',
                        details: failure?.details || null,
                        retryable: failure?.retryable !== false,
                    }));
                });

                const syncedCount = completedIds.size;
                const failCount = entries.length - syncedCount;
                if (syncedCount > 0 && outletCode) {
                    dispatch(fetchMenuAvailability(outletCode));
                }
                if (!silent) {
                    if (syncedCount > 0) {
                        toast.success(
                            `Synced ${syncedCount} sale${syncedCount === 1 ? '' : 's'}.` +
                            (failCount ? ` ${failCount} still need attention.` : '')
                        );
                    } else if (failCount > 0) {
                        toast.error(`${failCount} offline sale${failCount === 1 ? '' : 's'} could not sync.`);
                    }
                }
                return { synced: syncedCount, failed: failCount };
            } catch (error) {
                const message = error.response?.data?.message || error.message || 'Connection failed.';
                const retryable = !error.response || error.response.status >= 500;
                entries.forEach((entry) => dispatch(markFailed({
                    id: entry.clientTransactionId,
                    error: message,
                    code: error.response ? `HTTP_${error.response.status}` : 'NETWORK_ERROR',
                    retryable,
                })));
                if (!silent) toast.error('Sync failed. The queued sales were kept for retry.');
                return { synced: 0, failed: entries.length };
            } finally {
                dispatch(loadQueue());
            }
        });
    }, [cashierId, dispatch, outletCode, runExclusive]);

    const syncHoldQueue = useCallback(async (options = {}) => {
        const ids = Array.isArray(options?.ids) ? new Set(options.ids) : null;
        const silent = options?.silent === true;
        const holds = getOfflineHolds(cashierId).filter((hold) => (
            hold.clientTransactionId !== resumedFromOfflineId
            && (!ids || ids.has(hold.clientTransactionId))
        ));
        if (!holds.length) return { synced: 0, failed: 0 };

        return runExclusive(async () => {
            let syncedCount = 0;
            let failedCount = 0;
            const syncedOrders = [];

            for (const hold of holds) {
                dispatch(markHoldSyncing(hold.clientTransactionId));
                try {
                    const syncedHold = await holdOrder(hold);
                    upsertCachedHeldOrder(outletCode, {
                        ...syncedHold,
                        customer: hold._customer || syncedHold?.customer || null,
                        cashier: typeof syncedHold?.cashier === 'object'
                            ? syncedHold.cashier
                            : {
                                _id: cashierId,
                                name: cashier?.name,
                                email: cashier?.email,
                            },
                    });
                    syncedOrders.push(syncedHold);
                    dispatch(markHoldSynced(hold.clientTransactionId));
                    syncedCount += 1;
                } catch (error) {
                    const message = error.response?.data?.message || error.message || 'Connection failed.';
                    dispatch(markHoldFailed({
                        id: hold.clientTransactionId,
                        error: message,
                        code: error.response ? `HTTP_${error.response.status}` : 'NETWORK_ERROR',
                        retryable: !error.response || error.response.status >= 500,
                    }));
                    failedCount += 1;
                }
            }

            dispatch(loadHoldQueue());
            if (syncedCount > 0 && outletCode) {
                dispatch(fetchMenuAvailability(outletCode));
            }
            if (!silent) {
                if (syncedCount > 0) {
                    toast.success(
                        `Synced ${syncedCount} held order${syncedCount === 1 ? '' : 's'}.` +
                        (failedCount ? ` ${failedCount} still need attention.` : '')
                    );
                } else if (failedCount > 0) {
                    toast.error(`${failedCount} offline hold${failedCount === 1 ? '' : 's'} could not sync.`);
                }
            }
            return { synced: syncedCount, failed: failedCount, orders: syncedOrders };
        });
    }, [cashier, cashierId, dispatch, outletCode, resumedFromOfflineId, runExclusive]);

    const syncAll = useCallback(async (options = {}) => {
        const saleResult = await syncQueue(options);
        const holdResult = await syncHoldQueue(options);
        return {
            synced: saleResult.synced + holdResult.synced,
            failed: saleResult.failed + holdResult.failed,
        };
    }, [syncHoldQueue, syncQueue]);

    const reconcileSales = useCallback(async (clientTransactionIds) => {
        if (!clientTransactionIds?.length) return [];
        const response = await api.post('/api/pos/sync-offline/status', {
            clientTransactionIds,
        }, { timeout: 5000 });
        return response.data?.data || [];
    }, []);

    useEffect(() => {
        if (!bootstrap) return undefined;
        dispatch(loadQueue());
        dispatch(loadHoldQueue());

        const handleOffline = () => {
            toast('Connection lost. New sales will remain on this terminal.', {
                id: OFFLINE_TOAST_ID,
                duration: 6000,
            });
        };

        const handleOnline = () => {
            toast.dismiss(OFFLINE_TOAST_ID);
            dispatch(fetchCurrentSession());
        };

        const handleStorage = (event) => {
            if (event.key === offlineQueueStorageKeys.sales) dispatch(loadQueue());
            if (event.key === offlineQueueStorageKeys.holds) dispatch(loadHoldQueue());
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('storage', handleStorage);
        };
    }, [bootstrap, cashierId, dispatch]);

    return {
        syncQueue,
        syncHoldQueue,
        syncAll,
        reconcileSales,
        isSyncing,
        queue,
        holdQueue,
        queueLength: queue.length,
        holdQueueLength: holdQueue.length,
        totalQueueLength: queue.length + holdQueue.length,
    };
};

export default useOfflineQueue;
