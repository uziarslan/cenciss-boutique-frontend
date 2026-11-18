import { Search, Trash2 } from 'lucide-react';

const Toolbar = ({ itemSearch, setItemSearch, selectedCount, onBulkDelete }) => (
  <div className="flex items-center justify-between gap-4 flex-wrap">
    <div className="flex items-center gap-3 flex-1 min-w-[220px]">
      <div className="relative flex-1 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          placeholder="Search items by name or SKU…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
        />
      </div>
      {selectedCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
          {selectedCount} selected
        </span>
      )}
    </div>

    {selectedCount > 0 && (
      <button
        type="button"
        onClick={onBulkDelete}
        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
      >
        <Trash2 size={13} /> Delete selected
      </button>
    )}
  </div>
);

export default Toolbar;
