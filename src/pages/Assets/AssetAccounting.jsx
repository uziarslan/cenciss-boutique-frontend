import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleDollarSign, Plus, Scale, Send, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  createDepreciationRun,
  getAssetMeta,
  getAssetReconciliation,
  getDepreciationRuns,
  postDepreciationRun,
} from '../../api/assetApi';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import HeroBanner from '../../components/UI/HeroBanner';
import SearchableSelect from '../../components/UI/SearchableSelect';
import StatusChip from '../../components/UI/StatusChip';
import useQueryState from '../../hooks/useQueryState';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AssetAccounting = () => {
  const [outlets, setOutlets] = useState([]);
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const [runs, setRuns] = useState([]);
  const [reconciliation, setReconciliation] = useState({ rows: [], isReconciled: true });
  const [throughDate, setThroughDate] = useQueryState('throughDate', new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAssetMeta()
      .then(({ data }) => {
        setOutlets(data.data.outlets);
        if (data.data.outlets[0]) setOutlet(data.data.outlets[0]._id);
      })
      .catch((error) => toast.error(error.response?.data?.message || 'Enabled outlets could not be loaded.'));
  }, [setOutlet]);
  const load = useCallback(async () => {
    if (!outlet) return;
    setLoading(true);
    try {
      const [runRes, recRes] = await Promise.all([
        getDepreciationRuns(outlet),
        getAssetReconciliation(outlet),
      ]);
      setRuns(runRes.data.data);
      setReconciliation(recRes.data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Asset accounting data could not be loaded.');
    } finally { setLoading(false); }
  }, [outlet]);
  useEffect(() => { load(); }, [load]);

  const createRun = async () => {
    setLoading(true);
    try {
      const { data } = await createDepreciationRun({ outlet, throughDate });
      toast.success(`${data.data.runNumber} prepared. Review it before posting.`);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Depreciation run could not be prepared.');
    } finally { setLoading(false); }
  };
  const postRun = async (id) => {
    if (!window.confirm('Post this depreciation journal? The run cannot be edited afterward.')) return;
    setLoading(true);
    try {
      await postDepreciationRun(id);
      toast.success('Depreciation posted to the asset register and accounting.');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Depreciation could not be posted.');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <HeroBanner eyebrow="Asset accounting" title="Depreciation & Reconciliation" subtitle="Controlled monthly depreciation and register-to-ledger comparison." />
      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <SearchableSelect options={outlets.map((row) => ({ value: row._id, label: row.name, meta: row.code }))} value={outlet} onChange={setOutlet} placeholder="Choose outlet" />
          <input type="date" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" value={throughDate} onChange={(e) => setThroughDate(e.target.value)} />
          <Button icon={Plus} disabled={loading || !outlet} onClick={createRun}>Prepare depreciation</Button>
        </div>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${reconciliation.isReconciled ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{reconciliation.isReconciled ? <CheckCircle2 size={20} /> : <TriangleAlert size={20} />}</div><div><h2 className="font-bold text-slate-900">Register versus COA</h2><p className="text-xs text-slate-400">{reconciliation.isReconciled ? 'All mapped account balances agree.' : 'Differences need opening-balance or journal review.'}</p></div></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${reconciliation.isReconciled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{reconciliation.isReconciled ? 'Reconciled' : 'Difference found'}</span>
        </div>
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3 text-right">Register</th><th className="px-4 py-3 text-right">Ledger</th><th className="px-4 py-3 text-right">Difference</th></tr></thead><tbody className="divide-y divide-slate-100">{reconciliation.rows?.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No mapped asset balances for this outlet.</td></tr> : reconciliation.rows.map((row) => <tr key={row.account?._id}><td className="px-4 py-3"><span className="font-mono text-xs text-indigo-500">{row.account?.code}</span><p className="font-semibold text-slate-700">{row.account?.name}</p></td><td className="px-4 py-3 text-right">{money(row.registerBalance)}</td><td className="px-4 py-3 text-right">{money(row.ledgerBalance)}</td><td className={`px-4 py-3 text-right font-bold ${Math.abs(row.difference) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>{money(row.difference)}</td></tr>)}</tbody></table>
        </div>
      </Card>
      <Card padding={false}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Scale size={18} /></div><div><h2 className="font-bold text-slate-900">Depreciation runs</h2><p className="text-xs text-slate-400">Draft first, post after review</p></div></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Run</th><th className="px-4 py-3">Through</th><th className="px-4 py-3 text-right">Assets</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{runs.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No depreciation runs prepared.</td></tr> : runs.map((run) => <tr key={run._id}><td className="px-5 py-3"><p className="font-mono text-xs font-bold text-indigo-600">{run.runNumber}</p>{run.journalEntry && <p className="text-xs text-slate-400">{run.journalEntry.entryNumber}</p>}</td><td className="px-4 py-3 text-slate-600">{new Date(run.throughDate).toLocaleDateString()}</td><td className="px-4 py-3 text-right">{run.lines?.length || 0}</td><td className="px-4 py-3 text-right font-semibold">{money(run.totalAmount)}</td><td className="px-4 py-3"><StatusChip status={run.status} /></td><td className="px-5 py-3 text-right">{run.status === 'draft' && <Button size="sm" icon={Send} disabled={loading} onClick={() => postRun(run._id)}>Post</Button>}</td></tr>)}</tbody></table>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><div className="flex gap-3"><CircleDollarSign className="text-indigo-500" size={19} /><div><p className="font-semibold text-slate-800">Opening assets</p><p className="mt-1 text-xs text-slate-500">Register-only opening imports will appear as reconciliation differences until linked to an existing balance or opening journal.</p></div></div></Card>
        <Card><div className="flex gap-3"><Scale className="text-emerald-500" size={19} /><div><p className="font-semibold text-slate-800">Journal safety</p><p className="mt-1 text-xs text-slate-500">Draft runs do not touch accounting. Posting updates every asset and creates one balanced outlet-tagged journal.</p></div></div></Card>
      </div>
    </div>
  );
};

export default AssetAccounting;
