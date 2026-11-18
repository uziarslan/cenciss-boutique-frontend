const cleanReason = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Return the canonical cancellation reason, with compatibility for QR orders
 * that only have the reason in their QR audit metadata.
 */
export const getCancellationReason = (transaction) => [
  transaction?.voidReason,
  transaction?.qrOrder?.declineReason,
  transaction?.declineReason,
].map(cleanReason).find(Boolean) || '';
