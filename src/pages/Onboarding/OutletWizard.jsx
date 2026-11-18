import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { completeOutletWizard } from '../../api/onboardingApi';
import { setUser } from '../../store/slices/authSlice';
import logo from '../../assets/logo.png';

const OutletWizard = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);

  const [name, setName] = useState(user?.tenant?.outletName || '');
  const [code, setCode] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Pakistan');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('Asia/Karachi');
  const [currency, setCurrency] = useState('PKR');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await completeOutletWizard({
        name,
        code: code.trim() || undefined,
        address: { street, city, country },
        phone,
        timezone,
        currency,
      });
      dispatch(setUser({
        ...user,
        tenant: { ...(user.tenant || {}), outletConfigured: true, outletName: name },
      }));
      toast.success('Outlet configured. Welcome to Cenciss.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not complete setup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-950 text-white">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_-10%,rgba(99,102,241,0.35),transparent_60%),radial-gradient(120%_80%_at_120%_110%,rgba(20,184,166,0.28),transparent_55%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 shadow-glow ring-1 ring-white/10 overflow-hidden">
            <img src={logo} alt="Cenciss" className="h-7 w-7 object-contain" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Cenciss</p>
            <p className="text-[11px] text-surface-400">Boutique operations</p>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-surface-200 backdrop-blur-md">
          Step 2 of 2
        </span>
      </header>

      {/* Card */}
      <section className="relative z-10 mx-auto flex max-w-xl flex-col px-6 pb-12 pt-6 md:pt-10">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-200 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Almost there
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight md:text-4xl">
            Set up your{' '}
            <span className="bg-gradient-to-r from-brand-300 via-cyan-200 to-emerald-200 bg-clip-text text-transparent">
              outlet
            </span>
          </h1>
          <p className="mt-3 text-sm text-surface-300">
            We just need a few details before you get full access.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-md shadow-[0_40px_80px_-30px_rgba(15,23,42,0.6)]">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />

          <form onSubmit={submit} className="relative space-y-4">
            <Field label="Outlet name" value={name} onChange={setName} placeholder="The Smash Oven" required autoFocus />

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-surface-300">Outlet code</label>
                <span className="text-[10px] text-surface-500">Optional · auto-generated if blank</span>
              </div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="SMO-1234"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-surface-500 backdrop-blur-md transition focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400/40 uppercase tracking-wider"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" value={phone} onChange={setPhone} placeholder="+92 300 0000000" />
              <Field label="Currency" value={currency} onChange={setCurrency} placeholder="PKR" />
            </div>

            <Field label="Street address" value={street} onChange={setStreet} placeholder="123 Main Street" />

            <div className="grid grid-cols-2 gap-3">
              <Field label="City" value={city} onChange={setCity} placeholder="Karachi" />
              <Field label="Country" value={country} onChange={setCountry} placeholder="Pakistan" />
            </div>

            <Field label="Timezone" value={timezone} onChange={setTimezone} placeholder="Asia/Karachi" />

            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="group mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-700 px-6 py-3 text-sm font-bold text-white shadow-[0_30px_60px_-20px_rgba(79,70,229,0.6)] ring-1 ring-white/15 transition-all hover:-translate-y-0.5 hover:shadow-[0_40px_80px_-20px_rgba(79,70,229,0.7)] disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Finish setup
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-surface-500">
              <ShieldCheck size={12} className="text-emerald-400/80" />
              Settings can be edited any time from your dashboard
            </div>
          </form>
        </div>
      </section>
    </main>
  );
};

const Field = ({ label, value, onChange, type = 'text', placeholder, autoFocus, required }) => (
  <label className="block">
    <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-surface-300">{label}</div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      required={required}
      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-surface-500 backdrop-blur-md transition focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400/40"
    />
  </label>
);

export default OutletWizard;
