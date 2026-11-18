import { Bike, ChevronLeft, ChevronRight, ShoppingCart, Receipt } from 'lucide-react';

/**
 * Left-side sidebar for the cashier dashboard. Two sections:
 *   - 'order'    → punching new orders (the menu / cart screen)
 *   - 'history'  → shared transaction history for the cashier's outlet
 *
 * The sidebar is collapsible to a slim icon-only rail so it doesn't eat
 * space on smaller terminals.
 */
const sections = (showRiderDispatch) => [
  { id: 'order',   label: 'New Order',     Icon: ShoppingCart, hint: 'Punch a new ticket' },
  { id: 'history', label: 'Order History', Icon: Receipt,      hint: 'Outlet transactions' },
  ...(showRiderDispatch ? [{ id: 'dispatch', label: 'Rider Dispatch', Icon: Bike, hint: 'Live fleet & assignments' }] : []),
];

const POSSidebar = ({ active, onChange, collapsed, onToggle, showRiderDispatch = false }) => {
  return (
    <aside
      className={`hidden md:flex shrink-0 flex-col border-r border-surface-200 bg-white transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} border-b border-surface-100 px-2 py-2`}>
        {!collapsed && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400 px-2">
            Cashier
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-700"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sections(showRiderDispatch).map(({ id, label, Icon, hint }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`group relative flex w-full items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
              }`}
              title={collapsed ? `${label} — ${hint}` : undefined}
            >
              {/* Active rail */}
              <span
                className={`absolute inset-y-1 left-0 w-1 rounded-r ${
                  isActive ? 'bg-brand-600' : 'bg-transparent'
                }`}
              />
              <Icon size={16} className="shrink-0" />
              {!collapsed && (
                <span className="flex-1 text-left leading-tight">
                  <span className="block">{label}</span>
                  <span className={`block text-[10px] font-normal ${isActive ? 'text-brand-500' : 'text-surface-400'}`}>
                    {hint}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

/**
 * Mobile variant — bottom segmented tabs. Mounted at the foot of the POS
 * screen so the cashier can flip between order entry and history without
 * a sidebar that would steal half the viewport.
 */
export const POSSectionTabs = ({ active, onChange, showRiderDispatch = false }) => (
  <div className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-surface-200 bg-white">
    <div className={`grid ${showRiderDispatch ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {sections(showRiderDispatch).map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ${
              isActive ? 'text-brand-700' : 'text-surface-500'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        );
      })}
    </div>
  </div>
);

export default POSSidebar;
