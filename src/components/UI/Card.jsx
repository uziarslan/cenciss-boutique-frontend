import clsx from 'clsx';

/**
 * Premium content card. Matches the Dashboard's Section card aesthetic.
 *
 *   <Card>...</Card>
 *   <Card title="Recent activity" subtitle="last 7 days" action={<Button/>}>...</Card>
 *
 * Use `padding={false}` if the body should bleed edge-to-edge (e.g. table).
 */
const Card = ({
  title,
  subtitle,
  action,
  icon: Icon,
  iconAccent = 'indigo',
  children,
  className,
  bodyClassName,
  padding = true,
}) => {
  const accentBg = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    cyan: 'bg-cyan-50 text-cyan-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-600',
  }[iconAccent] || 'bg-indigo-50 text-indigo-600';

  return (
    <section
      className={clsx(
        'bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden',
        className
      )}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:gap-4 sm:px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', accentBg)}>
                <Icon size={15} />
              </div>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-sm font-semibold text-gray-800 truncate">{title}</h2>}
              {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={clsx(padding ? 'p-4 sm:p-5' : '', bodyClassName)}>{children}</div>
    </section>
  );
};

export default Card;
