import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Monitor, Plus, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  createRestaurantDevice,
  listRestaurantDevices,
  regenerateRestaurantDevice,
  revokeRestaurantDevice,
  updateRestaurantDevice,
} from '../../api/restaurantDeviceApi';
import { useGetOutletsQuery } from '../../store/baseApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import ConfirmModal from '../../components/UI/ConfirmModal';

const typeLabel = { orderTablet: 'Order tablet', printStation: 'Print computer' };
const fmt = (date) => date ? new Date(date).toLocaleString() : 'Never';

const RestaurantDevices = () => {
  const { data: outletList = [] } = useGetOutletsQuery();
  const outlets = outletList.filter((outlet) => outlet.isActive !== false);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState('orderTablet');
  const [label, setLabel] = useState('');
  const [outletId, setOutletId] = useState('');
  const [printStationId, setPrintStationId] = useState('');
  const [tokenResult, setTokenResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [regeneratingId, setRegeneratingId] = useState('');
  const [assigningId, setAssigningId] = useState('');

  const active = devices.filter((device) => !device.revokedAt);
  const printStations = active.filter((device) => device.type === 'printStation');
  const stationsForOutlet = (id) => printStations.filter((station) => (
    String(station.outletId) === String(id)
  ));
  const selectedOutletStations = stationsForOutlet(outletId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listRestaurantDevices();
      setDevices(data.devices || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load restaurant devices.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault();
    if (!outletId) return toast.error('Select an outlet.');
    if (type === 'orderTablet' && selectedOutletStations.length > 1 && !printStationId) {
      return toast.error('Select which print computer this tablet should use.');
    }
    setCreating(true);
    try {
      const { data } = await createRestaurantDevice({
        type,
        label: label.trim(),
        outletId,
        ...(type === 'orderTablet' && printStationId && { printStationId }),
      });
      setTokenResult({ ...data.device, token: data.token });
      setLabel('');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not create the device.');
    } finally {
      setCreating(false);
    }
  };

  const regenerate = async (device) => {
    setRegeneratingId(device.id);
    try {
      const { data } = await regenerateRestaurantDevice(device.id);
      setTokenResult({ ...data.device, token: data.token });
      toast.success('Device token regenerated. The old token is no longer valid.');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not regenerate the token.');
    } finally {
      setRegeneratingId('');
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeRestaurantDevice(revokeTarget.id);
      toast.success('Device revoked.');
      setRevokeTarget(null);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not revoke the device.');
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(tokenResult.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const changeType = (nextType) => {
    setType(nextType);
    if (nextType !== 'orderTablet') {
      setPrintStationId('');
      return;
    }
    const matches = stationsForOutlet(outletId);
    setPrintStationId(matches.length === 1 ? matches[0].id : '');
  };

  const changeOutlet = (nextOutletId) => {
    setOutletId(nextOutletId);
    const matches = stationsForOutlet(nextOutletId);
    setPrintStationId(type === 'orderTablet' && matches.length === 1 ? matches[0].id : '');
  };

  const assignTablet = async (device, nextStationId) => {
    if (!nextStationId || String(nextStationId) === String(device.printStationId || '')) return;
    setAssigningId(device.id);
    try {
      await updateRestaurantDevice(device.id, { printStationId: nextStationId });
      toast.success(`${device.label || 'Order tablet'} now prints through ${
        printStations.find((station) => String(station.id) === String(nextStationId))?.label || 'the selected computer'
      }.`);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not change the tablet print computer.');
    } finally {
      setAssigningId('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Order & Print Devices</h2>
        <p className="mt-1 text-sm text-slate-500">
          Add multiple print computers and choose exactly which computer handles each order tablet.
        </p>
      </div>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Link2 size={17} />
          </span>
          <div>
            <p className="text-sm font-bold text-indigo-950">Adding Tablet 2 with Computer 2</p>
            <p className="mt-1 text-xs leading-relaxed text-indigo-800">
              Create <strong>Computer 2</strong> as a Print computer, connect its token in Printer Settings on that PC,
              then create <strong>Tablet 2</strong> and select Computer 2 under “Print through computer.”
              Tablet 1 remains linked to Computer 1.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={create} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className={`grid gap-3 md:grid-cols-2 md:items-end ${
          type === 'orderTablet'
            ? 'xl:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
            : 'xl:grid-cols-[190px_minmax(0,1fr)_minmax(0,1fr)_auto]'
        }`}>
          <label className="text-xs font-bold text-slate-600">
            Device type
            <select value={type} onChange={(event) => changeType(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              <option value="orderTablet">Order tablet</option>
              <option value="printStation">Print computer</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Label
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={type === 'orderTablet' ? 'Tablet 2' : 'Computer 2'} className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" maxLength={80} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Outlet
            <div className="mt-1">
              <SearchableSelect
                options={outlets.map((outlet) => ({ value: outlet._id, label: outlet.name, meta: outlet.code }))}
                value={outletId}
                onChange={changeOutlet}
                placeholder="Select outlet…"
              />
            </div>
          </label>
          {type === 'orderTablet' && (
            <label className="text-xs font-bold text-slate-600">
              Print through computer
              <select
                value={printStationId}
                onChange={(event) => setPrintStationId(event.target.value)}
                disabled={!outletId || selectedOutletStations.length === 0}
                className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">
                  {selectedOutletStations.length ? 'Select computer…' : 'No print computer at this outlet'}
                </option>
                {selectedOutletStations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.label || 'Print computer'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button disabled={creating} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-60">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create token
          </button>
        </div>
        {type === 'orderTablet' && outletId && selectedOutletStations.length === 0 && (
          <p className="mt-2 text-xs font-semibold text-amber-700">
            Create a print computer for this outlet first so the tablet has somewhere to send kitchen tickets.
          </p>
        )}
      </form>

      {tokenResult && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <h3 className="font-bold text-amber-900">Copy this token now—it is shown only once.</h3>
          <p className="mt-1 text-sm text-amber-800">
            {tokenResult.type === 'orderTablet'
              ? `Open Cenciss Tablet Operations on the tablet, choose Take Orders, and paste this token.${
                tokenResult.printStationLabel ? ` Orders will print through ${tokenResult.printStationLabel}.` : ''
              }`
              : 'Open Printer Settings on this computer and use this token under Reception printing for order tablets.'}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 break-all rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs">{tokenResult.token}</code>
            <button type="button" onClick={copy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" onClick={() => setTokenResult(null)} className="mt-3 text-xs font-semibold text-amber-800 underline">I saved it</button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-800">Active devices</h3>
          <span className="ml-auto text-xs text-slate-400">{active.length}</span>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400"><Loader2 className="mr-2 inline animate-spin" size={14} />Loading…</div>
        ) : active.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">No order or print devices paired.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {active.map((device) => (
              <div key={device.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${device.type === 'orderTablet' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {device.type === 'orderTablet' ? <Smartphone size={18} /> : <Monitor size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{device.label || typeLabel[device.type]}</p>
                  <p className="text-xs text-slate-500">
                    {typeLabel[device.type]} · {device.outletName}
                    {device.type === 'printStation' && ` · ${
                      active.filter((row) => (
                        row.type === 'orderTablet'
                        && String(row.printStationId) === String(device.id)
                      )).length
                    } tablet(s) linked`}
                    {' · '}Last seen {fmt(device.lastUsedAt)}
                  </p>
                </div>
                {device.type === 'orderTablet' && (
                  <label className="w-full text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:min-w-[210px] sm:w-auto">
                    Prints through
                    <span className="relative mt-1 block">
                      <select
                        value={device.printStationId || ''}
                        onChange={(event) => assignTablet(device, event.target.value)}
                        disabled={assigningId === device.id}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 pr-8 text-xs font-semibold normal-case tracking-normal text-slate-700 disabled:opacity-60"
                      >
                        <option value="" disabled>Select computer…</option>
                        {stationsForOutlet(device.outletId).map((station) => (
                          <option key={station.id} value={station.id}>
                            {station.label || 'Print computer'}
                          </option>
                        ))}
                      </select>
                      {assigningId === device.id && (
                        <Loader2 size={13} className="absolute right-2 top-2.5 animate-spin text-indigo-600" />
                      )}
                    </span>
                  </label>
                )}
                <button type="button" onClick={() => regenerate(device)} disabled={regeneratingId === device.id} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Regenerate token">
                  <RefreshCw size={15} className={regeneratingId === device.id ? 'animate-spin' : ''} />
                </button>
                <button type="button" onClick={() => setRevokeTarget(device)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Revoke device"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {revokeTarget && (
        <ConfirmModal
          isOpen
          title={`Revoke ${revokeTarget.label || typeLabel[revokeTarget.type]}?`}
          message="This device will immediately lose access. Its historical orders and print jobs remain intact."
          confirmLabel="Revoke device"
          onConfirm={revoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
};

export default RestaurantDevices;
