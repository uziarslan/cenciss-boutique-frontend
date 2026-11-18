import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import ProtectedRoute from './components/ProtectedRoute';
import AppGate from './components/AppGate';
import AppLayout from './components/Layout/AppLayout';
import useAuth from './hooks/useAuth';

// ── Public pages ──────────────────────────────────────────────────────────────
const Landing = lazy(() => import('./pages/Landing/Landing'));
const Signup = lazy(() => import('./pages/Auth/Signup'));
const Login = lazy(() => import('./pages/Auth/Login'));
const ForgotPassword = lazy(() => import('./pages/Auth/ForgotPassword'));
const SetPassword = lazy(() => import('./pages/Auth/SetPassword'));
const SubscriptionExpired = lazy(() => import('./pages/Billing/SubscriptionExpired'));
const OutletWizard = lazy(() => import('./pages/Onboarding/OutletWizard'));
const TerminalApp = lazy(() => import('./pages/POSTerminal/TerminalApp'));

// ── Protected pages ───────────────────────────────────────────────────────────
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Account = lazy(() => import('./pages/Account/Account'));
const BillingCenter = lazy(() => import('./pages/Billing/BillingCenter'));

const VendorList = lazy(() => import('./pages/Vendors/VendorList'));
const VendorForm = lazy(() => import('./pages/Vendors/VendorForm'));
const VendorDetail = lazy(() => import('./pages/Vendors/VendorDetail'));

const ProductList = lazy(() => import('./pages/Products/ProductList'));
const ProductForm = lazy(() => import('./pages/Products/ProductForm'));
const ProductDetail = lazy(() => import('./pages/Products/ProductDetail'));

const PurchaseList = lazy(() => import('./pages/Purchases/PurchaseList'));
const PurchaseForm = lazy(() => import('./pages/Purchases/PurchaseForm'));
const PurchaseDetail = lazy(() => import('./pages/Purchases/PurchaseDetail'));

const PaymentList = lazy(() => import('./pages/Payments/PaymentList'));

const ReportsLayout = lazy(() => import('./pages/Reports/ReportsLayout'));
const SpendReport = lazy(() => import('./pages/Reports/SpendReport'));
const PriceHistory = lazy(() => import('./pages/Reports/PriceHistory'));
const VendorPerformance = lazy(() => import('./pages/Reports/VendorPerformance'));
const AgingReport = lazy(() => import('./pages/Reports/AgingReport'));
const SalesSummary = lazy(() => import('./pages/Reports/SalesSummary'));
const SalesTransactions = lazy(() => import('./pages/Reports/SalesTransactions'));
const SalesByItem = lazy(() => import('./pages/Reports/SalesByItem'));
const SalesByCashier = lazy(() => import('./pages/Reports/SalesByCashier'));
const HourlyBreakdown = lazy(() => import('./pages/Reports/HourlyBreakdown'));
const CancelledOrders = lazy(() => import('./pages/Reports/CancelledOrders'));
const OrderLifecycle = lazy(() => import('./pages/Reports/OrderLifecycle'));
const KitchenCounterSales = lazy(() => import('./pages/Reports/KitchenCounterSales'));

const InventoryLayout = lazy(() => import('./pages/Inventory/InventoryLayout'));
const StockList = lazy(() => import('./pages/Inventory/StockList'));
const StockDetail = lazy(() => import('./pages/Inventory/StockDetail'));
const StockCount = lazy(() => import('./pages/Inventory/StockCount'));
const WasteLog = lazy(() => import('./pages/Inventory/WasteLog'));
const InventoryInsights = lazy(() => import('./pages/Inventory/InventoryInsights'));
const RetailInventory = lazy(() => import('./pages/Inventory/RetailInventory'));
const ProductionManager = lazy(() => import('./pages/Production/ProductionManager'));

const StoreLayout = lazy(() => import('./pages/Store/StoreLayout'));
const StoreStock = lazy(() => import('./pages/Store/StoreStock'));
const IssueToKitchen = lazy(() => import('./pages/Store/IssueToKitchen'));
const Transfers = lazy(() => import('./pages/Store/Transfers'));
const AreaMovementReport = lazy(() => import('./pages/Inventory/AreaMovementReport'));

