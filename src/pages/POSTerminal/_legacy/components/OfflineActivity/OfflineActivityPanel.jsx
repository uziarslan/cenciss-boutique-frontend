import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  Calculator,
  Clock3,
  CloudOff,
  PauseCircle,
  Receipt,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import useOfflineQueue from '../../hooks/useOfflineQueue';
import {
  clearOfflineHoldQueue,
  clearOfflineSales,
  discardOfflineHold,
  discardOfflineSale,
  repairOfflineCashAmount,
} from '../../store/slices/offlineSlice';
import { getOfflineCashAmountResolution } from '../../utils/offlineQueue';
import ConfirmModal from '../UI/ConfirmModal';

const formatMoney = (value) =>
  `PKR ${Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: Number(value || 0) % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const statusPresentation = (entry) => {
  if (entry.status === 'syncing') {
    return {
      label: 'Syncing',
      className: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
      Icon: RefreshCw,
      spin: true,
    };
  }
  if (entry.status === 'failed') {
    return entry.retryable === false
      ? {
          label: 'Action needed',
          className: 'bg-rose-50 text-rose-700 ring-rose-200',
          Icon: AlertCircle,
        }
      : {
          label: 'Retry pending',
          className: 'bg-amber-50 text-amber-700 ring-amber-200',
          Icon: AlertCircle,
        };
  }
  return {
    label: 'Queued',
    className: 'bg-slate-100 text-slate-700 ring-slate-200',
    Icon: Clock3,
  };
};

const ActivityRow = ({ entry, kind, busy, amountResolution, onRetry, onResolveAmount, onRemove }) => {
  const state = statusPresentation(entry);
  const itemCount = (entry.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const queuedAt = entry.queuedAt ? new Date(entry.queuedAt) : null;
  const StateIcon = state.Icon;

  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          kind === 'sale' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {kind === 'sale' ? <Receipt size={15} /> : <PauseCircle size={15} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-extrabold text-slate-900">
              {kind === 'sale' ? 'Paid sale' : 'Held order'}
            </p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${state.className}`}>
              <StateIcon size={10} className={state.spin ? 'animate-spin' : ''} />
              {state.label}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="font-bold tabular-nums text-slate-700">{formatMoney(entry.totalAmount)}</span>
            <span>{itemCount} item{itemCount === 1 ? '' : 's'}</span>
            <span>
              {queuedAt && !Number.isNaN(queuedAt.getTime())
                ? queuedAt.toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Time unavailable'}
            </span>
          </div>

          <p className="mt-1 truncate font-mono text-[10px] text-slate-400" title={entry.clientTransactionId}>
            {entry.clientTransactionId}
          </p>
          {entry.lastError && (
            <p className="mt-1.5 rounded-md bg-rose-50 px-2 py-1.5 text-[11px] font-medium leading-snug text-rose-700">
              {entry.lastError}
            </p>
          )}
          {entry.retries > 0 && (
            <p className="mt-1 text-[10px] font-medium text-slate-400">
              {entry.retries} failed attempt{entry.retries === 1 ? '' : 's'}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {amountResolution ? (
            <button
              type="button"
              onClick={onResolveAmount}
              disabled={busy || entry.status === 'syncing'}
              aria-label="Resolve offline cash amount"
              title="Resolve amount mismatch"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:opacity-40"
            >
              <Calculator size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy || entry.status === 'syncing'}
              aria-label={`Retry ${kind}`}
              title="Retry sync"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
            >
              <RefreshCw size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={busy || entry.status === 'syncing'}
            aria-label={`Remove ${kind} from offline storage`}
            title="Remove local retry record"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const OfflineActivityPanel = ({ isMobile, isOpen, onClose }) => {
  const dispatch = useDispatch();
  const {
    queue,
    holdQueue,
    isSyncing,
    syncQueue,
    syncHoldQueue,
    syncAll,
    reconcileSales,
  } = useOfflineQueue();
  const [filter, setFilter] = useState('all');
  const [removeTarget, setRemoveTarget] = useState(null);
  const [amountTarget, setAmountTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const entries = useMemo(() => {
    const sales = queue.map((entry) => ({ ...entry, _kind: 'sale' }));
    const holds = holdQueue.map((entry) => ({ ...entry, _kind: 'hold' }));
    if (filter === 'sales') return sales;
    if (filter === 'holds') return holds;
    return [...sales, ...holds].sort(
      (a, b) => new Date(b.queuedAt || 0) - new Date(a.queuedAt || 0)
    );
  }, [filter, holdQueue, queue]);

  const total = queue.length + holdQueue.length;
  const retryEntry = async (entry) => {
    if (entry._kind === 'sale') {
      await syncQueue({ ids: [entry.clientTransactionId] });
    } else {
      await syncHoldQueue({ ids: [entry.clientTransactionId] });
    }
  };

  const repairAmountAndRetry = async () => {
    if (!amountTarget) return;
    const id = amountTarget.entry.clientTransactionId;
    setRepairing(true);
    try {
      dispatch(repairOfflineCashAmount(id));
      setAmountTarget(null);
      await syncQueue({ ids: [id] });
    } finally {
      setRepairing(false);
    }
  };

  const removeEntries = async () => {
    const targets = removeTarget === 'all'
      ? [...queue.map((entry) => ({ ...entry, _kind: 'sale' })), ...holdQueue.map((entry) => ({ ...entry, _kind: 'hold' }))]
      : [removeTarget];
    if (!targets.length) {
      setRemoveTarget(null);
      return;
    }

    setRemoving(true);
    let serverCount = 0;
    let reconciliationFailed = false;
    try {
      const ids = targets.map((entry) => entry.clientTransactionId).filter(Boolean);
      if (!navigator.onLine) reconciliationFailed = true;
      for (let offset = 0; !reconciliationFailed && offset < ids.length; offset += 250) {
        try {
          const records = await reconcileSales(ids.slice(offset, offset + 250));
          serverCount += records.length;
        } catch {
          reconciliationFailed = true;
          break;
        }
      }

      if (removeTarget === 'all') {
        dispatch(clearOfflineSales());
        dispatch(clearOfflineHoldQueue());
      } else if (removeTarget._kind === 'sale') {
        dispatch(discardOfflineSale(removeTarget.clientTransactionId));
      } else {
        dispatch(discardOfflineHold(removeTarget.clientTransactionId));
      }

      if (reconciliationFailed) {
        toast('Local records removed. Server status could not be checked.');
      } else if (serverCount > 0) {
        toast.success(
          `Local records removed. ${serverCount} matching server record${serverCount === 1 ? ' was' : 's were'} retained.`
        );
      } else {
        toast.success(`Removed ${targets.length} offline record${targets.length === 1 ? '' : 's'}.`);
      }
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  const body = (
    <>
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <CloudOff size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-slate-900">Offline Activity</h2>
              <p className="text-[11px] font-medium text-slate-500">
                {total} local record{total === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close offline activity"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {[
              ['all', `All ${total}`],
              ['sales', `Sales ${queue.length}`],
              ['holds', `Holds ${holdQueue.length}`],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold transition ${
                  filter === value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => syncAll()}
              disabled={!total || isSyncing}
              title="Sync all offline records now"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-40"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing…' : 'Sync all'}
            </button>
            <button
              type="button"
              onClick={() => setRemoveTarget('all')}
              disabled={!total || isSyncing}
              title="Remove all local records"
              aria-label="Remove all offline records"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-white">
        {entries.length === 0 ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <CloudOff size={20} />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-800">No offline records</p>
          </div>
        ) : (
          entries.map((entry) => {
            const amountResolution = entry._kind === 'sale'
              ? getOfflineCashAmountResolution(entry)
              : null;
            return (
              <ActivityRow
                key={`${entry._kind}:${entry.clientTransactionId}`}
                entry={entry}
                kind={entry._kind}
                busy={isSyncing || removing || repairing}
                amountResolution={amountResolution}
                onRetry={() => retryEntry(entry)}
                onResolveAmount={() => setAmountTarget({ entry, resolution: amountResolution })}
                onRemove={() => setRemoveTarget(entry)}
              />
            );
          })
        )}
      </div>
    </>
  );

  const confirmModal = removeTarget && (
    <ConfirmModal
      title={removeTarget === 'all' ? 'Remove all offline records?' : 'Remove offline record?'}
      message={
        removeTarget === 'all'
          ? `This removes ${total} local retry record${total === 1 ? '' : 's'} from this terminal. Existing server transactions will not be deleted.`
          : 'This removes the local retry record from this terminal. An existing server transaction will not be deleted.'
      }
      confirmLabel={removing ? 'Removing...' : 'Remove'}
      cancelLabel="Cancel"
      variant="danger"
      onConfirm={removeEntries}
      onCancel={() => setRemoveTarget(null)}
    />
  );
  const amountModal = amountTarget && (
    <ConfirmModal
      title="Correct offline cash amount?"
      message={
        amountTarget.resolution.recordedTotal !== amountTarget.resolution.expectedTotal
          ? `The offline receipt recorded ${formatMoney(amountTarget.resolution.recordedTotal)}, but the server total is ${formatMoney(amountTarget.resolution.expectedTotal)}. Collect the additional ${formatMoney(amountTarget.resolution.shortfall)} before confirming. The queued cash amount will then be corrected and synced.`
          : `The receipt total is ${formatMoney(amountTarget.resolution.expectedTotal)}, but the recorded cash is short by ${formatMoney(amountTarget.resolution.shortfall)}. Collect the difference before confirming, then the queued sale will retry.`
      }
      confirmLabel={repairing
        ? 'Syncing...'
        : `Collected ${formatMoney(amountTarget.resolution.shortfall)}`}
      cancelLabel="Cancel"
      variant="primary"
      onConfirm={repairAmountAndRetry}
      onCancel={() => setAmountTarget(null)}
    />
  );

  if (isMobile) {
    return (
      <>
        {isOpen && (
          <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        )}
        <div className={`fixed inset-x-0 bottom-0 z-40 flex max-h-[92vh] min-h-[70vh] flex-col rounded-t-2xl bg-white shadow-float transition-transform duration-300 ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}>
          <div className="flex justify-center py-2">
            <div className="h-1 w-10 rounded-full bg-slate-300" />
          </div>
          {body}
        </div>
        {confirmModal}
        {amountModal}
      </>
    );
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-[calc(3.5rem_+_env(safe-area-inset-top))] z-[29] hidden md:block"
          onClick={onClose}
        />
      )}
      <aside className={`fixed bottom-0 right-0 top-[calc(3.5rem_+_env(safe-area-inset-top))] z-30 flex w-[440px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {body}
      </aside>
      {confirmModal}
      {amountModal}
    </>
  );
};

export default OfflineActivityPanel;
