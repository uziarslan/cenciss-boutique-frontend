export const KDS_CANCELLATION_MESSAGE = 'Kitchen has accepted this order. Cancel it from KDS so kitchen staff can confirm whether it was prepared.';

export const requiresKitchenCancellation = (kds) => Boolean(kds && (
  kds.cancellationRequiresKitchen
  || kds.hasBeenAccepted
  || kds.acceptedAt
  || ['accepted', 'preparing', 'dispatched'].includes(kds.currentStatus)
  || (kds.lifecycle || []).some((event) => event.type === 'accepted')
));
