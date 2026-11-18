import { useState, useRef, useEffect } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import PremiumModal, { SecondaryButton, PrimaryButton } from './PremiumModal';

/**
 * Confirm dialog — uses the shared PremiumModal shell so every confirm across
 * the app shares the gradient-header style of the Employee modal.
 *
 * variant: 'danger' (default) | 'default' (positive / informational)
 *
 * Double-submit safe: while `onConfirm` is in flight BOTH buttons are disabled
 * and a synchronous ref latch drops any extra clicks — so a fast double-click
 * (or an async onConfirm that hasn't resolved yet) can't fire the action twice.
 * Callers may still pass `isLoading` to force the disabled state externally.
 */
const ConfirmModal = ({
  isOpen,
  title      = 'Are you sure?',
  message    = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  variant    = 'danger',
  isLoading  = false,
  onConfirm,
  onCancel,
  children,
}) => {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);          // synchronous guard against double-clicks
  const mounted  = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  if (!isOpen) return null;

  const disabled = isLoading || busy;

  const handleConfirm = async () => {
    if (inFlight.current || isLoading) return;   // ignore extra clicks while running
    inFlight.current = true;
    setBusy(true);
    try {
      await onConfirm?.();
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const isDanger = variant === 'danger';
  const accent   = isDanger ? 'rose'   : 'indigo';
  const Icon     = isDanger ? AlertTriangle : ShieldCheck;
  const eyebrow  = isDanger ? 'Confirm Action' : 'Confirm';

  return (
    <PremiumModal
      open
      onClose={disabled ? undefined : onCancel}
      icon={Icon}
      eyebrow={eyebrow}
      title={title}
      accent={accent}
      size="sm"
      footer={
        <>
          <SecondaryButton type="button" onClick={onCancel} disabled={disabled}>
            {cancelLabel}
          </SecondaryButton>
          <PrimaryButton type="button" onClick={handleConfirm} disabled={disabled} accent={accent}>
            {disabled ? 'Please wait…' : confirmLabel}
          </PrimaryButton>
        </>
      }
    >
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </PremiumModal>
  );
};

export default ConfirmModal;
