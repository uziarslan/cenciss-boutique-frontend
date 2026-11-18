const QUEUE_KEY = 'pos_offline_queue_v2';
const HOLD_QUEUE_KEY = 'pos_offline_holds_v2';
const LEGACY_QUEUE_KEY = 'pos_offline_queue';
const LEGACY_HOLD_QUEUE_KEY = 'pos_offline_holds';

const parseJson = (raw, fallback) => {
    try {
        const value = JSON.parse(raw);
        return value ?? fallback;
    } catch {
        return fallback;
    }
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const activeIdentity = () => {
    const cashier = parseJson(localStorage.getItem('pos_cashier'), null);
    return {
        cashierId: String(cashier?._id || cashier?.id || ''),
        tenantSlug: String(cashier?.tenantSlug || cashier?.tenant?.slug || ''),
    };
};

const entryIdentity = (entry) => ({
    cashierId: String(entry?.owner?.cashierId || entry?.cashierId || ''),
    tenantSlug: String(entry?.owner?.tenantSlug || entry?.tenantSlug || ''),
});

const belongsTo = (entry, identity = activeIdentity()) => {
    const owner = entryIdentity(entry);
    if (!identity.cashierId || owner.cashierId !== String(identity.cashierId)) return false;
    return !identity.tenantSlug || !owner.tenantSlug || owner.tenantSlug === identity.tenantSlug;
};

const normalizeEntry = (entry, kind) => {
    const queuedAt = entry?.queuedAt || new Date().toISOString();
    return {
        ...entry,
        queuedAt,
        queueKind: kind,
        status: ['pending', 'syncing', 'failed'].includes(entry?.status) ? entry.status : 'pending',
        retries: Math.max(0, Number(entry?.retries) || 0),
        lastAttemptAt: entry?.lastAttemptAt || null,
        lastError: entry?.lastError || null,
        errorCode: entry?.errorCode || null,
        errorDetails: entry?.errorDetails || null,
        retryable: entry?.retryable !== false,
        owner: {
            cashierId: String(entry?.owner?.cashierId || entry?.cashierId || ''),
            sessionId: String(entry?.owner?.sessionId || entry?.sessionId || ''),
            outletCode: String(entry?.owner?.outletCode || entry?.outletCode || ''),
            tenantSlug: String(entry?.owner?.tenantSlug || entry?.tenantSlug || ''),
        },
    };
};

const readAll = (key, legacyKey, kind) => {
    const current = parseJson(localStorage.getItem(key), null);
    if (Array.isArray(current)) return current.map((entry) => normalizeEntry(entry, kind));

    const legacy = parseJson(localStorage.getItem(legacyKey), []);
    if (!Array.isArray(legacy) || legacy.length === 0) return [];

    const migrated = legacy.map((entry) => normalizeEntry(entry, kind));
    localStorage.setItem(key, JSON.stringify(migrated));
    localStorage.removeItem(legacyKey);
    return migrated;
};

const writeAll = (key, entries) => {
    localStorage.setItem(key, JSON.stringify(entries));
};

const getScoped = (key, legacyKey, kind, cashierId) => {
    const identity = cashierId
        ? { ...activeIdentity(), cashierId: String(cashierId) }
        : activeIdentity();
    return readAll(key, legacyKey, kind).filter((entry) => belongsTo(entry, identity));
};

const addEntry = (key, legacyKey, kind, payload) => {
    const all = readAll(key, legacyKey, kind);
    const identity = activeIdentity();
    const entry = normalizeEntry({
        ...payload,
        queuedAt: payload.queuedAt || new Date().toISOString(),
        status: 'pending',
        retries: 0,
        owner: {
            cashierId: String(payload.cashierId || identity.cashierId || ''),
            sessionId: String(payload.sessionId || ''),
            outletCode: String(payload.outletCode || ''),
            tenantSlug: identity.tenantSlug,
        },
    }, kind);
    const withoutDuplicate = all.filter(
        (candidate) => candidate.clientTransactionId !== entry.clientTransactionId
    );
    writeAll(key, [...withoutDuplicate, entry]);
    return entry;
};

const updateEntry = (key, legacyKey, kind, clientTransactionId, patch) => {
    const all = readAll(key, legacyKey, kind);
    let changed = false;
    const next = all.map((entry) => {
        if (entry.clientTransactionId !== clientTransactionId) return entry;
        changed = true;
        return normalizeEntry({ ...entry, ...patch }, kind);
    });
    if (changed) writeAll(key, next);
    return next;
};

const removeEntry = (key, legacyKey, kind, clientTransactionId) => {
    const all = readAll(key, legacyKey, kind);
    writeAll(
        key,
        all.filter((entry) => entry.clientTransactionId !== clientTransactionId),
    );
};

const clearScoped = (key, legacyKey, kind, cashierId) => {
    const identity = cashierId
        ? { ...activeIdentity(), cashierId: String(cashierId) }
        : activeIdentity();
    const remaining = readAll(key, legacyKey, kind)
        .filter((entry) => !belongsTo(entry, identity));
    writeAll(key, remaining);
};

// ── Sale queue (completed transactions queued while offline) ──────────────────

export const getQueue = (cashierId) =>
    getScoped(QUEUE_KEY, LEGACY_QUEUE_KEY, 'sale', cashierId);

export const addToQueue = (salePayload) => {
    const entry = addEntry(QUEUE_KEY, LEGACY_QUEUE_KEY, 'sale', salePayload);
    if (getQueue(entry.owner.cashierId).length > 50) {
        console.warn('[OfflineQueue] Queue has exceeded 50 items. Contact support.');
    }
    return entry;
};

export const updateQueueEntry = (clientTransactionId, patch) =>
    updateEntry(QUEUE_KEY, LEGACY_QUEUE_KEY, 'sale', clientTransactionId, patch);

const parseAmount = (value) => Number(String(value || '').replace(/,/g, ''));

export const getOfflineCashAmountResolution = (entry) => {
    if (!entry || entry.paymentMethod !== 'cash') return null;

    const details = entry.errorDetails || {};
    let expectedTotal = parseAmount(details.expectedTotal);
    let recordedTotal = parseAmount(details.clientTotal ?? entry.totalAmount);
    let shortfall = parseAmount(details.shortfall);

    if (!(expectedTotal > 0)) {
        const message = String(entry.lastError || '');
        const totalMismatch = message.match(
            /Offline checkout total \(([0-9.,]+)\) does not match server total \(([0-9.,]+)\)/i
        );
        const tenderMismatch = message.match(
            /Cash tendered \(([0-9.,]+)\) is less than total \(([0-9.,]+)\)/i
        );
        if (totalMismatch) {
            recordedTotal = parseAmount(totalMismatch[1]);
            expectedTotal = parseAmount(totalMismatch[2]);
        } else if (tenderMismatch) {
            recordedTotal = parseAmount(entry.totalAmount || tenderMismatch[1]);
            expectedTotal = parseAmount(tenderMismatch[2]);
            shortfall = expectedTotal - parseAmount(tenderMismatch[1]);
        }
    }

    if (!(shortfall > 0)) shortfall = expectedTotal - recordedTotal;
    if (!(shortfall > 0) || expectedTotal + 0.009 < recordedTotal) return null;

    return {
        recordedTotal: round2(recordedTotal),
        expectedTotal: round2(expectedTotal),
        shortfall: round2(shortfall),
    };
};

export const resolveOfflineCashAmount = (clientTransactionId) => {
    const entry = getQueue().find(
        (candidate) => candidate.clientTransactionId === clientTransactionId
    );
    const resolution = getOfflineCashAmountResolution(entry);
    if (!entry || !resolution) return null;

    const correctedTendered = round2(Math.max(
        Number(entry.cashTendered) || 0,
        resolution.expectedTotal
    ));
    updateQueueEntry(clientTransactionId, {
        totalAmount: resolution.expectedTotal,
        cashTendered: correctedTendered,
        changeGiven: round2(Math.max(0, correctedTendered - resolution.expectedTotal)),
        status: 'pending',
        retries: 0,
        lastAttemptAt: null,
        lastError: null,
        errorCode: null,
        errorDetails: null,
        retryable: true,
        offlineAmountAdjustment: {
            originalTotal: resolution.recordedTotal,
            correctedTotal: resolution.expectedTotal,
            shortfall: resolution.shortfall,
            confirmedAt: new Date().toISOString(),
        },
    });
    return getQueue().find(
        (candidate) => candidate.clientTransactionId === clientTransactionId
    ) || null;
};

export const removeFromQueue = (clientTransactionId) =>
    removeEntry(QUEUE_KEY, LEGACY_QUEUE_KEY, 'sale', clientTransactionId);

export const clearQueue = (cashierId) =>
    clearScoped(QUEUE_KEY, LEGACY_QUEUE_KEY, 'sale', cashierId);

// ── Hold queue (orders held locally while offline) ────────────────────────────

export const getOfflineHolds = (cashierId) =>
    getScoped(HOLD_QUEUE_KEY, LEGACY_HOLD_QUEUE_KEY, 'hold', cashierId);

export const addOfflineHold = (holdPayload) =>
    addEntry(HOLD_QUEUE_KEY, LEGACY_HOLD_QUEUE_KEY, 'hold', holdPayload);

export const updateOfflineHold = (clientTransactionId, patch) =>
    updateEntry(HOLD_QUEUE_KEY, LEGACY_HOLD_QUEUE_KEY, 'hold', clientTransactionId, patch);

export const removeOfflineHold = (clientTransactionId) =>
    removeEntry(HOLD_QUEUE_KEY, LEGACY_HOLD_QUEUE_KEY, 'hold', clientTransactionId);

// Persist only the active cashier's locally-held records while retaining other
// cashiers' scoped data in the shared browser storage.
export const setOfflineHolds = (holds) => {
    const identity = activeIdentity();
    const all = readAll(HOLD_QUEUE_KEY, LEGACY_HOLD_QUEUE_KEY, 'hold');
    const retained = all.filter((entry) => !belongsTo(entry, identity));
    writeAll(
        HOLD_QUEUE_KEY,
        [...retained, ...(Array.isArray(holds) ? holds.map((entry) => normalizeEntry(entry, 'hold')) : [])],
    );
};

export const clearOfflineHolds = (cashierId) =>
    clearScoped(HOLD_QUEUE_KEY, LEGACY_HOLD_QUEUE_KEY, 'hold', cashierId);

export const offlineQueueStorageKeys = {
    sales: QUEUE_KEY,
    holds: HOLD_QUEUE_KEY,
};

// A queued paid sale that came from a server-side hold supersedes that hold in
// the terminal UI immediately. The backend removes the real held record when
// the sale syncs; this set prevents the cached copy looking unpaid meanwhile.
export const getSupersededServerHoldIds = (saleQueue = []) => new Set(
    (Array.isArray(saleQueue) ? saleQueue : [])
        .map((entry) => entry?.resumedFromHoldId)
        .filter(Boolean)
        .map(String)
);
