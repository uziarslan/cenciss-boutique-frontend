import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Clock3 } from 'lucide-react';
import { Link } from 'react-router';
import { getSubscriptionBillingStatus } from '../../api/billingApi';

const POLL_MS = 60 * 60 * 1000;

const SubscriptionBanner = () => {
  const [status, setStatus] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await getSubscriptionBillingStatus();
      setStatus(data.data || null);
    } catch {
      // The API subscription gate/expired page remains authoritative. A banner
      // lookup failure must never interrupt normal management work.
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    const onRefresh = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('billing:refresh', onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('billing:refresh', onRefresh);
    };
  }, [refresh]);

  if (!status?.showWarning) return null;
  const urgent = Number(status.daysRemaining) <= 2;
  const amount = Number(status.outstandingAmount || 0);
  const dayLabel = `${status.daysRemaining} day${status.daysRemaining === 1 ? '' : 's'}`;

  return (
    <div
      role="alert"
      className={`relative z-20 border-b px-4 py-2.5 sm:px-6 ${urgent
        ? 'border-rose-300 bg-rose-50 text-rose-900'
        : 'border-amber-300 bg-amber-50 text-amber-950'}`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${urgent ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}>
            {urgent ? <AlertTriangle size={15} /> : <Clock3 size={15} />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold">
              Your Cenciss subscription expires in {dayLabel}.
            </p>
            <p className={`text-xs ${urgent ? 'text-rose-700' : 'text-amber-800'}`}>
              Please arrange payment to avoid interruption.
              {status.canViewDocuments && amount > 0
                ? ` Outstanding: ${status.currency || 'PKR'} ${amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
                : ''}
            </p>
          </div>
        </div>
        {status.canViewDocuments && (
          <Link
            to="/billing"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${urgent
              ? 'bg-rose-600 text-white hover:bg-rose-700'
              : 'bg-amber-700 text-white hover:bg-amber-800'}`}
          >
            View billing <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
};

export default SubscriptionBanner;
