import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Loader2, Plus, Trash2, Copy, Check, AlertTriangle, MapPin,
  RefreshCw, Cpu, Info,
} from 'lucide-react';
import {
  listFaceTerminals,
  createFaceTerminal,
  updateFaceTerminal,
  regenerateFaceTerminalToken,
  revokeFaceTerminal,
} from '../../api/faceTerminalApi';
import { useGetOutletsQuery } from '../../store/baseApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import ConfirmModal from '../../components/UI/ConfirmModal';

const formatDate = (d) => (d ? new Date(d).toLocaleString() : '—');

// The Hikvision web UI (Configuration → Network → Advanced Settings → HTTP
// Listening) does not accept a whole URL — it has four separate boxes. Hand the
// installer the values already split so nothing has to be picked apart on site.
const splitWebhookUrl = (raw) => {
  try {
    const u = new URL(raw);
    const isHttps = u.protocol === 'https:';
    return {
      protocol: isHttps ? 'HTTPS' : 'HTTP',
      host: u.hostname,
      port: u.port || (isHttps ? '443' : '80'),
      path: `${u.pathname}${u.search}`,
    };
  } catch {
    return null;
  }
};

// One "type this into that box on the device" row.
const DeviceField = ({ label, value, hint, copied, onCopy }) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
    <div className="w-full sm:w-52 sm:shrink-0">
      <div className="text-xs font-bold text-amber-900">{label}</div>
      {hint && <div className="text-[11px] text-amber-700/80">{hint}</div>}
    </div>
    <code className="flex-1 min-w-0 break-all rounded-lg bg-white border border-amber-300 px-3 py-1.5 text-xs font-mono text-slate-800">
      {value}
    </code>
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  </div>
);

