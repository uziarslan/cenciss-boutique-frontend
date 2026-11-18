import { useState, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  UserPlus, MoreVertical, CheckCircle, XCircle, Copy, Trash2,
  Users as UsersIcon, ShieldCheck, UserCheck, UserX as UserXIcon,
  Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { updateUser, inviteUserLink, createUser, deleteUser, generateInviteForUser } from '../../api/userApi';
import useAuth from '../../hooks/useAuth';
import { useGetOutletsQuery, useGetUsersQuery, listQueryOpts, baseApi } from '../../store/baseApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import StatTile from '../../components/UI/StatTile';
import Button from '../../components/UI/Button';
import FilterBar from '../../components/UI/FilterBar';
import ConfirmModal from '../../components/UI/ConfirmModal';
import PremiumModal, { SecondaryButton, PrimaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';
import { formatDateTime } from '../../utils/formatDate';
import useQueryState from '../../hooks/useQueryState';
import useFeatures from '../../hooks/useFeatures';

// ── Zod schema ────────────────────────────────────────────────────────────────
const inviteSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters.'),
  email:    z.string().email('Invalid email address.'),
  password: z
    .union([
      z.string().min(8, 'Password must be at least 8 characters.'),
      z.literal(''),
    ])
    .optional(),
  role:     z.enum(['owner','financeManager','purchaseManager','receivingStaff','cashier','rider']),
  outlet:   z.string().optional(),
});

// ── Role badge ────────────────────────────────────────────────────────────────
const ROLE_LABELS = {
  owner:           { label: 'Owner',            cls: 'bg-indigo-100 text-indigo-700' },
  financeManager:  { label: 'Finance Manager',  cls: 'bg-blue-100   text-blue-700'   },
  purchaseManager: { label: 'Purchase Manager', cls: 'bg-amber-100  text-amber-700'  },
  receivingStaff:  { label: 'Receiving Staff',  cls: 'bg-gray-100   text-gray-600'   },
  cashier:         { label: 'Cashier',          cls: 'bg-emerald-100 text-emerald-700' },
  rider:           { label: 'Rider',            cls: 'bg-cyan-100 text-cyan-700' },
};

const RoleBadge = ({ role }) => {
  const { label, cls } = ROLE_LABELS[role] ?? { label: role, cls: 'bg-gray-100 text-gray-600' };
  return <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', cls)}>{label}</span>;
};

