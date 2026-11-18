// Turns raw audit-log entries into human-readable text for the viewer.

const MODULE_LABELS = {
  payments: 'Payment', invoices: 'Invoice', 'purchase-orders': 'Purchase Order',
  grns: 'Goods Receipt', vendors: 'Vendor', products: 'Item', inventory: 'Kitchen', 'stock-issues': 'Stock Issue',
  menu: 'Menu', accounting: 'Accounting', users: 'User', salary: 'Salary',
  allowances: 'Allowance', loyalty: 'Loyalty', tax: 'Tax Settings', outlets: 'Outlet',
  pos: 'POS', reports: 'Report', tables: 'Table', auth: 'Account', customers: 'Customer',
  attendance: 'Attendance', onboarding: 'Onboarding', 'attendance-devices': 'Attendance Device',
};

const moduleLabel = (m) => MODULE_LABELS[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : 'System');

const VERB = {
  create: { word: 'Created', cls: 'bg-emerald-50 text-emerald-700' },
  update: { word: 'Updated', cls: 'bg-amber-50 text-amber-700' },
  delete: { word: 'Deleted', cls: 'bg-rose-50 text-rose-700' },
};

// A friendly title + a colored verb chip for a log row.
export const describeAction = (log) => {
  if (log.action === 'auth.login') return { title: 'Signed in', verb: 'Sign in', cls: 'bg-indigo-50 text-indigo-700' };
  if (log.action === 'auth.logout') return { title: 'Signed out', verb: 'Sign out', cls: 'bg-slate-100 text-slate-600' };
  if (log.action === 'auth.login_failed') return { title: 'Failed sign-in attempt', verb: 'Failed', cls: 'bg-rose-100 text-rose-700' };

  const [, verbKey] = (log.action || '').split('.');
  const v = VERB[verbKey];
  const label = moduleLabel(log.module);
  if (v) return { title: `${v.word} ${label.toLowerCase()}`, verb: v.word, cls: v.cls };
  return { title: `${label} · ${log.method || ''}`.trim(), verb: log.method || 'Action', cls: 'bg-slate-100 text-slate-600' };
};

// camelCase / snake_case → "Title Case".
export const humanizeKey = (k) =>
  String(k)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/g, 'ID');

// Render a single value as readable text.
export const humanizeValue = (v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString();
  if (Array.isArray(v)) return v.length ? `${v.length} item${v.length === 1 ? '' : 's'}` : 'none';
  if (typeof v === 'object') {
    // Common nested shapes: show a name if present, else a compact summary.
    if (v.name) return v.name;
    const keys = Object.keys(v);
    return keys.length ? `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''} }` : '—';
  }
  return String(v);
};

// Flatten an audit before/after payload into [{ key, value }] readable pairs.
export const toPairs = (obj) => {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).map(([k, v]) => ({ key: humanizeKey(k), value: humanizeValue(v) }));
};
