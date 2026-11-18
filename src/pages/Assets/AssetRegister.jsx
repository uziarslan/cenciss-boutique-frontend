import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  CalendarClock,
  CircleDollarSign,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { Link } from 'react-router';
import toast from 'react-hot-toast';
import {
  createAsset,
  getAssetCategories,
  getAssetMeta,
  getAssets,
} from '../../api/assetApi';
import usePermissions from '../../hooks/usePermissions';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import FilterBar from '../../components/UI/FilterBar';
import HeroBanner from '../../components/UI/HeroBanner';
import SearchableSelect from '../../components/UI/SearchableSelect';
import StatusChip from '../../components/UI/StatusChip';
import { useQueryFilters } from '../../hooks/useQueryState';

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const blankForm = {
  name: '',
  category: '',
  outlet: '',
  location: '',
  custodianName: '',
  serialNumber: '',
  modelNumber: '',
  manufacturer: '',
  quantity: 1,
  originalUnitCost: 0,
  acquisitionDate: new Date().toISOString().slice(0, 10),
  usefulLifeMonths: '',
  residualValue: 0,
  condition: 'good',
  source: 'manual',
  accountingLinked: false,
  notes: '',
};

const Stat = ({ icon: Icon, label, value, tone = 'indigo' }) => {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone]}`}><Icon size={19} /></div>
        <div>
          <p className="text-xs font-semibold text-slate-400">{label}</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
    </Card>
  );
};

const CreateAssetModal = ({ outlets, categories, initialOutlet, onClose, onCreated }) => {
  const [form, setForm] = useState({ ...blankForm, outlet: initialOutlet || outlets[0]?._id || '' });
  const [saving, setSaving] = useState(false);
  const category = categories.find((row) => row._id === form.category);
  const serialized = category?.trackingMode !== 'bulk';
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.category || !form.outlet) {
      toast.error('Name, category and outlet are required.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await createAsset({
        ...form,
        quantity: serialized ? 1 : Number(form.quantity),
        originalUnitCost: Number(form.originalUnitCost),
        usefulLifeMonths: form.usefulLifeMonths ? Number(form.usefulLifeMonths) : undefined,
        residualValue: Number(form.residualValue),
      });
      toast.success(`${data.data.asset.assetNumber} added to the register.`);
      onCreated();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Asset could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
          <div><h2 className="text-lg font-bold text-slate-900">Add asset</h2><p className="text-xs text-slate-400">Serialized machinery or a bulk asset lot</p></div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Asset name *</span><input className={fieldClass} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Main kitchen oven" /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Category *</span><SearchableSelect options={categories.map((row) => ({ value: row._id, label: row.name, meta: `${row.code} · ${row.trackingMode}` }))} value={form.category} onChange={(value) => {
            const selected = categories.find((row) => row._id === value);
            setForm((old) => ({
              ...old,
              category: value,
              usefulLifeMonths: selected?.defaultUsefulLifeMonths || old.usefulLifeMonths,
              quantity: selected?.trackingMode === 'serialized' ? 1 : old.quantity,
            }));
          }} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Outlet *</span><SearchableSelect options={outlets.map((row) => ({ value: row._id, label: row.name, meta: row.code }))} value={form.outlet} onChange={(value) => set('outlet', value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Location</span><input className={fieldClass} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Kitchen · Ground floor" /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Custodian</span><input className={fieldClass} value={form.custodianName} onChange={(e) => set('custodianName', e.target.value)} placeholder="Responsible person" /></label>
          {serialized ? (
            <label><span className="mb-1 block text-xs font-semibold text-slate-500">Serial number</span><input className={fieldClass} value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} placeholder="Manufacturer serial" /></label>
          ) : (
            <label><span className="mb-1 block text-xs font-semibold text-slate-500">Opening quantity *</span><input type="number" min="0.01" step="0.01" className={fieldClass} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></label>
          )}
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Manufacturer</span><input className={fieldClass} value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Model</span><input className={fieldClass} value={form.modelNumber} onChange={(e) => set('modelNumber', e.target.value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Unit cost</span><input type="number" min="0" step="0.01" className={fieldClass} value={form.originalUnitCost} onChange={(e) => set('originalUnitCost', e.target.value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Acquisition date</span><input type="date" className={fieldClass} value={form.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Useful life (months)</span><input type="number" min="1" className={fieldClass} value={form.usefulLifeMonths} onChange={(e) => set('usefulLifeMonths', e.target.value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Residual value</span><input type="number" min="0" step="0.01" className={fieldClass} value={form.residualValue} onChange={(e) => set('residualValue', e.target.value)} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Condition</span><select className={fieldClass} value={form.condition} onChange={(e) => set('condition', e.target.value)}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option><option value="underRepair">Under repair</option></select></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Register source</span><select className={fieldClass} value={form.source} onChange={(e) => set('source', e.target.value)}><option value="manual">New/manual record</option><option value="openingImport">Existing opening asset</option></select></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">Notes</span><textarea rows={3} className={fieldClass} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></label>
          {form.source === 'openingImport' && (
            <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <input type="checkbox" className="mt-1" checked={form.accountingLinked} onChange={(e) => set('accountingLinked', e.target.checked)} />
              <span><strong>Already included in accounting.</strong><span className="mt-1 block text-xs text-amber-700">This marks it as linked to an existing opening balance. No duplicate journal will be created.</span></span>
            </label>
          )}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add asset'}</Button>
        </div>
      </form>
    </div>
  );
};

const AssetRegister = () => {
  const { has } = usePermissions();
  const [meta, setMeta] = useState({ outlets: [] });
  const [categories, setCategories] = useState([]);
  const [payload, setPayload] = useState({ assets: [], summary: {}, total: 0 });
  const [filters, setFilters] = useQueryFilters(
    { outlet: '', category: '', q: '', status: '' },
    { q: 'search' },
  );
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadReference = useCallback(async () => {
    try {
      const [metaRes, categoryRes] = await Promise.all([getAssetMeta(), getAssetCategories()]);
      setMeta(metaRes.data.data);
      setCategories(categoryRes.data.data);
      if (metaRes.data.data.outlets.length === 1) {
        setFilters((old) => ({ ...old, outlet: metaRes.data.data.outlets[0]._id }));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Asset setup could not be loaded.');
    }
  }, [setFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getAssets({
        ...filters,
        outlet: filters.outlet || undefined,
        category: filters.category || undefined,
        status: filters.status || undefined,
        q: filters.q || undefined,
      });
      setPayload(data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Assets could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadReference(); }, [loadReference]);
  useEffect(() => {
    const timer = setTimeout(load, filters.q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.q]);

  const outletOptions = useMemo(() => meta.outlets.map((row) => ({ value: row._id, label: row.name, meta: row.code })), [meta.outlets]);
  const summary = payload.summary || {};

  return (
    <div className="space-y-5">
      <HeroBanner
        eyebrow="Asset control"
        title="Asset Register"
        subtitle="Machinery, equipment and bulk durable items by outlet, location and custodian."
        actions={has('assets.manage') && <Button icon={Plus} onClick={() => setShowCreate(true)}>Add asset</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Boxes} label="Registered assets" value={summary.assets || 0} />
        <Stat icon={Boxes} label="Physical quantity" value={Number(summary.quantity || 0).toLocaleString()} tone="emerald" />
        <Stat icon={CircleDollarSign} label="Net book value" value={money(summary.netBookValue)} tone="violet" />
        <Stat icon={CalendarClock} label="Due for audit" value={summary.dueForAudit || 0} tone="amber" />
      </div>
      <FilterBar>
        <label className="relative min-w-[260px] flex-1"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input className={`${fieldClass} pl-9`} value={filters.q} onChange={(e) => setFilters((old) => ({ ...old, q: e.target.value }))} placeholder="Search asset, code or serial…" /></label>
        <div className="min-w-[210px] flex-1"><SearchableSelect options={[{ value: '', label: 'All enabled outlets' }, ...outletOptions]} value={filters.outlet} onChange={(value) => setFilters((old) => ({ ...old, outlet: value }))} /></div>
        <div className="min-w-[210px] flex-1"><SearchableSelect options={[{ value: '', label: 'All categories' }, ...categories.map((row) => ({ value: row._id, label: row.name, meta: row.code }))]} value={filters.category} onChange={(value) => setFilters((old) => ({ ...old, category: value }))} /></div>
        <div className="min-w-[210px] flex-1"><SearchableSelect searchable={false} options={[{ value: '', label: 'All statuses' }, ...['active', 'underRepair', 'missing', 'writtenOff', 'disposed', 'inactive'].map((value) => ({ value, label: value }))]} value={filters.status} onChange={(value) => setFilters((old) => ({ ...old, status: value }))} /></div>
      </FilterBar>
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-3">Asset</th><th className="px-4 py-3">Outlet / Location</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Gross cost</th><th className="px-4 py-3">Condition</th><th className="px-5 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">Loading asset register…</td></tr>
                : payload.assets?.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">No assets match these filters.</td></tr>
                  : payload.assets.map((asset) => (
                    <tr key={asset._id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3"><Link to={`/assets/register/${asset._id}`} className="font-semibold text-indigo-600 hover:underline">{asset.name}</Link><p className="font-mono text-[11px] text-slate-400">{asset.assetNumber}{asset.serialNumber ? ` · ${asset.serialNumber}` : ''}</p></td>
                      <td className="px-4 py-3"><p className="font-medium text-slate-700">{asset.outlet?.name}</p><p className="text-xs text-slate-400">{asset.location || 'No location'}</p></td>
                      <td className="px-4 py-3 text-slate-600">{asset.category?.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{asset.quantity} {asset.unit}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{money(asset.grossCarryingAmount ?? asset.originalCost)}</td>
                      <td className="px-4 py-3 capitalize text-slate-600">{asset.condition}</td>
                      <td className="px-5 py-3"><StatusChip status={asset.status} /></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>
      {showCreate && (
        <CreateAssetModal
          outlets={meta.outlets}
          categories={categories}
          initialOutlet={filters.outlet}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
};

export default AssetRegister;
