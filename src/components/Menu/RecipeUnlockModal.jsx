import { useState } from 'react';
import { Lock, KeyRound } from 'lucide-react';
import PremiumModal, { inputCls, labelCls, PrimaryButton, SecondaryButton } from '../UI/PremiumModal';
import { verifyRecipeLockPassword } from '../../api/menuApi';
import { setRecipeUnlockToken } from '../../utils/recipeUnlock';

/**
 * Password gate for locked recipes. Verifies the tenant-wide recipe password
 * with the backend and, on success, stores the returned unlock token (so the
 * axios interceptor attaches it to subsequent recipe fetches) and calls
 * onUnlocked(). The recipe itself is never fetched until this succeeds.
 *
 * <RecipeUnlockModal open onClose={...} onUnlocked={...} itemName="Zinger Burger" />
 */
const RecipeUnlockModal = ({ open, onClose, onUnlocked, itemName }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setPassword(''); setError(''); setBusy(false); };

  const handleClose = () => { reset(); onClose?.(); };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await verifyRecipeLockPassword(password);
      const token = data?.data?.token;
      if (!token) throw new Error('No unlock token returned.');
      setRecipeUnlockToken(token);
      reset();
      onUnlocked?.();
    } catch (err) {
      const status = err?.response?.status;
      setError(status === 401 ? 'Incorrect password. Try again.'
        : err?.response?.data?.message || 'Could not verify the password.');
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <PremiumModal
      open={open}
      onClose={handleClose}
      icon={Lock}
      accent="slate"
      eyebrow="Protected recipe"
      title="Enter recipe password"
      subtitle={itemName ? `“${itemName}” is locked` : 'This recipe is locked'}
      size="sm"
      footer={(
        <>
          <SecondaryButton onClick={handleClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton accent="slate" onClick={submit} disabled={busy || !password.trim()}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </PrimaryButton>
        </>
      )}
    >
      <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-xs text-slate-500 mb-4">
          This recipe is password-protected. Enter the recipe password to view it — it stays
          unlocked for the rest of this session.
        </p>
        <label className={labelCls} htmlFor="recipe-unlock-password">Recipe password</label>
        <div className="relative">
          <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            id="recipe-unlock-password"
            type="password"
            autoFocus
            autoComplete="off"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            className={`${inputCls} pl-9`}
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-xs font-medium text-rose-600 mt-2">{error}</p>}
        {/* Hidden submit so Enter works even without clicking Unlock. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </PremiumModal>
  );
};

export default RecipeUnlockModal;