// ── Invite Modal ──────────────────────────────────────────────────────────────
const InviteModal = ({ onClose, onSuccess }) => {
  const [useLink, setUseLink] = useState(false);
  const { hasFeature, outletFeatures } = useFeatures();
  const { data: outletsList = [] } = useGetOutletsQuery();
  const { register, handleSubmit, control, formState: { errors, isSubmitting }, reset, watch } = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'receivingStaff' },
  });
  const selectedRole = watch('role');
  const riderEnabledOutlets = useMemo(
    () => outletsList.filter((outlet) => hasFeature('riderTracking', outlet._id)),
    [hasFeature, outletsList],
  );
  const canCreateRiders = hasFeature('riderTracking')
    || Object.values(outletFeatures).some((features) => features?.riderTracking === true)
    || riderEnabledOutlets.length > 0;

  const onSubmit = async (data) => {
    try {
      if (data.role === 'rider' && !hasFeature('riderTracking', data.outlet)) {
        toast.error('Rider Tracking must be enabled for the selected outlet by the platform admin.');
        return;
      }
      if (useLink) {
        if (data.role !== 'owner' && (!data.outlet || data.outlet === '')) {
          toast.error('Outlet is required for non-owner users.');
          return;
        }
        const res = await inviteUserLink({ name: data.name, email: data.email, role: data.role, outlet: data.outlet });
        let inviteUrl = res.data?.data?.inviteUrl || '';
        if (inviteUrl.includes(',')) {
          const parts = inviteUrl.split(',').map((s) => s.trim());
          const withPath = parts.find((p) => p.includes('/set-password'));
          inviteUrl = withPath || parts.pop();
        }
        try { await navigator.clipboard.writeText(inviteUrl); toast.success('Invite link copied to clipboard.'); } catch { /* ignore */ }
        toast.success('Invite link created.');
      } else {
        if (data.role !== 'owner' && (!data.outlet || data.outlet === '')) {
          toast.error('Outlet is required for non-owner users.');
          return;
        }
        if (!data.password) {
          toast.error('Password is required when not sending an invite link.');
          return;
        }
        await createUser({ name: data.name, email: data.email, password: data.password, role: data.role, outlet: data.outlet });
        toast.success('User created.');
      }

      onSuccess();
      onClose();
      reset();
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Failed to invite user.');
    }
  };

  return (
    <PremiumModal
      open
      onClose={isSubmitting ? undefined : onClose}
      icon={UserPlus}
      eyebrow="Invite User"
      title="Invite User"
      subtitle="Create a new account or send a magic invite link to a team member"
      accent="indigo"
      size="md"
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose} disabled={isSubmitting}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting} accent="indigo">
            {isSubmitting ? (useLink ? 'Inviting…' : 'Creating…') : (useLink ? 'Send Invite' : 'Create User')}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          {/* Mode segmented control */}
          <div className="space-y-1.5">
            <label className={labelCls}>Invite Method</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUseLink(false)}
                className={clsx(
                  'px-3 py-2.5 rounded-xl text-sm font-semibold border transition flex items-center justify-center gap-1.5',
                  !useLink
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                )}
              >
                <ShieldCheck size={13} /> Set Password
              </button>
              <button
                type="button"
                onClick={() => setUseLink(true)}
                className={clsx(
                  'px-3 py-2.5 rounded-xl text-sm font-semibold border transition flex items-center justify-center gap-1.5',
                  useLink
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                )}
              >
                <Mail size={13} /> Magic Link
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              {useLink
                ? "We'll generate a one-time link you can share with the user."
                : "You'll set their initial password."}
            </p>
          </div>

          <div>
            <label className={labelCls}>Full Name <span className="text-rose-500">*</span></label>
            <input {...register('name')} className={inputCls} placeholder="Jane Smith" />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className={labelCls}>Email <span className="text-rose-500">*</span></label>
            <input {...register('email')} type="email" className={inputCls} placeholder="jane@restaurant.com" />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
          </div>

          {!useLink && (
            <div>
              <label className={labelCls}>Temporary Password <span className="text-rose-500">*</span></label>
              <input {...register('password')} type="password" className={inputCls} placeholder="Min 8 characters" />
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Role <span className="text-rose-500">*</span></label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={[
                      { value: 'owner',           label: 'Owner' },
                      { value: 'financeManager',  label: 'Finance Manager' },
                      { value: 'purchaseManager', label: 'Purchase Manager' },
                      { value: 'receivingStaff',  label: 'Receiving Staff' },
                      { value: 'cashier',         label: 'Cashier' },
                      ...(canCreateRiders ? [{ value: 'rider', label: 'Rider' }] : []),
                    ]}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            <div>
              <label className={labelCls}>
                Outlet {selectedRole !== 'owner'
                  ? <span className="text-rose-500">*</span>
                  : <span className="text-slate-400 font-normal">(optional)</span>}
              </label>
              <Controller
                name="outlet"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={[{ value: '', label: 'No outlet' }, ...(selectedRole === 'rider' ? riderEnabledOutlets : outletsList).map((o) => ({ value: o._id, label: o.name, meta: o.code }))]}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="No outlet"
                    searchPlaceholder="Search outlets…"
                  />
                )}
              />
            </div>
          </div>
        </div>
      </form>
    </PremiumModal>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const UserManagement = () => {
  const dispatch = useDispatch();
  const [showInvite,  setShowInvite]  = useState(false);
  const [confirmUser, setConfirmUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useQueryState('search', '');
  const [roleFilter, setRoleFilter] = useQueryState('role', '');
  const [statusFilter, setStatusFilter] = useQueryState('status', '');
  const [outletFilter, setOutletFilter] = useQueryState('outlet', '');
  const [createdFrom, setCreatedFrom] = useQueryState('createdFrom', '');
  const [createdTo, setCreatedTo] = useQueryState('createdTo', '');
  const [sort, setSort] = useQueryState('sort', 'name');

  const { data: payload, isLoading: loading } = useGetUsersQuery(undefined, listQueryOpts);
  const users = useMemo(() => payload?.users ?? [], [payload]);

  const { role: currentRole, user: currentUser } = useAuth();
  const { hasFeature, outletFeatures } = useFeatures();
  const riderFeatureVisible = hasFeature('riderTracking')
    || Object.values(outletFeatures).some((features) => features?.riderTracking === true);

  // Inline copy-invite button (non-blocking)
  const CopyInviteButton = ({ userId }) => {
    const [busy, setBusy] = useState(false);
    const handleClick = async () => {
      setBusy(true);
      try {
        const res = await generateInviteForUser(userId);
        let inviteUrl = res.data?.data?.inviteUrl || '';
        if (inviteUrl.includes(',')) {
          const parts = inviteUrl.split(',').map((s) => s.trim());
          const withPath = parts.find((p) => p.includes('/set-password'));
          inviteUrl = withPath || parts.pop();
        }
        try { await navigator.clipboard.writeText(inviteUrl); toast.success('Invite link copied to clipboard.'); } catch { /* ignore */ }
        dispatch(baseApi.util.invalidateTags(['User']));
      } catch (err) {
        toast.error(err?.response?.data?.message ?? 'Failed to generate invite link.');
      } finally {
        setBusy(false);
      }
    };
    return (
      <button
        onClick={handleClick}
        disabled={busy}
        className={clsx(
          'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md',
          busy ? 'opacity-50 cursor-not-allowed text-gray-400' : 'text-indigo-600 hover:bg-indigo-50'
        )}
        title={busy ? 'Generating invite link…' : 'Copy invite link'}
        aria-busy={busy}
      >
        <Copy size={12} /> Invite
      </button>
    );
  };

  const load = () => dispatch(baseApi.util.invalidateTags(['User']));

  const handleToggleActive = (user) => {
    if (user._id === currentUser?._id) {
      toast.error('You cannot deactivate your own account.');
      return Promise.resolve();
    }
    const next = !user.isActive;
    toast.success(`${user.name} ${next ? 'activated' : 'deactivated'}.`);
    updateUser(user._id, { isActive: next })
      .then(() => dispatch(baseApi.util.invalidateTags(['User'])))
      .catch(() => {
        toast.error('Failed to update user.');
        dispatch(baseApi.util.invalidateTags(['User']));
      });
    return Promise.resolve();
  };

  const handleDelete = (user) => {
    if (!currentRole || currentRole !== 'owner') {
      toast.error('You are not authorized to delete users.');
      return;
    }
    if (user._id === currentUser?._id) {
      toast.error('You cannot delete your own account.');
      return;
    }
    setDeleteTarget(user);
  };

  const performDeleteConfirmed = () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    deleteUser(target._id, { hard: true })
      .then(() => {
        toast.success('User deleted.');
        dispatch(baseApi.util.invalidateTags(['User']));
      })
      .catch((err) => {
        toast.error(err?.response?.data?.message ?? 'Failed to delete user.');
      });
  };

  // Filtering
  const userOutlets = [...new Set(users.map((u) => typeof u.outlet === 'object' ? u.outlet?.name : u.outlet).filter(Boolean))].sort();
  const filteredUsers = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (statusFilter === 'active'   && !u.isActive) return false;
    if (statusFilter === 'inactive' &&  u.isActive) return false;
    const outletName = typeof u.outlet === 'object' ? u.outlet?.name : u.outlet;
    if (outletFilter && outletName !== outletFilter) return false;
    const created = u.createdAt ? new Date(u.createdAt) : null;
    if (createdFrom && (!created || created < new Date(`${createdFrom}T00:00:00`))) return false;
    if (createdTo && (!created || created > new Date(`${createdTo}T23:59:59.999`))) return false;
    if (search) {
      const q = search.trim().toLowerCase();
      const hay = `${u.name ?? ''} ${u.email ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sort === 'role') return String(a.role || '').localeCompare(String(b.role || ''));
    if (sort === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (sort === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  // Stats
  const activeUsers   = users.filter((u) => u.isActive !== false).length;
  const ownerCount    = users.filter((u) => u.role === 'owner').length;
  const cashierCount  = users.filter((u) => u.role === 'cashier').length;
  const riderCount    = users.filter((u) => u.role === 'rider').length;

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={UsersIcon}
        eyebrow="Access Control"
        title="User Management"
        subtitle="Invite users, assign roles, and manage outlet-level access for your team."
        accent="indigo"
        compact
        actions={
          <Button variant="primary" icon={UserPlus} onClick={() => setShowInvite(true)}>
            Invite User
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total Users" value={users.length}  icon={UsersIcon}    gradient="indigo"  />
        <StatTile label="Active"      value={activeUsers}    icon={UserCheck}    gradient="emerald" />
        <StatTile label="Owners"      value={ownerCount}     icon={ShieldCheck}  gradient="violet"  />
        <StatTile label={riderFeatureVisible ? 'Riders' : 'Cashiers'} value={riderFeatureVisible ? riderCount : cashierCount} icon={UserXIcon} gradient="cyan" />
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Role</label>
          <SearchableSelect
            options={[
              { value: '',                label: 'All roles' },
              { value: 'owner',           label: 'Owner' },
              { value: 'financeManager',  label: 'Finance Manager' },
              { value: 'purchaseManager', label: 'Purchase Manager' },
              { value: 'receivingStaff',  label: 'Receiving Staff' },
              { value: 'cashier',         label: 'Cashier' },
              ...(riderFeatureVisible ? [{ value: 'rider', label: 'Rider' }] : []),
            ]}
            value={roleFilter}
            onChange={setRoleFilter}
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Status</label>
          <SearchableSelect
            options={[
              { value: '',         label: 'All' },
              { value: 'active',   label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <div className="min-w-[180px]"><SearchableSelect options={[{ value: '', label: 'All outlets' }, ...userOutlets.map((value) => ({ value, label: value }))]} value={outletFilter} onChange={setOutletFilter} /></div>
        <label className="min-w-[165px]"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-gray-400">Created from</span><input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="min-w-[165px]"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-gray-400">Created to</span><input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <div className="min-w-[170px]"><SearchableSelect searchable={false} options={[{ value: 'name', label: 'Sort by name' }, { value: 'role', label: 'Sort by role' }, { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]} value={sort} onChange={setSort} /></div>
        <div className="ml-auto text-xs text-gray-400 self-end pb-2">
          {filteredUsers.length} of {users.length}
        </div>
      </FilterBar>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Team Roster</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? 'Loading…' : `${filteredUsers.length} user${filteredUsers.length === 1 ? '' : 's'}${roleFilter ? ` · ${ROLE_LABELS[roleFilter]?.label ?? roleFilter}` : ''}`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex gap-4 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <UsersIcon size={36} strokeWidth={1.5} className="text-gray-300" />
            <p className="text-sm font-medium text-slate-500">
              {users.length === 0 ? 'No users yet.' : 'No users match these filters.'}
            </p>
            <p className="text-xs text-gray-400 -mt-2">
              {users.length === 0 ? 'Click "Invite User" to add your first team member.' : 'Try clearing the filters above.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5">User</th>
                  <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4">Role</th>
                  <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4">Outlet</th>
                  <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4">Status</th>
                  <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4">Joined</th>
                  <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const isSelf = u._id === currentUser?._id;
                  return (
                    <tr key={u._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 text-xs font-bold">
                            {u.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-gray-900 truncate">{u.name}</p>
                              {isSelf && (
                                <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700">You</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4"><RoleBadge role={u.role} /></td>
                      <td className="py-3 px-4 text-gray-600">{u.outlet || <span className="text-gray-300">—</span>}</td>
                      <td className="py-3 px-4">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            <CheckCircle size={11} /> Active
                          </span>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                              <XCircle size={11} /> Inactive
                            </span>
                            {currentRole === 'owner' && <CopyInviteButton userId={u._id} />}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(u.createdAt)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          {u.role !== 'owner' && !isSelf && (
                            <button
                              onClick={() => setConfirmUser(u)}
                              className={clsx(
                                'p-1.5 rounded-lg transition-colors',
                                u.isActive
                                  ? 'text-gray-400 hover:bg-amber-50 hover:text-amber-600'
                                  : 'text-gray-400 hover:bg-emerald-50 hover:text-emerald-600'
                              )}
                              title={u.isActive ? 'Deactivate' : 'Activate'}
                            >
                              <MoreVertical size={14} />
                            </button>
                          )}
                          {currentRole === 'owner' && u.role !== 'owner' && !isSelf && (
                            <button
                              onClick={() => handleDelete(u)}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              title="Permanently delete user"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          {(u.role === 'owner' || isSelf) && (
                            <span className="text-xs text-gray-300 italic">—</span>
                          )}
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

      {/* Modals */}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onSuccess={load} />}

      <ConfirmModal
        isOpen={Boolean(confirmUser)}
        title={confirmUser ? `${confirmUser.isActive ? 'Deactivate' : 'Activate'} ${confirmUser.name}?` : ''}
        message={confirmUser
          ? confirmUser.isActive
            ? 'This user will no longer be able to log in.'
            : 'This user will regain access to the system.'
          : ''}
        confirmLabel={confirmUser?.isActive ? 'Deactivate' : 'Activate'}
        variant={confirmUser?.isActive ? 'danger' : 'default'}
        onConfirm={() => handleToggleActive(confirmUser).then(() => setConfirmUser(null))}
        onCancel={() => setConfirmUser(null)}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title={deleteTarget ? `Permanently delete ${deleteTarget.name}?` : ''}
        message="This action cannot be undone. All user data and access will be removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={performDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default UserManagement;
