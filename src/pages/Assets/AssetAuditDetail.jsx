import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import toast from 'react-hot-toast';
import {
  addUnregisteredAuditLine,
  approveAssetAudit,
  countAssetAuditLine,
  getAssetAudit,
  rejectAssetAudit,
  requestAssetAuditRecount,
  reviewAssetAudit,
  startAssetAudit,
  submitAssetAudit,
} from '../../api/assetApi';
import usePermissions from '../../hooks/usePermissions';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import HeroBanner from '../../components/UI/HeroBanner';
import StatusChip from '../../components/UI/StatusChip';
import useQueryState from '../../hooks/useQueryState';

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ApprovalModal = ({ onClose, onApprove, saving, hasAccounting, writeOffCount }) => {
  const [postAccounting, setPostAccounting] = useState(writeOffCount > 0);
  const [ownerOverrideReason, setOwnerOverrideReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">Approve asset audit</h2><p className="mt-1 text-sm text-slate-500">Operational adjustments are applied exactly once.</p></div><button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        <label className={`mt-5 flex items-start gap-3 rounded-xl border p-4 ${writeOffCount ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
          <input type="checkbox" className="mt-1" checked={postAccounting} disabled={!hasAccounting} onChange={(e) => setPostAccounting(e.target.checked)} />
          <span className="text-sm text-slate-800"><strong>Post approved write-offs to accounting</strong><span className="mt-1 block text-xs text-slate-500">{writeOffCount} write-off line(s). The journal removes cost and accumulated depreciation and recognizes the net loss.</span>{!hasAccounting && <span className="mt-1 block text-xs font-semibold text-rose-600">You do not have asset accounting permission.</span>}</span>
        </label>
        <label className="mt-4 block"><span className="mb-1 block text-xs font-semibold text-slate-500">Owner override reason, if you participated in counting</span><textarea rows={3} className={fieldClass} value={ownerOverrideReason} onChange={(e) => setOwnerOverrideReason(e.target.value)} placeholder="Recorded only when separation of duties needs an owner override" /></label>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || (writeOffCount > 0 && !postAccounting)} onClick={() => onApprove({ postAccounting, ownerOverrideReason })}>{saving ? 'Approving…' : 'Approve audit'}</Button></div>
      </div>
    </div>
  );
};

