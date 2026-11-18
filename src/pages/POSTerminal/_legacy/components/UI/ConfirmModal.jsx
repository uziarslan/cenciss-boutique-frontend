import { useEffect, useRef } from 'react';

const ConfirmModal = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef(null);

  // Focus trap + Escape key
  useEffect(() => {
    const prev = document.activeElement;
    dialogRef.current?.focus();
    const handler = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      prev?.focus?.();
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="absolute inset-0 bg-surface-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-float focus:outline-none animate-scale-in"
      >
        {title && (
          <h3 id="confirm-title" className="text-base font-bold text-surface-900">
            {title}
          </h3>
        )}
        <p className={`text-sm text-surface-600 ${title ? 'mt-2' : ''}`}>{message}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary flex-1 py-2.5"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all ${
              variant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
