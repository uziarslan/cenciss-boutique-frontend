import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Plus, X } from 'lucide-react';
import { Link } from 'react-router';
import toast from 'react-hot-toast';
import {
  createAssetAudit,
  getAssetAudits,
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

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

const CreateAuditModal = ({ outlets, categories, onClose, onCreated }) => {
  const [form, setForm] = useState({
    title: '',
    outlet: outlets[0]?._id || '',
    scopeType: 'all',
    category: '',
    location: '',
    assetIds: [],
    scheduledFor: '',
    blindCount: true,
    notes: '',
  });
  const [assets, setAssets] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (form.scopeType !== 'selected' || !form.outlet) return;
    getAssets({ outlet: form.outlet, limit: 100 })
      .then(({ data }) => setAssets(data.data.assets || []))
      .catch(() => setAssets([]));
  }, [form.scopeType, form.outlet]);
  const toggleAsset = (id) => setForm((old) => ({
    ...old,
    assetIds: old.assetIds.includes(id)
      ? old.assetIds.filter((value) => value !== id)
      : [...old.assetIds, id],
  }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await createAssetAudit({
        title: form.title,
        outlet: form.outlet,
        scope: {
          type: form.scopeType,
          category: form.category || null,
          location: form.location,
          assetIds: form.assetIds,
        },
        scheduledFor: form.scheduledFor || null,
        blindCount: form.blindCount,
        notes: form.notes,
      });
      toast.success(`${data.data.auditNumber} created.`);
      onCreated();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Audit could not be created.');
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-5"><div><h2 className="text-lg font-bold text-slate-900">Schedule asset audit</h2><p className="text-xs text-slate-400">The expected register is snapshotted when counting starts</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        <div className="space-y-4 p-6">
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Audit title</span><input className={fieldClass} value={form.title} onChange={(e) => setForm((old) => ({ ...old, title: e.target.value }))} placeholder="Quarterly equipment audit" /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Outlet *</span><SearchableSelect options={outlets.map((row) => ({ value: row._id, label: row.name, meta: row.code }))} value={form.outlet} onChange={(value) => setForm((old) => ({ ...old, outlet: value, assetIds: [] }))} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Scope</span><select className={fieldClass} value={form.scopeType} onChange={(e) => setForm((old) => ({ ...old, scopeType: e.target.value, assetIds: [] }))}><option value="all">All active assets</option><option value="category">One category</option><option value="location">One location</option><option value="selected">Selected assets</option></select></label>
          {form.scopeType === 'category' && <SearchableSelect options={categories.map((row) => ({ value: row._id, label: row.name, meta: row.code }))} value={form.category} onChange={(value) => setForm((old) => ({ ...old, category: value }))} placeholder="Choose category" />}
          {form.scopeType === 'location' && <input className={fieldClass} value={form.location} onChange={(e) => setForm((old) => ({ ...old, location: e.target.value }))} placeholder="Exact location used on asset records" />}
          {form.scopeType === 'selected' && (
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
              {assets.map((asset) => <label key={asset._id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"><input type="checkbox" checked={form.assetIds.includes(asset._id)} onChange={() => toggleAsset(asset._id)} /><span><span className="block text-sm font-semibold text-slate-700">{asset.name}</span><span className="text-xs text-slate-400">{asset.assetNumber} · {asset.location || 'No location'}</span></span></label>)}
              {assets.length === 0 && <p className="py-5 text-center text-sm text-slate-400">No assets found for this outlet.</p>}
            </div>
          )}
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Scheduled date/time</span><input type="datetime-local" className={fieldClass} value={form.scheduledFor} onChange={(e) => setForm((old) => ({ ...old, scheduledFor: e.target.value }))} /></label>
          <label className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4"><input type="checkbox" className="mt-1" checked={form.blindCount} onChange={(e) => setForm((old) => ({ ...old, blindCount: e.target.checked }))} /><span className="text-sm text-indigo-950"><strong>Blind count</strong><span className="mt-1 block text-xs text-indigo-700">Counters cannot see expected quantities until review, reducing confirmation bias.</span></span></label>
          <textarea rows={3} className={fieldClass} value={form.notes} onChange={(e) => setForm((old) => ({ ...old, notes: e.target.value }))} placeholder="Instructions or notes" />
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white/95 px-6 py-4"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create audit'}</Button></div>
      </form>
    </div>
  );
};

const AssetAudits = () => {
  const { has } = usePermissions();
  const [meta, setMeta] = useState({ outlets: [] });
  const [categories, setCategories] = useState([]);
  const [audits, setAudits] = useState([]);
  const [filters, setFilters] = useQueryFilters({ outlet: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const loadReference = useCallback(async () => {
    try {
      const [metaRes, catRes] = await Promise.all([getAssetMeta(), getAssetCategories()]);
      setMeta(metaRes.data.data);
      setCategories(catRes.data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Audit setup could not be loaded.');
    }
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getAssetAudits({
        outlet: filters.outlet || undefined,
        status: filters.status || undefined,
      });
      setAudits(data.data.audits || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Asset audits could not be loaded.');
    } finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { loadReference(); }, [loadReference]);
  useEffect(() => { load(); }, [load]);
  const openCount = useMemo(() => audits.filter((row) => ['inProgress', 'recountRequested'].includes(row.status)).length, [audits]);

  return (
    <div className="space-y-5">
      <HeroBanner eyebrow="Physical verification" title="Asset Audits" subtitle={`${openCount} audit${openCount === 1 ? '' : 's'} currently open for counting.`} actions={has('assetAudits.create') && <Button icon={Plus} onClick={() => setShowCreate(true)}>New audit</Button>} />
      <FilterBar><div className="grid w-full gap-3 sm:grid-cols-2"><SearchableSelect options={[{ value: '', label: 'All enabled outlets' }, ...meta.outlets.map((row) => ({ value: row._id, label: row.name, meta: row.code }))]} value={filters.outlet} onChange={(value) => setFilters((old) => ({ ...old, outlet: value }))} /><SearchableSelect searchable={false} options={[{ value: '', label: 'All statuses' }, ...['draft', 'scheduled', 'inProgress', 'submitted', 'underReview', 'recountRequested', 'approved', 'rejected'].map((value) => ({ value, label: value }))]} value={filters.status} onChange={(value) => setFilters((old) => ({ ...old, status: value }))} /></div></FilterBar>
      <div className="grid gap-4 lg:grid-cols-2">
        {loading ? <Card><p className="py-10 text-center text-sm text-slate-400">Loading audits…</p></Card>
          : audits.length === 0 ? <Card><div className="py-12 text-center"><ClipboardCheck size={28} className="mx-auto text-slate-300" /><p className="mt-3 text-sm text-slate-400">No asset audits found.</p></div></Card>
            : audits.map((audit) => (
              <Link key={audit._id} to={`/assets/audits/${audit._id}`} className="block">
                <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-xs font-bold text-indigo-600">{audit.auditNumber}</p><h2 className="mt-1 font-bold text-slate-900">{audit.title || `${audit.scope?.type || 'All'} asset audit`}</h2><p className="mt-1 text-xs text-slate-400">{audit.outlet?.name} · {audit.blindCount ? 'Blind count' : 'Open count'}</p></div><StatusChip status={audit.status} /></div>
                  <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-center"><div><p className="text-lg font-bold text-slate-900">{audit.totalAssets || 0}</p><p className="text-[10px] uppercase text-slate-400">Assets</p></div><div><p className="text-lg font-bold text-emerald-600">{audit.countedAssets || 0}</p><p className="text-[10px] uppercase text-slate-400">Counted</p></div><div><p className="text-lg font-bold text-amber-600">{audit.varianceLines || 0}</p><p className="text-[10px] uppercase text-slate-400">Variances</p></div></div>
                  <p className="mt-3 text-xs text-slate-400">{audit.scheduledFor ? `Scheduled ${new Date(audit.scheduledFor).toLocaleString()}` : `Created ${new Date(audit.createdAt).toLocaleDateString()}`}</p>
                </Card>
              </Link>
            ))}
      </div>
      {showCreate && <CreateAuditModal outlets={meta.outlets} categories={categories} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
};

export default AssetAudits;
