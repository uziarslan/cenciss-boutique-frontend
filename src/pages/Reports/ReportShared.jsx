import clsx from 'clsx';
import { Download } from 'lucide-react';

// ── Money formatter (comma separators, 2 dp) ──────────────────────────────────
export const fmt = (n) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Stat card — soft white tile, tinted icon chip ────────────────────────────
const TONES = {
  indigo:  { color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
  emerald: { color: 'text-emerald-600', bg: 'bg-emerald-50' },
  green:   { color: 'text-emerald-600', bg: 'bg-emerald-50' },
  rose:    { color: 'text-rose-600',    bg: 'bg-rose-50'    },
  red:     { color: 'text-rose-600',    bg: 'bg-rose-50'    },
  amber:   { color: 'text-amber-600',   bg: 'bg-amber-50'   },
  blue:    { color: 'text-blue-600',    bg: 'bg-blue-50'    },
  cyan:    { color: 'text-cyan-600',    bg: 'bg-cyan-50'    },
  violet:  { color: 'text-violet-600',  bg: 'bg-violet-50'  },
  slate:   { color: 'text-slate-600',   bg: 'bg-slate-100'  },
  gray:    { color: 'text-slate-600',   bg: 'bg-slate-100'  },
};

export const StatCard = ({ label, value, sub, color = 'indigo', icon: Icon, highlight, compact = false }) => {
  const tone = TONES[color] || TONES.indigo;
  return (
    <div
      className={clsx(
        'rounded-2xl border bg-white shadow-sm flex items-center',
        compact ? 'p-3 gap-2.5 min-h-[76px]' : 'p-4 gap-3',
        highlight ? 'border-indigo-200 ring-2 ring-indigo-500/20' : 'border-gray-100'
      )}
    >
      {Icon && !compact && (
        <div className={clsx(compact ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl', 'flex items-center justify-center shrink-0', tone.bg)}>
          <Icon size={compact ? 14 : 16} className={tone.color} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-gray-400 uppercase tracking-widest">{label}</p>
        <p className={clsx(compact ? 'text-base' : 'text-xl', 'font-bold leading-tight tabular-nums truncate mt-0.5', tone.color)}>
          {value}
        </p>
        {sub && <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
};

// ── Table skeleton ─────────────────────────────────────────────────────────────
export const ReportSkeleton = ({ rows = 7, cols = 4 }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
    <div className="border-b border-slate-100 bg-slate-50 h-12" />
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-5 py-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-4 bg-gray-100 rounded"
              style={{ width: `${j === 0 ? 30 : 14}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

// ── Empty state ───────────────────────────────────────────────────────────────
export const ReportEmpty = ({ message = 'No data for the selected period.' }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16 gap-3">
    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 18h16M4 12h12M4 6h16" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
    <div className="text-center">
      <p className="text-sm font-medium text-slate-500">{message}</p>
      <p className="text-xs text-gray-400 mt-1">Adjust the filters to see other periods.</p>
    </div>
  </div>
);

// ── Inline percentage bar ─────────────────────────────────────────────────────
export const PctBar = ({ pct, color = 'bg-indigo-500' }) => (
  <div className="flex items-center gap-2.5 min-w-[120px]">
    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={clsx('h-full rounded-full transition-all', color)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
    <span className="text-xs text-gray-400 w-10 text-right shrink-0 tabular-nums">{pct.toFixed(1)}%</span>
  </div>
);

// ── Export button ─────────────────────────────────────────────────────────────
export const ExportButton = ({ onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <Download size={14} />
    Export CSV
  </button>
);

// ── Report card wrapper ────────────────────────────────────────────────────────
export const ReportCard = ({ children, className = '' }) => (
  <div className={clsx('bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

// ── Section card header (icon chip + title + subtitle + optional right slot) ──
export const ReportSectionHeader = ({ icon: Icon, iconAccent = 'indigo', title, subtitle, right }) => {
  const tone = TONES[iconAccent] || TONES.indigo;
  return (
    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', tone.bg)}>
            <Icon size={15} className={tone.color} />
          </div>
        )}
        <div className="min-w-0">
          {title && <h2 className="text-sm font-semibold text-gray-800 truncate">{title}</h2>}
          {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
};

export const ReportThead = ({ headers }) => (
  <thead className="bg-slate-50/80 border-b border-slate-100">
    <tr>
      {headers.map((h, i) => (
        <th
          key={i}
          className={clsx(
            'text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4 whitespace-nowrap',
            typeof h === 'string' ? 'text-left' : h.align === 'right' ? 'text-right' : h.align === 'center' ? 'text-center' : 'text-left'
          )}
          style={typeof h === 'object' && h.style ? h.style : undefined}
        >
          {typeof h === 'string' ? h : h.label}
        </th>
      ))}
    </tr>
  </thead>
);
