import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2, Copy, Check, Smartphone, AlertTriangle, MapPin, Pencil, X, RefreshCw } from 'lucide-react';
import {
  listAttendanceDevices,
  createAttendanceDevice,
  updateAttendanceDeviceLabel,
  regenerateAttendanceDeviceToken,
  revokeAttendanceDevice,
} from '../../api/attendanceDeviceApi';
import { useGetOutletsQuery } from '../../store/baseApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import ConfirmModal from '../../components/UI/ConfirmModal';

const formatDate = (d) => (d ? new Date(d).toLocaleString() : '—');

const AttendanceDevices = () => {
  const [devices, setDevices] = useState([]);
  const { data: outletList = [] } = useGetOutletsQuery();
  const outlets = outletList.filter((o) => o.isActive !== false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [outletId, setOutletId] = useState('');
  const [justCreated, setJustCreated] = useState(null); // { token, label, outletName }
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null); // device pending revoke
  const [revoking, setRevoking] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [regenTarget, setRegenTarget] = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: dev } = await listAttendanceDevices();
      setDevices(dev.devices || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (creating) return;
    if (!outletId) {
      toast.error('Pick an outlet to bind this device to.');
      return;
    }
    setCreating(true);
    try {
      const { data } = await createAttendanceDevice({
        label: label.trim(),
        outletId,
      });
      setJustCreated({
        token: data.token,
        label: data.device.label || 'Untitled device',
        outletName: data.device.outletName || '',
      });
      setLabel('');
      setOutletId('');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create device.');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (device) => {
    setEditingId(device.id);
    setEditingLabel(device.label || '');
  };

  const cancelEdit = () => {
    if (savingEdit) return;
    setEditingId(null);
    setEditingLabel('');
  };

  const saveEdit = async () => {
    if (!editingId || savingEdit) return;
    setSavingEdit(true);
    try {
      const { data } = await updateAttendanceDeviceLabel(editingId, editingLabel.trim());
      // Patch the local list in-place rather than refetching everything.
      setDevices((list) =>
        list.map((d) => (d.id === editingId ? { ...d, label: data.device.label } : d))
      );
      toast.success('Label updated.');
      setEditingId(null);
      setEditingLabel('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update label.');
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmRegenerate = async () => {
    if (!regenTarget) return;
    setRegenerating(true);
    try {
      const { data } = await regenerateAttendanceDeviceToken(regenTarget.id);
      setRegenTarget(null);
      // Reuse the one-time token banner so the new value is shown exactly
      // once with the same copy / dismiss UX as fresh creation.
      setJustCreated({
        token: data.token,
        label: data.device.label || 'Untitled device',
        outletName: data.device.outletName || '',
      });
      // Patch the row's lastUsedAt clear (the regen endpoint reset it).
      setDevices((list) =>
        list.map((d) => (d.id === data.device.id ? { ...d, lastUsedAt: null } : d))
      );
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to regenerate token.');
    } finally {
      setRegenerating(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeAttendanceDevice(revokeTarget.id);
      toast.success('Device revoked.');
      setRevokeTarget(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to revoke.');
    } finally {
      setRevoking(false);
    }
  };

  const copyToken = async () => {
    if (!justCreated?.token) return;
    try {
      await navigator.clipboard.writeText(justCreated.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const active = devices.filter((d) => !d.revokedAt);
  const revoked = devices.filter((d) => d.revokedAt);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Attendance Devices</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pair the attendance terminal app with this outlet using a one-time token.
          Each tablet/kiosk gets its own token so you can revoke a single device
          without affecting the others.
        </p>
      </div>

      {/* New device form */}
      <form onSubmit={create} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Label (optional)
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Front desk tablet"
              className="w-full h-10 px-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
              maxLength={80}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Bind to outlet <span className="text-rose-500">*</span>
            </label>
            <SearchableSelect
              options={outlets.map((o) => ({
                value: o._id,
                label: o.name,
                meta: o.code || '',
              }))}
              value={outletId}
              onChange={setOutletId}
              placeholder="Select an outlet…"
              searchPlaceholder="Search outlets…"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold px-4 rounded-xl text-sm whitespace-nowrap"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Generate token
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Each terminal scans only its bound outlet's employees — keeps
          attendance fast and prevents cross-outlet matches.
        </p>
      </form>

      {/* One-time token display */}
      {justCreated && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-amber-900">
                Copy this token now — you won't see it again.
              </div>
              <div className="text-sm text-amber-800 mt-1">
                Paste it into the attendance terminal's pairing screen. Label:{' '}
                <span className="font-mono font-semibold">{justCreated.label}</span>
                {justCreated.outletName && (
                  <> · Bound to <span className="font-semibold">{justCreated.outletName}</span></>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 break-all rounded-xl bg-white border border-amber-300 px-3 py-2 text-xs font-mono text-slate-800">
                  {justCreated.token}
                </code>
                <button
                  onClick={copyToken}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button
                onClick={() => setJustCreated(null)}
                className="mt-3 text-xs font-semibold text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
              >
                Dismiss (I've saved it)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active devices */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Smartphone size={15} className="text-gray-500" />
          <h3 className="text-sm font-bold text-gray-800">Active devices</h3>
          <span className="ml-auto text-xs text-gray-500">{active.length}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            <Loader2 size={14} className="inline animate-spin mr-2" /> Loading…
          </div>
        ) : active.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No active devices yet. Generate a token to pair your first terminal.
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-2.5">Label</th>
                <th className="text-left px-5 py-2.5">Outlet</th>
                <th className="text-left px-5 py-2.5">Created</th>
                <th className="text-left px-5 py-2.5">Last used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {active.map((d) => {
                const isEditing = editingId === d.id;
                return (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="px-5 py-3 font-bold text-gray-900">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit();
                              else if (e.key === 'Escape') cancelEdit();
                            }}
                            autoFocus
                            maxLength={80}
                            placeholder="Untitled device"
                            className="flex-1 h-8 px-2.5 border border-gray-300 rounded-lg text-sm font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                          />
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={savingEdit}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white"
                            title="Save"
                          >
                            {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={savingEdit}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-600"
                            title="Cancel"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(d)}
                          className="group inline-flex items-center gap-2 text-left hover:text-indigo-600 transition"
                          title="Click to edit label"
                        >
                          <span>{d.label || 'Untitled device'}</span>
                          <Pencil size={12} className="text-gray-300 group-hover:text-indigo-500 transition" />
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {d.outletName ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          <MapPin size={10} />
                          {d.outletCode ? `${d.outletCode}` : d.outletName}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Any outlet</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{formatDate(d.createdAt)}</td>
                    <td className="px-5 py-3 text-gray-600">{formatDate(d.lastUsedAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          onClick={() => setRegenTarget(d)}
                          disabled={isEditing}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 disabled:opacity-50 font-bold text-xs"
                          title="Generate a new token for this device"
                        >
                          <RefreshCw size={12} /> Regenerate
                        </button>
                        <button
                          onClick={() => setRevokeTarget(d)}
                          disabled={isEditing}
                          className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 disabled:opacity-50 font-bold text-xs"
                        >
                          <Trash2 size={12} /> Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Revoked devices */}
      {revoked.length > 0 && (
        <details className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <summary className="px-5 py-3 cursor-pointer text-xs font-bold text-gray-500 uppercase tracking-wide">
            Revoked devices ({revoked.length})
          </summary>
          <div className="border-t border-gray-100">
            {revoked.map((d) => (
              <div key={d.id} className="flex flex-col gap-1 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span className="text-gray-700">{d.label || 'Untitled device'}</span>
                <span className="text-xs text-gray-400">revoked {formatDate(d.revokedAt)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <ConfirmModal
        isOpen={Boolean(regenTarget)}
        title="Regenerate this token?"
        message={
          regenTarget
            ? `A new 64-character token will be generated for "${regenTarget.label || 'Untitled device'}"${regenTarget.outletName ? ` (${regenTarget.outletName})` : ''}. The current token will stop working immediately — any tablet using it will be redirected to the pairing screen on its next request. The new token will be shown only once.`
            : ''
        }
        confirmLabel="Regenerate token"
        cancelLabel="Cancel"
        variant="default"
        isLoading={regenerating}
        onConfirm={confirmRegenerate}
        onCancel={() => { if (!regenerating) setRegenTarget(null); }}
      />

      <ConfirmModal
        isOpen={Boolean(revokeTarget)}
        title="Revoke this device?"
        message={
          revokeTarget
            ? `"${revokeTarget.label || 'Untitled device'}"${revokeTarget.outletName ? ` (${revokeTarget.outletName})` : ''} will stop working immediately. The paired terminal will be redirected to the pairing screen on its next request.`
            : ''
        }
        confirmLabel="Revoke device"
        cancelLabel="Keep active"
        variant="danger"
        isLoading={revoking}
        onConfirm={confirmRevoke}
        onCancel={() => { if (!revoking) setRevokeTarget(null); }}
      />
    </div>
  );
};

export default AttendanceDevices;
