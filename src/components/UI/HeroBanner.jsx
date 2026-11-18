import clsx from 'clsx';

/**
 * Quiet page header — replaces the previous gradient hero with a clean,
 * dashboard-aligned title block. Preserves the original prop API so existing
 * call-sites need no changes.
 *
 * Props (all optional):
 *   icon        — Lucide icon component (rendered as a soft tinted chip)
 *   iconNode    — custom node to render in place of the icon chip
 *   eyebrow     — small uppercase label above the title
 *   title       — main h1
 *   subtitle    — descriptive line under the title
 *   accent      — color key (used for the icon chip tint)
 *   actions     — right-aligned action buttons
 *   compact     — slightly smaller title
 *   className   — extra classes on the root
 *   children    — extra content under the header (no card wrapper)
 */
const ACCENTS = {
  indigo:  { text: 'text-indigo-600',  bg: 'bg-indigo-50'  },
  violet:  { text: 'text-violet-600',  bg: 'bg-violet-50'  },
  emerald: { text: 'text-emerald-600', bg: 'bg-emerald-50' },
  amber:   { text: 'text-amber-600',   bg: 'bg-amber-50'   },
  rose:    { text: 'text-rose-600',    bg: 'bg-rose-50'    },
  cyan:    { text: 'text-cyan-600',    bg: 'bg-cyan-50'    },
  slate:   { text: 'text-slate-600',   bg: 'bg-slate-100'  },
};

const HeroBanner = ({
  icon: Icon,
  iconNode,
  eyebrow,
  title,
  subtitle,
  accent = 'indigo',
  actions,
  children,
  compact = false,
  className,
}) => {
  const tone = ACCENTS[accent] || ACCENTS.indigo;
  return (
    <section className={clsx('flex flex-col gap-4', className)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          {(Icon || iconNode) && (
            <div className={clsx(
              'rounded-xl flex items-center justify-center shrink-0',
              tone.bg,
              compact ? 'w-9 h-9' : 'w-10 h-10'
            )}>
              {iconNode || (Icon && <Icon size={compact ? 16 : 18} className={tone.text} />)}
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{eyebrow}</p>
            )}
            <h1 className={clsx(
              'break-words font-bold text-gray-900 tracking-tight leading-tight',
              eyebrow ? 'mt-0.5' : '',
              compact ? 'text-xl' : 'text-2xl'
            )}>
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-1 max-w-2xl">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
      </div>
      {children && <div>{children}</div>}
    </section>
  );
};

export default HeroBanner;
