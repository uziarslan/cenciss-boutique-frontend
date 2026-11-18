// Central permissions list used by RoleSettings and per-user permission editor.
// Each entry has a machine `key` used for saving per-user overrides.
export const PERMISSIONS = [
    { key: 'dashboard.view', feature: 'Dashboard', owner: true, financeManager: true, purchaseManager: true, receivingStaff: true },

    // Purchasing
    { key: 'vendors.manage', feature: 'Vendors (list/edit/delete)', owner: true, financeManager: false, purchaseManager: true, receivingStaff: false },
    { key: 'products.manage', feature: 'Products (list/edit)', owner: true, financeManager: false, purchaseManager: true, receivingStaff: true },
    { key: 'purchases.view', feature: 'Purchases (view)', owner: true, financeManager: true, purchaseManager: true, receivingStaff: true },
    { key: 'purchases.create', feature: 'Purchases (create drafts)', owner: true, financeManager: false, purchaseManager: true, receivingStaff: true },
    { key: 'purchases.post', feature: 'Purchases (post stock and accounting)', owner: true, financeManager: true, purchaseManager: true, receivingStaff: true },
    { key: 'purchases.edit', feature: 'Purchases (edit drafts and correct posted)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'purchases.delete', feature: 'Purchases (delete)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'payments.view', feature: 'Payments (view)', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'payments.record', feature: 'Pay / Record Payment', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'payments.edit', feature: 'Payments (edit date and method)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'payments.delete', feature: 'Payments (reverse/delete)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },

    // Accounting
    { key: 'accounting.view', feature: 'View Accounting', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.journals', feature: 'Post Journal Entry', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.coa', feature: 'Chart of Accounts', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.journalEntries', feature: 'Journal Entries', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.ledger', feature: 'Ledger / Trial Balance', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.reports', feature: 'Profit & Loss / Balance Sheet', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.apAging', feature: 'AP Aging', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.arAging', feature: 'AR Aging', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.editJournalEntry', feature: 'Edit Journal Entries', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.deleteJournalEntry', feature: 'Delete Journal Entries', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.editAccount', feature: 'Edit Accounts', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'accounting.deleteAccount', feature: 'Delete Accounts', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },

    // Staff allowances — independent toggle so it doesn't piggyback on
    // accounting.reports.
    { key: 'allowances.view', feature: 'View Staff Allowances', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'allowances.manage', feature: 'Manage Staff Allowances', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },

    // Operations
    { key: 'menu.manage', feature: 'Menu Management', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'inventory.view', feature: 'Kitchen (stock)', owner: true, financeManager: false, purchaseManager: true, receivingStaff: true },
    { key: 'inventory.manage', feature: 'Kitchen (manage)', owner: true, financeManager: false, purchaseManager: true, receivingStaff: true },
    { key: 'store.view', feature: 'Store (view)', owner: true, financeManager: false, purchaseManager: true, receivingStaff: true },
    { key: 'store.manage', feature: 'Store (issue / manage)', owner: true, financeManager: false, purchaseManager: true, receivingStaff: true },
    { key: 'kds.view', feature: 'KDS (view)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },
    { key: 'kds.operate', feature: 'KDS (accept / prepare / dispatch)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },
    { key: 'kds.cancel', feature: 'KDS (cancel orders)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },
    { key: 'riderTracking.live', feature: 'Rider Operations (live view)', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false, cashier: true, rider: false },
    { key: 'riderTracking.assign', feature: 'Rider Dispatch (assign orders)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: true, rider: false },
    { key: 'riderTracking.history', feature: 'Rider Operations (route history)', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false, cashier: false, rider: false },
    { key: 'riderTracking.manage', feature: 'Rider Tracking (configuration)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false, rider: false },

    // Asset Register & Audit (requires the platform admin outlet entitlement).
    { key: 'assets.view', feature: 'Assets (view register)', owner: true, financeManager: true, purchaseManager: true, receivingStaff: true },
    { key: 'assets.manage', feature: 'Assets (create/edit/transfer)', owner: true, financeManager: false, purchaseManager: true, receivingStaff: false },
    { key: 'assetAudits.create', feature: 'Asset Audits (schedule)', owner: true, financeManager: true, purchaseManager: true, receivingStaff: false },
    { key: 'assetAudits.count', feature: 'Asset Audits (count)', owner: true, financeManager: false, purchaseManager: true, receivingStaff: true },
    { key: 'assetAudits.review', feature: 'Asset Audits (review)', owner: true, financeManager: true, purchaseManager: true, receivingStaff: false },
    { key: 'assetAudits.approve', feature: 'Asset Audits (approve)', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'assets.accounting', feature: 'Assets (accounting/depreciation)', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },

    { key: 'attendance.view', feature: 'Attendance (view)', owner: true, financeManager: true, purchaseManager: true, receivingStaff: false },
    { key: 'attendance.manage', feature: 'Attendance (edit)', owner: true, financeManager: true, purchaseManager: true, receivingStaff: false },

    // POS — backend keys, mirrored here so RoleSettings can render them
    { key: 'pos.sale', feature: 'POS Sale (take orders)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: true },
    { key: 'pos.manage', feature: 'POS Sessions (review)', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false, cashier: false },
    { key: 'pos.transactions', feature: 'POS Transactions', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false, cashier: false },
    { key: 'pos.discount', feature: 'POS Discount', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false, cashier: false },
    { key: 'pos.cancelOrder', feature: 'Cancel POS Orders', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },
    // Owners retain full access; every non-owner must be granted this high-risk
    // authority individually.
    { key: 'pos.cancelSentItem', feature: 'Cancel Kitchen-Sent Items', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false, rider: false },
    { key: 'pos.logWaste', feature: 'Log POS Orders as Waste', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false, cashier: true },
    { key: 'pos.drawerAdd', feature: 'Drawer Payouts (add)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: true },
    { key: 'pos.drawerEdit', feature: 'Drawer Payouts (edit)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },
    { key: 'pos.drawerDelete', feature: 'Drawer Payouts (delete)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },

    // Add-on features (only usable when the admin has enabled the feature flag)
    { key: 'tables.manage',  feature: 'Tables (QR ordering)', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false, cashier: false },
    { key: 'loyalty.manage', feature: 'Membership / Rewards', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false, cashier: false },

    // Reports
    { key: 'reports.cogs', feature: 'COGS', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'reports.belowPar', feature: 'Below-Par Stock', owner: true, financeManager: true, purchaseManager: true, receivingStaff: false },
    { key: 'reports.spend', feature: 'Spend', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'reports.priceHistory', feature: 'Price History', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'reports.vendorPerformance', feature: 'Vendor Performance', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'reports.aging', feature: 'Aging', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'reports.salesSummary', feature: 'Sales Summary', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'reports.salesTransactions', feature: 'Sales Transactions', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'reports.salesByItem', feature: 'Sales by Item', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'reports.salesByCashier', feature: 'Sales by Cashier', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'reports.hourly', feature: 'Hourly Breakdown', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'reports.orderLifecycle', feature: 'Order Lifecycle', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },
    { key: 'reports.kitchenCounterSales', feature: 'Kitchen vs Counter Sales', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },

    // Settings
    { key: 'settings.users', feature: 'User Management', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'settings.roles', feature: 'Role Settings (read-only)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'settings.outlets', feature: 'Outlets (manage)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'settings.integrations', feature: 'Integrations (manage)', owner: true, financeManager: true, purchaseManager: false, receivingStaff: false },
    { key: 'settings.printers', feature: 'Printer Settings', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },
    { key: 'settings.kds', feature: 'KDS Settings', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },

    // Salaries
    { key: 'salaries.view', feature: 'View Salaries', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'salaries.manage', feature: 'Manage Salaries (pay, advance, employees)', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false },
    { key: 'salaries.overrideCreditLimits', feature: 'Override Employee Credit Limits', owner: true, financeManager: false, purchaseManager: false, receivingStaff: false, cashier: false },

    // Employees
    { key: 'employees.view', feature: 'View Employees', owner: true, financeManager: true, purchaseManager: true, receivingStaff: false },
    { key: 'employees.manage', feature: 'Employees (create/edit/deactivate)', owner: true, financeManager: true, purchaseManager: true, receivingStaff: false },
];

export const ROLES = [
    { key: 'owner', label: 'Owner' },
    { key: 'financeManager', label: 'Finance Manager' },
    { key: 'purchaseManager', label: 'Purchase Manager' },
    { key: 'receivingStaff', label: 'Receiving Staff' },
    { key: 'cashier', label: 'Cashier' },
    { key: 'rider', label: 'Rider' },
];

export const hasEffectivePermission = (user, permissionKey) => {
    if (!user) return false;
    if (user.role === 'owner') return true;
    const overrides = user.permissions || {};
    if (Object.prototype.hasOwnProperty.call(overrides, permissionKey)) {
        return !!overrides[permissionKey];
    }
    const permission = PERMISSIONS.find((entry) => entry.key === permissionKey);
    return !!permission?.[user.role];
};

export default PERMISSIONS;
