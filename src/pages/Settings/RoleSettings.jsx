import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { RotateCcw, ShieldCheck, Search, Lock, Eye, Wrench, Pencil, Users, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { PERMISSIONS } from '../../config/permissions';
import { updateUser, getMe } from '../../api/userApi';
import useAuth from '../../hooks/useAuth';
import useFeatures from '../../hooks/useFeatures';
import { useDispatch } from 'react-redux';
import { setUser } from '../../store/slices/authSlice';
import { useGetUsersQuery, listQueryOpts, baseApi } from '../../store/baseApi';
import useQueryState from '../../hooks/useQueryState';

// ── Permission map: one entry per sidebar nav item ────────────────────────────
//
// Every group/item below mirrors the sidebar `NAV_ITEMS` and uses ONLY
// permission keys that exist in `frontend/src/config/permissions.js` (which
// in turn mirrors `backend/src/config/permissions.js`). Toggling a level
// here writes the same keys the backend middleware reads — see
// `auth.middleware.js#hasPermission` and `allowedByDefault` in
// `backend/src/config/permissions.js`.

const NAV_SECTIONS = [
  {
    group: 'Core',
    items: [
      {
        label: 'Dashboard',
        allKeys: ['dashboard.view'],
        levels: [
          { id: 'none', label: 'None', set: { 'dashboard.view': false } },
          { id: 'view', label: 'View', set: { 'dashboard.view': true  } },
        ],
      },
    ],
  },
  {
    group: 'Purchasing',
    feature: 'purchasing',
    items: [
      {
        label: 'Vendors',
        allKeys: ['vendors.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'vendors.manage': false } },
          { id: 'edit', label: 'Edit', set: { 'vendors.manage': true  } },
        ],
      },
      {
        label: 'Items',
        allKeys: ['products.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'products.manage': false } },
          { id: 'edit', label: 'Edit', set: { 'products.manage': true  } },
        ],
      },
      {
        label: 'Purchases',
        allKeys: ['purchases.view', 'purchases.create', 'purchases.post', 'purchases.edit', 'purchases.delete'],
        levels: [
          { id: 'none', label: 'None', set: { 'purchases.view': false, 'purchases.create': false, 'purchases.post': false, 'purchases.edit': false, 'purchases.delete': false } },
          { id: 'view', label: 'View', set: { 'purchases.view': true, 'purchases.create': false, 'purchases.post': false, 'purchases.edit': false, 'purchases.delete': false } },
          { id: 'create', label: 'Create', set: { 'purchases.view': true, 'purchases.create': true, 'purchases.post': false, 'purchases.edit': false, 'purchases.delete': false } },
          { id: 'post', label: 'Post', set: { 'purchases.view': true, 'purchases.create': true, 'purchases.post': true, 'purchases.edit': false, 'purchases.delete': false } },
          { id: 'edit', label: 'Edit', set: { 'purchases.view': true, 'purchases.create': true, 'purchases.post': true, 'purchases.edit': true, 'purchases.delete': false } },
          { id: 'delete', label: 'Delete', set: { 'purchases.view': true, 'purchases.create': true, 'purchases.post': true, 'purchases.edit': true, 'purchases.delete': true } },
        ],
      },
      {
        label: 'Payments',
        allKeys: ['payments.view', 'payments.record', 'payments.edit', 'payments.delete'],
        levels: [
          { id: 'none', label: 'None', set: { 'payments.view': false, 'payments.record': false, 'payments.edit': false, 'payments.delete': false } },
          { id: 'view', label: 'View', set: { 'payments.view': true, 'payments.record': false, 'payments.edit': false, 'payments.delete': false } },
          { id: 'record', label: 'Record', set: { 'payments.view': true, 'payments.record': true, 'payments.edit': false, 'payments.delete': false } },
          { id: 'edit', label: 'Edit', set: { 'payments.view': true, 'payments.record': true, 'payments.edit': true, 'payments.delete': false } },
          { id: 'delete', label: 'Delete', set: { 'payments.view': true, 'payments.record': true, 'payments.edit': true, 'payments.delete': true } },
        ],
      },
    ],
  },
  {
    group: 'Accounting',
    feature: 'accounting',
    items: [
      {
        label: 'Accounting Section (dashboard card)',
        allKeys: ['accounting.view'],
        levels: [
          { id: 'none', label: 'None', set: { 'accounting.view': false } },
          { id: 'view', label: 'View', set: { 'accounting.view': true  } },
        ],
      },
      {
        label: 'Chart of Accounts',
        allKeys: ['accounting.coa', 'accounting.editAccount', 'accounting.deleteAccount'],
        levels: [
          { id: 'none',   label: 'None',   set: { 'accounting.coa': false, 'accounting.editAccount': false, 'accounting.deleteAccount': false } },
          { id: 'manage', label: 'Manage', set: { 'accounting.coa': true,  'accounting.editAccount': false, 'accounting.deleteAccount': false } },
          { id: 'edit',   label: 'Edit',   set: { 'accounting.coa': true,  'accounting.editAccount': true,  'accounting.deleteAccount': false } },
          { id: 'delete', label: 'Delete', set: { 'accounting.coa': true,  'accounting.editAccount': true,  'accounting.deleteAccount': true  } },
        ],
      },
      {
        label: 'Journal Entries',
        allKeys: ['accounting.journalEntries', 'accounting.journals', 'accounting.editJournalEntry', 'accounting.deleteJournalEntry'],
        levels: [
          { id: 'none',   label: 'None',   set: { 'accounting.journalEntries': false, 'accounting.journals': false, 'accounting.editJournalEntry': false, 'accounting.deleteJournalEntry': false } },
          { id: 'view',   label: 'View',   set: { 'accounting.journalEntries': true,  'accounting.journals': false, 'accounting.editJournalEntry': false, 'accounting.deleteJournalEntry': false } },
          { id: 'post',   label: 'Post',   set: { 'accounting.journalEntries': true,  'accounting.journals': true,  'accounting.editJournalEntry': false, 'accounting.deleteJournalEntry': false } },
          { id: 'edit',   label: 'Edit',   set: { 'accounting.journalEntries': true,  'accounting.journals': true,  'accounting.editJournalEntry': true,  'accounting.deleteJournalEntry': false } },
          { id: 'delete', label: 'Delete', set: { 'accounting.journalEntries': true,  'accounting.journals': true,  'accounting.editJournalEntry': true,  'accounting.deleteJournalEntry': true  } },
        ],
      },
      {
        label: 'Ledger & Trial Balance',
        allKeys: ['accounting.ledger'],
        levels: [
          { id: 'none', label: 'None', set: { 'accounting.ledger': false } },
          { id: 'view', label: 'View', set: { 'accounting.ledger': true  } },
        ],
      },
      {
        label: 'P&L / Balance Sheet',
        allKeys: ['accounting.reports'],
        levels: [
          { id: 'none', label: 'None', set: { 'accounting.reports': false } },
          { id: 'view', label: 'View', set: { 'accounting.reports': true  } },
        ],
      },
      {
        label: 'AP Aging',
        allKeys: ['accounting.apAging'],
        levels: [
          { id: 'none', label: 'None', set: { 'accounting.apAging': false } },
          { id: 'view', label: 'View', set: { 'accounting.apAging': true  } },
        ],
      },
      {
        label: 'AR Aging',
        allKeys: ['accounting.arAging'],
        levels: [
          { id: 'none', label: 'None', set: { 'accounting.arAging': false } },
          { id: 'view', label: 'View', set: { 'accounting.arAging': true  } },
        ],
      },
    ],
  },
  {
    group: 'Operations',
    items: [
      {
        label: 'Menu Management',
        feature: 'menu',
        allKeys: ['menu.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'menu.manage': false } },
          { id: 'edit', label: 'Edit', set: { 'menu.manage': true  } },
        ],
      },
      {
        label: 'Kitchen',
        feature: 'inventory',
        allKeys: ['inventory.view', 'inventory.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'inventory.view': false, 'inventory.manage': false } },
          { id: 'view', label: 'View', set: { 'inventory.view': true,  'inventory.manage': false } },
          { id: 'edit', label: 'Edit', set: { 'inventory.view': true,  'inventory.manage': true  } },
        ],
      },
      {
        label: 'Kitchen Display System',
        feature: 'kds',
        allKeys: ['kds.view', 'kds.operate', 'kds.cancel'],
        levels: [
          { id: 'none', label: 'None', set: { 'kds.view': false, 'kds.operate': false, 'kds.cancel': false } },
          { id: 'view', label: 'View', set: { 'kds.view': true, 'kds.operate': false, 'kds.cancel': false } },
          { id: 'operate', label: 'Operate', set: { 'kds.view': true, 'kds.operate': true, 'kds.cancel': false } },
          { id: 'cancel', label: 'Operate + Cancel', set: { 'kds.view': true, 'kds.operate': true, 'kds.cancel': true } },
        ],
      },
      {
        label: 'Rider Operations',
        feature: 'riderTracking',
        allKeys: ['riderTracking.live', 'riderTracking.assign', 'riderTracking.history', 'riderTracking.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'riderTracking.live': false, 'riderTracking.assign': false, 'riderTracking.history': false, 'riderTracking.manage': false } },
          { id: 'view', label: 'Live View', set: { 'riderTracking.live': true, 'riderTracking.assign': false, 'riderTracking.history': false, 'riderTracking.manage': false } },
          { id: 'manage', label: 'Dispatch', set: { 'riderTracking.live': true, 'riderTracking.assign': true, 'riderTracking.history': false, 'riderTracking.manage': false } },
          { id: 'edit', label: 'Full', set: { 'riderTracking.live': true, 'riderTracking.assign': true, 'riderTracking.history': true, 'riderTracking.manage': true } },
        ],
      },
      {
        label: 'Store',
        feature: 'store',
        allKeys: ['store.view', 'store.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'store.view': false, 'store.manage': false } },
          { id: 'view', label: 'View', set: { 'store.view': true,  'store.manage': false } },
          { id: 'edit', label: 'Edit', set: { 'store.view': true,  'store.manage': true  } },
        ],
      },
      {
        label: 'POS Sessions',
        feature: 'pos',
        allKeys: ['pos.manage', 'pos.transactions'],
        levels: [
          { id: 'none', label: 'None', set: { 'pos.manage': false, 'pos.transactions': false } },
          { id: 'view', label: 'View', set: { 'pos.manage': true,  'pos.transactions': true  } },
        ],
      },
      {
        label: 'Staff Allowances',
        feature: 'payroll',
        allKeys: ['allowances.view', 'allowances.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'allowances.view': false, 'allowances.manage': false } },
          { id: 'view', label: 'View', set: { 'allowances.view': true,  'allowances.manage': false } },
          { id: 'edit', label: 'Edit', set: { 'allowances.view': true,  'allowances.manage': true  } },
        ],
      },
      {
        label: 'Employees',
        feature: 'employees',
        allKeys: ['employees.view', 'employees.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'employees.view': false, 'employees.manage': false } },
          { id: 'view', label: 'View', set: { 'employees.view': true,  'employees.manage': false } },
          { id: 'edit', label: 'Edit', set: { 'employees.view': true,  'employees.manage': true  } },
        ],
      },
      {
        label: 'Attendance',
        feature: 'attendance',
        allKeys: ['attendance.view', 'attendance.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'attendance.view': false, 'attendance.manage': false } },
          { id: 'view', label: 'View', set: { 'attendance.view': true,  'attendance.manage': false } },
          { id: 'edit', label: 'Edit', set: { 'attendance.view': true,  'attendance.manage': true  } },
        ],
      },
      {
        label: 'Salaries',
        feature: 'payroll',
        allKeys: ['salaries.view', 'salaries.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'salaries.view': false, 'salaries.manage': false } },
          { id: 'view', label: 'View', set: { 'salaries.view': true,  'salaries.manage': false } },
          { id: 'edit', label: 'Edit', set: { 'salaries.view': true,  'salaries.manage': true  } },
        ],
      },
      {
        label: 'Override Employee Credit Limits',
        feature: 'payroll',
        allKeys: ['salaries.overrideCreditLimits'],
        levels: [
          { id: 'none', label: 'None', set: { 'salaries.overrideCreditLimits': false } },
          { id: 'grant', label: 'Grant', set: { 'salaries.overrideCreditLimits': true } },
        ],
      },
    ],
  },
  {
    group: 'Asset Register & Audit',
    feature: 'assetAudit',
    items: [
      {
        label: 'Asset Register',
        allKeys: ['assets.view', 'assets.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'assets.view': false, 'assets.manage': false } },
          { id: 'view', label: 'View', set: { 'assets.view': true, 'assets.manage': false } },
          { id: 'edit', label: 'Manage', set: { 'assets.view': true, 'assets.manage': true } },
        ],
      },
      {
        label: 'Physical Audits',
        allKeys: ['assetAudits.create', 'assetAudits.count', 'assetAudits.review', 'assetAudits.approve'],
        levels: [
          { id: 'none', label: 'None', set: { 'assetAudits.create': false, 'assetAudits.count': false, 'assetAudits.review': false, 'assetAudits.approve': false } },
          { id: 'count', label: 'Count', set: { 'assetAudits.create': false, 'assetAudits.count': true, 'assetAudits.review': false, 'assetAudits.approve': false } },
          { id: 'create', label: 'Schedule', set: { 'assetAudits.create': true, 'assetAudits.count': true, 'assetAudits.review': false, 'assetAudits.approve': false } },
          { id: 'review', label: 'Review', set: { 'assetAudits.create': true, 'assetAudits.count': true, 'assetAudits.review': true, 'assetAudits.approve': false } },
          { id: 'approve', label: 'Approve', set: { 'assetAudits.create': true, 'assetAudits.count': true, 'assetAudits.review': true, 'assetAudits.approve': true } },
        ],
      },
      {
        label: 'Asset Accounting',
        allKeys: ['assets.accounting'],
        levels: [
          { id: 'none', label: 'None', set: { 'assets.accounting': false } },
          { id: 'post', label: 'Post', set: { 'assets.accounting': true } },
        ],
      },
    ],
  },
  {
    group: 'POS Terminal',
    feature: 'pos',
    items: [
      {
        label: 'POS Sale (take orders)',
        allKeys: ['pos.sale'],
        levels: [
          { id: 'none', label: 'None', set: { 'pos.sale': false } },
          { id: 'edit', label: 'Edit', set: { 'pos.sale': true  } },
        ],
      },
      {
        label: 'Apply Discount',
        allKeys: ['pos.discount'],
        levels: [
          { id: 'none',  label: 'None',  set: { 'pos.discount': false } },
          { id: 'grant', label: 'Grant', set: { 'pos.discount': true  } },
        ],
      },
      {
        label: 'Cancel Orders',
        allKeys: ['pos.cancelOrder'],
        levels: [
          { id: 'none',  label: 'None',  set: { 'pos.cancelOrder': false } },
          { id: 'grant', label: 'Grant', set: { 'pos.cancelOrder': true  } },
        ],
      },
      {
        label: 'Cancel Kitchen-Sent Items',
        allKeys: ['pos.cancelSentItem'],
        levels: [
          { id: 'none',  label: 'None',  set: { 'pos.cancelSentItem': false } },
          { id: 'grant', label: 'Grant', set: { 'pos.cancelSentItem': true  } },
        ],
      },
      {
        label: 'Log Order as Waste',
        allKeys: ['pos.logWaste'],
        levels: [
          { id: 'none',  label: 'None',  set: { 'pos.logWaste': false } },
          { id: 'grant', label: 'Grant', set: { 'pos.logWaste': true  } },
        ],
      },
      {
        label: 'Manage Drawer Payouts',
        allKeys: ['pos.drawerAdd', 'pos.drawerEdit', 'pos.drawerDelete'],
        levels: [
          { id: 'none',   label: 'None',   set: { 'pos.drawerAdd': false, 'pos.drawerEdit': false, 'pos.drawerDelete': false } },
          { id: 'add',    label: 'Add',    set: { 'pos.drawerAdd': true,  'pos.drawerEdit': false, 'pos.drawerDelete': false } },
          { id: 'edit',   label: 'Edit',   set: { 'pos.drawerAdd': true,  'pos.drawerEdit': true,  'pos.drawerDelete': false } },
          { id: 'delete', label: 'Delete', set: { 'pos.drawerAdd': true,  'pos.drawerEdit': true,  'pos.drawerDelete': true  } },
        ],
      },
    ],
  },
  // Add-on features — these sections only appear when the admin has enabled the
  // corresponding feature for this tenant.
  {
    group: 'Tables (QR)',
    feature: 'qrOrdering',
    items: [
      {
        label: 'Tables (QR ordering)',
        allKeys: ['tables.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'tables.manage': false } },
          { id: 'edit', label: 'Manage', set: { 'tables.manage': true  } },
        ],
      },
    ],
  },
  {
    group: 'Membership / Rewards',
    feature: 'membershipRewards',
    items: [
      {
        label: 'Membership / Rewards',
        allKeys: ['loyalty.manage'],
        levels: [
          { id: 'none', label: 'None', set: { 'loyalty.manage': false } },
          { id: 'edit', label: 'Manage', set: { 'loyalty.manage': true  } },
        ],
      },
    ],
  },
  {
    group: 'Reports',
    feature: 'reports',
    items: [
      {
        label: 'COGS',
        allKeys: ['reports.cogs'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.cogs': false } },
          { id: 'view', label: 'View', set: { 'reports.cogs': true  } },
        ],
      },
      {
        label: 'Below-Par Stock',
        allKeys: ['reports.belowPar'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.belowPar': false } },
          { id: 'view', label: 'View', set: { 'reports.belowPar': true  } },
        ],
      },
      {
        label: 'Spend',
        allKeys: ['reports.spend'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.spend': false } },
          { id: 'view', label: 'View', set: { 'reports.spend': true  } },
        ],
      },
      {
        label: 'Price History',
        allKeys: ['reports.priceHistory'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.priceHistory': false } },
          { id: 'view', label: 'View', set: { 'reports.priceHistory': true  } },
        ],
      },
      {
        label: 'Vendor Performance',
        allKeys: ['reports.vendorPerformance'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.vendorPerformance': false } },
          { id: 'view', label: 'View', set: { 'reports.vendorPerformance': true  } },
        ],
      },
      {
        label: 'Aging',
        allKeys: ['reports.aging'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.aging': false } },
          { id: 'view', label: 'View', set: { 'reports.aging': true  } },
        ],
      },
      {
        label: 'Sales Summary',
        allKeys: ['reports.salesSummary'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.salesSummary': false } },
          { id: 'view', label: 'View', set: { 'reports.salesSummary': true  } },
        ],
      },
      {
        label: 'Sales Transactions',
        allKeys: ['reports.salesTransactions'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.salesTransactions': false } },
          { id: 'view', label: 'View', set: { 'reports.salesTransactions': true  } },
        ],
      },
      {
        label: 'Sales by Item',
        allKeys: ['reports.salesByItem'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.salesByItem': false } },
          { id: 'view', label: 'View', set: { 'reports.salesByItem': true  } },
        ],
      },
      {
        label: 'Sales by Cashier',
        allKeys: ['reports.salesByCashier'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.salesByCashier': false } },
          { id: 'view', label: 'View', set: { 'reports.salesByCashier': true  } },
        ],
      },
      {
        label: 'Hourly Breakdown',
        allKeys: ['reports.hourly'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.hourly': false } },
          { id: 'view', label: 'View', set: { 'reports.hourly': true  } },
        ],
      },
      {
        label: 'Order Lifecycle',
        feature: 'kds',
        allKeys: ['reports.orderLifecycle'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.orderLifecycle': false } },
          { id: 'view', label: 'View', set: { 'reports.orderLifecycle': true } },
        ],
      },
      {
        label: 'Kitchen vs Counter Sales',
        feature: 'kds',
        allKeys: ['reports.kitchenCounterSales'],
        levels: [
          { id: 'none', label: 'None', set: { 'reports.kitchenCounterSales': false } },
          { id: 'view', label: 'View', set: { 'reports.kitchenCounterSales': true } },
        ],
      },
    ],
  },
  {
    group: 'Settings',
    items: [
      {
        label: 'User Management',
        allKeys: ['settings.users'],
        levels: [
          { id: 'none', label: 'None', set: { 'settings.users': false } },
          { id: 'edit', label: 'Edit', set: { 'settings.users': true  } },
        ],
      },
      {
        label: 'Role Settings',
        allKeys: ['settings.roles'],
        levels: [
          { id: 'none', label: 'None', set: { 'settings.roles': false } },
          { id: 'edit', label: 'Edit', set: { 'settings.roles': true  } },
        ],
      },
      {
        label: 'Outlets',
        allKeys: ['settings.outlets'],
        levels: [
          { id: 'none', label: 'None', set: { 'settings.outlets': false } },
          { id: 'edit', label: 'Edit', set: { 'settings.outlets': true  } },
        ],
      },
      {
        label: 'Printer Settings',
        allKeys: ['settings.printers'],
        levels: [
          { id: 'none', label: 'None', set: { 'settings.printers': false } },
          { id: 'edit', label: 'Edit', set: { 'settings.printers': true  } },
        ],
      },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
const getEffectiveLevel = (item, overrides, role) => {
  const effective = {};
  for (const key of item.allKeys) {
    const def = PERMISSIONS.find((p) => p.key === key);
    const roleDefault = def ? !!def[role] : false;
    effective[key] = Object.prototype.hasOwnProperty.call(overrides, key)
      ? !!overrides[key]
      : roleDefault;
  }
  for (let i = item.levels.length - 1; i >= 0; i--) {
    const lvl = item.levels[i];
    if (Object.entries(lvl.set).every(([k, v]) => effective[k] === v)) return lvl.id;
  }
  return item.levels[0].id;
};

const applyLevel = (item, levelId, currentOverrides, role) => {
  const lvl = item.levels.find((l) => l.id === levelId);
  if (!lvl) return currentOverrides;
  const next = { ...currentOverrides };
  for (const [key, val] of Object.entries(lvl.set)) {
    const def = PERMISSIONS.find((p) => p.key === key);
    const roleDefault = def ? !!def[role] : false;
    if (val === roleDefault) {
      delete next[key];
    } else {
      next[key] = val;
    }
  }
  return next;
};

const ROLE_LABELS = {
  owner:           'Owner',
  financeManager:  'Finance Manager',
  purchaseManager: 'Purchase Manager',
  receivingStaff:  'Receiving Staff',
  cashier:         'Cashier',
  rider:           'Rider',
};

const ROLE_BADGE = {
  owner:           'bg-indigo-100 text-indigo-700',
  financeManager:  'bg-blue-100 text-blue-700',
  purchaseManager: 'bg-amber-100 text-amber-700',
  receivingStaff:  'bg-gray-100 text-gray-600',
  cashier:         'bg-emerald-100 text-emerald-700',
  rider:           'bg-cyan-100 text-cyan-700',
};

const LEVEL_STYLES = {
  none:   { base: 'border-gray-200 text-gray-400 hover:border-gray-300',          active: 'bg-slate-100 border-slate-400 text-slate-700 font-semibold shadow-sm' },
  view:   { base: 'border-gray-200 text-gray-400 hover:border-sky-300',           active: 'bg-sky-50 border-sky-400 text-sky-700 font-semibold shadow-sm' },
  manage: { base: 'border-gray-200 text-gray-400 hover:border-violet-300',        active: 'bg-violet-50 border-violet-400 text-violet-700 font-semibold shadow-sm' },
  edit:   { base: 'border-gray-200 text-gray-400 hover:border-emerald-300',       active: 'bg-emerald-50 border-emerald-400 text-emerald-700 font-semibold shadow-sm' },
  delete: { base: 'border-gray-200 text-gray-400 hover:border-rose-300',          active: 'bg-rose-50 border-rose-400 text-rose-700 font-semibold shadow-sm' },
  full:   { base: 'border-gray-200 text-gray-400 hover:border-emerald-300',       active: 'bg-emerald-50 border-emerald-400 text-emerald-700 font-semibold shadow-sm' },
  grant:  { base: 'border-gray-200 text-gray-400 hover:border-orange-300',        active: 'bg-orange-50 border-orange-400 text-orange-700 font-semibold shadow-sm' },
};

// ── Component ─────────────────────────────────────────────────────────────────
const RoleSettings = () => {
  const dispatch = useDispatch();
  const { role: currentRole, user: authUser } = useAuth();
  const { hasFeature } = useFeatures();

  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useQueryState('search', '');
  const [localPerms, setLocalPerms] = useState({});
  const [discountLimits, setDiscountLimits] = useState({});
  const [savingDiscountLimit, setSavingDiscountLimit] = useState(false);
  const savingRef = useRef({});

  const { data: payload, isLoading: loading } = useGetUsersQuery(undefined, listQueryOpts);
  const users = useMemo(() => payload?.users ?? [], [payload]);

  // Seed selection + local override editing state from the cached user list.
  useEffect(() => {
    if (users.length === 0) return;
    setSelectedId((prev) => prev ?? users[0]._id);
    const seed = {};
    const limitSeed = {};
    users.forEach((u) => { seed[u._id] = { ...(u.permissions ?? {}) }; });
    users.forEach((u) => {
      limitSeed[u._id] = Number.isFinite(Number(u.posDiscountLimitPercent))
        ? String(Number(u.posDiscountLimitPercent))
        : '100';
    });
    setLocalPerms(seed);
    setDiscountLimits(limitSeed);
  }, [users]);

  const savePermsToServer = useCallback(async (user, overrides) => {
    const key = user._id;
    if (savingRef.current[key]) return;
    savingRef.current[key] = true;
    try {
      const { data: res } = await updateUser(user._id, { permissions: overrides });
      dispatch(baseApi.util.invalidateTags(['User']));
      if (user._id === authUser?.id || user._id === authUser?._id) {
        try {
          const updated = res?.data?.user || res?.user || null;
          if (updated) {
            dispatch(setUser(updated));
          } else {
            const { data } = await getMe();
            dispatch(setUser(data.user));
          }
        } catch (_) { /* best-effort */ }
      }
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Failed to save permission.');
    } finally {
      savingRef.current[key] = false;
    }
  }, [authUser, dispatch]);

  // Owners cannot manage their own permissions — locking yourself out of
  // settings.users / settings.roles in the same session would brick the
  // account. Server enforces the same rule.
  const isSelf = useCallback(
    (u) => Boolean(u && (u._id === authUser?.id || u._id === authUser?._id)),
    [authUser]
  );

  const handleLevelChange = useCallback((user, item, levelId) => {
    if (currentRole !== 'owner') {
      toast.error('Only owners can edit permissions.');
      return;
    }
    if (isSelf(user)) {
      toast.error('You can’t edit your own permissions.');
      return;
    }
    const current = localPerms[user._id] ?? {};
    const next = applyLevel(item, levelId, current, user.role);
    setLocalPerms((prev) => ({ ...prev, [user._id]: next }));
    savePermsToServer(user, next);
  }, [currentRole, localPerms, savePermsToServer, isSelf]);

  const handleReset = useCallback(async (user) => {
    if (currentRole !== 'owner') {
      toast.error('Only owners can edit permissions.');
      return;
    }
    if (isSelf(user)) {
      toast.error('You can’t reset your own permissions.');
      return;
    }
    const empty = {};
    setLocalPerms((prev) => ({ ...prev, [user._id]: empty }));
    try {
      await updateUser(user._id, { permissions: empty });
      dispatch(baseApi.util.invalidateTags(['User']));
      toast.success(`${user.name}'s permissions reset to role defaults.`);
      if (user._id === authUser?.id || user._id === authUser?._id) {
        try { const { data } = await getMe(); dispatch(setUser(data.user)); } catch (_) {}
      }
    } catch (err) {
      toast.error('Failed to reset permissions.');
    }
  }, [currentRole, authUser, dispatch, isSelf]);

  const handleSaveDiscountLimit = useCallback(async (user) => {
    if (currentRole !== 'owner' || isSelf(user)) return;
    const value = Number(discountLimits[user._id]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      toast.error('Discount limit must be between 0 and 100%.');
      return;
    }
    setSavingDiscountLimit(true);
    try {
      await updateUser(user._id, { posDiscountLimitPercent: value });
      dispatch(baseApi.util.invalidateTags(['User']));
      toast.success(`${user.name}'s POS discount limit is now ${value}%.`);
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Failed to save discount limit.');
    } finally {
      setSavingDiscountLimit(false);
    }
  }, [currentRole, discountLimits, dispatch, isSelf]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.trim().toLowerCase();
    return users.filter((u) =>
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (ROLE_LABELS[u.role] ?? '').toLowerCase().includes(q)
    );
  }, [users, search]);

  const selectedUser = users.find((u) => u._id === selectedId);

  // Count overrides across the selected user's permissions
  const overrideCount = useMemo(() => {
    if (!selectedUser) return 0;
    return Object.keys(localPerms[selectedUser._id] ?? {}).length;
  }, [selectedUser, localPerms]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isOwner = currentRole === 'owner';

  return (
    <div className="space-y-5 pb-8">
      {/* Read-only banner for non-owners */}
      {!isOwner && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-amber-50 border-amber-100">
          <Info size={18} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700">
            <span className="font-semibold">Read-only mode</span> — only Owners can change role permissions.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
        {/* ── User list card ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Users size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Users</h2>
              <p className="text-xs text-gray-400 mt-0.5">{users.length} total · click to edit</p>
            </div>
          </div>

          <div className="p-3">
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users…"
                className="w-full pl-8 pr-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
              />
            </div>
            <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-gray-400">No users match.</li>
              ) : filteredUsers.map((u) => {
                const initials = u.name?.charAt(0)?.toUpperCase() ?? '?';
                const isActive = u._id === selectedId;
                return (
                  <li key={u._id}>
                    <button
                      onClick={() => setSelectedId(u._id)}
                      className={clsx(
                        'w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors',
                        isActive
                          ? 'bg-indigo-50 ring-1 ring-indigo-200'
                          : 'hover:bg-slate-50'
                      )}
                    >
                      <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                        isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      )}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={clsx('text-sm font-medium truncate', isActive ? 'text-indigo-700' : 'text-gray-700')}>
                          {u.name}
                        </p>
                        <span className={clsx('inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold mt-0.5', ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-600')}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ── Permission editor ──────────────────────────────────────────── */}
        <div className="space-y-5">
          {!selectedUser ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
              <ShieldCheck size={36} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">Select a user to edit permissions.</p>
              <p className="text-xs mt-1">Pick a teammate from the list on the left.</p>
            </div>
          ) : (
            <>
              {/* Self-edit banner */}
              {isSelf(selectedUser) && (
                <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-slate-50 border-slate-200">
                  <Lock size={18} className="text-slate-500 shrink-0" />
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">You can’t edit your own permissions.</span>{' '}
                    To change anything here, ask another owner to do it.
                  </p>
                </div>
              )}

              {/* Selected user header */}
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 text-lg font-bold">
                    {selectedUser.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-gray-900 truncate">{selectedUser.name}</h2>
                      {isSelf(selectedUser) && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                          You
                        </span>
                      )}
                      <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', ROLE_BADGE[selectedUser.role] || 'bg-gray-100 text-gray-600')}>
                        {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                      </span>
                      {overrideCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                          <Wrench size={11} /> {overrideCount} override{overrideCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{selectedUser.email}</p>
                  </div>
                </div>
                {isOwner && overrideCount > 0 && !isSelf(selectedUser) && (
                  <button
                    onClick={() => handleReset(selectedUser)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100 px-3 py-2 rounded-lg transition"
                  >
                    <RotateCcw size={14} /> Reset to defaults
                  </button>
                )}
              </div>

              {/* Level legend */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Permission levels</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'none',   icon: Lock,        label: 'None',   sub: 'No access',                          color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-100'  },
                    { id: 'view',   icon: Eye,         label: 'View',   sub: 'Read only',                          color: 'text-sky-600',     bg: 'bg-sky-50',     border: 'border-sky-100'    },
                    { id: 'manage', icon: Wrench,      label: 'Manage', sub: 'Create & act, no final approval',    color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-100' },
                    { id: 'edit',   icon: Pencil,      label: 'Edit',   sub: 'Full control including approval',    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                  ].map((l) => (
                    <div key={l.id} className={clsx('flex items-center gap-2.5 p-3 rounded-xl border', l.bg, l.border)}>
                      <div className={clsx('w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm', l.color)}>
                        <l.icon size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className={clsx('text-xs font-bold', l.color)}>{l.label}</p>
                        <p className="text-[10px] text-gray-500 truncate">{l.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sections */}
              <div className="space-y-4">
                {NAV_SECTIONS.map((section) => {
                  if (section.feature && !hasFeature(section.feature)) return null;
                  const visibleItems = section.items.filter((item) => !item.feature || hasFeature(item.feature));
                  if (visibleItems.length === 0) return null;
                  return (
                  <div
                    key={section.group}
                    role="region"
                    aria-label={`${section.group} permissions`}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-slate-50/40 px-4 py-4 sm:px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                          <ShieldCheck size={15} />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-800">{section.group}</h3>
                          <p className="text-xs text-gray-400 mt-0.5">{visibleItems.length} permission{visibleItems.length === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {visibleItems.map((item) => {
                        const overrides = localPerms[selectedUser._id] ?? {};
                        const activeLevel = getEffectiveLevel(item, overrides, selectedUser.role);
                        const isOverridden = item.allKeys.some((k) =>
                          Object.prototype.hasOwnProperty.call(overrides, k)
                        );
                        return (
                          <div key={item.label} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50/40 sm:gap-4 sm:px-5">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate">{item.label}</p>
                              {isOverridden && (
                                <span
                                  title="Differs from role default"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700"
                                >
                                  <Wrench size={9} /> custom
                                </span>
                              )}
                            </div>
                            <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto sm:justify-end">
                              {item.levels.map((lvl) => {
                                const styles = LEVEL_STYLES[lvl.id] ?? LEVEL_STYLES.edit;
                                const active = activeLevel === lvl.id;
                                const locked = !isOwner || isSelf(selectedUser);
                                return (
                                  <button
                                    key={lvl.id}
                                    onClick={() => handleLevelChange(selectedUser, item, lvl.id)}
                                    disabled={locked}
                                    className={clsx(
                                      'px-3 py-1.5 text-xs rounded-lg border transition',
                                      active ? styles.active : `bg-white ${styles.base}`,
                                      locked && 'cursor-not-allowed opacity-60'
                                    )}
                                  >
                                    {lvl.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {section.group === 'POS Terminal' && (
                        <div className="flex items-center justify-between px-5 py-4 gap-4 flex-wrap bg-rose-50/40">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800">POS discount limit</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Maximum combined item and order discount for this user. “Apply Discount” must also be granted.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="relative">
                              <span className="sr-only">Maximum POS discount percentage</span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={discountLimits[selectedUser._id] ?? '100'}
                                onChange={(e) => setDiscountLimits((prev) => ({
                                  ...prev,
                                  [selectedUser._id]: e.target.value,
                                }))}
                                disabled={!isOwner || isSelf(selectedUser)}
                                className="w-24 rounded-lg border border-rose-200 bg-white py-1.5 pl-3 pr-7 text-sm font-semibold text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                              />
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-rose-400"
                              >
                                %
                              </span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleSaveDiscountLimit(selectedUser)}
                              disabled={!isOwner || isSelf(selectedUser) || savingDiscountLimit}
                              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingDiscountLimit ? 'Saving…' : 'Save limit'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoleSettings;