const AssetAuditDetail = () => {
  const { id } = useParams();
  const { has } = usePermissions();
  const [audit, setAudit] = useState(null);
  const [lines, setLines] = useState([]);
  const [draftCounts, setDraftCounts] = useState({});
  const [reviews, setReviews] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useQueryState('search', '');
  const [showApproval, setShowApproval] = useState(false);
  const [showUnregistered, setShowUnregistered] = useQueryState('showUnregistered', false);
  const [unregistered, setUnregistered] = useState({ name: '', countedQuantity: 1, trackingMode: 'serialized', foundLocation: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getAssetAudit(id);
      setAudit(data.data);
      setLines(data.data.lines || []);
      setDraftCounts(Object.fromEntries((data.data.lines || []).map((line) => [line._id, {
        countedQuantity: line.countedQuantity ?? '',
        countedCondition: line.countedCondition || 'good',
        foundLocation: line.foundLocation || '',
        notes: line.notes || '',
      }])));
      setReviews(Object.fromEntries((data.data.lines || []).map((line) => [line._id, {
        reviewAction: line.reviewAction === 'pending'
          ? !line.asset
            ? 'investigate'
            : Number(line.variance || 0) === 0
              ? 'noChange'
              : line.asset.accountingLinked && Number(line.variance) < 0
                ? 'writeOff'
                : line.asset.accountingLinked
                  ? 'investigate'
                  : 'quantityAdjustment'
          : line.reviewAction,
        approvedQuantity: line.approvedQuantity ?? line.countedQuantity ?? 0,
        reviewerNotes: line.reviewerNotes || '',
      }])));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Asset audit could not be loaded.');
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setBusy(true);
    try { await startAssetAudit(id); toast.success('Audit snapshot created. Counting is open.'); load(); }
    catch (error) { toast.error(error.response?.data?.message || 'Audit could not be started.'); }
    finally { setBusy(false); }
  };
  const saveCount = async (lineId) => {
    const row = draftCounts[lineId];
    if (row.countedQuantity === '' || Number(row.countedQuantity) < 0) {
      toast.error('Enter a valid counted quantity.');
      return;
    }
    setBusy(true);
    try {
      await countAssetAuditLine(id, lineId, { ...row, countedQuantity: Number(row.countedQuantity) });
      toast.success('Count saved.');
      load();
    } catch (error) { toast.error(error.response?.data?.message || 'Count could not be saved.'); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    const pending = lines.filter((line) => line.countedQuantity == null).length;
    const markMissing = pending > 0 && window.confirm(`${pending} asset(s) are uncounted. Mark them as missing and submit?`);
    if (pending > 0 && !markMissing) return;
    setBusy(true);
    try { await submitAssetAudit(id, markMissing); toast.success('Audit submitted for review.'); load(); }
    catch (error) { toast.error(error.response?.data?.message || 'Audit could not be submitted.'); }
    finally { setBusy(false); }
  };
  const saveReview = async () => {
    setBusy(true);
    try {
      await reviewAssetAudit(id, Object.entries(reviews).map(([lineId, value]) => ({
        lineId,
        ...value,
        approvedQuantity: Number(value.approvedQuantity),
      })));
      toast.success('Review decisions saved.');
      load();
    } catch (error) { toast.error(error.response?.data?.message || 'Review could not be saved.'); }
    finally { setBusy(false); }
  };
  const recount = async () => {
    const lineIds = lines.filter((line) => reviews[line._id]?.reviewAction === 'recount').map((line) => line._id);
    setBusy(true);
    try {
      await requestAssetAuditRecount(id, { lineIds, reason: 'Recount requested during variance review' });
      toast.success('Audit returned for recount.');
      load();
    } catch (error) { toast.error(error.response?.data?.message || 'Recount could not be requested.'); }
    finally { setBusy(false); }
  };
  const approve = async (body) => {
    setBusy(true);
    try {
      await approveAssetAudit(id, body);
      toast.success('Audit approved and register updated.');
      setShowApproval(false);
      load();
    } catch (error) { toast.error(error.response?.data?.message || 'Audit could not be approved.'); }
    finally { setBusy(false); }
  };
  const reject = async () => {
    const reason = window.prompt('Why is this audit being rejected?')?.trim();
    if (!reason) return;
    setBusy(true);
    try { await rejectAssetAudit(id, reason); toast.success('Audit rejected.'); load(); }
    catch (error) { toast.error(error.response?.data?.message || 'Audit could not be rejected.'); }
    finally { setBusy(false); }
  };
  const addUnregistered = async () => {
    setBusy(true);
    try {
      await addUnregisteredAuditLine(id, { ...unregistered, countedQuantity: Number(unregistered.countedQuantity) });
      toast.success('Unregistered finding added for investigation.');
      setShowUnregistered(false);
      setUnregistered({ name: '', countedQuantity: 1, trackingMode: 'serialized', foundLocation: '', notes: '' });
      load();
    } catch (error) { toast.error(error.response?.data?.message || 'Finding could not be added.'); }
    finally { setBusy(false); }
  };

  const visibleLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? lines.filter((line) => `${line.nameSnapshot} ${line.assetNumberSnapshot}`.toLowerCase().includes(q)) : lines;
  }, [lines, query]);
  const mayCount = has('assetAudits.count') && audit?.status === 'inProgress';
  const mayReview = has('assetAudits.review') && ['submitted', 'underReview'].includes(audit?.status);
  const mayApprove = has('assetAudits.approve') && ['submitted', 'underReview'].includes(audit?.status);
  const writeOffCount = Object.values(reviews).filter((row) => row.reviewAction === 'writeOff').length;

  if (loading) return <div className="py-24 text-center text-slate-400">Loading asset audit…</div>;
  if (!audit) return <div className="py-24 text-center text-slate-400">Audit not found.</div>;

  return (
    <div className="space-y-5">
      <Link to="/assets/audits" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-indigo-600"><ArrowLeft size={15} /> Back to audits</Link>
      <HeroBanner
        eyebrow={audit.auditNumber}
        title={audit.title || 'Asset Audit'}
        subtitle={`${audit.outlet?.name} · ${audit.scope?.type} scope · ${audit.blindCount ? 'blind count' : 'open count'}`}
        actions={<>
          {has('assetAudits.create') && ['draft', 'scheduled', 'recountRequested'].includes(audit.status) && <Button icon={Play} disabled={busy} onClick={start}>{audit.status === 'recountRequested' ? 'Open recount' : 'Start audit'}</Button>}
          {mayCount && <Button variant="secondary" icon={CheckCircle2} onClick={() => setShowUnregistered(true)}>Unregistered asset</Button>}
          {mayCount && <Button icon={Send} disabled={busy} onClick={submit}>Submit audit</Button>}
          {mayReview && <Button variant="secondary" icon={Save} disabled={busy} onClick={saveReview}>Save review</Button>}
          {mayReview && Object.values(reviews).some((row) => row.reviewAction === 'recount') && <Button variant="secondary" icon={RotateCcw} onClick={recount}>Request recount</Button>}
          {mayApprove && <Button icon={ShieldCheck} onClick={() => setShowApproval(true)}>Approve</Button>}
          {mayReview && <Button variant="danger" onClick={reject}>Reject</Button>}
        </>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[['Status', <StatusChip status={audit.status} />], ['Snapshot', audit.snapshotAt ? new Date(audit.snapshotAt).toLocaleString() : 'Not started'], ['Assets', audit.totalAssets || lines.length], ['Counted', audit.countedAssets || 0], ['Variance value', money(audit.estimatedVarianceValue)]].map(([label, value]) => <Card key={label}><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><div className="mt-2 text-sm font-bold text-slate-800">{value}</div></Card>)}
      </div>
      <Card><label className="relative block"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input className={`${fieldClass} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search audit lines…" /></label></Card>
      <div className="space-y-3">
        {visibleLines.map((line) => {
          const count = draftCounts[line._id] || {};
          const review = reviews[line._id] || {};
          const variance = line.variance;
          return (
            <Card key={line._id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold text-slate-900">{line.nameSnapshot || line.unregisteredName}</p><p className="font-mono text-xs text-indigo-500">{line.assetNumberSnapshot || 'UNREGISTERED'} · {line.trackingMode}</p></div>
                <div className="text-right">{variance !== undefined && <p className={`text-sm font-bold ${variance === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>Variance {variance > 0 ? '+' : ''}{variance}</p>}<p className="text-xs text-slate-400">{line.status}</p></div>
              </div>
              {mayCount ? (
                <div className="mt-4 grid gap-3 md:grid-cols-[120px_150px_1fr_1fr_auto]">
                  <label><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Counted qty</span><input type="number" min="0" max={line.trackingMode === 'serialized' ? 1 : undefined} step={line.trackingMode === 'serialized' ? 1 : 0.01} className={fieldClass} value={count.countedQuantity} onChange={(e) => setDraftCounts((old) => ({ ...old, [line._id]: { ...old[line._id], countedQuantity: e.target.value } }))} /></label>
                  <label><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Condition</span><select className={fieldClass} value={count.countedCondition} onChange={(e) => setDraftCounts((old) => ({ ...old, [line._id]: { ...old[line._id], countedCondition: e.target.value } }))}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option><option value="missing">Missing</option><option value="underRepair">Under repair</option></select></label>
                  <label><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Found location</span><input className={fieldClass} value={count.foundLocation} onChange={(e) => setDraftCounts((old) => ({ ...old, [line._id]: { ...old[line._id], foundLocation: e.target.value } }))} /></label>
                  <label><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Notes</span><input className={fieldClass} value={count.notes} onChange={(e) => setDraftCounts((old) => ({ ...old, [line._id]: { ...old[line._id], notes: e.target.value } }))} /></label>
                  <div className="self-end"><Button size="sm" icon={Save} disabled={busy} onClick={() => saveCount(line._id)}>Save</Button></div>
                </div>
              ) : mayReview ? (
                <div className="mt-4 grid gap-3 md:grid-cols-[130px_130px_190px_1fr]">
                  <div><p className="text-[10px] font-bold uppercase text-slate-400">Expected</p><p className="mt-2 text-sm font-semibold text-slate-700">{line.expectedQuantity ?? 'Blind'} · {line.expectedLocation || 'No location'}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-slate-400">Counted</p><p className="mt-2 text-sm font-semibold text-slate-700">{line.countedQuantity} · {line.countedCondition}</p></div>
                  <label><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Decision</span><select className={fieldClass} value={review.reviewAction} onChange={(e) => setReviews((old) => ({ ...old, [line._id]: { ...old[line._id], reviewAction: e.target.value } }))}>{line.asset ? <><option value="noChange">No change</option>{!line.asset.accountingLinked && <option value="quantityAdjustment">Adjust register quantity</option>}<option value="conditionUpdate">Update condition/location</option>{Number(line.variance) < 0 && <option value="writeOff">Write off shortage</option>}<option value="recount">Request recount</option><option value="investigate">Investigate</option></> : <option value="investigate">Keep as investigation exception</option>}</select></label>
                  <div className="grid gap-2 sm:grid-cols-[110px_1fr]"><input type="number" min="0" className={fieldClass} value={review.approvedQuantity} onChange={(e) => setReviews((old) => ({ ...old, [line._id]: { ...old[line._id], approvedQuantity: e.target.value } }))} title="Approved quantity" /><input className={fieldClass} value={review.reviewerNotes} onChange={(e) => setReviews((old) => ({ ...old, [line._id]: { ...old[line._id], reviewerNotes: e.target.value } }))} placeholder="Reviewer notes" /></div>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4"><div><span className="text-xs text-slate-400">Expected</span><p className="font-semibold">{line.expectedQuantity ?? 'Hidden'}</p></div><div><span className="text-xs text-slate-400">Counted</span><p className="font-semibold">{line.countedQuantity ?? 'Pending'}</p></div><div><span className="text-xs text-slate-400">Condition</span><p className="font-semibold capitalize">{line.countedCondition || line.expectedCondition}</p></div><div><span className="text-xs text-slate-400">Decision</span><p className="font-semibold capitalize">{line.reviewAction}</p></div></div>
              )}
            </Card>
          );
        })}
      </div>
      {showApproval && <ApprovalModal onClose={() => setShowApproval(false)} onApprove={approve} saving={busy} hasAccounting={has('assets.accounting')} writeOffCount={writeOffCount} />}
      {showUnregistered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">Unregistered asset found</h2><p className="text-sm text-slate-500">This creates an investigation exception, not an accounting entry.</p></div><button onClick={() => setShowUnregistered(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
            <div className="mt-5 space-y-3"><input className={fieldClass} value={unregistered.name} onChange={(e) => setUnregistered((old) => ({ ...old, name: e.target.value }))} placeholder="Asset description" /><div className="grid grid-cols-2 gap-3"><input type="number" min="1" className={fieldClass} value={unregistered.countedQuantity} onChange={(e) => setUnregistered((old) => ({ ...old, countedQuantity: e.target.value }))} /><select className={fieldClass} value={unregistered.trackingMode} onChange={(e) => setUnregistered((old) => ({ ...old, trackingMode: e.target.value }))}><option value="serialized">Serialized</option><option value="bulk">Bulk</option></select></div><input className={fieldClass} value={unregistered.foundLocation} onChange={(e) => setUnregistered((old) => ({ ...old, foundLocation: e.target.value }))} placeholder="Found location" /><textarea rows={3} className={fieldClass} value={unregistered.notes} onChange={(e) => setUnregistered((old) => ({ ...old, notes: e.target.value }))} placeholder="Notes/evidence" /></div>
            <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowUnregistered(false)}>Cancel</Button><Button disabled={busy} onClick={addUnregistered}>Add finding</Button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetAuditDetail;
