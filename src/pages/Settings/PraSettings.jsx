import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Clipboard, ExternalLink, Save, ShieldCheck, Stethoscope, Trash2 } from 'lucide-react';
import { checkPraSetup, getPraConfig, updatePraConfig } from '../../api/praApi';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { inputCls, labelCls } from '../../components/UI/PremiumModal';

const EMPTY = {
  enabled: false,
  mode: 'sandbox',
  sandboxPosId: '',
  productionPosId: '',
  defaultPctCode: '',
  hasSandboxToken: false,
  usesSharedSandboxToken: false,
  hasProductionToken: false,
  staticIps: [],
};

const TextField = ({ label, value, onChange, type = 'text', inputMode, placeholder, hint, children }) => (
  <div>
    <label className={labelCls}>{label}</label>
    <input type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={inputCls} />
    {children}
    {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
  </div>
);

const SectionLabel = ({ children }) => (
  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{children}</p>
);

const PraSettings = ({ outletId, onStatus }) => {
  const [form, setForm] = useState(EMPTY);
  const [sandboxToken, setSandboxToken] = useState('');
  const [productionToken, setProductionToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const load = () => {
    if (!outletId) return;
    setLoading(true);
    getPraConfig({ outlet: outletId })
      .then(({ data }) => {
        const next = { ...EMPTY, ...(data?.data || {}) };
        setForm(next);
        onStatus?.({ enabled: next.enabled, mode: next.mode });
      })
      .catch(() => toast.error('Failed to load PRA eIMS settings.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setSandboxToken('');
    setProductionToken('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId]);

  const payload = () => ({
    enabled: form.enabled,
    mode: form.mode,
    sandboxPosId: form.sandboxPosId,
    productionPosId: form.productionPosId,
    defaultPctCode: form.defaultPctCode,
    ...(sandboxToken.trim() ? { sandboxToken: sandboxToken.trim() } : {}),
    ...(productionToken.trim() ? { productionToken: productionToken.trim() } : {}),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePraConfig(payload(), { outlet: outletId });
      toast.success('PRA eIMS settings saved.');
      setSandboxToken('');
      setProductionToken('');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save PRA settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      const token = form.mode === 'production' ? productionToken.trim() : sandboxToken.trim();
      const posId = form.mode === 'production' ? form.productionPosId : form.sandboxPosId;
      const { data } = await checkPraSetup({
        mode: form.mode,
        posId,
        token: token || undefined,
        defaultPctCode: form.defaultPctCode,
      }, { outlet: outletId });
      toast.success(data?.data?.message || 'PRA setup is ready.');
    } catch (error) {
      toast.error(error.response?.data?.data?.message || error.response?.data?.message || 'PRA setup is incomplete.');
    } finally {
      setChecking(false);
    }
  };

  const clearToken = async (mode) => {
    setSaving(true);
    try {
      await updatePraConfig(
        mode === 'sandbox' ? { clearSandboxToken: true } : { clearProductionToken: true },
        { outlet: outletId },
      );
      toast.success('Token removed.');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not remove token.');
    } finally {
      setSaving(false);
    }
  };

  const copyIps = async () => {
    try {
      await navigator.clipboard.writeText((form.staticIps || []).join('\n'));
      toast.success('Static IPs copied.');
    } catch {
      toast.error('Could not copy automatically. Select the IPs and copy them manually.');
    }
  };

  const statusChip = (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
      !form.enabled ? 'bg-gray-100 text-gray-500'
        : form.mode === 'production' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
    )}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', !form.enabled ? 'bg-gray-400' : form.mode === 'production' ? 'bg-emerald-500' : 'bg-amber-500')} />
      {!form.enabled ? 'Disabled' : form.mode === 'production' ? 'Live' : 'Sandbox'}
    </span>
  );

  return (
    <Card
      title="PRA eIMS Fiscal Invoicing"
      subtitle="Report this outlet's sales to Punjab Revenue Authority"
      icon={ShieldCheck}
      iconAccent="emerald"
      action={!loading ? statusChip : null}
    >
      {loading ? <div className="h-56 rounded-xl bg-gray-50 animate-pulse" /> : (
        <div className="space-y-6">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm leading-relaxed text-emerald-900">
            This is the PRA eIMS cloud integration. The Windows <strong>.exe installer is not needed</strong> on Heroku.
            Each restaurant/outlet must use its own PRA POS ID and production token.
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3.5">
            <label className="flex cursor-pointer select-none items-center gap-3">
              <input type="checkbox" checked={form.enabled} onChange={(event) => set('enabled', event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm font-medium text-gray-800">Enable PRA reporting for this outlet</span>
            </label>
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              {['sandbox', 'production'].map((mode) => (
                <button key={mode} type="button" onClick={() => set('mode', mode)} className={clsx(
                  'rounded-md px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors',
                  form.mode === mode ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700',
                )}>{mode}</button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <SectionLabel>PRA POS registration</SectionLabel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Sandbox Test POS ID" value={form.sandboxPosId} onChange={(value) => set('sandboxPosId', value)} inputMode="numeric" placeholder="Generated by PRA" hint="PRA POS Client Registration → Generate Test POS IDs." />
              <TextField label="Production POS ID" value={form.productionPosId} onChange={(value) => set('productionPosId', value)} inputMode="numeric" placeholder="Registered outlet POS ID" hint="Use the POS ID assigned to this outlet—not another restaurant's ID." />
            </div>
          </div>

          <div className="space-y-3">
            <SectionLabel>Bearer tokens</SectionLabel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Sandbox token"
                type="password"
                value={sandboxToken}
                onChange={setSandboxToken}
                placeholder={form.hasSandboxToken ? '•••••••• (saved — type to replace)' : form.usesSharedSandboxToken ? 'Shared PRA sandbox token is active' : 'Paste PRA sandbox token'}
              >
                <div className="mt-1 flex items-center justify-between">
                  <span className={clsx('text-xs', form.hasSandboxToken || form.usesSharedSandboxToken ? 'text-emerald-600' : 'text-gray-400')}>
                    {form.hasSandboxToken ? '✓ Outlet token saved' : form.usesSharedSandboxToken ? '✓ Server shared token available' : 'No sandbox token'}
                  </span>
                  {form.hasSandboxToken && <button type="button" onClick={() => clearToken('sandbox')} disabled={saving} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600"><Trash2 size={12} /> Remove</button>}
                </div>
              </TextField>
              <TextField
                label="Production token"
                type="password"
                value={productionToken}
                onChange={setProductionToken}
                placeholder={form.hasProductionToken ? '•••••••• (saved — type to replace)' : 'Paste this POS ID’s production token'}
              >
                <div className="mt-1 flex items-center justify-between">
                  <span className={clsx('text-xs', form.hasProductionToken ? 'text-emerald-600' : 'text-gray-400')}>{form.hasProductionToken ? '✓ Token saved' : 'No production token'}</span>
                  {form.hasProductionToken && <button type="button" onClick={() => clearToken('production')} disabled={saving} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600"><Trash2 size={12} /> Remove</button>}
                </div>
              </TextField>
            </div>
          </div>

          <div className="space-y-3">
            <SectionLabel>Invoice classification</SectionLabel>
            <div className="sm:max-w-sm">
              <TextField label="Default PCT service code" value={form.defaultPctCode} onChange={(value) => set('defaultPctCode', value)} placeholder="8 digits" hint="Restaurant/service classification from the Second Schedule. Individual menu items can override it." />
            </div>
          </div>

          {(form.staticIps || []).length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-sky-900">Production server IP whitelist</p>
                  <p className="mt-1 text-xs leading-relaxed text-sky-700">
                    Email these IPs with the restaurant PNTN, business name and POS ID to eims@pra.punjab.gov.pk. Add both IPs for every separately registered restaurant.
                  </p>
                  <div className="mt-2 space-y-1 font-mono text-sm font-semibold text-sky-950">
                    {form.staticIps.map((ip) => <div key={ip}>{ip}</div>)}
                  </div>
                </div>
                <Button type="button" variant="secondary" icon={Clipboard} onClick={copyIps}>Copy IPs</Button>
              </div>
            </div>
          )}

          <p className="text-xs leading-relaxed text-gray-500">
            Need credentials? Register the restaurant/POS in the PRA portal, generate a Test POS ID for sandbox, then use that POS row&apos;s production token for live reporting. View posted invoices in the PRA eIMS portal.{' '}
            <a href="https://e.pra.punjab.gov.pk/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">Open PRA portal <ExternalLink size={11} /></a>
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
            <Button variant="secondary" icon={Stethoscope} onClick={handleCheck} disabled={checking}>{checking ? 'Checking…' : 'Check setup'}</Button>
            <Button variant="gradient" icon={Save} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save PRA settings'}</Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default PraSettings;
