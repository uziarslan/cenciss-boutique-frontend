import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import Portal from './Portal';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Premium modal shell — gradient hero header, scrollable body, sticky footer.
 * Use this for every modal across the app for visual consistency.
 *
 * <PremiumModal
 *   open
 *   title="Pay Salary"
 *   subtitle="Select employee and period"
 *   icon={DollarSign}
 *   accent="indigo"   // 'indigo' | 'amber' | 'emerald' | 'rose' | 'slate'
 *   eyebrow="Pay Salary"
 *   hero={<div>net pill…</div>}      // optional content rendered inside header below the title
 *   footer={<Button/>}                // sticky footer right side
 *   onClose={...}
 *   size="md"   // 'sm' | 'md' | 'lg' | 'xl'
 * >
 *   {body}
 * </PremiumModal>
 */
const ACCENTS = {
  indigo:  'from-indigo-600 via-violet-600 to-purple-600',
  amber:   'from-amber-500 via-orange-500 to-rose-500',
  emerald: 'from-emerald-600 via-teal-600 to-cyan-600',
  rose:    'from-rose-600 via-red-600 to-orange-500',
  slate:   'from-slate-700 via-slate-800 to-slate-900',
};

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

const PremiumModal = ({
  open = true,
  onClose,
  title,
  subtitle,
  eyebrow,
  icon: Icon,
  iconNode,
  accent = 'indigo',
  hero,
  footer,
  size = 'lg',
  children,
  className,
  bodyClassName,
}) => {
  const dialogRef = useRef(null);

  // Move focus into the dialog ON OPEN only (deps: [open]) — NOT on every render
  // or onClose identity change, which would yank focus out of a field the user is
  // in (e.g. an open SearchableSelect dropdown, which is portaled to <body> and so
  // is not contained by the dialog). The guard skips stealing focus if it's
  // already inside the dialog (respecting a child that autofocuses).
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    if (node && !node.contains(document.activeElement)) node.focus();
  }, [open]);

  // Escape-to-close + Tab focus-trap. A SearchableSelect dropdown is portaled to
  // <body> and closes its own dropdown on Escape (capture-phase, preventDefault),
  // so Escape closes the open dropdown first, then the modal on a second press.
  useEffect(() => {
    if (!open) return undefined;
    const node = dialogRef.current;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (!e.defaultPrevented) onClose?.();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    node?.addEventListener('keydown', onKey);
    return () => node?.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const grad = ACCENTS[accent] || ACCENTS.indigo;
  const sizeCls = SIZES[size] || SIZES.lg;

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-0 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] sm:p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={clsx(
          'flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-white shadow-2xl ring-1 ring-slate-100 outline-none sm:max-h-[92vh] sm:rounded-3xl',
          sizeCls,
          className
        )}
      >
        {/* Hero header */}
        <div className={clsx('relative shrink-0 overflow-hidden bg-gradient-to-br px-4 pb-4 pt-5 text-white sm:px-6 sm:pb-5 sm:pt-6', grad)}>
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-12 w-48 h-48 rounded-full bg-cyan-300/15 blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {(Icon || iconNode) && (
                <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25 flex items-center justify-center shadow-inner shrink-0">
                  {iconNode || (Icon && <Icon size={20} />)}
                </div>
              )}
              <div className="min-w-0">
                {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">{eyebrow}</p>}
                <h3 className="mt-0.5 break-words text-lg font-bold leading-tight sm:text-xl">{title}</h3>
                {subtitle && <p className="mt-0.5 break-words text-xs text-white/80">{subtitle}</p>}
              </div>
            </div>
            {onClose && (
              <button onClick={onClose} className="text-white/80 hover:text-white transition-colors p-1 shrink-0">
                <X size={20} />
              </button>
            )}
          </div>
          {hero && <div className="relative mt-5">{hero}</div>}
        </div>

        {/* Body */}
        <div className={clsx('overflow-y-auto bg-slate-50/40 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5', bodyClassName)}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex shrink-0 flex-col-reverse items-stretch gap-2 border-t border-slate-100 bg-white px-4 py-3 [&>button]:w-full sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-4 sm:[&>button]:w-auto">
            {footer}
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
};

/** Small section header used inside a modal body, matches Salary modal pattern. */
export const ModalSection = ({ icon: Icon, title, subtitle, accent = 'indigo', children, className }) => {
  const accentBg = {
    indigo:  'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    cyan:    'bg-cyan-50 text-cyan-600',
    rose:    'bg-rose-50 text-rose-600',
    slate:   'bg-slate-100 text-slate-600',
  }[accent] || 'bg-indigo-50 text-indigo-600';

  return (
    <section className={clsx('bg-white rounded-2xl border border-slate-100 shadow-sm p-5', className)}>
      {(title || Icon) && (
        <div className="flex items-center gap-2.5 mb-3">
          {Icon && (
            <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', accentBg)}>
              <Icon size={15} />
            </div>
          )}
          <div>
            {title && <h4 className="text-sm font-semibold text-slate-800 leading-tight">{title}</h4>}
            {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
          </div>
        </div>
      )}
      {children}
    </section>
  );
};

/** Standard input class string used across modals/forms. */
export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20';
export const labelCls = 'block text-xs font-semibold text-slate-600 mb-1.5';

/** Convenience primary CTA used in modal footers. */
export const PrimaryButton = ({ accent = 'indigo', className, children, ...rest }) => {
  const grad = {
    indigo:  'from-indigo-600 to-violet-600 shadow-indigo-500/30',
    amber:   'from-amber-500 to-orange-500 shadow-amber-500/30',
    emerald: 'from-emerald-600 to-teal-500 shadow-emerald-500/30',
    rose:    'from-rose-600 to-red-600 shadow-rose-500/30',
    slate:   'from-slate-700 to-slate-900 shadow-slate-500/30',
  }[accent] || 'from-indigo-600 to-violet-600 shadow-indigo-500/30';
  return (
    <button
      {...rest}
      className={clsx(
        'rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50 bg-gradient-to-r',
        grad,
        className
      )}
    >
      {children}
    </button>
  );
};

export const SecondaryButton = ({ className, children, ...rest }) => (
  <button
    {...rest}
    className={clsx('px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition rounded-xl', className)}
  >
    {children}
  </button>
);

export default PremiumModal;
