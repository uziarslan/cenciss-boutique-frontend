import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRightCircle, Printer, RefreshCw, X } from 'lucide-react';
import { buildReceiptHtml, printReceipt } from '../../utils/receiptPrinter';

const ReceiptModal = ({
  transaction,
  outletName,
  cashierName,
  onClose,
  onNewOrder,
  onPrinted,
  cancelLabel = 'No, Start New Order',
}) => {
  const dialogRef = useRef(null);
  const printInFlightRef = useRef(false);
  const [printing, setPrinting] = useState(false);
  const isOffline = Boolean(transaction.offline);
  const isPendingDelivery = transaction.status === 'out-for-delivery';

  // Freeze the generated time while this confirmation is open. The exact same
  // HTML is handed to the browser printer after the cashier confirms.
  const generatedAtRef = useRef(new Date());
  const generatedAt = generatedAtRef.current;
  const receiptHtml = useMemo(
    () => buildReceiptHtml(transaction, outletName, cashierName, { generatedAt }),
    [transaction, outletName, cashierName, generatedAt],
  );

  const handlePrint = async () => {
    // State updates are asynchronous, so use a synchronous ref as the actual
    // guard against a rapid double-click creating two counter tickets.
    if (printInFlightRef.current) return;
    printInFlightRef.current = true;
    setPrinting(true);
    try {
      await printReceipt(transaction, outletName, cashierName, { generatedAt, receiptHtml });
    } catch (error) {
      toast.error(error?.message || 'Receipt printing failed. Check the printer and USB cable.');
      printInFlightRef.current = false;
      setPrinting(false);
      return;
    }
    printInFlightRef.current = false;
    setPrinting(false);
    onPrinted?.();
  };

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape' && !printing) onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, printing]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-900/80 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt print confirmation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-float outline-none animate-scale-in"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-100 p-5">
          <div>
            <h2 className="text-xl font-extrabold text-surface-900">Print this receipt?</h2>
            <p className="mt-0.5 text-sm text-surface-400">This preview matches the customer receipt.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white ${isOffline || isPendingDelivery ? 'bg-amber-500' : 'bg-emerald-600'}`}>
              {isOffline ? 'Saved Offline' : isPendingDelivery ? 'Payment Due' : transaction.paymentMethod ?? 'Paid'}
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={printing}
                className="rounded-lg p-1 text-surface-400 transition hover:bg-surface-100 hover:text-surface-600 disabled:opacity-50"
                aria-label="Close receipt"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-100 p-4 sm:p-6">
          <div
            className="mx-auto box-border w-full max-w-[80mm] bg-white p-[2mm] font-mono text-black shadow-sm"
            // The builder escapes receipt data and is also used by the browser
            // print container, keeping preview and printed markup identical.
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: receiptHtml }}
          />
        </div>

        <div className="grid shrink-0 gap-2 border-t border-surface-100 bg-white p-5">
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="btn-secondary justify-center gap-2 py-3"
          >
            {printing ? <RefreshCw size={16} className="animate-spin" /> : <Printer size={16} />}
            {printing ? 'Sending to printer…' : 'Yes, Print Receipt'}
          </button>
          <button
            type="button"
            onClick={onNewOrder}
            disabled={printing}
            className="btn-primary justify-center gap-2 py-3"
          >
            <ArrowRightCircle size={16} />
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
