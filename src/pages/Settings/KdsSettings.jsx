import { useEffect, useState } from 'react';
import { ChefHat, Clock3, Power, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { getOutlets, updateOutlet } from '../../api/outletApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import Button from '../../components/UI/Button';
import useQueryState from '../../hooks/useQueryState';

const KdsSettings = () => {
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useQueryState('outlet', '');
  const [enabled, setEnabled] = useState(false);
  const [warningMinutes, setWarningMinutes] = useState(15);
  const [criticalMinutes, setCriticalMinutes] = useState(25);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOutlets({ limit: 100 })
      .then(({ data }) => {
        const rows = data?.data || [];
        setOutlets(rows);
        setOutletId((current) => rows.some((row) => String(row._id) === String(current))
          ? current
          : rows[0]?._id || '');
      })
      .catch(() => toast.error('Could not load outlets.'))
      .finally(() => setLoading(false));
  }, [setOutletId]);

  useEffect(() => {
    const outlet = outlets.find((row) => row._id === outletId);
    if (!outlet) return;
    setEnabled(outlet.kds?.enabled === true);
    setWarningMinutes(Number(outlet.kds?.warningMinutes || 15));
    setCriticalMinutes(Number(outlet.kds?.criticalMinutes || 25));
  }, [outletId, outlets]);

  const save = async () => {
    if (!outletId) return;
    if (criticalMinutes < warningMinutes) {
      toast.error('Critical time must be at least the warning time.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await updateOutlet(outletId, {
        kds: { enabled, warningMinutes: Number(warningMinutes), criticalMinutes: Number(criticalMinutes) },
      });
      const updated = data?.data;
      setOutlets((current) => current.map((row) => row._id === outletId ? { ...row, ...updated } : row));
      window.dispatchEvent(new Event('kds-settings-changed'));
      toast.success(enabled ? 'KDS enabled for this outlet.' : 'KDS disabled for this outlet.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save KDS settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-orange-100 p-2.5 text-orange-700"><ChefHat size={22} /></div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Kitchen Display System</h2>
            <p className="mt-1 text-sm text-slate-500">Enable KDS independently per outlet. Paper kitchen printing continues unchanged.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Store size={13} /> Outlet</label>
            <SearchableSelect
              options={outlets.map((outlet) => ({ value: outlet._id, label: outlet.name, meta: outlet.code }))}
              value={outletId}
              onChange={setOutletId}
              disabled={loading}
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Power size={13} /> Status</label>
            <button
              type="button"
              onClick={() => setEnabled((value) => !value)}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
            >
              <span><span className="block text-sm font-bold">{enabled ? 'KDS is on' : 'KDS is off'}</span><span className="text-xs opacity-75">{enabled ? 'New kitchen sends will appear on the board.' : 'Current POS behaviour only.'}</span></span>
              <span className={`relative h-7 w-12 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? 'left-6' : 'left-1'}`} /></span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="rounded-xl border border-slate-200 p-4">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-700"><Clock3 size={14} className="text-amber-500" /> Warning after</span>
            <input type="number" min="1" max="240" value={warningMinutes} onChange={(event) => setWarningMinutes(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2" />
            <span className="mt-1 block text-xs text-slate-400">Minutes before the ticket turns amber.</span>
          </label>
          <label className="rounded-xl border border-slate-200 p-4">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-700"><Clock3 size={14} className="text-rose-500" /> Critical after</span>
            <input type="number" min="1" max="240" value={criticalMinutes} onChange={(event) => setCriticalMinutes(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2" />
            <span className="mt-1 block text-xs text-slate-400">Minutes before the ticket turns red.</span>
          </label>
        </div>

        <div className="mt-5 flex justify-end"><Button onClick={save} disabled={saving || !outletId}>{saving ? 'Saving…' : 'Save KDS Settings'}</Button></div>
      </div>
    </div>
  );
};

export default KdsSettings;
