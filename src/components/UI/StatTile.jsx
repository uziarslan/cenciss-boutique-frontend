import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';

/**
 * Soft white stat tile — quiet, dashboard-aligned KPI for list pages.
 * Preserves the original prop API so existing call-sites don't need changes.
 *
 *   <StatTile label="Total Vendors" value={42} icon={Building2} gradient="indigo" />
 *
 * The `gradient` prop is reinterpreted as an accent tone (icon chip color).
 */
const TONES = {
  indigo:  { text: 'text-indigo-600',  bg: 'bg-indigo-50'  },
  violet:  { text: 'text-violet-600',  bg: 'bg-violet-50'  },
  emerald: { text: 'text-emerald-600', bg: 'bg-emerald-50' },
  amber:   { text: 'text-amber-600',   bg: 'bg-amber-50'   },
  rose:    { text: 'text-rose-600',    bg: 'bg-rose-50'    },
  cyan:    { text: 'text-cyan-600',    bg: 'bg-cyan-50'    },
  slate:   { text: 'text-slate-600',   bg: 'bg-slate-100'  },
  orange:  { text: 'text-orange-600',  bg: 'bg-orange-50'  },
  red:     { text: 'text-red-600',     bg: 'bg-red-50'     },
  teal:    { text: 'text-teal-600',    bg: 'bg-teal-50'    },
};

const StatTile = ({
  label,
  value,
  sub,
  icon: Icon,
  gradient = 'indigo',
  loading,
  onClick,
  className,
  trend, // { value: '+12%', positive: true }
}) => {
  const tone = TONES[gradient] || TONES.indigo;
  return (
    <div
      onClick={onClick}
      className={clsx(
        'relative flex items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition-all duration-200 sm:gap-3 sm:p-4',
        onClick && 'cursor-pointer hover:shadow-md hover:border-gray-200',
        className
      )}
    >
      {Icon && (
        <div className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9', tone.bg)}>
          <Icon size={16} className={tone.text} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {loading ? (
          <div className="h-6 w-20 animate-pulse bg-gray-100 rounded-md" />
        ) : (
          <p className={clsx('truncate text-lg font-bold leading-tight tabular-nums sm:text-xl', tone.text)}>
            {value ?? '—'}
          </p>
        )}
        <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-widest truncate">{label}</p>
        {sub && !loading && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>
        )}
        {trend && !loading && (
          <p className={clsx('text-xs mt-0.5 font-semibold', trend.positive ? 'text-emerald-600' : 'text-rose-600')}>
            {trend.value}
          </p>
        )}
      </div>
      {onClick && <ChevronRight size={14} className="text-gray-300 shrink-0" />}
    </div>
  );
};

export default StatTile;