const FaceTerminals = () => {
  const [terminals, setTerminals] = useState([]);
  const { data: outletList = [] } = useGetOutletsQuery();
  const outlets = outletList.filter((o) => o.isActive !== false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [outletId, setOutletId] = useState('');
  const [graceMinutes, setGraceMinutes] = useState('0');
  const [graceDrafts, setGraceDrafts] = useState({});
  const [savingGrace, setSavingGrace] = useState(null);
  // { webhookUrl, label, outletName }
  const [justCreated, setJustCreated] = useState(null);
  // Which field was copied last, so each row can show its own tick.
  const [copiedKey, setCopiedKey] = useState('');
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [regenTarget, setRegenTarget] = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listFaceTerminals();
      setTerminals(data.terminals || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load terminals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (creating) return;
    if (!outletId) {
      toast.error('Pick an outlet to bind this terminal to.');
      return;
    }
    setCreating(true);
    try {
      const { data } = await createFaceTerminal({ label: label.trim(), outletId, serialNo: serialNo.trim(), graceMinutes: Number(graceMinutes) });
      setJustCreated({
        webhookUrl: data.webhookUrl,
        label: data.terminal.label || 'Untitled terminal',
        outletName: data.terminal.outletName || '',
      });
      setLabel('');
      setSerialNo('');
      setOutletId('');
      setGraceMinutes('0');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create terminal.');
    } finally {
      setCreating(false);
    }
  };

  const saveGrace = async (event, terminal) => {
    event.preventDefault();
    if (savingGrace) return;
    const minutes = Number(graceDrafts[terminal.id] ?? terminal.graceMinutes ?? 0);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      toast.error('Enter a whole number of minutes from 0 to 1440.');
      return;
    }
    setSavingGrace(terminal.id);
    try {
      const { data } = await updateFaceTerminal(terminal.id, { graceMinutes: minutes });
      setTerminals((current) => current.map((item) => item.id === terminal.id ? data.terminal : item));
      setGraceDrafts((current) => {
        const next = { ...current };
        delete next[terminal.id];
        return next;
      });
      toast.success('Grace period saved for new attendance days.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save grace period.');
    } finally {
      setSavingGrace(null);
    }
  };

  const confirmRegenerate = async () => {
    if (!regenTarget) return;
    setRegenerating(true);
    try {
      const { data } = await regenerateFaceTerminalToken(regenTarget.id);
      setRegenTarget(null);
      setJustCreated({
        webhookUrl: data.webhookUrl,
        label: data.terminal.label || 'Untitled terminal',
        outletName: data.terminal.outletName || '',
      });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to regenerate.');
    } finally {
      setRegenerating(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeFaceTerminal(revokeTarget.id);
      toast.success('Terminal revoked.');
      setRevokeTarget(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to revoke.');
    } finally {
      setRevoking(false);
    }
  };

  const copyValue = async (key, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? '' : k)), 1500);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const active = terminals.filter((d) => !d.revokedAt);
  const revoked = terminals.filter((d) => d.revokedAt);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Face Terminals</h2>
        <p className="text-sm text-gray-500 mt-1">
          Register an on-premise Hikvision face-recognition terminal for an outlet.
          The device recognizes staff locally and reports check-in and checkout to this
          system automatically — no tablet camera needed.
        </p>
      </div>

      {/* Setup guidance */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 sm:p-5">
        <div className="flex items-start gap-3">
          <Info size={18} className="text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p className="font-bold">How to connect a terminal</p>
            <ol className="list-decimal ml-4 space-y-1 text-indigo-800/90">
              <li>On the device, turn on <span className="font-semibold">Face Anti-Spoofing</span> and set the time zone / NTP.</li>
              <li>Enroll each employee's face on the device and note their <span className="font-semibold">Person / Employee ID</span>.</li>
              <li>Generate a terminal below — you'll get the four values the device asks for.</li>
              <li>Enter them in the device web UI under <span className="font-mono text-[12px]">Configuration → Network → Advanced Settings → HTTP Listening</span>.</li>
              <li>In Employees, set each person's <span className="font-semibold">Device Person ID</span> to the same <span className="font-semibold">Person / Employee ID</span> used on the terminal.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* New terminal form */}
      <form onSubmit={create} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Label (optional)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Main entrance terminal"
              className="w-full h-10 px-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
              maxLength={80}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Serial (optional)</label>
            <input
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              placeholder="e.g. FC6249195"
              className="w-full h-10 px-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
              maxLength={64}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Bind to outlet <span className="text-rose-500">*</span>
            </label>
            <SearchableSelect
              options={outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))}
              value={outletId}
              onChange={setOutletId}
              placeholder="Select an outlet…"
              searchPlaceholder="Search outlets…"
            />
          </div>
          <div>
            <label htmlFor="new-terminal-grace" className="block text-xs font-bold text-gray-700 mb-1">Grace period (minutes)</label>
            <input id="new-terminal-grace" type="number" min="0" max="1440" step="1" required value={graceMinutes}
              onChange={(e) => setGraceMinutes(e.target.value)}
              className="w-full h-10 px-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold px-4 rounded-xl text-sm whitespace-nowrap"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Generate
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500">Grace allows late arrival and early leaving by the entered minutes. 0 means no tolerance; 30 means half an hour. Every scan and actual worked time is still recorded.</p>
      </form>

      {/* One-time webhook display, pre-split into the device's four fields */}
      {justCreated && (() => {
        const parts = splitWebhookUrl(justCreated.webhookUrl);
        return (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-amber-900">
                  Copy these values now — you won't see them again.
                </div>
                <div className="text-sm text-amber-800 mt-1">
                  Enter them in the device's web UI under{' '}
                  <span className="font-mono text-[12px] font-semibold">
                    Configuration → Network → Advanced Settings → HTTP Listening
                  </span>. Terminal:{' '}
                  <span className="font-mono font-semibold">{justCreated.label}</span>
                  {justCreated.outletName && (
                    <> · Bound to <span className="font-semibold">{justCreated.outletName}</span></>
                  )}
                </div>

                {parts ? (
                  <div className="mt-4 space-y-2">
                    <DeviceField
                      label="Protocol"
                      value={parts.protocol}
                      copied={copiedKey === 'protocol'}
                      onCopy={() => copyValue('protocol', parts.protocol)}
                    />
                    <DeviceField
                      label="Destination IP or Host Name"
                      hint="host only — no https://, no path"
                      value={parts.host}
                      copied={copiedKey === 'host'}
                      onCopy={() => copyValue('host', parts.host)}
                    />
                    <DeviceField
                      label="Port"
                      value={parts.port}
                      copied={copiedKey === 'port'}
                      onCopy={() => copyValue('port', parts.port)}
                    />
                    <DeviceField
                      label="URL"
                      hint="path only, keep the leading slash"
                      value={parts.path}
                      copied={copiedKey === 'path'}
                      onCopy={() => copyValue('path', parts.path)}
                    />
                  </div>
                ) : null}

                <details className="mt-4">
                  <summary className="text-xs font-semibold text-amber-800 cursor-pointer">
                    Full webhook URL (for testing with curl / Postman)
                  </summary>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code className="flex-1 break-all rounded-xl bg-white border border-amber-300 px-3 py-2 text-xs font-mono text-slate-800">
                      {justCreated.webhookUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyValue('full', justCreated.webhookUrl)}
                      className="inline-flex items-center gap-1.5 shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-2 rounded-xl text-xs"
                    >
                      {copiedKey === 'full' ? <Check size={13} /> : <Copy size={13} />}
                      {copiedKey === 'full' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </details>

                <button
                  onClick={() => setJustCreated(null)}
                  className="mt-3 text-xs font-semibold text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
                >
                  Dismiss (I've saved it)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Active terminals */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Cpu size={15} className="text-gray-500" />
          <h3 className="text-sm font-bold text-gray-800">Active terminals</h3>
          <span className="ml-auto text-xs text-gray-500">{active.length}</span>
        </div>
        <p className="px-5 py-3 text-xs text-gray-500 border-b border-gray-100">Set grace for each terminal below. Existing attendance days keep their recorded grace period.</p>
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            <Loader2 size={14} className="inline animate-spin mr-2" /> Loading…
          </div>
        ) : active.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No terminals yet. Generate one to connect your first device.
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-slate-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-2.5">Label</th>
                <th className="text-left px-5 py-2.5">Outlet</th>
                <th className="text-left px-5 py-2.5">Serial</th>
                <th className="text-left px-5 py-2.5">Grace period</th>
                <th className="text-right px-5 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.map((d) => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="px-5 py-3 font-bold text-gray-900">{d.label || 'Untitled terminal'}</td>
                  <td className="px-5 py-3">
                    {d.outletName ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        <MapPin size={10} />
                        {d.outletCode ? `${d.outletCode}` : d.outletName}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-600">{d.serialNo || '—'}</td>
                  <td className="px-5 py-3">
                    <form onSubmit={(event) => saveGrace(event, d)} className="flex items-center gap-2">
                      <input type="number" min="0" max="1440" step="1" required
                        aria-label={`Grace period for ${d.label || 'Untitled terminal'} (minutes)`}
                        value={graceDrafts[d.id] ?? d.graceMinutes ?? 0}
                        onChange={(event) => setGraceDrafts((current) => ({ ...current, [d.id]: event.target.value }))}
                        disabled={savingGrace === d.id}
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                      <span className="text-xs text-gray-500">min</span>
                      <button type="submit" aria-label={`Save grace for ${d.label || 'Untitled terminal'}`}
                        disabled={Boolean(savingGrace) || Number(graceDrafts[d.id] ?? d.graceMinutes ?? 0) === (d.graceMinutes ?? 0)}
                        className="text-xs font-bold text-indigo-600 disabled:text-gray-400 disabled:cursor-default">
                        {savingGrace === d.id ? 'Saving…' : 'Save'}
                      </button>
                    </form>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        onClick={() => setRegenTarget(d)}
                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-bold text-xs"
                        title="Generate a new webhook URL for this terminal"
                      >
                        <RefreshCw size={12} /> Regenerate
                      </button>
                      <button
                        onClick={() => setRevokeTarget(d)}
                        className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-bold text-xs"
                      >
                        <Trash2 size={12} /> Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Revoked terminals */}
      {revoked.length > 0 && (
        <details className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <summary className="px-5 py-3 cursor-pointer text-xs font-bold text-gray-500 uppercase tracking-wide">
            Revoked terminals ({revoked.length})
          </summary>
          <div className="border-t border-gray-100">
            {revoked.map((d) => (
              <div key={d.id} className="flex flex-col gap-1 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span className="text-gray-700">{d.label || 'Untitled terminal'}</span>
                <span className="text-xs text-gray-400">revoked {formatDate(d.revokedAt)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <ConfirmModal
        isOpen={Boolean(regenTarget)}
        title="Regenerate this webhook URL?"
        message={
          regenTarget
            ? `A new webhook URL will be generated for "${regenTarget.label || 'Untitled terminal'}"${regenTarget.outletName ? ` (${regenTarget.outletName})` : ''}. The current URL stops working immediately — update the device's HTTP Listening host with the new URL. It will be shown only once.`
            : ''
        }
        confirmLabel="Regenerate"
        cancelLabel="Cancel"
        variant="default"
        isLoading={regenerating}
        onConfirm={confirmRegenerate}
        onCancel={() => { if (!regenerating) setRegenTarget(null); }}
      />

      <ConfirmModal
        isOpen={Boolean(revokeTarget)}
        title="Revoke this terminal?"
        message={
          revokeTarget
            ? `"${revokeTarget.label || 'Untitled terminal'}"${revokeTarget.outletName ? ` (${revokeTarget.outletName})` : ''} will stop reporting attendance immediately.`
            : ''
        }
        confirmLabel="Revoke terminal"
        cancelLabel="Keep active"
        variant="danger"
        isLoading={revoking}
        onConfirm={confirmRevoke}
        onCancel={() => { if (!revoking) setRevokeTarget(null); }}
      />
    </div>
  );
};

export default FaceTerminals;
