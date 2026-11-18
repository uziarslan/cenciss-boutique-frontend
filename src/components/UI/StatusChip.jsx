import clsx from 'clsx';

/**
 * Premium status pill — colored dot + label, ring border, soft tinted bg.
 * Replaces the flat colored pill with a more refined badge.
 */
const STYLES = {
  // Vendor / general
  active:           { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500',  ring: 'ring-emerald-200' },
  inactive:         { bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-400',    ring: 'ring-slate-200'   },
  onHold:           { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500',    ring: 'ring-amber-200'   },
  // Product / boolean
  true:             { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500',  ring: 'ring-emerald-200' },
  false:            { bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-400',    ring: 'ring-slate-200'   },
  // Purchases / payments
  draft:            { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400',    ring: 'ring-slate-200'   },
  pendingApproval:  { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500',    ring: 'ring-amber-200'   },
  approved:         { bg: 'bg-sky-50',      text: 'text-sky-700',     dot: 'bg-sky-500',      ring: 'ring-sky-200'     },
  sent:             { bg: 'bg-indigo-50',   text: 'text-indigo-700',  dot: 'bg-indigo-500',   ring: 'ring-indigo-200'  },
  partialReceived:  { bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-500',   ring: 'ring-orange-200'  },
  received:         { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500',  ring: 'ring-emerald-200' },
  cancelled:        { bg: 'bg-rose-50',     text: 'text-rose-700',    dot: 'bg-rose-500',     ring: 'ring-rose-200'    },
  confirmed:        { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500',  ring: 'ring-emerald-200' },
  pending:          { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500',    ring: 'ring-amber-200'   },
  paid:             { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500',  ring: 'ring-emerald-200' },
  partiallyPaid:    { bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-500',   ring: 'ring-orange-200'  },
  overdue:          { bg: 'bg-rose-50',     text: 'text-rose-700',    dot: 'bg-rose-500',     ring: 'ring-rose-200'    },
};

const LABELS = {
  pendingApproval: 'Pending Approval',
  partialReceived: 'Partial Received',
  partiallyPaid:   'Partially Paid',
  onHold:          'On Hold',
  true:            'Active',
  false:           'Inactive',
};

const StatusChip = ({ status, size = 'md' }) => {
  const key = String(status);
  const s = STYLES[key] ?? { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', ring: 'ring-slate-200' };
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold capitalize ring-1',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        s.bg, s.text, s.ring
      )}
    >
      <span className={clsx('rounded-full', size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2', s.dot)} />
      {LABELS[key] ?? key}
    </span>
  );
};

export default StatusChip;
