import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import SearchableSelect from './SearchableSelect';

const fmt = (d) => (d ? format(d, 'yyyy-MM-dd') : '');

const PRESETS = [
  { label: 'All dates',     id: 'all' },
  { label: 'Today',         id: 'today' },
  { label: 'This week',     id: 'thisWeek' },
  { label: 'This month',    id: 'thisMonth' },
  { label: 'Last month',    id: 'lastMonth' },
  { label: 'Last 3 months', id: 'last3Months' },
  { label: 'Custom',        id: 'custom' },
];

const applyPreset = (id) => {
  const now = new Date();
  switch (id) {
    case 'all':
      return { from: '', to: '' };
    case 'today':
      return { from: fmt(now), to: fmt(now) };
    case 'thisWeek':
      return { from: fmt(startOfWeek(now, { weekStartsOn: 1 })), to: fmt(endOfWeek(now, { weekStartsOn: 1 })) };
    case 'thisMonth':
      return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) };
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      return { from: fmt(startOfMonth(lm)), to: fmt(endOfMonth(lm)) };
    }
    case 'last3Months':
      return { from: fmt(subDays(now, 90)), to: fmt(now) };
    default:
      return { from: '', to: '' };
  }
};

// Derive which preset the current range corresponds to, so the dropdown reflects
// the actual dates (e.g. shows "Today" when from===to===today) instead of being
// stuck on "Custom". Falls back to 'custom' only when no preset matches.
const matchPreset = (from, to) => {
  for (const p of PRESETS) {
    if (p.id === 'custom') continue;
    const r = applyPreset(p.id);
    if (r.from === from && r.to === to) return p.id;
  }
  return 'custom';
};

const DateRangePicker = ({ from = '', to = '', onChange, className = '' }) => {
  // The selected preset is derived from the controlled from/to props rather than
  // held in local state, so it always stays in sync (and a "Today" default shows
  // as Today, not Custom).
  const preset = matchPreset(from, to);

  const handlePreset = (e) => {
    const id = e.target.value;
    if (id !== 'custom') {
      const { from: f, to: t } = applyPreset(id);
      onChange(f, t);
    }
  };

  const handleFrom = (e) => {
    onChange(e.target.value, to);
  };

  const handleTo = (e) => {
    onChange(from, e.target.value);
  };

  return (
    <div className={`grid w-full grid-cols-1 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap ${className}`}>
      <div className="w-full sm:min-w-[160px] sm:w-auto">
        <SearchableSelect
          options={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          value={preset}
          onChange={(v) => handlePreset({ target: { value: v } })}
        />
      </div>

      <input
        type="date"
        value={from}
        onChange={handleFrom}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-auto"
      />
      <span className="hidden text-sm text-gray-400 sm:inline">to</span>
      <input
        type="date"
        value={to}
        onChange={handleTo}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-auto"
      />
    </div>
  );
};

export default DateRangePicker;
