import clsx from 'clsx';

/**
 * Underline-style tab strip — matches the tab pattern used in detail pages
 * Shared detail-page tabs used by StockDetail and AllowanceManager.
 *
 *   <Tabs
 *     value={tab}
 *     onChange={setTab}
 *     tabs={[
 *       { value: 'a', label: 'Pay Salary', icon: DollarSign },
 *       { value: 'b', label: 'Advances',   icon: TrendingDown, count: 3 },
 *     ]}
 *   />
 */
const Tabs = ({ value, onChange, tabs = [], className }) => (
  <div className={clsx('flex gap-1 border-b border-gray-200', className)}>
    {tabs.map((t) => {
      const active = value === t.value;
      return (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={clsx(
            'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap',
            active
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          {t.icon && <t.icon size={15} />}
          {t.label}
          {t.count != null && (
            <span className={clsx(
              'ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold tabular-nums',
              active ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
            )}>
              {t.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

export default Tabs;
