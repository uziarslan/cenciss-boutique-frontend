import { useMemo } from 'react';
import { SearchX, UtensilsCrossed } from 'lucide-react';
import MenuItemTile from './MenuItemTile';

const MenuGrid = ({ categories, activeCategoryId, isLoading, searchQuery = '' }) => {
  const items = useMemo(() => {
    let result;
    if (activeCategoryId === 'all') {
      result = categories.flatMap((category) => (category.items || []).map((item) => ({
        ...item,
        categoryId: category._id,
        categoryName: category.name,
      })));
    } else {
      const category = categories.find((cat) => cat._id === activeCategoryId);
      result = (category?.items || []).map((item) => ({
        ...item,
        categoryId: category._id,
        categoryName: category.name,
      }));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((item) => (
        item.name?.toLowerCase().includes(q)
        || (item.variations || []).some((variation) => (
          variation.name?.toLowerCase().includes(q)
        ))
      ));
    }
    return result;
  }, [categories, activeCategoryId, searchQuery]);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-2xl bg-surface-100 h-[110px]">
            <div className="p-4">
              <div className="h-3 w-3/4 rounded-full bg-surface-200" />
              <div className="mt-6 h-4 w-1/3 rounded-full bg-surface-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!items.length && searchQuery.trim()) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-300 bg-white py-16 text-center animate-fade-in">
        <SearchX size={36} className="text-surface-300" strokeWidth={1.5} />
        <p className="mt-4 text-sm font-medium text-surface-500">No results for "{searchQuery}"</p>
        <p className="mt-1 text-xs text-surface-400">Try a different search term</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-300 bg-white py-16 text-center animate-fade-in">
        <UtensilsCrossed size={36} className="text-surface-300" strokeWidth={1.5} />
        <p className="mt-4 text-sm font-medium text-surface-500">No items in this category</p>
        <p className="mt-1 text-xs text-surface-400">Items will appear here when added to the menu</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
      {items.map((item) => (
        <MenuItemTile key={item._id || item.id} item={item} />
      ))}
    </div>
  );
};

export default MenuGrid;
