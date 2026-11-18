import { useState } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { User as UserIcon, Mail, Shield, Building2, KeyRound, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import clsx from 'clsx';
import useAuth from '../../hooks/useAuth';
import { setUser } from '../../store/slices/authSlice';
import { updateMyProfile, changeMyPassword } from '../../api/userApi';
import { inputCls, labelCls } from '../../components/UI/PremiumModal';
import RecipeLock from '../Settings/RecipeLock';

const ROLE_LABELS = {
  owner: 'Owner',
  financeManager: 'Finance Manager',
  purchaseManager: 'Purchase Manager',
  receivingStaff: 'Receiving Staff',
  cashier: 'Cashier',
};

const Section = ({ icon: Icon, title, subtitle, children }) => (
  <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
    <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-gray-100">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm">
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <div className="px-6 py-5">{children}</div>
  </section>
);

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 py-2.5">
    <Icon size={14} className="text-slate-400 shrink-0" />
    <span className="text-xs uppercase tracking-widest text-slate-500 w-28 shrink-0">{label}</span>
    <span className="text-sm font-medium text-slate-900 truncate">{value || '—'}</span>
  </div>
);

const Account = () => {
  const dispatch = useDispatch();
  const { user } = useAuth();

  const initials = (() => {
    const n = (user?.name || '').trim();
    if (!n) return user?.email?.charAt(0).toUpperCase() || '?';
    const parts = n.split(/\s+/);
    return ((parts[0] || '').charAt(0) + (parts[1] || '').charAt(0)).toUpperCase();
  })();

  // Profile form
  const [name, setName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Name cannot be empty.'); return; }
    if (trimmed === user?.name) return;
    setSavingName(true);
    try {
      const { data } = await updateMyProfile({ name: trimmed });
      const updated = data?.data?.user;
      dispatch(setUser({ ...user, name: updated?.name ?? trimmed }));
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update profile.');
    } finally {
      setSavingName(false);
    }
  };

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) { toast.error('Fill in all fields.'); return; }
    if (newPassword.length < 8) { toast.error('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match.'); return; }
    setSavingPwd(true);
    try {
      await changeMyPassword({ currentPassword, newPassword });
      toast.success('Password updated.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not change password.');
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header card */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center text-xl font-bold">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{user?.name || 'Your Account'}</h1>
            <p className="text-sm text-indigo-100 truncate">{user?.email}</p>
            <span className="inline-flex mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-white/15 ring-1 ring-white/20">
              {ROLE_LABELS[user?.role] ?? user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Account info (read-only) */}
      <Section icon={UserIcon} title="Account Details" subtitle="Information about your account">
        <div className="divide-y divide-gray-100">
          <InfoRow icon={Mail} label="Email" value={user?.email} />
          <InfoRow icon={Shield} label="Role" value={ROLE_LABELS[user?.role] ?? user?.role} />
          {user?.outlet && <InfoRow icon={Building2} label="Outlet" value={user.outlet} />}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          To change your email, role, or outlet, contact an owner.
        </p>
      </Section>

      {/* Profile editor */}
      <Section icon={UserIcon} title="Profile" subtitle="Update your display name">
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className={labelCls}>Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              autoComplete="name"
              maxLength={120}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingName || !name.trim() || name.trim() === user?.name}
              className={clsx(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition',
                savingName || !name.trim() || name.trim() === user?.name
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
              )}
            >
              {savingName && <Loader2 size={14} className="animate-spin" />}
              Save changes
            </button>
          </div>
        </form>
      </Section>

      {/* Password */}
      <Section icon={KeyRound} title="Password" subtitle="Use at least 8 characters">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className={labelCls}>Current password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={clsx(inputCls, 'pr-10')}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((s) => !s)}
                className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-700"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>New password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={clsx(inputCls, 'pr-10')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((s) => !s)}
                  className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-700"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Confirm new password</label>
              <input
                type={showNew ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputCls}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPwd}
              className={clsx(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition',
                savingPwd
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
              )}
            >
              {savingPwd && <Loader2 size={14} className="animate-spin" />}
              Change password
            </button>
          </div>
        </form>
      </Section>

      {/* Recipe Lock — tenant-wide recipe password. Owner-only. */}
      {user?.role === 'owner' && (
        <Section icon={Lock} title="Recipe Lock" subtitle="Set the password that protects locked recipes">
          <RecipeLock />
        </Section>
      )}
    </div>
  );
};

export default Account;
