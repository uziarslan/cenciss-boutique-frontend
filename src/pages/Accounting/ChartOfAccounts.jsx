import { useState, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { Lock, Plus, Pencil, PowerOff, Trash2, ListTree, Wallet, Receipt, Landmark, TrendingUp, TrendingDown } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { createAccount, updateAccount, deactivateAccount, deleteAccount } from '../../api/accountingApi';
import { baseApi, useGetAccountsQuery, listQueryOpts } from '../../store/baseApi';
import usePermissions from '../../hooks/usePermissions';
import ConfirmModal from '../../components/UI/ConfirmModal';
import SearchableSelect from '../../components/UI/SearchableSelect';
import SearchInput from '../../components/UI/SearchInput';
import FilterBar from '../../components/UI/FilterBar';
import HeroBanner from '../../components/UI/HeroBanner';
import Button from '../../components/UI/Button';
import PremiumModal, { SecondaryButton, PrimaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';
import useQueryState from '../../hooks/useQueryState';

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const TYPE_META = {
  asset:     { label: 'Asset',     icon: Wallet,        chip: 'bg-blue-50 text-blue-700',     iconChip: 'bg-blue-50 text-blue-600' },
  liability: { label: 'Liability', icon: Receipt,       chip: 'bg-orange-50 text-orange-700', iconChip: 'bg-orange-50 text-orange-600' },
  equity:    { label: 'Equity',    icon: Landmark,      chip: 'bg-purple-50 text-purple-700', iconChip: 'bg-purple-50 text-purple-600' },
  revenue:   { label: 'Revenue',   icon: TrendingUp,    chip: 'bg-emerald-50 text-emerald-700', iconChip: 'bg-emerald-50 text-emerald-600' },
  expense:   { label: 'Expense',   icon: TrendingDown,  chip: 'bg-rose-50 text-rose-700',     iconChip: 'bg-rose-50 text-rose-600' },
};

const NORMAL_BALANCE_COLOR = {
  debit:  'bg-indigo-50 text-indigo-700',
  credit: 'bg-teal-50 text-teal-700',
};

// ── Form schema ───────────────────────────────────────────────────────────────

const schema = z.object({
  code:          z.string().min(1, 'Code required'),
  name:          z.string().min(1, 'Name required'),
  type:          z.enum(['asset', 'liability', 'equity', 'revenue', 'expense'], { required_error: 'Select type' }),
  normalBalance: z.enum(['debit', 'credit'], { required_error: 'Select normal balance' }),
  subType:       z.string().optional(),
  description:   z.string().optional(),
});

// Edit schema — code/type/normalBalance are immutable after creation.
const editSchema = z.object({
  name:        z.string().min(1, 'Name required'),
  subType:     z.string().optional(),
  description: z.string().optional(),
  isActive:    z.boolean().optional(),
});

// ── Add Account Modal ─────────────────────────────────────────────────────────

const AddAccountModal = ({ onClose, onSaved }) => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    try {
      await createAccount(values);
      toast.success('Account created.');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to create account.');
    }
  };

  return (
    <PremiumModal
      open
      onClose={isSubmitting ? undefined : onClose}
      icon={ListTree}
      eyebrow="New Account"
      title="Add Account"
      subtitle="Create a new entry in the chart of accounts"
      accent="indigo"
      size="md"
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose} disabled={isSubmitting}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting} accent="indigo">
            {isSubmitting ? 'Saving…' : 'Add Account'}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Code <span className="text-rose-500">*</span></label>
              <input type="text" {...register('code')} placeholder="e.g. 1000" className={inputCls} />
              {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Name <span className="text-rose-500">*</span></label>
              <input type="text" {...register('name')} placeholder="e.g. Cash" className={inputCls} />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Type <span className="text-rose-500">*</span></label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={TYPES.map((t) => ({ value: t, label: TYPE_META[t].label }))}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select…"
                  />
                )}
              />
              {errors.type && <p className="mt-1 text-xs text-red-600">{errors.type.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Normal Balance <span className="text-rose-500">*</span></label>
              <Controller
                name="normalBalance"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={[
                      { value: 'debit',  label: 'Debit' },
                      { value: 'credit', label: 'Credit' },
                    ]}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select…"
                  />
                )}
              />
              {errors.normalBalance && <p className="mt-1 text-xs text-red-600">{errors.normalBalance.message}</p>}
            </div>
          </div>

          <div>
            <label className={labelCls}>Sub-type <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="text" {...register('subType')} placeholder="e.g. currentAsset, accountsPayable" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea {...register('description')} rows={2} className={clsx(inputCls, 'resize-none')} />
          </div>
        </div>
      </form>
    </PremiumModal>
  );
};

