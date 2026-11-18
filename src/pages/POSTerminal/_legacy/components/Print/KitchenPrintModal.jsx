import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Printer, X, RefreshCw } from 'lucide-react';
import { buildKitchenHtml, printKitchenTicket } from '../../utils/kitchenPrinter';

/**
 * Custom kitchen-print modal. A successful USB transfer completes the flow
 * automatically; printer errors leave the modal open so the cashier can retry.
 *
 * Props:
 *   order:          { items, orderType, tableNumber, customer, notes, transactionNumber, clientTransactionId }
 *   outletName:     string
 *   onPrinted:      () => Promise<void> | void  — fired after a successful print transfer
 *   onCancel:       () => void                  — closes without marking printed
 *
 * A paired USB printer is addressed directly. If none is configured, the
 * browser print dialog remains available as a deliberate fallback.
 */
const KitchenPrintModal = ({ order, outletName, onPrinted, onCancel }) => {
  const [phase, setPhase] = useState('ready'); // 'ready' | 'printing'
  const dialogRef = useRef(null);
  const generatedAtRef = useRef(null);
  const printInFlightRef = useRef(false);
  if (!generatedAtRef.current) generatedAtRef.current = new Date();
  const previewHtml = useMemo(() => buildKitchenHtml(order, outletName, {
    generatedAt: generatedAtRef.current,
  }), [order, outletName]);

  useEffect(() => { dialogRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && phase !== 'printing') onCancel?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, onCancel]);

  const completePrint = async () => {
    try {
      await onPrinted?.();
      if (!onPrinted) {
        printInFlightRef.current = false;
        setPhase('ready');
      }
    } catch (error) {
      toast.error(error?.message || 'Printed, but could not update the order status.');
      printInFlightRef.current = false;
      setPhase('ready');
    }
  };

  const triggerPrint = async () => {
    // React state updates after the click handler returns, so a fast double
    // click can otherwise start two printer transfers before the button hides.
    if (printInFlightRef.current) return;
    printInFlightRef.current = true;
    setPhase('printing');

    // The browser fallback cannot distinguish Print from Cancel. Direct USB is
    // preferred and only resolves after its complete transfer/status check.
    const onAfter = async () => {
      window.removeEventListener('afterprint', onAfter);
      await completePrint();
    };
    window.addEventListener('afterprint', onAfter);

    try {
      const result = await printKitchenTicket(order, outletName, {
        generatedAt: generatedAtRef.current,
        // System/browser mode prints this exact combined preview. Routed USB
        // and Windows modes still split jobs according to Printer Settings.
        ticketHtml: previewHtml,
      });
      // Direct USB has no browser afterprint event. The helper only resolves
      // after the full transfer and optional printer-status check complete.
      if (result?.confirmation !== 'browser-dialog') {
        window.removeEventListener('afterprint', onAfter);
        await completePrint();
      }
    } catch (err) {
      window.removeEventListener('afterprint', onAfter);
      toast.error(err?.message || 'Print failed — check the printer connection');
      printInFlightRef.current = false;
      setPhase('ready');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Print kitchen ticket"
    >
      <div className="absolute inset-0 bg-surface-900/70 backdrop-blur-sm" onClick={() => phase !== 'printing' && onCancel?.()} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-float outline-none animate-scale-in"
      >
        {/* Header — matches the payment modal aesthetic */}
        <div className="flex items-start justify-between gap-4 border-b border-surface-100 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <Printer size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-surface-400">Send to Kitchen</p>
              <p className="mt-0.5 text-lg font-extrabold text-surface-900">Print Kitchen Ticket</p>
            </div>
          </div>
          {phase !== 'printing' && (
            <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-700">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-100 p-4 sm:p-5">
          <div className="mx-auto w-full max-w-[80mm] bg-white p-[4mm] font-mono text-black shadow-sm">
            {/* The shared builder escapes order content. In system mode this
                exact HTML string is also sent to the browser print container. */}
            {/* eslint-disable-next-line react/no-danger */}
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-surface-100 bg-surface-50/40 px-5 py-3">
          {phase === 'ready' && (
            <div className="flex gap-2">
              <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-3">
                Cancel
              </button>
              <button type="button" onClick={triggerPrint} className="btn-primary flex-1 py-3 bg-amber-500 hover:bg-amber-600">
                <Printer size={15} />
                Send to Kitchen
              </button>
            </div>
          )}

          {phase === 'printing' && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-surface-500">
              <RefreshCw size={14} className="animate-spin" />
              Sending to printer…
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default KitchenPrintModal;
