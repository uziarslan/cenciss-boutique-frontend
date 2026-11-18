import { Suspense, useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import Sidebar from './Sidebar';
import Topbar  from './Topbar';
import usePermissions from '../../hooks/usePermissions';
import useAuth from '../../hooks/useAuth';
import SubscriptionBanner from './SubscriptionBanner';

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close overlay sidebar on ≥ md breakpoint resize
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 768) setSidebarOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Auto-redirect when current path is no longer permitted.
  const { has } = usePermissions();
  const { role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // candidate paths in preferred order
    const candidates = ['/dashboard', '/purchases', '/vendors', '/products'];

    const isVisible = (path) => {
      if (path === '/dashboard') return has('dashboard.view');
      if (path === '/purchases') return ['purchases.view', 'purchases.create', 'purchases.post', 'purchases.edit', 'purchases.delete'].some(has);
      if (path === '/vendors') return has('vendors.manage') || ['owner','purchaseManager'].includes(role);
      if (path === '/products') return has('products.manage') || ['owner','purchaseManager','receivingStaff'].includes(role);
      // fallback: allow if role-based would show it (simple heuristic)
      return true;
    };

    const cur = location.pathname;
    // if current path is not among visible set, navigate to first visible candidate
    if (!isVisible(cur)) {
      const first = candidates.find((p) => isVisible(p));
      if (first && first !== cur) navigate(first, { replace: true });
    }
  }, [location.pathname, has, role, navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* ── Desktop sidebar (always visible on md+) ─────────────────────── */}
      <div className="hidden md:flex md:shrink-0">
        <Sidebar onClose={() => {}} />
      </div>

      {/* ── Mobile sidebar overlay (always mounted for slide animation) ──── */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!sidebarOpen}
      >
        {/* Backdrop */}
        <div
          onClick={() => setSidebarOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ease-out ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        {/* Drawer — slides in from the left */}
        <div
          className={`absolute inset-y-0 left-0 flex transform transition-transform duration-300 ease-out will-change-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* ── Main content area ────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <SubscriptionBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
