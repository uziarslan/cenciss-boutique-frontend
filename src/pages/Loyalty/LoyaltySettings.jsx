import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Save, Coins, Repeat, CreditCard as CardIcon, ShieldCheck, Sparkles, Banknote, Layers, RotateCcw, Landmark } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import Button from '../../components/UI/Button';
import SearchableSelect from '../../components/UI/SearchableSelect';
import {
  ReportCard,
  ReportSectionHeader,
  ReportSkeleton,
} from '../Reports/ReportShared';
import { updateLoyaltyConfig } from '../../api/loyaltyApi';
import { baseApi, useGetLoyaltyConfigQuery, listQueryOpts } from '../../store/baseApi';

// ── Premium switch (label-controlled, peer-based) ─────────────────────────────
const Switch = ({ checked, onChange, label, hint }) => (
  <label className="group flex items-start gap-3 cursor-pointer select-none">
    <span className="relative inline-flex shrink-0 mt-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="h-5 w-9 rounded-full bg-gray-200 transition-colors peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40" />
      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-medium text-gray-800">{label}</span>
      {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
    </span>
  </label>
);

// ── Premium pill-checkbox (used for multi-select payment methods) ──────────────
const PillCheck = ({ active, onClick, icon: Icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all',
      active
        ? 'border-indigo-300 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/15 shadow-sm'
        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800'
    )}
  >
    {Icon && <Icon size={14} />}
    {label}
    <span
      className={clsx(
        'w-4 h-4 rounded border flex items-center justify-center transition-colors ml-1',
        active ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'
      )}
    >
      {active && (
        <svg viewBox="0 0 12 12" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 6.5L5 9.5L10 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  </button>
);

const Field = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-semibold text-gray-700">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
  </div>
);

const Input = (props) => (
  <input
    {...props}
    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
  />
);

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CardIcon },
  { value: 'online-transfer', label: 'Online Transfer', icon: Landmark },
  { value: 'split', label: 'Split', icon: Layers },
];

const EARN_BASIS_OPTIONS = [
  { value: 'subtotal', label: 'Subtotal (excl. tax)' },
  { value: 'subtotalPlusTax', label: 'Subtotal + Tax' },
];

const APPLY_MODE_OPTIONS = [
  { value: 'preTax', label: 'Pre-tax discount' },
  { value: 'postTax', label: 'Post-tax discount' },
];

const CARD_MODE_OPTIONS = [
  { value: 'auto', label: 'Auto-generated' },
  { value: 'manual', label: 'Manual entry' },
];

const BREAKAGE_OPTIONS = [
  { value: '4003', label: '4003 — Breakage Revenue', meta: 'Revenue · separate P&L line' },
  { value: '5005', label: '5005 — Reverse Rewards Expense', meta: 'Net against expense' },
];

