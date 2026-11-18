import { Search, X } from 'lucide-react';
import clsx from 'clsx';

// Compact light-theme search box used across the Accounting pages' filter bars.
// Controlled: `value` string, `onChange(nextString)`.
const SearchInput = ({ value, onChange, placeholder = 'Search…', className }) => (
  <div className={clsx('relative', className)}>
    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="Clear search"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
      >
        <X size={13} />
      </button>
    )}
  </div>
);

export default SearchInput;
