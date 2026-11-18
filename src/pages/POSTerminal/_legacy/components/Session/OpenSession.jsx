import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { fetchCurrentSession } from '../../store/slices/sessionSlice';
import useSession from '../../hooks/useSession';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  Banknote,
  Loader2,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import unifiedLogout from '../../utils/unifiedLogout';
import { getOutlets } from '../../api/sessionApi';
import AmountInput from '../UI/AmountInput';
import FloatingSelect from '../../../../../components/UI/FloatingSelect';

const QUICK_FLOATS = [1000, 2000, 5000, 10000];

const formatPKR = (n) => {
  const num = Number(n || 0);
  if (!num) return 'PKR 0';
  return `PKR ${num.toLocaleString('en-PK')}`;
};

const OpenSession = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { cashier, outletCode, outletName, openSession } = useSession();
  const [openingFloat, setOpeningFloat] = useState('');
  const [loading, setLoading] = useState(false);

  // Cashiers are bound to a single outlet (outletCode is set). Owners/managers
  // have no fixed outlet, so they choose which outlet's till to open.
  const hasFixedOutlet = Boolean(outletCode);
  const role = cashier?.role || 'cashier';
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState('');

  // Revalidate the shift whenever we land here. If a (possibly stale, offline)
  // closed session routed us here but the server actually has an OPEN shift,
  // the refreshed session flips RequireNoSession and bounces us back to /pos.
  // Offline this fetch just fails and we stay put.
  useEffect(() => {
    if (navigator.onLine) dispatch(fetchCurrentSession());
  }, [dispatch]);

  useEffect(() => {
    if (hasFixedOutlet) return;
    let active = true;
    (async () => {
      try {
        const res = await getOutlets();
        const list = (Array.isArray(res) ? res : res?.outlets ?? []).filter((o) => o.isActive !== false);
        if (!active) return;
        setOutlets(list);
        if (list.length === 1) setSelectedOutletId(list[0]._id);
      } catch (err) {
        if (active) toast.error('Could not load outlets');
      }
    })();
    return () => { active = false; };
  }, [hasFixedOutlet]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = Number(openingFloat);
    if (!amount || amount < 0) {
      toast.error('Enter a valid opening float amount');
      return;
    }
    if (!hasFixedOutlet && !selectedOutletId) {
      toast.error('Select an outlet to open a shift for');
      return;
    }
    setLoading(true);
    try {
      const result = await openSession({
        openingFloat: amount,
        outletCode,
        outletId: hasFixedOutlet ? undefined : selectedOutletId,
      });
      if (result.error) {
        toast.error(result.payload || 'Could not open session');
      } else {
        toast.success('Shift opened');
        navigate('/terminal/pos');
      }
    } finally {
      setLoading(false);
    }
  };

  const selectedOutletName = outlets.find((o) => o._id === selectedOutletId)?.name;

  const handleLogout = () => {
    toast.success('Signed out');
    unifiedLogout(dispatch);
  };

  const cashierName = cashier?.name || cashier?.email || 'Cashier';
  const initials = cashierName
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <main className="flex h-[calc(100vh-3.5rem)] items-center justify-center bg-slate-50 px-4 lg:h-[calc(100vh-7rem)]">
      <section className="w-full max-w-md">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.18)]">
          {/* Cashier chip */}
          <div className="relative mb-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-bold text-white shadow-sm ring-1 ring-white">
                {initials || 'CA'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{cashierName}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {roleLabel} · {outletName || outletCode || selectedOutletName || 'Outlet'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition"
            >
              <LogOut size={12} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="relative space-y-4">
            {/* Outlet picker — only for roles without a fixed outlet (owner/manager) */}
            {!hasFixedOutlet && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Outlet
                  </label>
                </div>
                <FloatingSelect
                  label="Outlet"
                  options={outlets.map((outlet) => ({ value: String(outlet._id), label: outlet.name, meta: outlet.code || '' }))}
                  value={selectedOutletId}
                  onChange={setSelectedOutletId}
                  placeholder={outlets.length ? 'Select an outlet' : 'Loading outlets…'}
                  disabled={!outlets.length}
                  className="border-slate-200 py-3 text-sm font-semibold text-slate-900"
                />
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Opening float
                </label>
                <span className="text-[10px] text-slate-400">PKR</span>
              </div>
              <div className="relative">
                <Banknote
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500/80"
                />
                <AmountInput
                  value={openingFloat}
                  onChange={setOpeningFloat}
                  placeholder="0"
                  required
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-3 text-lg font-bold tabular-nums text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                />
              </div>
              {/* Quick-pick chips */}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {QUICK_FLOATS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setOpeningFloat(String(amount))}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition"
                  >
                    {formatPKR(amount)}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700 px-6 py-3 text-sm font-bold text-white shadow-[0_20px_40px_-15px_rgba(79,70,229,0.6)] ring-1 ring-indigo-700/20 transition-all hover:-translate-y-0.5 hover:shadow-[0_30px_60px_-15px_rgba(79,70,229,0.7)] disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Open shift
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-slate-500">
              <ShieldCheck size={12} className="text-emerald-500" />
              Float locks the till open. Close it at end-of-day to reconcile.
            </div>
          </form>
        </div>
      </section>
    </main>
  );
};

export default OpenSession;
