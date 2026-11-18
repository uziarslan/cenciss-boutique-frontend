import { Outlet } from 'react-router';
import POSHeader from './POSHeader';

const POSLayout = ({ children }) => (
  <div className="min-h-screen bg-gray-50 text-gray-900">
    <POSHeader />
    <main className="pt-[calc(3.5rem_+_env(safe-area-inset-top))] lg:pt-[calc(7rem_+_env(safe-area-inset-top))]">
      {children || <Outlet />}
    </main>
  </div>
);

export default POSLayout;
