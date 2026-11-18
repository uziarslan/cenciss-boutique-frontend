import { NavLink } from 'react-router';
import { CreditCard, ShoppingCart } from 'lucide-react';
import clsx from 'clsx';
import usePermissions from '../../hooks/usePermissions';

const PurchaseTabs = () => {
  const { has } = usePermissions();
  const tabs = [
    { to: '/purchases', label: 'Purchases', icon: ShoppingCart },
    ...(has('payments.view') ? [{ to: '/payments', label: 'Payments', icon: CreditCard }] : []),
  ];
  return (
    <div className="flex items-center gap-1 border-b border-gray-200">
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) => clsx(
            'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition',
            isActive ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600',
          )}
        >
          <Icon size={16} /> {label}
        </NavLink>
      ))}
    </div>
  );
};

export default PurchaseTabs;