const ChartOfAccounts = lazy(() => import('./pages/Accounting/ChartOfAccounts'));
const JournalEntries = lazy(() => import('./pages/Accounting/JournalEntries'));
const Ledger = lazy(() => import('./pages/Accounting/Ledger'));
const TrialBalance = lazy(() => import('./pages/Accounting/TrialBalance'));
const ProfitAndLoss = lazy(() => import('./pages/Accounting/ProfitAndLoss'));
const BalanceSheet = lazy(() => import('./pages/Accounting/BalanceSheet'));
const PayablesAging = lazy(() => import('./pages/Accounting/PayablesAging'));
const ReceivablesAging = lazy(() => import('./pages/Accounting/ReceivablesAging'));

const AssetsLayout = lazy(() => import('./pages/Assets/AssetsLayout'));
const AssetRegister = lazy(() => import('./pages/Assets/AssetRegister'));
const AssetDetail = lazy(() => import('./pages/Assets/AssetDetail'));
const AssetAudits = lazy(() => import('./pages/Assets/AssetAudits'));
const AssetAuditDetail = lazy(() => import('./pages/Assets/AssetAuditDetail'));
const AssetCategories = lazy(() => import('./pages/Assets/AssetCategories'));
const AssetAccounting = lazy(() => import('./pages/Assets/AssetAccounting'));

const SettingsLayout = lazy(() => import('./pages/Settings/SettingsLayout'));
const UserManagement = lazy(() => import('./pages/Settings/UserManagement'));
const RoleSettings = lazy(() => import('./pages/Settings/RoleSettings'));
const Outlets = lazy(() => import('./pages/Settings/Outlets'));
const TaxSettings = lazy(() => import('./pages/Settings/TaxSettings'));
const AttendanceDevices = lazy(() => import('./pages/Settings/AttendanceDevices'));
const FaceTerminals = lazy(() => import('./pages/Settings/FaceTerminals'));
const PrinterSettings = lazy(() => import('./pages/Settings/BoutiquePrinterSettings'));
const KdsSettings = lazy(() => import('./pages/Settings/KdsSettings'));
const ShopifySettings = lazy(() => import('./pages/Settings/ShopifySettings'));
const MenuManagement = lazy(() => import('./pages/Menu/MenuManagement'));
const Sessions = lazy(() => import('./pages/POS/Sessions'));
const KdsBoard = lazy(() => import('./pages/KDS/KdsBoard'));
const RiderOperations = lazy(() => import('./pages/Riders/RiderOperations'));

const Tables = lazy(() => import('./pages/Tables/Tables'));
const SelfOrderApp = lazy(() => import('./pages/SelfOrder/SelfOrderApp'));

const LoyaltyLayout = lazy(() => import('./pages/Loyalty/LoyaltyLayout'));
const LoyaltyOverview = lazy(() => import('./pages/Loyalty/LoyaltyOverview'));
const LoyaltyMembers = lazy(() => import('./pages/Loyalty/LoyaltyMembers'));
const LoyaltySettings = lazy(() => import('./pages/Loyalty/LoyaltySettings'));
const MembershipMovements = lazy(() => import('./pages/Reports/MembershipMovements'));
const MembershipSummary = lazy(() => import('./pages/Reports/MembershipSummary'));

const NotFound = lazy(() => import('./pages/NotFound'));

const AllowanceManager = lazy(() => import('./pages/Allowances/AllowanceManager'));
const AuditLogs = lazy(() => import('./pages/Audit/AuditLogs'));
const SalaryManager = lazy(() => import('./pages/Salaries/SalaryManager'));
const SalaryPaymentPage = lazy(() => import('./pages/Salaries/SalaryPaymentPage'));
const EmployeeManager = lazy(() => import('./pages/Employees/EmployeeManager'));
const Attendance = lazy(() => import('./pages/Attendance/Attendance'));
const AttendanceEntry = lazy(() => import('./pages/Attendance/AttendanceEntry'));
const AttendanceDetail = lazy(() => import('./pages/Attendance/AttendanceDetail'));

// ── Fallback spinner ──────────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Shorthand wrappers ────────────────────────────────────────────────────────
// P = single permission key required
const P = (perm, el) => (
  <ProtectedRoute permission={perm}>{el}</ProtectedRoute>
);
// Any = any one of the listed keys required
const Any = (perms, el) => (
  <ProtectedRoute permissions={perms}>{el}</ProtectedRoute>
);
// F = feature flag + single permission key required
const F = (feature, perm, el) => (
  <ProtectedRoute feature={feature} permission={perm}>{el}</ProtectedRoute>
);
// FAny = feature flag + any-of permission keys required
const FAny = (feature, perms, el) => (
  <ProtectedRoute feature={feature} permissions={perms}>{el}</ProtectedRoute>
);