const LoyaltySettings = () => {
  const dispatch = useDispatch();
  const [cfg, setCfg] = useState(null);
  const [original, setOriginal] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: config, isLoading: loading } = useGetLoyaltyConfigQuery(undefined, listQueryOpts);

  // Seed the editable working copy once the cached config arrives.
  useEffect(() => {
    if (config) {
      setCfg(config);
      setOriginal(config);
    }
  }, [config]);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const togglePM = (m) => {
    const cur = new Set(cfg.earnOnPaymentMethods || []);
    cur.has(m) ? cur.delete(m) : cur.add(m);
    set('earnOnPaymentMethods', Array.from(cur));
  };

  const isDirty = useMemo(() => {
    if (!cfg || !original) return false;
    const keys = [
      'pointsPerCurrencyUnit', 'earnBasis', 'redemptionValue', 'minRedeemPoints',
      'maxRedeemPercent', 'redemptionApplyMode', 'cardNumberMode', 'cardNumberPrefix',
      'refundReversesPoints', 'expiryMonths', 'breakageAccountCode',
    ];
    for (const k of keys) {
      if (String(cfg[k] ?? '') !== String(original[k] ?? '')) return true;
    }
    const a = [...(cfg.earnOnPaymentMethods || [])].sort().join(',');
    const b = [...(original.earnOnPaymentMethods || [])].sort().join(',');
    return a !== b;
  }, [cfg, original]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateLoyaltyConfig({
        pointsPerCurrencyUnit: Number(cfg.pointsPerCurrencyUnit),
        earnBasis: cfg.earnBasis,
        earnOnPaymentMethods: cfg.earnOnPaymentMethods,
        redemptionValue: Number(cfg.redemptionValue),
        minRedeemPoints: Number(cfg.minRedeemPoints),
        maxRedeemPercent: Number(cfg.maxRedeemPercent),
        redemptionApplyMode: cfg.redemptionApplyMode,
        cardNumberMode: cfg.cardNumberMode,
        cardNumberPrefix: cfg.cardNumberPrefix,
        refundReversesPoints: cfg.refundReversesPoints,
        expiryMonths: Number(cfg.expiryMonths),
        breakageAccountCode: cfg.breakageAccountCode,
      });
      const updated = res?.data?.data ?? cfg;
      setCfg(updated);
      setOriginal(updated);
      dispatch(baseApi.util.invalidateTags(['LoyaltyConfig']));
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (original) setCfg(original);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <ReportSkeleton rows={3} cols={3} />
        <ReportSkeleton rows={3} cols={3} />
      </div>
    );
  }
  if (!cfg) return null;

  return (
    <>
      <div className="space-y-6 pb-32 max-w-5xl">
        {/* Earning */}
        <ReportCard>
          <ReportSectionHeader icon={Coins} iconAccent="amber" title="Earning" subtitle="How customers accrue points" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5">
            <Field label="Points per currency unit" hint="e.g. 0.01 = 1 pt per 100 PKR">
              <Input type="number" step="0.001" value={cfg.pointsPerCurrencyUnit} onChange={(e) => set('pointsPerCurrencyUnit', e.target.value)} />
            </Field>
            <Field label="Earn basis">
              <SearchableSelect
                options={EARN_BASIS_OPTIONS}
                value={cfg.earnBasis}
                onChange={(v) => set('earnBasis', v)}
                searchable={false}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Earn on payment methods" hint="Allowance sales never earn points">
                <div className="flex flex-wrap gap-2 pt-1">
                  {PAYMENT_METHODS.map((m) => (
                    <PillCheck
                      key={m.value}
                      active={(cfg.earnOnPaymentMethods || []).includes(m.value)}
                      onClick={() => togglePM(m.value)}
                      icon={m.icon}
                      label={m.label}
                    />
                  ))}
                </div>
              </Field>
            </div>
          </div>
        </ReportCard>

        {/* Redemption */}
        <ReportCard>
          <ReportSectionHeader icon={Repeat} iconAccent="indigo" title="Redemption" subtitle="How customers spend points at checkout" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 p-5">
            <Field label="Value per point (PKR)">
              <Input type="number" step="0.01" value={cfg.redemptionValue} onChange={(e) => set('redemptionValue', e.target.value)} />
            </Field>
            <Field label="Minimum points">
              <Input type="number" value={cfg.minRedeemPoints} onChange={(e) => set('minRedeemPoints', e.target.value)} />
            </Field>
            <Field label="Max % of bill" hint="Cap on redemption per sale">
              <Input type="number" min="0" max="100" value={cfg.maxRedeemPercent} onChange={(e) => set('maxRedeemPercent', e.target.value)} />
            </Field>
            <Field label="Applied">
              <SearchableSelect
                options={APPLY_MODE_OPTIONS}
                value={cfg.redemptionApplyMode}
                onChange={(v) => set('redemptionApplyMode', v)}
                searchable={false}
              />
            </Field>
          </div>
        </ReportCard>

        {/* Cards */}
        <ReportCard>
          <ReportSectionHeader icon={CardIcon} iconAccent="violet" title="Membership Cards" subtitle="How card numbers are generated" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5">
            <Field label="Card number mode">
              <SearchableSelect
                options={CARD_MODE_OPTIONS}
                value={cfg.cardNumberMode}
                onChange={(v) => set('cardNumberMode', v)}
                searchable={false}
              />
            </Field>
            <Field label="Auto-format prefix" hint="Used in auto mode. Example: MC → MC-2026-000001">
              <Input type="text" value={cfg.cardNumberPrefix || ''} onChange={(e) => set('cardNumberPrefix', e.target.value)} />
            </Field>
          </div>
        </ReportCard>

        {/* Rules */}
        <ReportCard>
          <ReportSectionHeader icon={ShieldCheck} iconAccent="emerald" title="Rules" subtitle="Refund behaviour, expiry, and accounting" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-5">
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
              <Switch
                checked={!!cfg.refundReversesPoints}
                onChange={(v) => set('refundReversesPoints', v)}
                label="Refund reverses points"
                hint="When a sale is refunded or voided, undo earn/redeem."
              />
            </div>
            <Field label="Expiry (months)" hint="0 = points never expire">
              <Input type="number" min="0" value={cfg.expiryMonths} onChange={(e) => set('expiryMonths', e.target.value)} />
            </Field>
            <Field label="Breakage flows to" hint="Where expired points are recognised on the books">
              <SearchableSelect
                options={BREAKAGE_OPTIONS}
                value={cfg.breakageAccountCode}
                onChange={(v) => set('breakageAccountCode', v)}
                searchable={false}
              />
            </Field>
          </div>
        </ReportCard>
      </div>

      {/* Sticky save bar — slides up when there are unsaved changes */}
      <div
        className={clsx(
          'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 transition-all duration-300',
          isDirty ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        )}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-indigo-900/10 px-5 py-3">
          <div className="flex items-center gap-2 pr-2 border-r border-gray-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-amber-500" />
            </span>
            <span className="text-sm font-medium text-gray-700">Unsaved changes</span>
          </div>
          <Button variant="ghost" icon={RotateCcw} onClick={handleDiscard} disabled={saving} size="sm">
            Discard
          </Button>
          <Button variant="primary" icon={Save} onClick={handleSave} disabled={saving} size="sm">
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Idle hint when clean — quick context for what changes do */}
      {!isDirty && (
        <p className="text-xs text-gray-400 inline-flex items-center gap-1.5 mt-2">
          <Sparkles size={12} className="text-indigo-400" />
          Changes apply to the next sale on every POS terminal.
        </p>
      )}
    </>
  );
};

export default LoyaltySettings;