// ── Edit Account Modal (owner-only) ───────────────────────────────────────────

const EditAccountModal = ({ account, onClose, onSaved }) => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name:        account.name ?? '',
      subType:     account.subType ?? '',
      description: account.description ?? '',
      isActive:    account.isActive !== false,
    },
  });

  const onSubmit = async (values) => {
    try {
      await updateAccount(account._id, {
        name:        values.name,
        subType:     values.subType ?? '',
        description: values.description ?? '',
        isActive:    values.isActive,
      });
      toast.success('Account updated.');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to update account.');
    }
  };

  const readonlyCls = clsx(inputCls, 'bg-slate-50 text-slate-400 cursor-not-allowed');

  return (
    <PremiumModal
      open
      onClose={isSubmitting ? undefined : onClose}
      icon={ListTree}
      eyebrow={`Edit ${account.code}`}
      title="Edit Account"
      subtitle="Update account details — the change is recorded in the audit log."
      accent="indigo"
      size="md"
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose} disabled={isSubmitting}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting} accent="indigo">
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Code</label>
              <input value={account.code} disabled className={readonlyCls} />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <input value={TYPE_META[account.type]?.label ?? account.type} disabled className={clsx(readonlyCls, 'capitalize')} />
            </div>
            <div>
              <label className={labelCls}>Normal Balance</label>
              <input value={account.normalBalance} disabled className={clsx(readonlyCls, 'capitalize')} />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 -mt-1">
            Code, type and normal balance are fixed once an account is created.
          </p>

          <div>
            <label className={labelCls}>Name <span className="text-rose-500">*</span></label>
            <input type="text" {...register('name')} className={inputCls} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Sub-type <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="text" {...register('subType')} placeholder="e.g. currentAsset" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={[
                      { value: 'active',   label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                    ]}
                    value={field.value ? 'active' : 'inactive'}
                    onChange={(v) => field.onChange(v === 'active')}
                  />
                )}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea {...register('description')} rows={2} className={clsx(inputCls, 'resize-none')} />
          </div>
        </div>
      </form>
    </PremiumModal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const ChartOfAccounts = () => {
  const { has } = usePermissions();
  const dispatch = useDispatch();
  const canManage = has('accounting.coa');
  const canEdit   = has('accounting.editAccount');
  const canDelete = has('accounting.deleteAccount');
  const [showAdd,     setShowAdd]     = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const [deleting,     setDeleting]     = useState(null);
  const [search, setSearch] = useQueryState('search', '');

  const queryParams = useMemo(() => ({}), []);
  const { data: payload, isLoading: loading } = useGetAccountsQuery(queryParams, listQueryOpts);
  const accounts = useMemo(() => payload ?? [], [payload]);

  // Search filters the visible account rows by code / name / sub-type. The stat
  // tiles above stay on the full chart (they're inventory counts, not a subset).
  const q = search.trim().toLowerCase();
  const filteredAccounts = useMemo(
    () => (q ? accounts.filter((a) => `${a.code} ${a.name} ${a.subType ?? ''}`.toLowerCase().includes(q)) : accounts),
    [accounts, q],
  );

  const invalidate = () => dispatch(baseApi.util.invalidateTags(['Account', 'Accounting']));

  const handleDeactivate = async () => {
    try {
      await deactivateAccount(deactivating._id);
      toast.success(`Account "${deactivating.name}" deactivated.`);
      setDeactivating(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to deactivate.');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAccount(deleting._id);
      toast.success(`Account "${deleting.name}" permanently deleted.`);
      setDeleting(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to delete account.');
    }
  };

  const grouped = TYPES.map((type) => ({
    type,
    accounts: filteredAccounts.filter((a) => a.type === type),
  })).filter((g) => g.accounts.length > 0);

  const totalCount    = accounts.length;
  const activeCount   = accounts.filter((a) => a.isActive).length;
  const systemCount   = accounts.filter((a) => a.isSystemAccount).length;
  // Count categories from the FULL chart (not `grouped`, which is search-filtered)
  // so this tile stays full like its siblings.
  const categoryCount = new Set(accounts.map((a) => a.type)).size;

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={ListTree}
        eyebrow="Accounting"
        title="Chart of Accounts"
        subtitle="Define and manage assets, liabilities, equity, revenue and expense accounts."
        accent="indigo"
        compact
        actions={canManage && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setShowAdd(true)}
          >
            Add Account
          </Button>
        )}
      />

      {/* Stat row — soft white tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Accounts', value: totalCount,       icon: ListTree,    color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
          { label: 'Active',         value: activeCount,      icon: TrendingUp,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Categories',     value: categoryCount,    icon: Landmark,    color: 'text-violet-600',  bg: 'bg-violet-50'  },
          { label: 'System',         value: systemCount,      icon: Lock,        color: 'text-slate-600',   bg: 'bg-slate-100'  },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon size={16} className={s.color} />
            </div>
            <div className="min-w-0">
              <p className={clsx('text-xl font-bold leading-tight tabular-nums', s.color)}>
                {loading ? '…' : s.value}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-widest">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search accounts by code, name or type…"
          className="min-w-[260px] flex-1"
        />
      </FilterBar>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ type, accounts: rows }) => {
            const meta = TYPE_META[type];
            return (
              <div key={type} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', meta.iconChip)}>
                      <meta.icon size={15} />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">{meta.label}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">{rows.length} account{rows.length === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <span className={clsx('inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest', meta.chip)}>
                    {meta.label}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50/80 border-b border-slate-100">
                      <tr>
                        {['Code', 'Name', 'Sub-type', 'Normal Balance', 'System', 'Status', ''].map((h) => (
                          <th key={h} className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((acc) => (
                        <tr
                          key={acc._id}
                          className={clsx('hover:bg-slate-50/60 transition-colors', !acc.isActive && 'opacity-50')}
                        >
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-gray-700">{acc.code}</td>
                          <td className="py-3 px-4 font-medium text-gray-800">{acc.name}</td>
                          <td className="py-3 px-4 text-xs text-gray-500">{acc.subType ?? '—'}</td>
                          <td className="py-3 px-4">
                            <span className={clsx(
                              'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize',
                              NORMAL_BALANCE_COLOR[acc.normalBalance] ?? 'bg-gray-100 text-gray-600'
                            )}>
                              {acc.normalBalance}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {acc.isSystemAccount
                              ? <Lock size={13} className="text-gray-400" title="System account" />
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="py-3 px-4">
                            <span className={clsx(
                              'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold',
                              acc.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                            )}>
                              {acc.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && !acc.isSystemAccount && (
                                <button
                                  onClick={() => setEditing(acc)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                  title="Edit"
                                >
                                  <Pencil size={12} /> Edit
                                </button>
                              )}
                              {!acc.isSystemAccount && acc.isActive && canManage && (
                                <button
                                  onClick={() => setDeactivating(acc)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                                  title="Deactivate"
                                >
                                  <PowerOff size={12} /> Deactivate
                                </button>
                              )}
                              {canDelete && !acc.isSystemAccount && (
                                <button
                                  onClick={() => setDeleting(acc)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                  title="Delete permanently"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {grouped.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
              <ListTree size={36} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
              {q ? (
                <>
                  <p className="text-sm font-medium text-gray-500">No accounts match “{search}”.</p>
                  <p className="text-xs mt-1">Try a different code, name or type.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-500">No accounts yet.</p>
                  <p className="text-xs mt-1">Click "Add Account" to create your first chart-of-accounts entry.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <AddAccountModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); invalidate(); }}
        />
      )}

      {editing && (
        <EditAccountModal
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate(); }}
        />
      )}

      {deactivating && (
        <ConfirmModal
          isOpen
          title="Deactivate Account"
          message={`Deactivate "${deactivating.name}" (${deactivating.code})? It will no longer appear in new entries.`}
          confirmLabel="Deactivate"
          variant="danger"
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivating(null)}
        />
      )}

      {deleting && (
        <ConfirmModal
          isOpen
          title="Delete Account Permanently"
          message={`Permanently delete "${deleting.name}" (${deleting.code})? This cannot be undone. Accounts used by journal entries or with sub-accounts can't be deleted — deactivate them instead.`}
          confirmLabel="Delete Permanently"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
};

export default ChartOfAccounts;
