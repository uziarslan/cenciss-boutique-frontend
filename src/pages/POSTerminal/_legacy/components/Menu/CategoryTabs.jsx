import { LayoutGrid } from 'lucide-react';

const CategoryTabs = ({ categories, activeCategoryId, onSelect }) => {
  const tabs = [{ _id: 'all', name: 'All', color: '#4f46e5' }, ...categories];

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      {tabs.map((category) => {
        const active = category._id === activeCategoryId;
        const color = category.color || '#4f46e5';
        const itemCount = category.items?.length;
        return (
          <button
            key={category._id}
            type="button"
            onClick={() => onSelect(category._id)}
            className={`group relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
              active
                ? 'text-white shadow-md'
                : 'border border-surface-200 bg-white text-surface-600 shadow-card hover:shadow-card-hover hover:border-surface-300'
            }`}
            style={active ? { backgroundColor: color, borderColor: color } : undefined}
          >
            {category._id === 'all' && <LayoutGrid size={15} />}
            <span>{category.name}</span>
            {itemCount > 0 && (
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  active ? 'bg-white/25 text-white' : 'bg-surface-100 text-surface-500'
                }`}
              >
                {itemCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryTabs;
