import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock, Unlock, ShieldCheck, ShieldOff, KeyRound, Loader2, Layers3 } from 'lucide-react';
import ConfirmModal from '../../components/UI/ConfirmModal';
import { inputCls, labelCls } from '../../components/UI/PremiumModal';
import {
  getRecipeLockStatus,
  setRecipeLockPassword,
  disableRecipeLock,
  lockAllRecipes,
  unlockAllRecipes,
} from '../../api/menuApi';
import { clearRecipeUnlockToken } from '../../utils/recipeUnlock';

const MIN_LEN = 4;

const RecipeLock = () => {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [allLocked, setAllLocked] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [disablePwd, setDisablePwd] = useState('');
  const [confirmLockAll, setConfirmLockAll] = useState(false);
  const [lockingAll, setLockingAll] = useState(false);
  const [confirmUnlockAll, setConfirmUnlockAll] = useState(false);
  const [unlockingAll, setUnlockingAll] = useState(false);
  const [unlockAllPwd, setUnlockAllPwd] = useState('');

  const load = async () => {
    try {
      const { data } = await getRecipeLockStatus();
      setEnabled(!!data?.data?.enabled);
      setAllLocked(!!data?.data?.allLocked);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load recipe-lock status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e?.preventDefault();
    if (enabled && !currentPwd.trim()) {
      toast.error('Enter the current recipe password.');
      return;
    }
    if (pwd.trim().length < MIN_LEN) {
      toast.error(`Password must be at least ${MIN_LEN} characters.`);
      return;
    }
    if (pwd !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await setRecipeLockPassword(pwd.trim(), enabled ? currentPwd.trim() : undefined);
      // The password changed, so any unlock token this browser holds is stale.
      clearRecipeUnlockToken();
      setCurrentPwd('');
      setPwd('');
      setConfirm('');
      setEnabled(true);
      toast.success(enabled ? 'Recipe password changed.' : 'Recipe lock enabled.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save the password.');
    } finally {
      setSaving(false);
    }
  };

  const doDisable = async () => {
    if (!disablePwd.trim()) {
      toast.error('Enter the current recipe password.');
      return;
    }
    setDisabling(true);
    try {
      await disableRecipeLock(disablePwd.trim());
      clearRecipeUnlockToken();
      setEnabled(false);
      setAllLocked(false);
      setConfirmDisable(false);
      setCurrentPwd('');
      setPwd('');
      setConfirm('');
      setDisablePwd('');
      toast.success('Recipe lock disabled. All recipes are now visible.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to disable recipe lock.');
    } finally {
      setDisabling(false);
    }
  };

  const doLockAll = async () => {
    setLockingAll(true);
    try {
      const { data } = await lockAllRecipes();
      const counts = data?.data || {};
      const menuCount = counts.menuItemsLocked ?? 0;
      const prepCount = counts.prepRecipesLocked ?? 0;
      const total = counts.totalLocked ?? (menuCount + prepCount);

      setConfirmLockAll(false);
      setAllLocked(true);
      if (total === 0) {
        toast.success('Every menu item and prep recipe is already locked.');
      } else {
        toast.success(`Locked ${total} recipes (${menuCount} menu items, ${prepCount} prep recipes).`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to lock all recipes.');
    } finally {
      setLockingAll(false);
    }
  };

  const doUnlockAll = async () => {
    if (!unlockAllPwd.trim()) {
      toast.error('Enter the current recipe password.');
      return;
    }
    setUnlockingAll(true);
    try {
      const { data } = await unlockAllRecipes(unlockAllPwd.trim());
      const counts = data?.data || {};
      const menuCount = counts.menuItemsUnlocked ?? 0;
      const prepCount = counts.prepRecipesUnlocked ?? 0;
      const total = counts.totalUnlocked ?? (menuCount + prepCount);

      clearRecipeUnlockToken();
      setAllLocked(false);
      setConfirmUnlockAll(false);
      setUnlockAllPwd('');
      toast.success(`Unlocked ${total} recipes (${menuCount} menu items, ${prepCount} prep recipes).`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unlock all recipes.');
    } finally {
      setUnlockingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-10">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <div className={`rounded-2xl border p-5 flex items-start gap-3 ${enabled ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
          {enabled ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Recipe lock is {enabled ? 'ON' : 'OFF'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {enabled
              ? 'Recipes you mark as locked require this password to be viewed or edited — by everyone, including you. Locked recipes are never sent to the browser without it.'
              : 'Set a password to start protecting individual recipes. Until then, the lock toggle on recipes is disabled.'}
          </p>
        </div>
      </div>

      {/* One-click bulk protection for both recipe types. */}
      <div className={`rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${allLocked ? 'border-amber-200 bg-amber-50/60' : 'border-indigo-100 bg-indigo-50/50'}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${allLocked ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-600'}`}>
          <Layers3 size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">
            {allLocked ? 'Every recipe is locked' : 'Lock every recipe'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {allLocked
              ? 'Unlock all menu item and prep recipes while keeping the recipe password enabled.'
              : 'Protect all menu item recipes and prep recipes with the recipe password at once.'}
          </p>
        </div>
        <button
          type="button"
          disabled={!enabled || lockingAll || unlockingAll}
          onClick={() => allLocked ? setConfirmUnlockAll(true) : setConfirmLockAll(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none shrink-0 ${allLocked ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          title={enabled
            ? (allLocked ? 'Unlock all menu item and prep recipes' : 'Lock all menu item and prep recipes')
            : 'Set a recipe password first'}
        >
          {(lockingAll || unlockingAll)
            ? <Loader2 size={15} className="animate-spin" />
            : (allLocked ? <Unlock size={15} /> : <Lock size={15} />)}
          {allLocked ? 'Unlock all recipes' : 'Lock all recipes'}
        </button>
      </div>

      {/* Set / change password */}
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
            <Lock size={15} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">
              {enabled ? 'Change recipe password' : 'Set recipe password'}
            </h4>
            <p className="text-[11px] text-slate-400">
              {enabled ? 'Enter the current password before choosing a new one.' : `At least ${MIN_LEN} characters.`}
            </p>
          </div>
        </div>

        {enabled && (
          <div>
            <label className={labelCls} htmlFor="rl-current">Current recipe password</label>
            <div className="relative">
              <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input id="rl-current" type="password" autoComplete="current-password" value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)} className={`${inputCls} pl-9`} placeholder="••••••••" />
            </div>
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="rl-pwd">New password</label>
          <div className="relative">
            <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input id="rl-pwd" type="password" autoComplete="new-password" value={pwd}
              onChange={(e) => setPwd(e.target.value)} className={`${inputCls} pl-9`} placeholder="••••••••" />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="rl-confirm">Confirm password</label>
          <div className="relative">
            <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input id="rl-confirm" type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} className={`${inputCls} pl-9`} placeholder="••••••••" />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          {enabled ? (
            <button type="button" onClick={() => setConfirmDisable(true)}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition">
              Disable recipe lock
            </button>
          ) : <span />}
          <button type="submit" disabled={saving}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50 bg-gradient-to-r from-slate-700 to-slate-900 shadow-slate-500/30">
            {saving ? 'Saving…' : (enabled ? 'Change password' : 'Enable lock')}
          </button>
        </div>
      </form>

      <ConfirmModal
        isOpen={confirmLockAll}
        title="Lock every recipe?"
        message="This will password-protect every menu item recipe and prep recipe. Anyone who wants to view or edit their ingredients will need the recipe password. Recipes already locked will stay locked."
        confirmLabel={lockingAll ? 'Locking…' : 'Lock all recipes'}
        cancelLabel="Cancel"
        variant="default"
        isLoading={lockingAll}
        onConfirm={doLockAll}
        onCancel={() => setConfirmLockAll(false)}
      />

      <ConfirmModal
        isOpen={confirmUnlockAll}
        title="Unlock every recipe?"
        message="Enter the current recipe password to unlock every menu item and prep recipe. The master recipe password will remain enabled."
        confirmLabel={unlockingAll ? 'Unlocking…' : 'Unlock all recipes'}
        cancelLabel="Cancel"
        variant="danger"
        isLoading={unlockingAll}
        onConfirm={doUnlockAll}
        onCancel={() => {
          setConfirmUnlockAll(false);
          setUnlockAllPwd('');
        }}
      >
        <div>
          <label className={labelCls} htmlFor="rl-unlock-all-current">Current recipe password</label>
          <div className="relative">
            <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input id="rl-unlock-all-current" type="password" autoComplete="current-password" value={unlockAllPwd}
              onChange={(e) => setUnlockAllPwd(e.target.value)} className={`${inputCls} pl-9`} placeholder="••••••••" autoFocus />
          </div>
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={confirmDisable}
        title="Disable recipe lock?"
        message="Enter the current recipe password to confirm. Disabling removes password protection and unlocks every menu item and prep recipe."
        confirmLabel={disabling ? 'Disabling…' : 'Disable lock'}
        cancelLabel="Cancel"
        variant="danger"
        isLoading={disabling}
        onConfirm={doDisable}
        onCancel={() => {
          setConfirmDisable(false);
          setDisablePwd('');
        }}
      >
        <div>
          <label className={labelCls} htmlFor="rl-disable-current">Current recipe password</label>
          <div className="relative">
            <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input id="rl-disable-current" type="password" autoComplete="current-password" value={disablePwd}
              onChange={(e) => setDisablePwd(e.target.value)} className={`${inputCls} pl-9`} placeholder="••••••••" autoFocus />
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
};

export default RecipeLock;
