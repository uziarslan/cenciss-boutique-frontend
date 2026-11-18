import { useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useFieldArray, useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, AlertTriangle, BookOpen, Scale, Lock, Loader2, Pencil, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { createJournalEntry, updateJournalEntry, deleteCustomParty, updateCustomParty } from '../../api/accountingApi';
import { baseApi, useGetAccountsQuery, useGetVendorsQuery, useGetCustomPartiesQuery, listQueryOpts } from '../../store/baseApi';
import AmountInput from '../../components/UI/AmountInput';
import SearchableSelect from '../../components/UI/SearchableSelect';
import PremiumModal, { SecondaryButton, PrimaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';
import usePermissions from '../../hooks/usePermissions';
import OrderSalaryChargeForm from './OrderSalaryChargeForm';

const fmt = (n) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Zod schema ────────────────────────────────────────────────────────────────

const lineSchema = z.object({
  account: z.string().min(1, 'Account required'),
  debit:   z.coerce.number().min(0).default(0),
  credit:  z.coerce.number().min(0).default(0),
  notes:   z.string().optional(),
});

const schema = z.object({
  date:        z.string().min(1, 'Date required'),
  description: z.string().min(3, 'Description must be at least 3 characters').max(500),
  party:       z.string().optional(),        // display name (vendor name or free text)
  partyVendor: z.string().optional(),        // vendor _id when the party is a known vendor
  lines:       z.array(lineSchema).min(2, 'At least 2 lines required'),
});

// ── Account searchable select ─────────────────────────────────────────────────

const AccountSelect = ({ value, onChange, accounts }) => (
  <SearchableSelect
    options={accounts.filter((a) => a.isActive !== false).map((a) => ({ value: a._id, label: a.name, meta: a.code }))}
    value={value}
    onChange={onChange}
    placeholder="Select account…"
    searchPlaceholder="Search code or name…"
    size="sm"
  />
);

// ── Main component ────────────────────────────────────────────────────────────

const JournalEntryForm = ({ entry, onClose, onSaved }) => {
  const dispatch = useDispatch();
  const { has } = usePermissions();
  const [chargingSalary, setChargingSalary] = useState(false);
  const isEdit = Boolean(entry);
  // Purchase and payment postings remain tied to their source documents. Other
  // modules receive the full edit workflow when the user has edit permission.
  const systemLocked = isEdit && [
    'purchase',
    'purchaseAdjustment',
    'payment',
    'assetDepreciation',
    'assetAuditAdjustment',
    'assetAcquisition',
    'assetDisposal',
  ].includes(entry?.sourceModule);

  const accountsParams = useMemo(() => ({ isActive: true }), []);
  const { data: accountsPayload } = useGetAccountsQuery(accountsParams, listQueryOpts);
  const { data: vendors = [] } = useGetVendorsQuery();
  const { data: customParties = [] } = useGetCustomPartiesQuery();
  // Party field: pick a vendor (groups this entry WITH that vendor's AP in aging)
  // or type a custom party. Custom mode when an existing entry has a free-text
  // party but no vendor link.
  const [useCustomParty, setUseCustomParty] = useState(() => isEdit && !!entry?.party && !entry?.partyVendor);
  // Inline "Manage" panel for renaming / deleting saved custom parties.
  const [managingParties, setManagingParties] = useState(false);
  const [deletingPartyId, setDeletingPartyId] = useState(null);
  const [editingPartyId, setEditingPartyId]   = useState(null);
  const [editPartyName,  setEditPartyName]    = useState('');
  const [savingPartyId,  setSavingPartyId]    = useState(null);
  // While any row is mid-delete or mid-save, freeze the other rows' actions.
  const partyBusy = !!deletingPartyId || !!savingPartyId;

  const startEditParty  = (cp) => { setEditingPartyId(cp._id); setEditPartyName(cp.name); };
  const cancelEditParty = () => { setEditingPartyId(null); setEditPartyName(''); };

  const handleDeleteParty = async (cp) => {
    setDeletingPartyId(cp._id);
    try {
      await deleteCustomParty(cp._id);
      // Refresh the dropdown/list everywhere it's used (JE form + Ledger filter).
      dispatch(baseApi.util.invalidateTags(['CustomParty']));
      toast.success(`Removed “${cp.name}” from saved parties`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not delete party.');
    } finally {
      setDeletingPartyId(null);
    }
  };

  const handleSaveParty = async (cp) => {
    const name = editPartyName.trim();
    if (!name) { toast.error('Party name is required.'); return; }
    if (name === cp.name) { cancelEditParty(); return; }
    setSavingPartyId(cp._id);
    try {
      const resp = await updateCustomParty(cp._id, { name });
      const n = resp?.data?.data?.retagged ?? 0;
      // Renaming also re-tags matching entries + touches the aging/ledger views.
      dispatch(baseApi.util.invalidateTags(['CustomParty', 'JournalEntry', 'Accounting', 'Report']));
      toast.success(n > 0 ? `Renamed to “${name}” · ${n} ${n === 1 ? 'entry' : 'entries'} updated` : `Renamed to “${name}”`);
      cancelEditParty();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not rename party.');
    } finally {
      setSavingPartyId(null);
    }
  };
  // In edit mode, merge in the accounts this entry already references — including
  // any since-deactivated ones (which the active-only query omits) — so every line
  // shows the account it actually points to instead of a blank picker.
  const accounts = useMemo(() => {
    const base = accountsPayload ?? [];
    if (!isEdit) return base;
    const seen  = new Set(base.map((a) => a._id));
    const extra = (entry.lines ?? [])
      .map((l) => l.account)
      .filter((a) => a && typeof a === 'object' && a._id && !seen.has(a._id));
    return extra.length ? [...base, ...extra] : base;
  }, [accountsPayload, isEdit, entry]);

  const {
    register,
    control,
    handleSubmit,
    setValue: setFormValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: isEdit
      ? {
          date:        entry.date ? format(new Date(entry.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
          description: entry.description ?? '',
          party:       entry.party ?? '',
          partyVendor: (entry.partyVendor?._id ?? entry.partyVendor ?? '').toString(),
          lines:       (entry.lines ?? []).map((l) => ({
            account: l.account?._id ?? l.account ?? '',
            debit:   l.debit ?? 0,
            credit:  l.credit ?? 0,
            notes:   l.notes ?? '',
          })),
        }
      : {
          date:        format(new Date(), 'yyyy-MM-dd'),
          description: '',
          party:       '',
          partyVendor: '',
          lines:       [
            { account: '', debit: 0, credit: 0, notes: '' },
            { account: '', debit: 0, credit: 0, notes: '' },
          ],
        },
  });

  const setValue = (name, value) => setFormValue(name, value, { shouldDirty: true });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  // Spreadsheet-style entry: pressing Tab from the last line's last field (Notes)
  // appends a fresh line and drops focus into it, so the cashier can keep adding
  // lines from the keyboard without reaching for the "Add line" button.
  const linesBodyRef = useRef(null);
  const handleNotesTab = (e, idx) => {
    if (systemLocked) return;                        // locked entries keep their lines
    if (e.key !== 'Tab' || e.shiftKey) return;      // only forward-Tab
    if (idx !== fields.length - 1) return;          // only on the last line
    e.preventDefault();
    append({ account: '', debit: 0, credit: 0, notes: '' });
    // Focus the first control of the newly-rendered row (runs after React commits).
    setTimeout(() => {
      const rows = linesBodyRef.current?.querySelectorAll('tr');
      const newRow = rows?.[rows.length - 1];
      const focusable = newRow?.querySelector('button, input, [tabindex]');
      focusable?.focus?.();
    }, 0);
  };

  const watchedLines = useWatch({ control, name: 'lines' }) ?? [];
  const partyVendor  = useWatch({ control, name: 'partyVendor' }) ?? '';
  const partyText    = useWatch({ control, name: 'party' }) ?? '';

  const toggleCustomParty = () => {
    setUseCustomParty((prev) => !prev);
    setValue('party', '');
    setValue('partyVendor', '');
  };

  // Unified party picker: vendors (value v:<id>) + saved custom parties
  // (value c:<name>). Custom parties already matching a vendor name are hidden to
  // avoid duplicates. The current custom party is injected if not yet in the list
  // (e.g. editing an entry whose party hasn't been saved).
  const vendorNames = useMemo(() => new Set(vendors.map((v) => v.name.toLowerCase())), [vendors]);
  const partyOptions = useMemo(() => {
    const opts = customParties
      .filter((cp) => cp.isSystem && cp.name)
      .map((cp) => ({ value: `c:${cp.name}`, label: cp.name, meta: 'System party' }));
    opts.push(...vendors.map((v) => ({ value: `v:${v._id}`, label: v.name, meta: 'Vendor' })));
    const seen = new Set(
      customParties
        .filter((cp) => cp.isSystem && cp.name)
        .map((cp) => cp.name.toLowerCase()),
    );
    for (const cp of customParties) {
      const lc = (cp.name ?? '').toLowerCase();
      if (!lc || cp.isSystem || vendorNames.has(lc) || seen.has(lc)) continue;
      seen.add(lc);
      opts.push({ value: `c:${cp.name}`, label: cp.name, meta: 'Custom' });
    }
    if (!partyVendor && partyText && !seen.has(partyText.toLowerCase()) && !vendorNames.has(partyText.toLowerCase())) {
      opts.push({ value: `c:${partyText}`, label: partyText, meta: 'Custom' });
    }
    return opts;
  }, [vendors, customParties, vendorNames, partyVendor, partyText]);

  const selectedPartyValue = partyVendor ? `v:${partyVendor}` : (partyText ? `c:${partyText}` : '');

  const onPartyChange = (val) => {
    if (val?.startsWith('v:')) {
      const id = val.slice(2);
      setValue('partyVendor', id);
      setValue('party', vendors.find((v) => v._id === id)?.name ?? '');
    } else if (val?.startsWith('c:')) {
      setValue('party', val.slice(2));
      setValue('partyVendor', '');
    } else {
      setValue('party', '');
      setValue('partyVendor', '');
    }
  };

  const totalDebit  = watchedLines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = watchedLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.001;

  const onSubmit = async (values) => {
    if (!isBalanced) { toast.error('Entry must balance before submitting.'); return; }
    try {
      if (isEdit) {
        // Always send party fields (as '' when empty) so the tag can be CLEARED or
        // switched — collapsing to undefined would drop the key and the backend
        // would keep the stale tag.
        await updateJournalEntry(entry._id, {
          date:        values.date,
          description: values.description,
          lines:       values.lines,
          party:       (values.party ?? '').trim(),
          partyVendor: values.partyVendor || '',
        });
        toast.success('Journal entry updated.');
      } else {
        // Create: omit empties (nothing to clear).
        await createJournalEntry({
          ...values,
          party:       (values.party ?? '').trim() || undefined,
          partyVendor: values.partyVendor || undefined,
          sourceModule: 'manual',
        });
        toast.success('Journal entry posted.');
      }
      dispatch(baseApi.util.invalidateTags(['JournalEntry', 'Accounting', 'Report', 'CustomParty']));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message ?? (isEdit ? 'Failed to update entry.' : 'Failed to post entry.'));
    }
  };

  const balanceHero = (
    <div className="flex items-center justify-between rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/20 px-4 py-3">
      <div className="flex items-center gap-2 text-white/85 text-xs font-semibold uppercase tracking-widest">
        <Scale size={14} /> Balance
      </div>
      <div className="flex items-center gap-4 text-sm font-bold text-white tabular-nums">
        <span>Dr {fmt(totalDebit)}</span>
        <span className="text-white/40">·</span>
        <span>Cr {fmt(totalCredit)}</span>
        <span className={clsx(
          'ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest',
          isBalanced ? 'bg-emerald-400/20 text-emerald-100' : 'bg-amber-400/20 text-amber-100'
        )}>
          {isBalanced ? 'Balanced' : `Diff ${fmt(Math.abs(totalDebit - totalCredit))}`}
        </span>
      </div>
    </div>
  );

  if (chargingSalary) return <OrderSalaryChargeForm entry={entry} onBack={() => setChargingSalary(false)} onClose={onClose} onSaved={onSaved} />;

  return (
    <PremiumModal
      open
      onClose={isSubmitting ? undefined : onClose}
      icon={BookOpen}
      eyebrow={isEdit ? `Edit ${entry.entryNumber}` : 'New Manual Entry'}
      title={isEdit ? 'Edit Journal Entry' : 'Journal Entry'}
      subtitle={isEdit
        ? (systemLocked
            ? `Edit the description or reclassify account heads on this ${entry.sourceModule} entry. Source-linked values remain locked.`
            : 'Update this entry — the change is recorded in the audit log.')
        : 'Post a manual debit/credit entry to the general ledger'}
      accent="indigo"
      size="xl"
      hero={balanceHero}
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose} disabled={isSubmitting}>Cancel</SecondaryButton>
          <PrimaryButton
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting || !isBalanced}
            accent="indigo"
          >
            {isSubmitting
              ? (isEdit ? 'Saving…' : 'Posting…')
              : (isEdit ? 'Save Changes' : 'Post Entry')}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {systemLocked && (
          <div className="flex items-start gap-2 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl">
            <Lock size={15} className="text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-700">
              Source-linked {entry.sourceModule} entry. You can edit the description and change permitted account heads.
              Debit and credit amounts, date, notes, party, and line count are locked to the source transaction.
            </p>
          </div>
        )}

        {/* Header section */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Date <span className="text-rose-500">*</span></label>
              <input type="date" {...register('date')} disabled={systemLocked} className={clsx(inputCls, systemLocked && 'bg-slate-100 text-slate-500 cursor-not-allowed')} />
              {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Description <span className="text-rose-500">*</span></label>
              <input
                type="text"
                {...register('description')}
                placeholder="Describe this entry…"
                className={inputCls}
              />
              {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
            </div>
          </div>

          {/* Party — optional; tags the entry so AP Aging groups it under a vendor.
              Hidden on locked (auto) entries, whose party comes from the source doc. */}
          {!systemLocked && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className={clsx(labelCls, 'mb-0')}>
                  Party <span className="text-slate-400 font-normal">(optional — groups this entry in AP Aging)</span>
                </label>
                <div className="flex items-center gap-3">
                  {entry?.sourceModule === 'pos' && entry.status === 'posted' && !entry.reversedBy && !entry.salaryAdvance && has('salaries.manage') && has('accounting.editJournalEntry') && (
                    <button type="button" onClick={() => setChargingSalary(true)} disabled={isSubmitting || isDirty}
                      title={isDirty ? 'Save or discard your journal edits before charging this order to salary.' : 'Charge the linked POS order to an employee’s salary'}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap disabled:opacity-40">
                      Charge to Salary
                    </button>
                  )}
                  {!useCustomParty && (customParties.length > 0 || managingParties) && (
                    <button
                      type="button"
                      onClick={() => setManagingParties((v) => !v)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700 whitespace-nowrap"
                    >
                      {managingParties ? 'Done' : 'Manage'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleCustomParty}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                  >
                    {useCustomParty ? 'Pick from list' : 'Enter new party'}
                  </button>
                </div>
              </div>
              {useCustomParty ? (
                <input
                  type="text"
                  {...register('party')}
                  placeholder="New party name… (saved for reuse)"
                  className={inputCls}
                  autoFocus
                />
              ) : (
                <SearchableSelect
                  options={partyOptions}
                  value={selectedPartyValue}
                  onChange={onPartyChange}
                  placeholder="Select vendor or saved party…"
                  searchPlaceholder="Search parties…"
                  allowClear
                />
              )}

              {/* Inline manage panel — delete saved custom parties from the reuse
                  list. Removing one does NOT touch entries already tagged with it. */}
              {!useCustomParty && managingParties && (
                <div className="mt-2 border border-slate-200 rounded-xl bg-slate-50/60 p-2">
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Saved parties</p>
                  {customParties.length === 0 && (
                    <p className="px-2 py-2 text-xs italic text-slate-400">No saved parties left.</p>
                  )}
                  <ul className="max-h-44 overflow-y-auto space-y-0.5">
                    {customParties.map((cp) => {
                      const isEditing = editingPartyId === cp._id;
                      const isDeleting = deletingPartyId === cp._id;
                      const isSaving = savingPartyId === cp._id;
                      return (
                        <li key={cp._id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white">
                          {isEditing ? (
                            <>
                              <input
                                type="text"
                                value={editPartyName}
                                onChange={(e) => setEditPartyName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); handleSaveParty(cp); }
                                  if (e.key === 'Escape') { e.preventDefault(); cancelEditParty(); }
                                }}
                                disabled={isSaving}
                                autoFocus
                                className="flex-1 min-w-0 px-2 py-1 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
                              />
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleSaveParty(cp)}
                                  disabled={isSaving}
                                  title="Save name"
                                  className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition"
                                >
                                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditParty}
                                  disabled={isSaving}
                                  title="Cancel"
                                  className="p-1 rounded-md text-slate-400 hover:bg-slate-100 disabled:opacity-50 transition"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="text-sm text-slate-700 truncate">{cp.name}</span>
                              {cp.isSystem ? (
                                <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                                  <Lock size={12} /> System
                                </span>
                              ) : (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => startEditParty(cp)}
                                    disabled={partyBusy}
                                    title="Rename"
                                    className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 transition"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteParty(cp)}
                                    disabled={partyBusy}
                                    title="Remove from saved parties"
                                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition"
                                  >
                                    {isDeleting ? <Loader2 size={14} className="animate-spin text-rose-500" /> : <Trash2 size={14} />}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="px-1 pt-1.5 text-[10px] text-slate-400">System defaults are locked. Changes to custom shortcuts do not alter entries already tagged with them.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lines section */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Lines</h4>
              <p className="text-[11px] text-slate-400">Each entry must have at least two balanced lines.</p>
            </div>
            {!systemLocked && (
              <button
                type="button"
                onClick={() => append({ account: '', debit: 0, credit: 0, notes: '' })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition"
              >
                <Plus size={13} /> Add line
              </button>
            )}
          </div>

          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-2.5 px-3 w-64">Account</th>
                    <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-2.5 px-3 w-32">Debit (Rs.)</th>
                    <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-2.5 px-3 w-32">Credit (Rs.)</th>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-2.5 px-3">Notes</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100" ref={linesBodyRef}>
                  {fields.map((field, idx) => (
                    <tr key={field.id} className="hover:bg-slate-50/60 transition-colors align-top">
                      <td className="py-2 px-3">
                        <AccountSelect
                          value={watchedLines[idx]?.account ?? ''}
                          onChange={(v) => setValue(`lines.${idx}.account`, v)}
                          accounts={accounts}
                        />
                        {errors.lines?.[idx]?.account && (
                          <p className="mt-0.5 text-xs text-red-600">{errors.lines[idx].account.message}</p>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <Controller
                          control={control}
                          name={`lines.${idx}.debit`}
                          render={({ field: f }) => (
                            <AmountInput
                              value={f.value ?? ''}
                              onChange={(raw) => f.onChange(raw)}
                              onBlur={f.onBlur}
                              disabled={systemLocked}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                            />
                          )}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Controller
                          control={control}
                          name={`lines.${idx}.credit`}
                          render={({ field: f }) => (
                            <AmountInput
                              value={f.value ?? ''}
                              onChange={(raw) => f.onChange(raw)}
                              onBlur={f.onBlur}
                              disabled={systemLocked}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                            />
                          )}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          {...register(`lines.${idx}.notes`)}
                          disabled={systemLocked}
                          onKeyDown={(e) => handleNotesTab(e, idx)}
                          placeholder="Optional…"
                          className={clsx('w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400', systemLocked && 'bg-slate-100 text-slate-500 cursor-not-allowed')}
                        />
                      </td>
                      <td className="py-2 px-3">
                        {fields.length > 2 && !systemLocked && (
                          <button
                            type="button"
                            onClick={() => remove(idx)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/80 border-t-2 border-slate-100">
                  <tr>
                    <td className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em]">Totals</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-800 tabular-nums">{fmt(totalDebit)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-800 tabular-nums">{fmt(totalCredit)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {watchedLines.length >= 2 && !isBalanced && (
            <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={15} className="text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700">
                Entry is not balanced — Debit: Rs. {fmt(totalDebit)}, Credit: Rs. {fmt(totalCredit)},
                Difference: Rs. {fmt(Math.abs(totalDebit - totalCredit))}
              </p>
            </div>
          )}
        </div>
      </form>
    </PremiumModal>
  );
};

export default JournalEntryForm;
