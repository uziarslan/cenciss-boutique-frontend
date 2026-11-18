import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  createAssetCategory,
  getAssetAccountOptions,
  getAssetCategories,
  updateAssetCategory,
} from '../../api/assetApi';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import HeroBanner from '../../components/UI/HeroBanner';
import SearchableSelect from '../../components/UI/SearchableSelect';

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const blank = {
  code: '',
  name: '',
  description: '',
  trackingMode: 'serialized',
  defaultUnit: 'unit',
  defaultUsefulLifeMonths: 60,
  defaultResidualValuePercent: 0,
  depreciationMethod: 'straightLine',
  auditFrequencyDays: 90,
  capitalisationThreshold: 0,
  accounts: {
    asset: '',
    accumulatedDepreciation: '',
    depreciationExpense: '',
    lossOnDisposal: '',
    gainOnDisposal: '',
  },
  isActive: true,
};

const CategoryModal = ({ category, accounts, onClose, onSaved }) => {
  const [form, setForm] = useState(category ? {
    ...blank,
    ...category,
    accounts: Object.fromEntries(Object.keys(blank.accounts).map((key) => [
      key,
      category.accounts?.[key]?._id || category.accounts?.[key] || '',
    ])),
  } : blank);
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const setAccount = (key, value) => setForm((old) => ({ ...old, accounts: { ...old.accounts, [key]: value } }));
  const optionFor = (types, normalBalance) => accounts
    .filter((row) => types.includes(row.type) && (!normalBalance || row.normalBalance === normalBalance))
    .map((row) => ({ value: row._id, label: `${row.code} — ${row.name}`, meta: row.subType }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (category) await updateAssetCategory(category._id, form);
      else await createAssetCategory(form);
      toast.success(category ? 'Category updated.' : 'Asset category created.');
      onSaved();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Category could not be saved.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-5">
          <div><h2 className="text-lg font-bold text-slate-900">{category ? 'Edit category' : 'New asset category'}</h2><p className="text-xs text-slate-400">Tracking rules and accounting mappings</p></div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Code *</span><input className={fieldClass} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="MACH" /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Category name *</span><input className={fieldClass} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Machinery & Equipment" /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Tracking</span><select className={fieldClass} value={form.trackingMode} onChange={(e) => set('trackingMode', e.target.value)}><option value="serialized">Serialized — one label per unit</option><option value="bulk">Bulk — quantity-based lot</option></select></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Default unit</span><input className={fieldClass} value={form.defaultUnit} onChange={(e) => set('defaultUnit', e.target.value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Useful life (months)</span><input type="number" min="1" className={fieldClass} value={form.defaultUsefulLifeMonths} onChange={(e) => set('defaultUsefulLifeMonths', Number(e.target.value))} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Residual value %</span><input type="number" min="0" max="100" step="0.01" className={fieldClass} value={form.defaultResidualValuePercent} onChange={(e) => set('defaultResidualValuePercent', Number(e.target.value))} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Audit every (days)</span><input type="number" min="1" className={fieldClass} value={form.auditFrequencyDays} onChange={(e) => set('auditFrequencyDays', Number(e.target.value))} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Depreciation</span><select className={fieldClass} value={form.depreciationMethod} onChange={(e) => set('depreciationMethod', e.target.value)}><option value="straightLine">Straight line</option><option value="none">No depreciation</option></select></label>
          <div className="sm:col-span-2 mt-2 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"><h3 className="text-sm font-bold text-indigo-950">Chart of Accounts mapping</h3><p className="mt-1 text-xs text-indigo-700">The fixed-asset head is required. Other heads are required before depreciation or write-off posting.</p></div>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">Fixed asset account *</span><SearchableSelect options={optionFor(['asset'], 'debit')} value={form.accounts.asset} onChange={(value) => setAccount('asset', value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Accumulated depreciation</span><SearchableSelect options={optionFor(['asset'], 'credit')} value={form.accounts.accumulatedDepreciation} onChange={(value) => setAccount('accumulatedDepreciation', value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Depreciation expense</span><SearchableSelect options={optionFor(['expense'])} value={form.accounts.depreciationExpense} onChange={(value) => setAccount('depreciationExpense', value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Loss / write-off expense</span><SearchableSelect options={optionFor(['expense'])} value={form.accounts.lossOnDisposal} onChange={(value) => setAccount('lossOnDisposal', value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Disposal gain</span><SearchableSelect options={optionFor(['revenue'])} value={form.accounts.gainOnDisposal} onChange={(value) => setAccount('gainOnDisposal', value)} /></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">Description</span><textarea rows={3} className={fieldClass} value={form.description} onChange={(e) => set('description', e.target.value)} /></label>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white/95 px-6 py-4"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save category'}</Button></div>
      </form>
    </div>
  );
};

const AssetCategories = () => {
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryRes, accountRes] = await Promise.all([
        getAssetCategories({ active: 'all' }),
        getAssetAccountOptions(),
      ]);
      setCategories(categoryRes.data.data);
      setAccounts(accountRes.data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Asset categories could not be loaded.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const activeCount = useMemo(() => categories.filter((row) => row.isActive).length, [categories]);

  return (
    <div className="space-y-5">
      <HeroBanner eyebrow="Asset setup" title="Categories & COA Mapping" subtitle={`${activeCount} active categories. Account mappings are snapshotted onto each asset.`} actions={<Button icon={Plus} onClick={() => setEditing({})}>New category</Button>} />
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Category</th><th className="px-4 py-3">Tracking</th><th className="px-4 py-3">Audit cycle</th><th className="px-4 py-3">Fixed asset head</th><th className="px-4 py-3">Depreciation heads</th><th className="px-5 py-3"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">Loading categories…</td></tr>
                : categories.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">Create the first category to start the asset register.</td></tr>
                  : categories.map((row) => (
                    <tr key={row._id} className={!row.isActive ? 'opacity-50' : ''}>
                      <td className="px-5 py-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="font-mono text-xs text-indigo-500">{row.code}</p></td>
                      <td className="px-4 py-3 capitalize text-slate-600">{row.trackingMode}</td>
                      <td className="px-4 py-3 text-slate-600">{row.auditFrequencyDays} days</td>
                      <td className="px-4 py-3 text-slate-600">{row.accounts?.asset ? `${row.accounts.asset.code} — ${row.accounts.asset.name}` : 'Not mapped'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{row.depreciationMethod === 'none' ? 'No depreciation' : row.accounts?.accumulatedDepreciation && row.accounts?.depreciationExpense ? 'Configured' : 'Incomplete'}</td>
                      <td className="px-5 py-3 text-right"><button onClick={() => setEditing(row)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Pencil size={15} /></button></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && <CategoryModal category={editing._id ? editing : null} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
};

export default AssetCategories;
