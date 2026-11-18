import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FileText, Printer, RefreshCw, X } from 'lucide-react';

const ThermalReportModal = ({
  title,
  subtitle = 'Review the exact thermal report before printing.',
  reportHtml,
  printLabel = 'Print Report',
  onPrint,
  onPrinted,
  onClose,
}) => {
  const dialogRef = useRef(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape' && !printing) onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, printing]);

  const handlePrint = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      await onPrint?.();
    } catch (error) {
      toast.error(error?.message || 'Report printing failed. Check the printer connection.');
      setPrinting(false);
      return;
    }
    setPrinting(false);
    onPrinted?.();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-surface-900/80 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} print preview`}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-float outline-none animate-scale-in"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-100 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-surface-900">{title}</h2>
              <p className="mt-0.5 text-sm text-surface-400">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="rounded-lg p-1.5 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700 disabled:opacity-50"
            aria-label="Close report preview"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-100 p-4 sm:p-6">
          <div
            className="mx-auto w-full max-w-[80mm] bg-white p-[4mm] font-mono text-black shadow-sm"
            // Report HTML is escaped by the shared thermal builder and this
            // exact string is passed to the browser print container.
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: reportHtml }}
          />
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-surface-100 bg-white p-5">
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="btn-secondary justify-center py-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="btn-primary justify-center py-3"
          >
            {printing ? <RefreshCw size={16} className="animate-spin" /> : <Printer size={16} />}
            {printing ? 'Printing…' : printLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThermalReportModal;