// Permission groups used on multiple routes
const PURCHASE_PERMS = ['purchases.view', 'purchases.create', 'purchases.post', 'purchases.edit', 'purchases.delete'];
const ATT_PERMS = ['attendance.view', 'attendance.manage'];
const EMP_PERMS = ['employees.view', 'employees.manage'];
const SAL_PERMS = ['salaries.view', 'salaries.manage'];
const ALLOW_PERMS = ['allowances.view', 'allowances.manage'];
const ASSET_PERMS = [
  'assets.view',
  'assets.manage',
  'assetAudits.create',
  'assetAudits.count',
  'assetAudits.review',
  'assetAudits.approve',
  'assets.accounting',
];
const POS_PERMS = ['reports.salesSummary', 'pos.manage'];
const SETTINGS_PERMS = ['settings.users', 'settings.roles', 'settings.outlets', 'settings.printers', 'settings.kds', 'settings.integrations'];
const REPORT_PERMS = [
  'reports.cogs', 'reports.spend', 'reports.priceHistory',
  'reports.vendorPerformance', 'reports.aging', 'reports.salesSummary',
  'reports.salesTransactions',
  'reports.salesByItem', 'reports.salesByCashier', 'reports.hourly',
  'reports.orderLifecycle', 'reports.kitchenCounterSales',
];

// Decides what `/` and any nested `/*` look like:
// - guest on `/`              → Landing page
// - guest on any nested path  → /login redirect
// - authed user               → tenant-aware AppGate around the app shell
const RootRouter = () => {
  const { isAuthenticated } = useAuth();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (!isAuthenticated) {
    return pathname === '/' ? <Landing /> : <Navigate to="/login" replace />;
  }
  return (
    <AppGate>
      <AppLayout />
    </AppGate>
  );
};

const AppRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* ── Public ─────────────────────────────────────────────────────── */}
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/set-password" element={<SetPassword />} />

      {/* ── Authenticated, but outside the main shell ──────────────────── */}
      <Route
        path="/onboarding/outlet"
        element={
          <ProtectedRoute>
            <OutletWizard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing/expired"
        element={
          <ProtectedRoute>
            <SubscriptionExpired />
          </ProtectedRoute>
        }
      />
      <Route
        path="/terminal/*"
        element={
          <ProtectedRoute>
            <TerminalApp />
          </ProtectedRoute>
        }
      />

      {/* ── Public self-order (no auth) — customer scans QR and lands here ── */}
      <Route path="/order/:tenantSlug/:outletCode/:tableCode" element={<SelfOrderApp />} />

      {/* ── Root: Landing for guests, app shell for authenticated users ── */}
      <Route path="/" element={<RootRouter />}>
        <Route index element={<Navigate to="/dashboard" replace />} />

        {/* Dashboard */}
        <Route path="dashboard" element={P('dashboard.view', <Dashboard />)} />

        {/* Account (any authenticated user) */}
        <Route path="account" element={<Account />} />
        <Route path="billing" element={<ProtectedRoute allowedRoles={['owner', 'financeManager']}><BillingCenter /></ProtectedRoute>} />

        {/* ── Vendors ── */}
        <Route path="vendors" element={F('purchasing', 'vendors.manage', <VendorList />)} />
        <Route path="vendors/new" element={F('purchasing', 'vendors.manage', <VendorForm />)} />
        <Route path="vendors/:id" element={F('purchasing', 'vendors.manage', <VendorDetail />)} />
        <Route path="vendors/:id/edit" element={F('purchasing', 'vendors.manage', <VendorForm />)} />

        {/* ── Products ── */}
        <Route path="products" element={F('purchasing', 'products.manage', <ProductList />)} />
        <Route path="products/new" element={F('purchasing', 'products.manage', <ProductForm />)} />
        <Route path="products/:id" element={F('purchasing', 'products.manage', <ProductDetail />)} />
        <Route path="products/:id/edit" element={F('purchasing', 'products.manage', <ProductForm />)} />

        {/* ── Unified Purchases ── */}
        <Route path="purchases" element={FAny('purchasing', PURCHASE_PERMS, <PurchaseList />)} />
        <Route path="purchases/new" element={F('purchasing', 'purchases.create', <PurchaseForm />)} />
        <Route path="purchases/:id" element={F('purchasing', 'purchases.view', <PurchaseDetail />)} />
        <Route path="purchases/:id/edit" element={F('purchasing', 'purchases.edit', <PurchaseForm />)} />
        <Route path="receiving/*" element={<Navigate to="/purchases" replace />} />
        <Route path="invoices/*" element={<Navigate to="/purchases" replace />} />

        {/* ── Payments ── */}
        <Route path="payments" element={F('purchasing', 'payments.view', <PaymentList />)} />

        {/* ── POS Sessions ── */}
        <Route path="pos/sessions" element={FAny('pos', POS_PERMS, <Sessions />)} />

        {/* Kitchen Display System — admin entitlement plus outlet KDS settings. */}
        <Route path="kds" element={F('kds', 'kds.view', <KdsBoard />)} />
        <Route path="rider-operations" element={FAny('riderTracking', ['riderTracking.live', 'riderTracking.history'], <RiderOperations />)} />

        {/* ── Accounting ── */}
        <Route path="accounting/chart-of-accounts" element={F('accounting', 'accounting.coa', <ChartOfAccounts />)} />
        <Route path="accounting/journal-entries" element={F('accounting', 'accounting.journalEntries', <JournalEntries />)} />
        <Route path="accounting/ledger" element={F('accounting', 'accounting.ledger', <Ledger />)} />
        <Route path="accounting/trial-balance" element={FAny('accounting', ['accounting.ledger', 'accounting.reports'], <TrialBalance />)} />
        <Route path="accounting/profit-and-loss" element={F('accounting', 'accounting.reports', <ProfitAndLoss />)} />
        <Route path="accounting/balance-sheet" element={F('accounting', 'accounting.reports', <BalanceSheet />)} />
        <Route path="accounting/ap-aging" element={F('accounting', 'accounting.apAging', <PayablesAging />)} />
        <Route path="accounting/ar-aging" element={F('accounting', 'accounting.arAging', <ReceivablesAging />)} />

        {/* ── Asset Register & Audit — opt-in and outlet-scoped ── */}
        <Route
          path="assets"
          element={FAny('assetAudit', ASSET_PERMS, <AssetsLayout />)}
        >
          <Route path="register" element={P('assets.view', <AssetRegister />)} />
          <Route path="register/:id" element={P('assets.view', <AssetDetail />)} />
          <Route path="audits" element={P('assets.view', <AssetAudits />)} />
          <Route path="audits/:id" element={P('assets.view', <AssetAuditDetail />)} />
          <Route path="categories" element={P('assets.manage', <AssetCategories />)} />
          <Route path="accounting" element={P('assets.accounting', <AssetAccounting />)} />
        </Route>

        {/* ── Reports (nested layout) ── */}
        <Route
          path="reports"
          element={FAny('reports', REPORT_PERMS, <ReportsLayout />)}
        >
          <Route path="cogs" element={<Navigate to="/reports/sales-summary" replace />} />
          <Route path="spend" element={P('reports.spend', <SpendReport />)} />
          <Route path="price-history" element={P('reports.priceHistory', <PriceHistory />)} />
          <Route path="vendor-performance" element={P('reports.vendorPerformance', <VendorPerformance />)} />
          <Route path="aging" element={P('reports.aging', <AgingReport />)} />
          <Route path="sales-summary" element={P('reports.salesSummary', <SalesSummary />)} />
          <Route path="sales-transactions" element={P('reports.salesTransactions', <SalesTransactions />)} />
          <Route path="sales-by-item" element={P('reports.salesByItem', <SalesByItem />)} />
          <Route path="sales-by-cashier" element={P('reports.salesByCashier', <SalesByCashier />)} />
          <Route path="hourly-breakdown" element={P('reports.hourly', <HourlyBreakdown />)} />
          <Route path="cancelled-orders" element={P('reports.salesSummary', <CancelledOrders />)} />
          <Route path="order-lifecycle" element={F('kds', 'reports.orderLifecycle', <OrderLifecycle />)} />
          <Route path="kitchen-counter-sales" element={F('kds', 'reports.kitchenCounterSales', <KitchenCounterSales />)} />
          {/* Membership / Rewards reports — gated by membershipRewards feature.
              Pages render an inline "feature disabled" notice rather than 404
              if the user navigates while the flag is off. */}
          <Route path="membership-movements" element={Any(POS_PERMS, <MembershipMovements />)} />
          <Route path="membership-summary"   element={Any(POS_PERMS, <MembershipSummary />)} />
        </Route>

        {/* Boutique finished goods are imported from Shopify; legacy Kitchen flows are retired in this copy. */}
        <Route path="retail-inventory" element={P('inventory.view', <RetailInventory />)} />
        <Route path="production" element={P('inventory.view', <ProductionManager />)} />
        <Route path="inventory/*" element={<Navigate to="/retail-inventory" replace />} />

        {/* ── Store (nested layout) — receiving buffer + issue to kitchen ── */}
        <Route
          path="store"
          element={F('store', 'store.view', <StoreLayout />)}
        >
          <Route path="stock"  element={P('store.view', <StoreStock />)} />
          <Route path="report" element={P('store.view', <AreaMovementReport area="store" />)} />
        </Route>

        {/* ── Settings (nested layout) ── */}
        <Route
          path="settings"
          element={Any(SETTINGS_PERMS, <SettingsLayout />)}
        >
          <Route path="users" element={P('settings.users', <UserManagement />)} />
          <Route path="roles" element={P('settings.roles', <RoleSettings />)} />
          <Route path="outlets" element={P('settings.outlets', <Outlets />)} />
          <Route path="integrations/shopify" element={P('settings.integrations', <ShopifySettings />)} />
          <Route path="printers" element={P('settings.printers', <PrinterSettings />)} />
          <Route path="kds" element={<ProtectedRoute feature="kds" allowedRoles={['owner']}><KdsSettings /></ProtectedRoute>} />
          <Route
            path="tax"
            element={
              <ProtectedRoute allowedRoles={['owner', 'financeManager']}>
                <TaxSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="attendance-devices"
            element={
              <ProtectedRoute allowedRoles={['owner']}>
                <AttendanceDevices />
              </ProtectedRoute>
            }
          />
          <Route
            path="face-terminals"
            element={
              <ProtectedRoute allowedRoles={['owner']} feature="attendanceExternalDevice">
                <FaceTerminals />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* ── Menu Management ── */}
        <Route path="menu" element={F('menu', 'menu.manage', <MenuManagement />)} />

        {/* ── Staff Allowances ── */}
        <Route path="allowances" element={FAny('payroll', ALLOW_PERMS, <AllowanceManager />)} />

        {/* ── Salaries ── */}
        <Route path="salaries" element={FAny('payroll', SAL_PERMS, <SalaryManager />)} />
        <Route path="salaries/pay" element={F('payroll', 'salaries.manage', <SalaryPaymentPage />)} />
        <Route path="salaries/:paymentId/edit" element={F('payroll', 'salaries.manage', <SalaryPaymentPage />)} />

        {/* ── Audit Logs (owner-only activity trail) ── */}
        <Route
          path="audit-logs"
          element={
            <ProtectedRoute allowedRoles={['owner']}>
              <AuditLogs />
            </ProtectedRoute>
          }
        />

        {/* ── Tables (QR self-order setup) ── */}
        <Route path="tables" element={FAny('qrOrdering', ['settings.outlets', 'pos.manage'], <Tables />)} />

        {/* ── Employees ── */}
        <Route path="employees" element={FAny('employees', EMP_PERMS, <EmployeeManager />)} />

        {/* ── Attendance ── */}
        <Route path="attendance" element={FAny('attendance', ATT_PERMS, <Attendance />)} />
        <Route path="attendance/entry" element={FAny('attendance', ['attendance.manage'], <AttendanceEntry />)} />
        <Route path="attendance/:id" element={FAny('attendance', ATT_PERMS, <AttendanceDetail />)} />

        {/* ── Membership / Rewards (nested layout with tabs) ── */}
        <Route
          path="loyalty"
          element={FAny('membershipRewards', POS_PERMS, <LoyaltyLayout />)}
        >
          <Route index element={<LoyaltyOverview />} />
          <Route path="members"  element={P('pos.manage', <LoyaltyMembers />)} />
          <Route path="settings" element={P('pos.manage', <LoyaltySettings />)} />
        </Route>
      </Route>

      {/* ── Catch-all ─────────────────────────────────────────────────── */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);

export default AppRoutes;
