import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
import { LogOut, Lock, Loader2, RefreshCw } from 'lucide-react';
import { logoutUser, setUser } from '../../store/slices/authSlice';
import { getMe } from '../../api/userApi';
import { getSubscriptionBillingStatus } from '../../api/billingApi';

const SubscriptionExpired = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const t = user?.tenant;
  const [billing, setBilling] = useState(null);
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setChecking(true);
    try {
      const { data } = await getSubscriptionBillingStatus();
      const current = data.data || null;
      setBilling(current);
      if (
        current?.status !== 'suspended'
        && Number(current?.millisecondsRemaining) > 0
      ) {
        const me = await getMe();
        if (me.data?.user) dispatch(setUser(me.data.user));
        navigate('/dashboard', { replace: true });
      }
    } catch {
      // Keep the expired screen usable during a transient status-check failure.
    } finally {
      if (!silent) setChecking(false);
    }
  }, [dispatch, navigate]);

  useEffect(() => {
    checkStatus({ silent: true });
    const timer = window.setInterval(() => checkStatus({ silent: true }), 60_000);
    const onFocus = () => checkStatus({ silent: true });
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkStatus]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-7 text-center shadow-sm">
        <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center">
          <Lock size={20} />
        </div>
        <div className="text-xl font-extrabold text-slate-900">
          {t?.status === 'suspended' ? 'Account suspended' : 'Subscription expired'}
        </div>
        <p className="text-sm text-slate-600 mt-2">
          {t?.status === 'suspended'
            ? 'This account has been suspended. Contact support to reactivate.'
            : 'Your access window has ended. Contact support to renew.'}
        </p>
        {t?.accessUntil && (
          <p className="text-xs text-slate-500 mt-2">
            Access ended {new Date(t.accessUntil).toLocaleString()}
          </p>
        )}
        {billing?.outstandingAmount > 0 && billing.canViewDocuments && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Outstanding subscription invoice</p>
            <p className="mt-1 text-lg font-extrabold text-amber-900">
              {billing.currency || 'PKR'} {Number(billing.outstandingAmount).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            {billing.invoice?.invoiceNumber && <p className="text-xs text-amber-700">{billing.invoice.invoiceNumber}</p>}
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => checkStatus()}
            disabled={checking}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Check renewal status
          </button>
          <button
            onClick={() => dispatch(logoutUser())}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white hover:bg-black"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionExpired;
