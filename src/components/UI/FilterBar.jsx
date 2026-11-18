import { Children, isValidElement, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import clsx from 'clsx';

const containsSearchInput = (node) => {
  if (!isValidElement(node)) return false;
  const componentName = node.type?.displayName || node.type?.name || '';
  if (/SearchInput/i.test(componentName)) return true;
  if (/search/i.test(String(node.props?.placeholder || ''))) return true;
  if (node.type === 'input' && (
    node.props?.type === 'search'
    || /search/i.test(String(node.props?.placeholder || ''))
  )) return true;
  return Children.toArray(node.props?.children).some(containsSearchInput);
};

const textContent = (node) => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!isValidElement(node)) return '';
  return Children.toArray(node.props?.children).map(textContent).join(' ');
};

const isAlwaysVisibleAction = (node) => {
  if (!isValidElement(node)) return false;
  if (node.props?.['data-filter-always-visible']) return true;
  if (node.type === 'button') return true;
  const componentName = node.type?.displayName || node.type?.name || '';
  return ['Button', 'ExportButton', 'Link', 'NavLink'].includes(componentName);
};

const activeFilterCount = (node) => {
  if (!isValidElement(node) || containsSearchInput(node)) return 0;
  if (node.type === 'input') return node.props?.value !== '' && node.props?.value != null ? 1 : 0;
  if (node.props?.options && Object.prototype.hasOwnProperty.call(node.props, 'value')) {
    const defaultValue = node.props.options?.[0]?.value ?? '';
    return node.props.value !== defaultValue ? 1 : 0;
  }
  if (Object.prototype.hasOwnProperty.call(node.props || {}, 'from') || Object.prototype.hasOwnProperty.call(node.props || {}, 'to')) {
    return node.props.from || node.props.to ? 1 : 0;
  }
  return Children.toArray(node.props?.children).reduce((sum, child) => sum + activeFilterCount(child), 0);
};

/**
 * White card that groups list-page filters/search.
 *
 *   <FilterBar>
 *     <input ... /> <SearchableSelect ... />
 *   </FilterBar>
 */
const FilterBar = ({ children, className, autoAdvanced = true }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const items = Children.toArray(children);

  // Purchase, Payments, and Salary/Advance already provide their own richer
  // advanced-filter drawers. Leave those layouts intact instead of nesting a
  // second shared panel around them.
  const hasCustomAdvancedFilters = items.some((item) => /advanced filters/i.test(textContent(item)));
  if (!autoAdvanced || hasCustomAdvancedFilters) {
    return (
      <div className={clsx(
        'bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4',
        hasCustomAdvancedFilters
          ? 'flex flex-col items-stretch gap-2.5 [&>*]:w-full'
          : 'flex flex-wrap items-stretch gap-2.5 sm:items-center [&>*]:w-full sm:[&>*]:w-auto',
        className,
      )}>
        {children}
      </div>
    );
  }

  const visibleItems = items.filter((item) => containsSearchInput(item) || isAlwaysVisibleAction(item));
  const advancedItems = items.filter((item) => !visibleItems.includes(item));
  const activeCount = advancedItems.reduce((sum, item) => sum + activeFilterCount(item), 0);

  return (
    <div className={clsx('rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4', className)}>
      <div className="flex flex-wrap items-stretch gap-2.5 sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
        {visibleItems}
        {advancedItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            aria-expanded={showAdvanced}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition',
              showAdvanced
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            <SlidersHorizontal size={15} />
            Advanced Filters
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-bold text-indigo-700">
                {activeCount}
              </span>
            )}
            <ChevronDown size={14} className={clsx('transition-transform', showAdvanced && 'rotate-180')} />
          </button>
        )}
      </div>

      {advancedItems.length > 0 && showAdvanced && (
        <div className="mt-3 flex w-full flex-wrap items-stretch gap-2.5 border-t border-slate-100 pt-3 sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
          {advancedItems}
        </div>
      )}
    </div>
  );
};

export default FilterBar;
