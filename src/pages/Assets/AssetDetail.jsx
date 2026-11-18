import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, Pencil, QrCode, Save } from 'lucide-react';
import { Link, useParams } from 'react-router';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import {
  getAsset,
  getAssetMeta,
  transferAsset,
  updateAsset,
} from '../../api/assetApi';
import usePermissions from '../../hooks/usePermissions';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import HeroBanner from '../../components/UI/HeroBanner';
import SearchableSelect from '../../components/UI/SearchableSelect';
import StatusChip from '../../components/UI/StatusChip';

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Info = ({ label, children }) => <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><div className="mt-1 text-sm font-medium text-slate-800">{children || '—'}</div></div>;

const AssetDetail = () => {
  const { id } = useParams();
  const { has } = usePermissions();
  const [asset, setAsset] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState('');
  const [form, setForm] = useState({});
  const [transfer, setTransfer] = useState({ toOutlet: '', location: '', reason: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, metaRes] = await Promise.all([getAsset(id), getAssetMeta()]);
      setAsset(data.data);
      setOutlets(metaRes.data.data.outlets);
      setForm({
        name: data.data.name,
        location: data.data.location || '',
        custodianName: data.data.custodianName || '',
        serialNumber: data.data.serialNumber || '',
        modelNumber: data.data.modelNumber || '',
        manufacturer: data.data.manufacturer || '',
        condition: data.data.condition,
        notes: data.data.notes || '',
        changeReason: '',
      });
      QRCode.toDataURL(data.data.assetNumber, { margin: 1, width: 220 }).then(setQr);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Asset could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await updateAsset(id, form);
      toast.success('Asset updated.');
      setEditing(false);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Asset could not be updated.');
    } finally { setSaving(false); }
  };

  const submitTransfer = async () => {
    if (!transfer.toOutlet || transfer.reason.trim().length < 3) {
      toast.error('Choose the destination and enter a transfer reason.');
      return;
    }
    setSaving(true);
    try {
      await transferAsset(id, transfer);
      toast.success('Asset transferred.');
      setTransferring(false);
      setTransfer({ toOutlet: '', location: '', reason: '' });
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Asset could not be transferred.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="py-24 text-center text-slate-400">Loading asset…</div>;
  if (!asset) return <div className="py-24 text-center text-slate-400">Asset not found.</div>;
  const nbv = Math.max(0, Number(asset.grossCarryingAmount ?? asset.originalCost) - Number(asset.accumulatedDepreciation));

  return (
    <div className="space-y-5">
      <Link to="/assets/register" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-indigo-600"><ArrowLeft size={15} /> Back to asset register</Link>
      <HeroBanner
        eyebrow={asset.assetNumber}
        title={asset.name}
        subtitle={`${asset.category?.name || 'Asset'} · ${asset.outlet?.name || ''}`}
        actions={has('assets.manage') && <>
          <Button variant="secondary" icon={Pencil} onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel edit' : 'Edit'}</Button>
          <Button icon={ArrowRightLeft} onClick={() => setTransferring(true)}>Transfer</Button>
        </>}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <Card>
            {editing ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="mb-1 block text-xs font-semibold text-slate-500">Name</span><input className={fieldClass} value={form.name} onChange={(e) => setForm((old) => ({ ...old, name: e.target.value }))} /></label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-500">Location</span><input className={fieldClass} value={form.location} onChange={(e) => setForm((old) => ({ ...old, location: e.target.value }))} /></label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-500">Custodian</span><input className={fieldClass} value={form.custodianName} onChange={(e) => setForm((old) => ({ ...old, custodianName: e.target.value }))} /></label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-500">Condition</span><select className={fieldClass} value={form.condition} onChange={(e) => setForm((old) => ({ ...old, condition: e.target.value }))}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option><option value="missing">Missing</option><option value="underRepair">Under repair</option></select></label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-500">Manufacturer</span><input className={fieldClass} value={form.manufacturer} onChange={(e) => setForm((old) => ({ ...old, manufacturer: e.target.value }))} /></label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-500">Model / serial</span><input className={fieldClass} value={form.serialNumber} onChange={(e) => setForm((old) => ({ ...old, serialNumber: e.target.value }))} /></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">Change reason</span><input className={fieldClass} value={form.changeReason} onChange={(e) => setForm((old) => ({ ...old, changeReason: e.target.value }))} placeholder="Required when condition changes" /></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">Notes</span><textarea rows={3} className={fieldClass} value={form.notes} onChange={(e) => setForm((old) => ({ ...old, notes: e.target.value }))} /></label>
                <div className="sm:col-span-2 flex justify-end"><Button icon={Save} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</Button></div>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Status"><StatusChip status={asset.status} /></Info>
                <Info label="Condition"><span className="capitalize">{asset.condition}</span></Info>
                <Info label="Tracking">{asset.trackingMode}</Info>
                <Info label="Quantity">{asset.quantity} {asset.unit}</Info>
                <Info label="Location">{asset.location}</Info>
                <Info label="Custodian">{asset.custodian?.name || asset.custodianName}</Info>
                <Info label="Serial number">{asset.serialNumber}</Info>
                <Info label="Model">{asset.modelNumber}</Info>
                <Info label="Acquired">{asset.acquisitionDate ? new Date(asset.acquisitionDate).toLocaleDateString() : '—'}</Info>
                <Info label="Gross cost">{money(asset.grossCarryingAmount ?? asset.originalCost)}</Info>
                <Info label="Accum. depreciation">{money(asset.accumulatedDepreciation)}</Info>
                <Info label="Net book value">{money(nbv)}</Info>
                <Info label="Last audit">{asset.lastAuditAt ? new Date(asset.lastAuditAt).toLocaleDateString() : 'Never'}</Info>
                <Info label="Next audit">{asset.nextAuditDueAt ? new Date(asset.nextAuditDueAt).toLocaleDateString() : 'Not scheduled'}</Info>
                <Info label="Accounting">{asset.accountingLinked ? 'Linked' : 'Unreconciled / no acquisition journal'}</Info>
                <Info label="Acquisition source">
                  {asset.purchase
                    ? <Link className="text-indigo-600 hover:underline" to={`/purchases/${asset.purchase._id}`}>{asset.purchase.purchaseNumber}</Link>
                    : asset.source}
                </Info>
                <Info label="Acquisition journal">
                  {asset.acquisitionJournalEntry
                    ? <Link className="text-indigo-600 hover:underline" to={`/accounting/journal-entries?search=${encodeURIComponent(asset.acquisitionJournalEntry.entryNumber)}`}>{asset.acquisitionJournalEntry.entryNumber}</Link>
                    : '—'}
                </Info>
              </div>
            )}
          </Card>
          <Card padding={false}>
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Movement history</h2><p className="text-xs text-slate-400">Immutable lifecycle and audit trail</p></div>
            {asset.movements?.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-400">No movements recorded.</p> : (
              <div className="divide-y divide-slate-100">
                {asset.movements.map((row) => (
                  <div key={row._id} className="flex items-start justify-between gap-4 px-5 py-4">
                    <div><p className="text-sm font-semibold capitalize text-slate-800">{row.type.replace(/([A-Z])/g, ' $1')}</p><p className="mt-0.5 text-xs text-slate-400">{row.reason || 'No reason'} · {row.user?.name || 'System'}</p></div>
                    <div className="text-right"><p className="text-sm font-semibold tabular-nums text-slate-700">{row.quantityBefore} → {row.quantityAfter}</p><p className="text-xs text-slate-400">{new Date(row.at).toLocaleString()}</p></div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <Card>
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><QrCode size={19} /></div>
            <h2 className="font-bold text-slate-900">Asset label</h2>
            <p className="text-xs text-slate-400">Scan during physical audits</p>
            {qr && <img src={qr} alt={`QR code for ${asset.assetNumber}`} className="mx-auto mt-4 w-48 rounded-xl border border-slate-100" />}
            <p className="mt-2 font-mono text-sm font-bold text-indigo-600">{asset.assetNumber}</p>
          </div>
        </Card>
      </div>
      {transferring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Transfer asset</h2>
            <p className="mt-1 text-sm text-slate-500">Transfers within the same business do not create a journal entry.</p>
            <div className="mt-5 space-y-4">
              <SearchableSelect options={outlets.filter((row) => row._id !== asset.outlet?._id).map((row) => ({ value: row._id, label: row.name, meta: row.code }))} value={transfer.toOutlet} onChange={(value) => setTransfer((old) => ({ ...old, toOutlet: value }))} placeholder="Destination outlet" />
              <input className={fieldClass} value={transfer.location} onChange={(e) => setTransfer((old) => ({ ...old, location: e.target.value }))} placeholder="New location" />
              <textarea rows={3} className={fieldClass} value={transfer.reason} onChange={(e) => setTransfer((old) => ({ ...old, reason: e.target.value }))} placeholder="Transfer reason" />
            </div>
            <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setTransferring(false)}>Cancel</Button><Button disabled={saving} onClick={submitTransfer}>{saving ? 'Transferring…' : 'Confirm transfer'}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetDetail;
